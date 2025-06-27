/**
 * SFTP Client using ssh2-streams transport
 */

import { EventEmitter } from 'events';
import { SSH2StreamsTransport, SSH2StreamsConfig, SFTPChannel } from '../ssh/ssh2-streams-transport';
import { SFTP_MSG, SFTP_VERSION, SFTP_STATUS, SFTP_OPEN_FLAGS, SFTP_ATTR, SFTPPacket, FileAttributes, DirectoryEntry, SFTPError } from '../ssh/types';

export type { DirectoryEntry, FileAttributes } from '../ssh/types';

// Connection keepalive configuration
export interface KeepaliveConfig {
  enabled: boolean;         // Enable SSH-level keepalive (default: false)
  interval?: number;        // Keepalive interval in ms (default: 30000)
  maxMissed?: number;       // Max missed keepalives before disconnect (default: 3)
}

// Health check configuration
export interface HealthCheckConfig {
  enabled: boolean;         // Enable connection health monitoring (default: false)
  method?: 'ping' | 'realpath'; // Health check method (default: 'realpath')
  interval?: number;        // Health check interval in ms (default: 60000)
}

// Auto-reconnect configuration
export interface AutoReconnectConfig {
  enabled: boolean;         // Enable automatic reconnection (default: false)
  maxAttempts?: number;     // Max reconnection attempts (default: 3)
  delay?: number;           // Initial delay between attempts in ms (default: 1000)
  backoff?: number;         // Backoff multiplier (default: 2)
}

export interface SFTPClientOptions extends SSH2StreamsConfig {
  // Timeout configurations
  connectTimeout?: number;    // Connection timeout in ms (default: 30000)
  operationTimeout?: number;  // General operation timeout in ms (default: 30000)
  chunkTimeout?: number;      // Chunk write timeout in ms (default: 30000) - optimized for 32KB chunks
  gracefulTimeout?: number;   // Graceful disconnect timeout in ms (default: 3000)
  
  // Connection keepalive and health check configurations
  keepalive?: KeepaliveConfig;
  healthCheck?: HealthCheckConfig;
  autoReconnect?: AutoReconnectConfig;
}

export class SSH2StreamsSFTPClient extends EventEmitter {
  private transport: SSH2StreamsTransport;
  private sftpChannel: SFTPChannel | null = null;
  private requestId: number = 0;
  private ready: boolean = false;
  private pendingRequests = new Map<number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    type: string;
  }>();
  private dataBuffer: Buffer = Buffer.alloc(0);
  private config: SFTPClientOptions;
  
  // Operation limit tracking for automatic reconnection
  private operationCount: number = 0;
  private bytesTransferred: number = 0;
  private detectedOperationLimit: number | null = null;
  private detectedDataLimit: number | null = null;
  private lastLimitDetectionTime: number = 0;
  
  // Keepalive and health check state
  private keepaliveTimer: NodeJS.Timeout | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private missedKeepalives = 0;
  private isHealthy = true;
  private reconnectAttempts = 0;
  private reconnecting = false;
  private lastReconnectError: Error | null = null;
  private originalConnect: () => Promise<void>;

  constructor(options: SFTPClientOptions) {
    super();
    this.validateConfig(options);
    this.config = options;
    this.transport = new SSH2StreamsTransport(options);
    this.setupTransportHandlers();
    
    // Store original connect method for auto-reconnect
    this.originalConnect = this.connect.bind(this);
  }

  /**
   * Validate configuration options
   */
  private validateConfig(options: SFTPClientOptions): void {
    // Validate keepalive configuration
    if (options.keepalive?.enabled) {
      if (options.keepalive.interval !== undefined && options.keepalive.interval < 1000) {
        throw new Error('Keepalive interval must be >= 1000ms');
      }
      if (options.keepalive.maxMissed !== undefined && options.keepalive.maxMissed < 1) {
        throw new Error('Keepalive maxMissed must be >= 1');
      }
    }
    
    // Validate health check configuration
    if (options.healthCheck?.enabled) {
      if (options.healthCheck.interval !== undefined && options.healthCheck.interval < 1000) {
        throw new Error('Health check interval must be >= 1000ms');
      }
      if (options.healthCheck.method && !['ping', 'realpath'].includes(options.healthCheck.method)) {
        throw new Error('Health check method must be "ping" or "realpath"');
      }
    }
    
    // Validate auto-reconnect configuration
    if (options.autoReconnect?.enabled) {
      if (options.autoReconnect.maxAttempts !== undefined && options.autoReconnect.maxAttempts < 1) {
        throw new Error('Auto-reconnect maxAttempts must be >= 1');
      }
      if (options.autoReconnect.delay !== undefined && options.autoReconnect.delay < 100) {
        throw new Error('Auto-reconnect delay must be >= 100ms');
      }
      if (options.autoReconnect.backoff !== undefined && options.autoReconnect.backoff < 1) {
        throw new Error('Auto-reconnect backoff must be >= 1');
      }
    }
  }

  private setupTransportHandlers(): void {
    this.transport.on('ready', () => {
      this.emit('debug', 'SSH transport ready');
    });

    this.transport.on('error', (err) => {
      this.emit('error', err);
    });

    this.transport.on('close', () => {
      this.ready = false;
      this.isHealthy = false;
      this.stopKeepalive();
      this.stopHealthCheck();
      
      // Attempt auto-reconnect if enabled and not already reconnecting
      if (this.config.autoReconnect?.enabled && !this.reconnecting) {
        this.attemptReconnect();
      } else {
        this.emit('close');
      }
    });

    this.transport.on('debug', (msg) => {
      this.emit('debug', msg);
    });
  }

  /**
   * Connect and initialize SFTP
   */
  async connect(): Promise<void> {
    try {
      // Connect SSH transport
      await this.transport.connect();
      
      // Open SFTP channel
      this.sftpChannel = await this.transport.openSFTP();
      
      // Set up SFTP channel handlers BEFORE sending INIT
      this.setupSFTPHandlers();
      
      // Small delay to ensure handlers are ready
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Send SFTP INIT
      await this.initializeSFTP();
      
      this.ready = true;
      this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
      this.resetOperationCounters(); // Reset operation limits tracking on new connection
      
      // Start keepalive and health checks
      this.startKeepalive();
      this.startHealthCheck();
      
      this.emit('ready');
      
    } catch (error) {
      this.emit('error', error);
      
      // Attempt auto-reconnect if enabled
      if (this.config.autoReconnect?.enabled && !this.reconnecting) {
        this.attemptReconnect();
      }
      
      throw error;
    }
  }

  private setupSFTPHandlers(): void {
    if (!this.sftpChannel) return;

    this.sftpChannel!.on('data', (data: Buffer) => {
      this.emit('debug', `SFTP channel received data: ${data.length} bytes`);
      this.handleSFTPData(data);
    });

    this.sftpChannel!.on('close', () => {
      this.ready = false;
      this.emit('close');
    });

    this.sftpChannel!.on('error', (err: Error) => {
      this.emit('error', err);
    });
  }

  private async initializeSFTP(): Promise<void> {
    if (!this.sftpChannel) {
      throw new Error('SFTP channel not available');
    }

    return new Promise((resolve, reject) => {
      const initTimeout = this.config?.connectTimeout ?? 30000;
      const timeout = setTimeout(() => {
        reject(new Error(`SFTP initialization timeout after ${initTimeout}ms`));
      }, initTimeout);

      // Listen for SFTP VERSION response
      const handleVersion = (packet: SFTPPacket) => {
        if (packet.type === SFTP_MSG.VERSION) {
          clearTimeout(timeout);
          const version = packet.payload.readUInt32BE(0);
          if (version === SFTP_VERSION) {
            this.removeListener('sftpPacket', handleVersion);
            resolve();
          } else {
            this.removeListener('sftpPacket', handleVersion);
            reject(new SFTPError(`Unsupported SFTP version: ${version}`));
          }
        }
      };

      this.on('sftpPacket', handleVersion);

      // Send SFTP INIT packet
      const initPacket = Buffer.from([
        0, 0, 0, 5,           // Length: 5 bytes
        SFTP_MSG.INIT,        // SSH_FXP_INIT
        0, 0, 0, SFTP_VERSION // Version: 3
      ]);

      this.sftpChannel!.write(initPacket);
    });
  }

  private handleSFTPData(data: Buffer): void {
    // Append new data to buffer
    this.dataBuffer = Buffer.concat([this.dataBuffer, data]);
    
    let offset = 0;

    while (offset + 4 <= this.dataBuffer.length) {
      const length = this.dataBuffer.readUInt32BE(offset);
      
      // Check if we have the complete packet
      if (offset + 4 + length > this.dataBuffer.length) {
        break; // Wait for more data
      }

      const packetData = this.dataBuffer.subarray(offset + 4, offset + 4 + length);
      const type = packetData.readUInt8(0) as SFTP_MSG;
      
      let id: number | undefined;
      let payload = packetData.subarray(1);

      if (type !== SFTP_MSG.INIT && type !== SFTP_MSG.VERSION) {
        id = payload.readUInt32BE(0);
        payload = payload.subarray(4);
      }

      const packet: SFTPPacket = { type, id, payload };
      this.handleSFTPPacket(packet);
      
      offset += 4 + length;
    }
    
    // Remove processed data from buffer
    if (offset > 0) {
      this.dataBuffer = this.dataBuffer.subarray(offset);
    }
  }

  private handleSFTPPacket(packet: SFTPPacket): void {
    this.emit('debug', `SFTP packet received: type=${packet.type}, id=${packet.id}`);
    this.emit('sftpPacket', packet);

    if (packet.id !== undefined) {
      const request = this.pendingRequests.get(packet.id);
      if (request) {
        this.pendingRequests.delete(packet.id);
        
        // Clear timeout if it exists
        if ((request as any).timeout) {
          clearTimeout((request as any).timeout);
        }
        
        switch (packet.type) {
          case SFTP_MSG.STATUS:
            this.handleStatusPacket(packet, request);
            break;
          case SFTP_MSG.HANDLE:
            request.resolve(packet.payload.subarray(4)); // Skip length prefix
            break;
          case SFTP_MSG.DATA: {
            const dataLength = packet.payload.readUInt32BE(0);
            const data = packet.payload.subarray(4, 4 + dataLength);
            request.resolve(data);
            break;
          }
          case SFTP_MSG.NAME: {
            const entries = this.parseNamePacket(packet.payload);
            request.resolve(entries);
            break;
          }
          case SFTP_MSG.ATTRS: {
            const { attrs } = this.parseFileAttributes(packet.payload, 0);
            request.resolve(attrs);
            break;
          }
        }
      }
    }
  }

  private handleStatusPacket(packet: SFTPPacket, request: any): void {
    const code = packet.payload.readUInt32BE(0) as SFTP_STATUS;
    
    if (code === SFTP_STATUS.OK) {
      request.resolve();
    } else {
      let message = 'Unknown error';
      if (packet.payload.length > 4) {
        const messageLength = packet.payload.readUInt32BE(4);
        message = packet.payload.subarray(8, 8 + messageLength).toString('utf8');
      }
      request.reject(new SFTPError(message, code));
    }
  }

  private parseNamePacket(payload: Buffer): DirectoryEntry[] {
    const count = payload.readUInt32BE(0);
    const entries: DirectoryEntry[] = [];
    let offset = 4;

    for (let i = 0; i < count; i++) {
      const filenameLength = payload.readUInt32BE(offset);
      offset += 4;
      const filename = payload.subarray(offset, offset + filenameLength).toString('utf8');
      offset += filenameLength;

      const longnameLength = payload.readUInt32BE(offset);
      offset += 4;
      const longname = payload.subarray(offset, offset + longnameLength).toString('utf8');
      offset += longnameLength;

      const { attrs, bytesRead } = this.parseFileAttributes(payload, offset);
      offset += bytesRead;

      entries.push({ filename, longname, attrs });
    }

    return entries;
  }

  private parseFileAttributes(buffer: Buffer, offset: number): { attrs: FileAttributes; bytesRead: number } {
    const flags = buffer.readUInt32BE(offset);
    const attrs: Partial<FileAttributes> & { flags: number } = { flags };
    let bytesRead = 4;

    if (flags & SFTP_ATTR.SIZE) {
      // Read 64-bit size as two 32-bit values for better compatibility
      const sizeHigh = buffer.readUInt32BE(offset + bytesRead);
      const sizeLow = buffer.readUInt32BE(offset + bytesRead + 4);
      attrs.size = sizeHigh * 0x100000000 + sizeLow;
      bytesRead += 8;
    }
    if (flags & SFTP_ATTR.UIDGID) {
      attrs.uid = buffer.readUInt32BE(offset + bytesRead);
      attrs.gid = buffer.readUInt32BE(offset + bytesRead + 4);
      bytesRead += 8;
    }
    if (flags & SFTP_ATTR.PERMISSIONS) {
      attrs.permissions = buffer.readUInt32BE(offset + bytesRead);
      bytesRead += 4;
    }
    if (flags & SFTP_ATTR.ACMODTIME) {
      attrs.atime = buffer.readUInt32BE(offset + bytesRead);
      attrs.mtime = buffer.readUInt32BE(offset + bytesRead + 4);
      bytesRead += 8;
    }

    // Add helper methods for file type detection (always present for ssh2-sftp-client compatibility)
    if (attrs.permissions !== undefined) {
      const mode = attrs.permissions;
      attrs.isFile = () => (mode & 0o170000) === 0o100000; // S_IFREG
      attrs.isDirectory = () => (mode & 0o170000) === 0o040000; // S_IFDIR
      attrs.isSymbolicLink = () => (mode & 0o170000) === 0o120000; // S_IFLNK
      attrs.isBlockDevice = () => (mode & 0o170000) === 0o060000; // S_IFBLK
      attrs.isCharacterDevice = () => (mode & 0o170000) === 0o020000; // S_IFCHR
      attrs.isFIFO = () => (mode & 0o170000) === 0o010000; // S_IFIFO
      attrs.isSocket = () => (mode & 0o170000) === 0o140000; // S_IFSOCK
    } else {
      // Fallback when permissions not available - always provide functions
      attrs.isFile = () => false;
      attrs.isDirectory = () => false;
      attrs.isSymbolicLink = () => false;
      attrs.isBlockDevice = () => false;
      attrs.isCharacterDevice = () => false;
      attrs.isFIFO = () => false;
      attrs.isSocket = () => false;
    }

    return { attrs: attrs as FileAttributes, bytesRead };
  }

  private sendSFTPRequest(type: SFTP_MSG, payload: Buffer, expectResponse = true, timeoutMs?: number): Promise<any> {
    if (!this.sftpChannel) {
      throw new Error('SFTP channel not available');
    }

    const actualTimeout = timeoutMs ?? this.config?.operationTimeout ?? 30000;
    
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      
      if (expectResponse) {
        const request = { resolve, reject, type: SFTP_MSG[type] };
        this.pendingRequests.set(id, request);
        
        // Add timeout for operations that might hang
        const timeout = setTimeout(() => {
          this.pendingRequests.delete(id);
          reject(new Error(`SFTP request timeout after ${actualTimeout}ms for ${SFTP_MSG[type]} (id: ${id})`));
        }, actualTimeout);
        
        // Store timeout with request for cleanup
        (request as any).timeout = timeout;
      }

      try {
        // Build SFTP packet
        const idBuffer = Buffer.allocUnsafe(4);
        idBuffer.writeUInt32BE(id, 0);

        const packetPayload = Buffer.concat([Buffer.from([type]), idBuffer, payload]);
        const lengthBuffer = Buffer.allocUnsafe(4);
        lengthBuffer.writeUInt32BE(packetPayload.length, 0);

        const packet = Buffer.concat([lengthBuffer, packetPayload]);
        
        // Write packet to SFTP channel
        this.sftpChannel!.write(packet);

        if (!expectResponse) {
          resolve(undefined);
        }
      } catch (error) {
        if (expectResponse) {
          const request = this.pendingRequests.get(id);
          if (request && (request as any).timeout) {
            clearTimeout((request as any).timeout);
          }
          this.pendingRequests.delete(id);
        }
        reject(error);
      }
    });
  }

  /**
   * Open a file
   */
  async openFile(path: string, flags: number = SFTP_OPEN_FLAGS.READ): Promise<Buffer> {
    const pathBuffer = Buffer.from(path, 'utf8');
    const pathLength = Buffer.allocUnsafe(4);
    pathLength.writeUInt32BE(pathBuffer.length, 0);

    const flagsBuffer = Buffer.allocUnsafe(4);
    flagsBuffer.writeUInt32BE(flags, 0);

    const attrsBuffer = Buffer.allocUnsafe(4);
    attrsBuffer.writeUInt32BE(0, 0); // No attributes

    const payload = Buffer.concat([pathLength, pathBuffer, flagsBuffer, attrsBuffer]);
    return this.sendSFTPRequest(SFTP_MSG.OPEN, payload);
  }

  /**
   * Sync/flush a file to disk (forces write)
   */
  async syncFile(handle: Buffer): Promise<void> {
    try {
      // Try to use fsync@openssh.com extension first
      const extensionName = Buffer.from('fsync@openssh.com', 'utf8');
      const extensionNameLength = Buffer.allocUnsafe(4);
      extensionNameLength.writeUInt32BE(extensionName.length, 0);
      
      const handleLength = Buffer.allocUnsafe(4);
      handleLength.writeUInt32BE(handle.length, 0);
      
      const payload = Buffer.concat([extensionNameLength, extensionName, handleLength, handle]);
      
      await this.sendSFTPRequest(SFTP_MSG.EXTENDED, payload);
      this.emit('debug', 'File synced using fsync@openssh.com extension');
    } catch (error) {
      // If fsync extension fails, fall back to a small delay
      this.emit('debug', 'fsync extension not supported, using delay fallback');
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  /**
   * Close a file
   */
  async closeFile(handle: Buffer): Promise<void> {
    const handleLength = Buffer.allocUnsafe(4);
    handleLength.writeUInt32BE(handle.length, 0);
    const payload = Buffer.concat([handleLength, handle]);
    // Use adaptive timeout for control operations
    const controlTimeout = this.transport.getAdaptiveTimeout('control');
    return this.sendSFTPRequest(SFTP_MSG.CLOSE, payload, true, controlTimeout);
  }

  /**
   * Read file data
   */
  async readFile(handle: Buffer, offset: number, length: number, timeoutMs?: number): Promise<Buffer> {
    const handleLength = Buffer.allocUnsafe(4);
    handleLength.writeUInt32BE(handle.length, 0);

    // Use consistent 32-bit offset handling
    const offsetHigh = Buffer.allocUnsafe(4);
    const offsetLow = Buffer.allocUnsafe(4);
    offsetHigh.writeUInt32BE(Math.floor(offset / 0x100000000), 0);
    offsetLow.writeUInt32BE(offset & 0xFFFFFFFF, 0);

    const lengthBuffer = Buffer.allocUnsafe(4);
    lengthBuffer.writeUInt32BE(length, 0);

    const payload = Buffer.concat([handleLength, handle, offsetHigh, offsetLow, lengthBuffer]);
    
    // Add debug info for read operations  
    const totalPacketSize = 4 + 1 + 4 + 4 + handle.length + 8 + 4;
    this.emit('debug', `SFTP READ: offset=${offset}, requestSize=${length}, handleSize=${handle.length}, totalPacketSize=${totalPacketSize}`);
    
    // Track operation before sending request
    this.trackOperation(0, 'READ'); // Will track bytes when response arrives
    
    try {
      const result = await this.sendSFTPRequest(SFTP_MSG.READ, payload, true, timeoutMs);
      
      // Track actual bytes received
      if (result && result.length > 0) {
        this.bytesTransferred += result.length; // Update byte count with actual data received
        this.emit('debug', `READ completed: received ${result.length} bytes (total: ${(this.bytesTransferred/(1024*1024)).toFixed(2)}MB)`);
      }
      
      return result;
    } catch (error) {
      // If this was a timeout, record it as a potential server limit
      if (error instanceof Error && error.message.includes('timeout')) {
        this.recordServerLimit(this.operationCount, this.bytesTransferred);
      }
      throw error;
    }
  }

  /**
   * List directory contents
   */
  async listDirectory(path: string): Promise<DirectoryEntry[]> {
    const handle = await this.openDirectory(path);
    const entries: DirectoryEntry[] = [];
    
    try {
      while (true) {
        try {
          const batch = await this.readDirectory(handle);
          entries.push(...batch);
        } catch (error) {
          if (error instanceof SFTPError && error.code === SFTP_STATUS.EOF) {
            break;
          }
          throw error;
        }
      }
    } finally {
      await this.closeFile(handle);
    }

    return entries;
  }

  private async openDirectory(path: string): Promise<Buffer> {
    const pathBuffer = Buffer.from(path, 'utf8');
    const pathLength = Buffer.allocUnsafe(4);
    pathLength.writeUInt32BE(pathBuffer.length, 0);
    const payload = Buffer.concat([pathLength, pathBuffer]);
    return this.sendSFTPRequest(SFTP_MSG.OPENDIR, payload);
  }

  private async readDirectory(handle: Buffer): Promise<DirectoryEntry[]> {
    const handleLength = Buffer.allocUnsafe(4);
    handleLength.writeUInt32BE(handle.length, 0);
    const payload = Buffer.concat([handleLength, handle]);
    return this.sendSFTPRequest(SFTP_MSG.READDIR, payload);
  }

  /**
   * Get file stats
   */
  async stat(path: string): Promise<FileAttributes> {
    const pathBuffer = Buffer.from(path, 'utf8');
    const pathLength = Buffer.allocUnsafe(4);
    pathLength.writeUInt32BE(pathBuffer.length, 0);
    const payload = Buffer.concat([pathLength, pathBuffer]);
    return this.sendSFTPRequest(SFTP_MSG.STAT, payload);
  }

  /**
   * Write data to a file handle
   */
  async writeFile(handle: Buffer, offset: number, data: Buffer, timeoutMs?: number): Promise<void> {
    // Build SFTP WRITE packet according to RFC 4251/4252
    const handleLength = Buffer.allocUnsafe(4);
    handleLength.writeUInt32BE(handle.length, 0);
    
    // Use 32-bit offset for better compatibility (most files are < 4GB)
    const offsetHigh = Buffer.allocUnsafe(4);
    const offsetLow = Buffer.allocUnsafe(4);
    offsetHigh.writeUInt32BE(Math.floor(offset / 0x100000000), 0);
    offsetLow.writeUInt32BE(offset & 0xFFFFFFFF, 0);
    
    const dataLength = Buffer.allocUnsafe(4);
    dataLength.writeUInt32BE(data.length, 0);
    
    const payload = Buffer.concat([handleLength, handle, offsetHigh, offsetLow, dataLength, data]);
    
    // Add debug info for write operations
    const totalPacketSize = 4 + 1 + 4 + 4 + handle.length + 8 + 4 + data.length;
    this.emit('debug', `SFTP WRITE: offset=${offset}, dataSize=${data.length}, handleSize=${handle.length}, totalPacketSize=${totalPacketSize}`);
    
    return this.sendSFTPRequest(SFTP_MSG.WRITE, payload, true, timeoutMs);
  }

  /**
   * Remove a file
   */
  async removeFile(path: string): Promise<void> {
    const pathBuffer = Buffer.from(path, 'utf8');
    const pathLength = Buffer.allocUnsafe(4);
    pathLength.writeUInt32BE(pathBuffer.length, 0);
    const payload = Buffer.concat([pathLength, pathBuffer]);
    return this.sendSFTPRequest(SFTP_MSG.REMOVE, payload);
  }

  /**
   * Rename a file
   */
  async renameFile(oldPath: string, newPath: string): Promise<void> {
    const oldPathBuffer = Buffer.from(oldPath, 'utf8');
    const oldPathLength = Buffer.allocUnsafe(4);
    oldPathLength.writeUInt32BE(oldPathBuffer.length, 0);
    
    const newPathBuffer = Buffer.from(newPath, 'utf8');
    const newPathLength = Buffer.allocUnsafe(4);
    newPathLength.writeUInt32BE(newPathBuffer.length, 0);
    
    const payload = Buffer.concat([oldPathLength, oldPathBuffer, newPathLength, newPathBuffer]);
    return this.sendSFTPRequest(SFTP_MSG.RENAME, payload);
  }

  /**
   * Create a directory
   */
  async makeDirectory(path: string, attrs?: Partial<FileAttributes>): Promise<void> {
    const pathBuffer = Buffer.from(path, 'utf8');
    const pathLength = Buffer.allocUnsafe(4);
    pathLength.writeUInt32BE(pathBuffer.length, 0);
    
    // Simple attributes - just set directory flag
    const attrFlags = Buffer.allocUnsafe(4);
    attrFlags.writeUInt32BE(SFTP_ATTR.PERMISSIONS, 0);
    
    const permissions = Buffer.allocUnsafe(4);
    permissions.writeUInt32BE(attrs?.permissions || 0o755, 0);
    
    const payload = Buffer.concat([pathLength, pathBuffer, attrFlags, permissions]);
    return this.sendSFTPRequest(SFTP_MSG.MKDIR, payload);
  }

  /**
   * Remove a directory
   */
  async removeDirectory(path: string): Promise<void> {
    const pathBuffer = Buffer.from(path, 'utf8');
    const pathLength = Buffer.allocUnsafe(4);
    pathLength.writeUInt32BE(pathBuffer.length, 0);
    const payload = Buffer.concat([pathLength, pathBuffer]);
    return this.sendSFTPRequest(SFTP_MSG.RMDIR, payload);
  }

  /**
   * Set file attributes
   */
  async setAttributes(path: string, attrs: Partial<FileAttributes>): Promise<void> {
    const pathBuffer = Buffer.from(path, 'utf8');
    const pathLength = Buffer.allocUnsafe(4);
    pathLength.writeUInt32BE(pathBuffer.length, 0);
    
    // Build attributes in correct RFC order: size, uid/gid, permissions, atime/mtime
    let flags = 0;
    let attrData = Buffer.alloc(0);
    
    // Order matters! Follow RFC: size, uid/gid, permissions, atime/mtime
    if (attrs.size !== undefined) {
      flags |= SFTP_ATTR.SIZE;
      const sizeHigh = Buffer.allocUnsafe(4);
      const sizeLow = Buffer.allocUnsafe(4);
      sizeHigh.writeUInt32BE(Math.floor(attrs.size / 0x100000000), 0);
      sizeLow.writeUInt32BE(attrs.size & 0xFFFFFFFF, 0);
      attrData = Buffer.concat([attrData, sizeHigh, sizeLow]);
    }
    
    if (attrs.uid !== undefined && attrs.gid !== undefined) {
      flags |= SFTP_ATTR.UIDGID;
      const uidBuffer = Buffer.allocUnsafe(4);
      const gidBuffer = Buffer.allocUnsafe(4);
      uidBuffer.writeUInt32BE(attrs.uid, 0);
      gidBuffer.writeUInt32BE(attrs.gid, 0);
      attrData = Buffer.concat([attrData, uidBuffer, gidBuffer]);
    }
    
    if (attrs.permissions !== undefined) {
      flags |= SFTP_ATTR.PERMISSIONS;
      const permBuffer = Buffer.allocUnsafe(4);
      permBuffer.writeUInt32BE(attrs.permissions, 0);
      attrData = Buffer.concat([attrData, permBuffer]);
    }
    
    if (attrs.atime !== undefined && attrs.mtime !== undefined) {
      flags |= SFTP_ATTR.ACMODTIME;
      const atimeBuffer = Buffer.allocUnsafe(4);
      const mtimeBuffer = Buffer.allocUnsafe(4);
      atimeBuffer.writeUInt32BE(attrs.atime, 0);
      mtimeBuffer.writeUInt32BE(attrs.mtime, 0);
      attrData = Buffer.concat([attrData, atimeBuffer, mtimeBuffer]);
    }
    
    const attrFlags = Buffer.allocUnsafe(4);
    attrFlags.writeUInt32BE(flags, 0);
    const payload = Buffer.concat([pathLength, pathBuffer, attrFlags, attrData]);
    return this.sendSFTPRequest(SFTP_MSG.SETSTAT, payload);
  }

  /**
   * Get real path (resolve symbolic links)
   */
  async realPath(path: string): Promise<string> {
    const pathBuffer = Buffer.from(path, 'utf8');
    const pathLength = Buffer.allocUnsafe(4);
    pathLength.writeUInt32BE(pathBuffer.length, 0);
    const payload = Buffer.concat([pathLength, pathBuffer]);
    
    // sendSFTPRequest for REALPATH returns DirectoryEntry[] from parseNamePacket
    const entries = await this.sendSFTPRequest(SFTP_MSG.REALPATH, payload) as DirectoryEntry[];
    
    if (entries && entries.length === 1) {
      return entries[0].filename; // Return the resolved absolute path
    }
    
    throw new Error('Invalid realpath response: expected exactly one path entry');
  }

  /**
   * Disconnect
   */
  disconnect(): void {
    this.ready = false;
    this.isHealthy = false;
    this.reconnecting = false;
    this.reconnectAttempts = 0;
    this.lastReconnectError = null;
    
    this.stopKeepalive();
    this.stopHealthCheck();
    this.cleanupPendingRequests();
    
    if (this.sftpChannel) {
      this.sftpChannel.end();
    }
    this.transport.disconnect();
  }

  /**
   * Start SSH keepalive timer
   */
  private startKeepalive(): void {
    if (!this.config.keepalive?.enabled) return;
    
    const interval = this.config.keepalive.interval ?? 30000;
    
    this.keepaliveTimer = setInterval(() => {
      this.sendKeepalive();
    }, interval);
    
    this.emit('debug', `Keepalive started with ${interval}ms interval`);
  }
  
  /**
   * Stop SSH keepalive timer
   */
  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
      this.missedKeepalives = 0;
      this.emit('debug', 'Keepalive stopped');
    }
  }
  
  /**
   * Send SSH keepalive (ping)
   */
  private async sendKeepalive(): Promise<void> {
    if (!this.ready || !this.transport.isConnected()) {
      return;
    }
    
    try {
      // Use SSH ping functionality from transport layer
      await this.transport.ping();
      this.missedKeepalives = 0;
      this.emit('keepalive', { type: 'ping', success: true });
    } catch (err) {
      this.missedKeepalives++;
      const maxMissed = this.config.keepalive?.maxMissed ?? 3;
      
      this.emit('keepalive', { type: 'ping', success: false, missed: this.missedKeepalives });
      this.emit('debug', `Keepalive failed: ${this.missedKeepalives}/${maxMissed}`);
      
      if (this.missedKeepalives >= maxMissed) {
        this.emit('debug', 'Max keepalive failures reached, disconnecting');
        this.isHealthy = false;
        this.disconnect();
      }
    }
  }
  
  /**
   * Start health check timer
   */
  private startHealthCheck(): void {
    if (!this.config.healthCheck?.enabled) return;
    
    const interval = this.config.healthCheck.interval ?? 60000;
    
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, interval);
    
    this.emit('debug', `Health check started with ${interval}ms interval`);
  }
  
  /**
   * Stop health check timer
   */
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
      this.emit('debug', 'Health check stopped');
    }
  }
  
  /**
   * Perform connection health check
   */
  private async performHealthCheck(): Promise<void> {
    if (!this.ready || !this.transport.isConnected()) {
      this.isHealthy = false;
      return;
    }
    
    try {
      const method = this.config.healthCheck?.method ?? 'realpath';
      
      if (method === 'ping') {
        await this.transport.ping();
      } else if (method === 'realpath') {
        await this.realPath('.');
      }
      
      const wasUnhealthy = !this.isHealthy;
      this.isHealthy = true;
      
      this.emit('healthCheck', { type: method, success: true, healthy: true });
      
      if (wasUnhealthy) {
        this.emit('debug', 'Connection health restored');
      }
    } catch (error) {
      this.isHealthy = false;
      this.emit('healthCheck', { type: this.config.healthCheck?.method ?? 'realpath', success: false, healthy: false, error: error as Error });
      this.emit('debug', `Health check failed: ${(error as Error).message}`);
      
      // Attempt auto-reconnect if enabled
      if (this.config.autoReconnect?.enabled && !this.reconnecting) {
        this.attemptReconnect();
      }
    }
  }
  
  /**
   * Attempt automatic reconnection with proper termination logic
   */
  private async attemptReconnect(): Promise<void> {
    // Prevent concurrent reconnection attempts
    if (this.reconnecting) return;
    
    const maxAttempts = this.config.autoReconnect?.maxAttempts ?? 3;
    const initialDelay = this.config.autoReconnect?.delay ?? 1000;
    const backoff = this.config.autoReconnect?.backoff ?? 2;
    
    // Check if max attempts already reached BEFORE starting
    if (this.reconnectAttempts >= maxAttempts) {
      this.emit('debug', `Max reconnect attempts (${maxAttempts}) reached`);
      this.emit('reconnectFailed', { 
        attempts: this.reconnectAttempts, 
        maxAttempts,
        lastError: this.lastReconnectError?.message
      });
      this.emit('close');
      return;
    }
    
    this.reconnecting = true;
    this.reconnectAttempts++;
    
    const delay = initialDelay * Math.pow(backoff, this.reconnectAttempts - 1);
    
    this.emit('debug', `Attempting reconnect ${this.reconnectAttempts}/${maxAttempts} in ${delay}ms`);
    this.emit('reconnectAttempt', { attempt: this.reconnectAttempts, maxAttempts, delay });
    
    setTimeout(async () => {
      try {
        // Clean up before reconnecting
        this.cleanupPendingRequests();
        
        await this.originalConnect();
        this.reconnecting = false;
        this.reconnectAttempts = 0; // Reset on successful reconnection
        this.lastReconnectError = null;
        this.emit('debug', `Reconnect successful after ${this.reconnectAttempts} attempts`);
        this.emit('reconnectSuccess', { attempts: this.reconnectAttempts });
      } catch (error) {
        this.lastReconnectError = error as Error;
        this.reconnecting = false;
        this.emit('debug', `Reconnect attempt ${this.reconnectAttempts} failed: ${(error as Error).message}`);
        this.emit('reconnectError', { attempt: this.reconnectAttempts, error: error as Error });
        
        // Only retry if we haven't reached max attempts
        if (this.reconnectAttempts < maxAttempts) {
          this.attemptReconnect();
        } else {
          // Final failure - emit reconnectFailed
          this.emit('debug', `Max reconnect attempts (${maxAttempts}) reached after failure`);
          this.emit('reconnectFailed', { 
            attempts: this.reconnectAttempts, 
            maxAttempts,
            lastError: this.lastReconnectError?.message 
          });
          this.emit('close');
        }
      }
    }, delay);
  }
  
  /**
   * Clean up pending requests on disconnect/reconnect
   */
  private cleanupPendingRequests(): void {
    for (const [id, request] of this.pendingRequests) {
      // Clear any associated timeouts
      if ((request as any).timeout) {
        clearTimeout((request as any).timeout);
      }
      // Reject with connection error
      request.reject(new Error('Connection lost during operation'));
    }
    this.pendingRequests.clear();
  }
  
  /**
   * Get connection health status
   */
  getHealthStatus(): { healthy: boolean; connected: boolean; ready: boolean } {
    return {
      healthy: this.isHealthy,
      connected: this.transport.isConnected(),
      ready: this.ready
    };
  }

  /**
   * Check if connected and ready
   */
  isReady(): boolean {
    return this.ready && this.transport.isConnected();
  }

  /**
   * Get current SSH channel window size for flow control
   */
  getCurrentWindowSize(): number {
    return this.transport.getCurrentWindowSize();
  }

  /**
   * Report transfer metrics for adaptive performance tuning
   */
  reportTransferMetrics(speedMBps: number, hadTimeout: boolean, responseTimeMs?: number): void {
    this.transport.adaptPerformance(speedMBps, hadTimeout, responseTimeMs);
  }

  /**
   * Get transport reference for direct access to adaptive methods
   */
  getTransport(): SSH2StreamsTransport {
    return this.transport;
  }

  /**
   * Calculate safe concurrency based on SSH window size and chunk size
   */
  getSafeConcurrency(chunkSize: number, maxConcurrency: number = 64): number {
    return this.transport.getSafeConcurrency(chunkSize, maxConcurrency);
  }

  /**
   * Get optimal concurrency based on window size and performance testing
   */
  getOptimalConcurrency(chunkSize: number): number {
    return this.transport.getOptimalConcurrency(chunkSize);
  }

  /**
   * Get maximum safe SFTP chunk size based on SSH packet limits
   */
  getMaxSafeChunkSize(): number {
    return this.transport.getMaxSafeChunkSize();
  }

  /**
   * Track operation for limit detection
   */
  private trackOperation(bytesTransferred: number = 0, operationType: string = 'READ'): void {
    this.operationCount++;
    this.bytesTransferred += bytesTransferred;
    
    // Emit debug info for operations that involve data transfer
    if (bytesTransferred > 0) {
      this.emit('debug', `Operation ${this.operationCount}: ${operationType} ${bytesTransferred} bytes (total: ${(this.bytesTransferred/(1024*1024)).toFixed(2)}MB)`);
    }
  }

  /**
   * Record server limit when timeout occurs
   */
  recordServerLimit(operationCount: number, bytesTransferred: number): void {
    this.detectedOperationLimit = operationCount;
    this.detectedDataLimit = bytesTransferred;
    this.lastLimitDetectionTime = Date.now();
    
    const mbTransferred = (bytesTransferred / (1024 * 1024)).toFixed(2);
    this.emit('debug', `Server limit detected: ${operationCount} operations, ${mbTransferred}MB`);
    this.emit('serverLimitDetected', { operations: operationCount, bytes: bytesTransferred, mb: mbTransferred });
  }

  /**
   * Check if we're approaching server limits
   */
  isApproachingLimit(): boolean {
    // If we haven't detected limits yet, assume reasonable defaults
    const operationLimit = this.detectedOperationLimit ?? 75; // Conservative default
    const dataLimitMB = this.detectedDataLimit ? (this.detectedDataLimit / (1024 * 1024)) : 0.6; // 600KB default
    
    // Use 90% of detected limits as safety margin
    const safeOperationLimit = Math.floor(operationLimit * 0.9);
    const safeDataLimitBytes = Math.floor(dataLimitMB * 0.9 * 1024 * 1024);
    
    const approachingOperationLimit = this.operationCount >= safeOperationLimit;
    const approachingDataLimit = this.bytesTransferred >= safeDataLimitBytes;
    
    if (approachingOperationLimit || approachingDataLimit) {
      this.emit('debug', `Approaching limits: ops ${this.operationCount}/${safeOperationLimit}, data ${(this.bytesTransferred/(1024*1024)).toFixed(2)}MB/${(safeDataLimitBytes/(1024*1024)).toFixed(2)}MB`);
      return true;
    }
    
    return false;
  }

  /**
   * Reset operation counters (call after reconnection)
   */
  resetOperationCounters(): void {
    this.operationCount = 0;
    this.bytesTransferred = 0;
    this.emit('debug', 'Operation counters reset after reconnection');
  }

  /**
   * Get current operation statistics
   */
  getOperationStats(): { operations: number; bytesTransferred: number; mbTransferred: number; detectedLimits: { operations: number | null; bytes: number | null } } {
    return {
      operations: this.operationCount,
      bytesTransferred: this.bytesTransferred,
      mbTransferred: this.bytesTransferred / (1024 * 1024),
      detectedLimits: {
        operations: this.detectedOperationLimit,
        bytes: this.detectedDataLimit
      }
    };
  }
}