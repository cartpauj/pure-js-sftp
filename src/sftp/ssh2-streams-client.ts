/**
 * SFTP Client using ssh2-streams transport
 */

import { EventEmitter } from 'events';
import { SSH2StreamsTransport, SSH2StreamsConfig, SFTPChannel } from '../ssh/ssh2-streams-transport';
import { SFTP_MSG, SFTP_VERSION, SFTP_STATUS, SFTP_OPEN_FLAGS, SFTP_ATTR, SFTPPacket, FileAttributes, DirectoryEntry, SFTPError } from '../ssh/types';

export type { DirectoryEntry, FileAttributes } from '../ssh/types';

export interface SFTPClientOptions extends SSH2StreamsConfig {}

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

  constructor(options: SFTPClientOptions) {
    super();
    this.transport = new SSH2StreamsTransport(options);
    this.setupTransportHandlers();
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
      this.emit('close');
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
      this.emit('ready');
      
    } catch (error) {
      this.emit('error', error);
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
      const timeout = setTimeout(() => {
        reject(new Error('SFTP initialization timeout'));
      }, 10000);

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
      const size64 = buffer.readBigUInt64BE(offset + bytesRead);
      attrs.size = Number(size64); // Handle 64-bit file sizes correctly
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

  private sendSFTPRequest(type: SFTP_MSG, payload: Buffer, expectResponse = true): Promise<any> {
    if (!this.sftpChannel) {
      throw new Error('SFTP channel not available');
    }

    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      
      if (expectResponse) {
        this.pendingRequests.set(id, { resolve, reject, type: SFTP_MSG[type] });
      }

      // Build SFTP packet
      const idBuffer = Buffer.allocUnsafe(4);
      idBuffer.writeUInt32BE(id, 0);

      const packetPayload = Buffer.concat([Buffer.from([type]), idBuffer, payload]);
      const lengthBuffer = Buffer.allocUnsafe(4);
      lengthBuffer.writeUInt32BE(packetPayload.length, 0);

      const packet = Buffer.concat([lengthBuffer, packetPayload]);
      this.sftpChannel!.write(packet);

      if (!expectResponse) {
        resolve(undefined);
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
   * Close a file
   */
  async closeFile(handle: Buffer): Promise<void> {
    const handleLength = Buffer.allocUnsafe(4);
    handleLength.writeUInt32BE(handle.length, 0);
    const payload = Buffer.concat([handleLength, handle]);
    return this.sendSFTPRequest(SFTP_MSG.CLOSE, payload);
  }

  /**
   * Read file data
   */
  async readFile(handle: Buffer, offset: number, length: number): Promise<Buffer> {
    const handleLength = Buffer.allocUnsafe(4);
    handleLength.writeUInt32BE(handle.length, 0);

    const offsetBuffer = Buffer.allocUnsafe(8);
    offsetBuffer.writeBigUInt64BE(BigInt(offset), 0); // Use consistent 64-bit handling

    const lengthBuffer = Buffer.allocUnsafe(4);
    lengthBuffer.writeUInt32BE(length, 0);

    const payload = Buffer.concat([handleLength, handle, offsetBuffer, lengthBuffer]);
    return this.sendSFTPRequest(SFTP_MSG.READ, payload);
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
  async writeFile(handle: Buffer, offset: number, data: Buffer): Promise<void> {
    const handleLength = Buffer.allocUnsafe(4);
    handleLength.writeUInt32BE(handle.length, 0);
    
    const offsetBuffer = Buffer.allocUnsafe(8);
    offsetBuffer.writeBigUInt64BE(BigInt(offset), 0);
    
    const dataLength = Buffer.allocUnsafe(4);
    dataLength.writeUInt32BE(data.length, 0);
    
    const payload = Buffer.concat([handleLength, handle, offsetBuffer, dataLength, data]);
    return this.sendSFTPRequest(SFTP_MSG.WRITE, payload);
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
      const sizeBuffer = Buffer.allocUnsafe(8);
      sizeBuffer.writeBigUInt64BE(BigInt(attrs.size), 0);
      attrData = Buffer.concat([attrData, sizeBuffer]);
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
    if (this.sftpChannel) {
      this.sftpChannel.end();
    }
    this.transport.disconnect();
  }

  /**
   * Check if connected and ready
   */
  isReady(): boolean {
    return this.ready && this.transport.isConnected();
  }
}