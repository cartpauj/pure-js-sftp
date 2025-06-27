import { EventEmitter } from 'events';
import { Socket } from 'net';
import * as ssh2Streams from 'ssh2-streams';
import { applyRevolutionaryProxyFix } from './revolutionary-proxy-fix';
import { parseKey } from './enhanced-key-parser';
import { enablePureJSSigningFix } from './pure-js-signing-fix';

export interface SSH2StreamsConfig {
  host: string;
  port?: number;
  username: string;
  privateKey?: Buffer | string;
  password?: string;
  passphrase?: string;
  connectTimeout?: number;
  algorithms?: {
    kex?: string[];
    cipher?: string[];
    hmac?: string[];
    compress?: string[];
  };
}

export interface SFTPChannel extends EventEmitter {
  write(data: Buffer): void;
  end(): void;
}

export class SSH2StreamsTransport extends EventEmitter {
  private socket: Socket;
  private ssh: ssh2Streams.SSH2Stream;
  private config: SSH2StreamsConfig;
  private connected = false;
  private authenticated = false;
  private sftpChannel: SFTPChannel | null = null;
  private pendingChannels = new Map<number, (err?: Error, channel?: any) => void>();
  private currentWindowSize = 0;
  private initialWindowSize = 0; // Will be set based on server capabilities
  private maxPacketSize = 32768; // Will be adjusted based on server response
  private serverMaxWindowSize = 0; // Detected from server
  adaptiveMetrics = {
    successfulTransfers: 0,
    timeouts: 0,
    avgTransferSpeed: 0,
    lastAdjustmentTime: 0,
    avgResponseTime: 100, // Track server response time
    serverCapabilities: {
      maxPacketSize: 32768, // Will be detected from server
      preferredTimeout: 30000, // Will be adapted based on performance
      optimalChunkSize: 8192 // Will be learned from successful transfers
    }
  };

  private isOpenSSHRSAKey(keyString: string): boolean {
    try {
      const lines = keyString.split('\n');
      const base64Data = lines
        .filter(line => !line.startsWith('-----'))
        .join('')
        .replace(/\s/g, '');
      
      const keyBuffer = Buffer.from(base64Data, 'base64');
      let offset = 0;
      
      // Skip magic bytes "openssh-key-v1\0"
      offset += 15;
      
      // Skip cipher name
      const cipherNameLength = keyBuffer.readUInt32BE(offset);
      offset += 4;
      offset += cipherNameLength;
      
      // Skip KDF name
      const kdfNameLength = keyBuffer.readUInt32BE(offset);
      offset += 4;
      offset += kdfNameLength;
      
      // Skip KDF options
      const kdfOptionsLength = keyBuffer.readUInt32BE(offset);
      offset += 4;
      offset += kdfOptionsLength;
      
      // Skip number of keys
      offset += 4;
      
      // Read public key section
      const publicKeyLength = keyBuffer.readUInt32BE(offset);
      offset += 4;
      const publicKeyData = keyBuffer.subarray(offset, offset + publicKeyLength);
      
      // Parse the public key to determine type
      let pubOffset = 0;
      const keyTypeLength = publicKeyData.readUInt32BE(pubOffset);
      pubOffset += 4;
      const keyTypeName = publicKeyData.subarray(pubOffset, pubOffset + keyTypeLength).toString();
      
      return keyTypeName === 'ssh-rsa';
    } catch (error) {
      return false;
    }
  }

  constructor(config: SSH2StreamsConfig) {
    super();
    this.config = config;
    this.socket = new Socket();
    this.socket.setNoDelay(true); // Disable Nagle's algorithm for low latency
    
    // Enable pure JS signing fix for broader compatibility
    enablePureJSSigningFix();
    // Use modern SSH algorithms compatible with OpenSSH 8.0+
    const defaultAlgorithms = {
      kex: [
        'ecdh-sha2-nistp256',
        'ecdh-sha2-nistp384', 
        'ecdh-sha2-nistp521',
        'diffie-hellman-group-exchange-sha256',
        'diffie-hellman-group14-sha256',
        'diffie-hellman-group16-sha512',
        'diffie-hellman-group18-sha512',
        // Fallback for ssh2-streams compatibility
        'diffie-hellman-group14-sha1'
      ],
      cipher: [
        'aes128-gcm@openssh.com',
        'aes256-gcm@openssh.com', 
        'aes128-ctr',
        'aes192-ctr',
        'aes256-ctr',
        // Fallback ciphers
        'aes128-cbc',
        'aes256-cbc'
      ],
      hmac: [
        'hmac-sha2-256',
        'hmac-sha2-512',
        // Fallback MAC for compatibility
        'hmac-sha1'
      ],
      compress: ['none']
    };

    // Create SSH2Stream instance
    const originalSSH = new ssh2Streams.SSH2Stream({
      server: false,
      algorithms: config.algorithms || defaultAlgorithms
    });
    
    // Apply RSA-SHA2 proxy fix only when needed (RSA keys with modern SSH servers)
    let needsRSAFix = false;
    if (config.privateKey) {
      try {
        // Check if this is an RSA key that might need the revolutionary fix
        const parsedKey = ssh2Streams.utils.parseKey(config.privateKey, config.passphrase);
        if (parsedKey) {
          const key = Array.isArray(parsedKey) ? parsedKey[0] : parsedKey;
          if (key && key.type === 'ssh-rsa') {
            needsRSAFix = true;
            this.emit('debug', 'RSA key detected via ssh2-streams - revolutionary proxy fix will be applied for modern SSH server compatibility');
          } else {
            this.emit('debug', `${key?.type || 'Unknown'} key detected - no RSA-SHA2 fix needed`);
          }
        }
      } catch (keyCheckError) {
        this.emit('debug', `ssh2-streams key detection failed: ${keyCheckError instanceof Error ? keyCheckError.message : String(keyCheckError)}`);
        
        // If ssh2-streams fails, check if it's an RSA key by looking at the key content
        if (typeof config.privateKey === 'string') {
          if (config.privateKey.includes('BEGIN RSA PRIVATE KEY') || 
              config.privateKey.includes('ssh-rsa') ||
              (config.privateKey.includes('BEGIN OPENSSH PRIVATE KEY') && this.isOpenSSHRSAKey(config.privateKey))) {
            needsRSAFix = true;
            this.emit('debug', 'RSA key detected via content analysis - revolutionary proxy fix will be applied as fallback');
          } else {
            this.emit('debug', 'Non-RSA key detected via content analysis - no proxy needed');
          }
        }
      }
    } else {
      this.emit('debug', 'Password authentication - no RSA-SHA2 fix needed');
    }

    if (needsRSAFix) {
      // Apply revolutionary proxy fix for ALL RSA keys (both OpenSSH and PKCS#1)
      this.emit('debug', 'RSA key detected - using revolutionary proxy fix for RSA-SHA2 compatibility');
      this.ssh = applyRevolutionaryProxyFix(originalSSH, (msg: string) => this.emit('debug', msg));
    } else {
      // No RSA-SHA2 fix needed for non-RSA keys (ECDSA, Ed25519, etc.)
      this.emit('debug', 'Non-RSA key detected - using standard ssh2-streams');
      this.ssh = originalSSH;
    }

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Socket events
    this.socket.on('connect', () => {
      this.emit('debug', 'Socket connected');
    });

    this.socket.on('error', (err) => {
      this.emit('error', err);
    });

    this.socket.on('close', () => {
      this.connected = false;
      this.authenticated = false;
      this.emit('close');
    });

    // SSH events
    this.ssh.on('ready', () => {
      this.emit('debug', 'SSH handshake complete, requesting ssh-userauth');
      this.ssh.service('ssh-userauth');
    });

    this.ssh.on('SERVICE_ACCEPT', (serviceName: string) => {
      this.emit('debug', `Service accepted: ${serviceName}`);
      
      if (serviceName === 'ssh-userauth') {
        this.startAuthentication();
      }
    });

    this.ssh.on('USERAUTH_SUCCESS', () => {
      this.emit('debug', 'Authentication successful');
      this.authenticated = true;
      this.connected = true;
      this.emit('ready');
    });

    this.ssh.on('USERAUTH_FAILURE', (methods: string[], _partial: boolean) => {
      this.emit('error', new Error(`Authentication failed. Available methods: ${methods.join(', ')}`));
    });

    this.ssh.on('USERAUTH_BANNER', (_message: string) => {
      this.emit('debug', 'Server banner received');
    });

    // Channel events
    this.ssh.on('CHANNEL_OPEN_CONFIRMATION:0', (info: any) => {
      this.emit('debug', `Channel opened successfully: ${JSON.stringify(info)}`);
      
      // Adaptive window size detection
      this.currentWindowSize = info.window;
      this.serverMaxWindowSize = info.window;
      
      // Auto-adjust initial window size based on server capability
      this.initialWindowSize = this.calculateOptimalWindowSize(info.window);
      
      this.emit('debug', `Server window: ${info.window} bytes, calculated optimal: ${this.initialWindowSize} bytes`);
      
      // Only adjust if server window is significantly smaller than our target
      if (this.currentWindowSize < this.initialWindowSize * 0.8) {
        const adjustment = this.initialWindowSize - this.currentWindowSize;
        this.emit('debug', `Adjusting window from ${this.currentWindowSize} to ${this.initialWindowSize} (+${adjustment} bytes)`);
        this.ssh.channelWindowAdjust(0, adjustment);
        this.currentWindowSize = this.initialWindowSize;
      } else {
        this.emit('debug', `Using server window size: ${this.currentWindowSize} bytes (no adjustment needed)`);
        this.initialWindowSize = this.currentWindowSize; // Use what server provides
      }
      
      // CRITICAL FIX: Track maximum packet size to prevent exceeding SSH channel limits
      this.maxPacketSize = info.packetSize || 32768; // Default to 32KB (server constraint)
      // SFTP WRITE overhead: 4(pkt_len) + 1(ssh_msg) + 4(channel) + 4(sftp_len) + 1(sftp_type) + 4(req_id) + 4(handle_len) + handle + 8(offset) + 4(data_len)
      // = 34 bytes + handle_length (typically 4-8 bytes, but can be up to 256 bytes per SFTP spec)
      const baseSftpOverhead = 34; // Fixed overhead without handle
      const maxHandleSize = 32; // Conservative estimate for handle size (SFTP spec allows up to 256, but most servers use 4-8)
      const sftpOverhead = baseSftpOverhead + maxHandleSize; // 66 bytes total conservative overhead
      const maxDataSize = this.maxPacketSize - sftpOverhead;
      this.emit('debug', `SSH max packet size: ${this.maxPacketSize}, SFTP overhead: ${sftpOverhead}B (${baseSftpOverhead}B + ${maxHandleSize}B handle), max data chunk: ${maxDataSize} bytes`);
      
      // Warn if the default chunk sizes might be too large
      if (maxDataSize < 32768) {
        this.emit('debug', `⚠️ SSH packet size limit (${this.maxPacketSize}) restricts SFTP chunks to ${maxDataSize} bytes`);
      }
      
      // Create channel wrapper immediately and store it
      const channel = this.createChannelWrapper(info);
      this.sftpChannel = channel;
      
      const callback = this.pendingChannels.get(0);
      if (callback) {
        callback(undefined, channel);
        this.pendingChannels.delete(0);
      } else {
        this.emit('debug', 'WARNING: No pending callback for channel 0');
      }
    });

    this.ssh.on('CHANNEL_SUCCESS:0', () => {
      this.emit('debug', 'SFTP subsystem started successfully');
      // Also adjust window here to ensure we can receive SFTP data
      this.emit('debug', 'Adjusting window size after SFTP subsystem start');
      this.ssh.channelWindowAdjust(0, 131072); // Increased from 32KB to 128KB for better performance
    });

    this.ssh.on('CHANNEL_FAILURE:0', () => {
      this.emit('error', new Error('SFTP subsystem request failed'));
    });

    this.ssh.on('CHANNEL_DATA:0', (data: Buffer) => {
      this.emit('debug', `Received CHANNEL_DATA:0: ${data.length} bytes`);
      if (this.sftpChannel) {
        this.sftpChannel.emit('data', data);
      } else {
        this.emit('debug', 'WARNING: Received channel data but no SFTP channel to forward to');
      }
    });

    this.ssh.on('CHANNEL_CLOSE:0', () => {
      if (this.sftpChannel) {
        this.sftpChannel.emit('close');
      }
    });

    this.ssh.on('CHANNEL_WINDOW_ADJUST:0', (bytesToAdd: number) => {
      // CRITICAL FIX: Handle server's window adjustment messages
      // This fixes the 32KB chunk timeout bug by properly tracking available window space
      const oldWindow = this.currentWindowSize;
      this.currentWindowSize += bytesToAdd;
      this.emit('debug', `Channel window adjusted: ${oldWindow} + ${bytesToAdd} = ${this.currentWindowSize} bytes`);
    });

    this.ssh.on('GLOBAL_REQUEST', () => {
      // Ignore global requests like host key announcements
    });

    this.ssh.on('error', (err: Error) => {
      this.emit('error', err);
    });

    this.ssh.on('close', () => {
      this.emit('close');
    });


    // Standard SSH stream piping - RSA-SHA2 fix is applied via proxy
    this.socket.pipe(this.ssh).pipe(this.socket);
  }

  private startAuthentication(): void {
    if (this.config.password) {
      this.emit('debug', 'Starting password authentication');
      this.ssh.authPassword(this.config.username, this.config.password);
    } else if (this.config.privateKey) {
      this.emit('debug', 'Starting public key authentication');
      
      try {
        let parsedKey: any = null;
        
        // Use enhanced key parser exclusively (pure JavaScript)
        this.emit('debug', 'Using pure JavaScript key parser (no dependencies)');
        parsedKey = parseKey(this.config.privateKey, this.config.passphrase);
        
        if (parsedKey) {
          this.emit('debug', 'Pure JavaScript key parsing successful');
        } else {
          throw new Error('Key parsing failed: Pure JavaScript parser could not parse the provided key');
        }
        
        const publicKeySSH = parsedKey.getPublicSSH();
        this.emit('debug', `Public key SSH format generated: ${publicKeySSH.length} bytes`);

        // Pure JS signing fix handles all key types including RSA-SHA2
        this.emit('debug', `Using pure JS signing for ${parsedKey.type} key`);
        const signatureCallback = (buf: Buffer, cb: (signature: Buffer) => void) => {
          try {
            // For RSA keys, use rsa-sha2-256 algorithm to match revolutionary proxy expectations
            const algorithm = (parsedKey.type === 'ssh-rsa') ? 'rsa-sha2-256' : undefined;
            const signature = parsedKey.sign(buf, algorithm);
            cb(signature);
          } catch (error) {
            throw new Error(`Pure JS signing failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        };

        // Authenticate with public key using appropriate signature method
        this.ssh.authPK(this.config.username, publicKeySSH, (buf: Buffer, cb: (signature: Buffer) => void) => {
          try {
            this.emit('debug', `Generating signature for ${buf.length} bytes of challenge data`);
            signatureCallback(buf, (signature: Buffer) => {
              this.emit('debug', `Signature generated: ${signature?.length || 'undefined'} bytes`);
              cb(signature);
            });
          } catch (error) {
            this.emit('error', new Error(`Authentication signing failed: ${error instanceof Error ? error.message : String(error)}`));
          }
        });
      } catch (error) {
        this.emit('error', new Error(`Key parsing failed: ${error instanceof Error ? error.message : String(error)}`));
      }
    } else {
      this.emit('error', new Error('No authentication method provided: must provide either password or privateKey'));
    }
  }

  private createChannelWrapper(info: any): SFTPChannel {
    const channelEmitter = new EventEmitter();
    
    // Extend EventEmitter with our methods
    const channel = Object.assign(channelEmitter, {
      write: (data: Buffer) => {
        const oldWindow = this.currentWindowSize;
        
        // Let SSH handle window management internally - don't interfere
        // Just track current window for concurrency calculations
        this.emit('debug', `Sending packet: ${data.length} bytes (window tracking: ${this.currentWindowSize} bytes available)`);
        
        // Don't manually deplete window - ssh2-streams handles this correctly
        // Our role is just to provide window size for concurrency calculations
        
        // Add warning if window is getting low
        if (this.currentWindowSize < 65536) { // Less than 64KB remaining
          this.emit('debug', `⚠️ Channel window getting low: ${this.currentWindowSize} bytes remaining`);
        }
        
        this.ssh.channelData(info.recipient, data);
      },
      end: () => {
        this.ssh.channelClose(info.recipient);
      }
    }) as SFTPChannel;
    
    return channel;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const connectTimeout = this.config?.connectTimeout ?? 30000;
      const timeout = setTimeout(() => {
        reject(new Error(`Connection timeout after ${connectTimeout}ms`));
      }, connectTimeout);

      this.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      // Connect to server
      this.socket.connect(this.config.port || 22, this.config.host);
    });
  }

  async openSFTP(): Promise<SFTPChannel> {
    if (!this.connected || !this.authenticated) {
      throw new Error('Not connected or authenticated');
    }

    return new Promise((resolve, reject) => {
      const sftpTimeout = this.config?.connectTimeout ?? 30000;
      const timeout = setTimeout(() => {
        reject(new Error(`SFTP open timeout after ${sftpTimeout}ms`));
      }, sftpTimeout);

      // Use channel 0 for session (ssh2-streams default)
      const channelId = 0;
      this.pendingChannels.set(channelId, (err?: Error, channel?: SFTPChannel) => {
        clearTimeout(timeout);
        
        if (err) {
          reject(err);
          return;
        }

        if (!channel) {
          reject(new Error('No channel received'));
          return;
        }

        // Request SFTP subsystem
        this.ssh.subsystem(0, 'sftp', true);

        // Wait for subsystem success
        const successHandler = () => {
          this.ssh.removeListener('CHANNEL_FAILURE:0', failureHandler);
          resolve(channel);
        };

        const failureHandler = () => {
          this.ssh.removeListener('CHANNEL_SUCCESS:0', successHandler);
          reject(new Error('SFTP subsystem request failed'));
        };

        this.ssh.once('CHANNEL_SUCCESS:0', successHandler);
        this.ssh.once('CHANNEL_FAILURE:0', failureHandler);
      });

      // Open session channel with adaptive window size based on server capabilities
      const sessionWindow = this.initialWindowSize || 524288; // Use adaptive or fallback to 512KB
      const sessionPacket = this.maxPacketSize; // Use detected packet size
      this.ssh.session(0, sessionWindow, sessionPacket);
    });
  }

  disconnect(): void {
    if (this.socket && !this.socket.destroyed) {
      this.socket.destroy();
    }
    this.connected = false;
    this.authenticated = false;
  }

  isConnected(): boolean {
    return this.connected && this.authenticated;
  }

  getCurrentWindowSize(): number {
    return this.currentWindowSize;
  }

  getSafeConcurrency(chunkSize: number, maxConcurrency: number = 64): number {
    if (this.currentWindowSize <= 0) {
      return 1; // Conservative fallback
    }
    
    // Calculate how many chunks of this size can fit in the current window
    const windowBasedConcurrency = Math.floor(this.currentWindowSize / chunkSize);
    
    // Use the minimum of window-based limit and desired max concurrency
    const safeConcurrency = Math.min(maxConcurrency, Math.max(1, windowBasedConcurrency));
    
    this.emit('debug', `Dynamic concurrency: window=${this.currentWindowSize}B, chunk=${chunkSize}B, safe=${safeConcurrency}x (max ${maxConcurrency}x)`);
    
    return safeConcurrency;
  }

  getOptimalConcurrency(chunkSize: number): number {
    // Adaptive concurrency based on current performance metrics
    const baseTargetUsage = 0.8; // 80% window usage
    const targetWindowUsage = Math.floor(this.currentWindowSize * baseTargetUsage);
    const theoreticalMax = Math.floor(targetWindowUsage / chunkSize);
    
    // Adaptive practical limits based on server performance
    let practicalMax = 8; // Very conservative default for stability
    
    // Adjust based on success rate
    const totalOps = this.adaptiveMetrics.successfulTransfers + this.adaptiveMetrics.timeouts;
    if (totalOps > 5) {
      const successRate = this.adaptiveMetrics.successfulTransfers / totalOps;
      
      if (successRate > 0.95) {
        // Excellent performance - allow higher concurrency (but stay conservative)
        practicalMax = Math.min(12, practicalMax + 2); // Gradual increase
      } else if (successRate < 0.8) {
        // Poor performance - reduce concurrency
        practicalMax = Math.max(2, Math.floor(practicalMax * 0.7));
      }
    }
    
    const optimalConcurrency = Math.min(theoreticalMax, practicalMax, Math.max(1, theoreticalMax));
    
    this.emit('debug', `Adaptive concurrency: window=${this.currentWindowSize}B, chunk=${chunkSize}B, theoretical=${theoreticalMax}, practical=${practicalMax}, optimal=${optimalConcurrency}`);
    
    return optimalConcurrency;
  }

  /**
   * Get maximum safe SFTP chunk size based on SSH packet size limits
   */
  getMaxSafeChunkSize(): number {
    // SFTP WRITE overhead: SSH headers + SFTP headers + handle (conservative estimate)
    const baseSftpOverhead = 34; // Fixed overhead without handle
    const maxHandleSize = 32; // Conservative estimate for handle size
    const sftpOverhead = baseSftpOverhead + maxHandleSize; // 66 bytes total
    return Math.max(8192, this.maxPacketSize - sftpOverhead); // At least 8KB, but respect packet limits
  }

  /**
   * Calculate adaptive timeout based on server performance
   */
  getAdaptiveTimeout(operationType: 'control' | 'data' | 'connection', dataSize: number = 0): number {
    const baseTimeout = this.adaptiveMetrics.serverCapabilities.preferredTimeout;
    const responseTime = this.adaptiveMetrics.avgResponseTime;
    
    switch (operationType) {
      case 'control':
        // Control operations should be fast - base on response time
        return Math.max(5000, responseTime * 20);
      
      case 'data':
        // Data operations scale with size and server performance
        const sizeMultiplier = Math.max(1, Math.log10(dataSize / 1024)); // Scale with data size
        const performanceMultiplier = responseTime > 1000 ? 2 : 1; // Slower servers need more time
        return Math.max(10000, baseTimeout * sizeMultiplier * performanceMultiplier);
      
      case 'connection':
        // Connection operations based on server responsiveness
        return Math.max(15000, responseTime * 100);
      
      default:
        return baseTimeout;
    }
  }

  /**
   * Calculate optimal chunk size based on server capabilities and performance
   */
  getAdaptiveChunkSize(transferType: 'upload' | 'download', bytesProcessed: number = 0): number {
    const serverOptimal = this.adaptiveMetrics.serverCapabilities.optimalChunkSize;
    const maxSafe = this.getMaxSafeChunkSize();
    
    // Different strategies for upload vs download
    if (transferType === 'upload') {
      // Uploads can be more aggressive based on server performance
      const successRate = this.getSuccessRate();
      if (successRate > 0.95) {
        return Math.min(maxSafe, serverOptimal * 4); // Up to 4x for excellent performance
      } else if (successRate > 0.8) {
        return Math.min(maxSafe, serverOptimal * 2); // 2x for good performance
      } else {
        return Math.min(maxSafe, serverOptimal); // Conservative for poor performance
      }
    } else {
      // Downloads are more conservative due to server limitations we observed
      const baseSize = Math.min(serverOptimal, maxSafe / 4); // Start very conservative
      
      // Gradually increase based on bytes processed successfully
      if (bytesProcessed > 1024 * 1024) { // After 1MB
        return Math.min(maxSafe / 2, baseSize * 2);
      } else if (bytesProcessed > 256 * 1024) { // After 256KB
        return Math.min(maxSafe / 4, baseSize * 1.5);
      } else {
        return baseSize;
      }
    }
  }

  /**
   * Get current success rate for adaptive decisions
   */
  private getSuccessRate(): number {
    const total = this.adaptiveMetrics.successfulTransfers + this.adaptiveMetrics.timeouts;
    return total > 0 ? this.adaptiveMetrics.successfulTransfers / total : 1;
  }

  /**
   * Calculate optimal window size based on server capabilities
   */
  private calculateOptimalWindowSize(serverWindow: number): number {
    // Fully adaptive calculation based on server-provided window
    // Use server capabilities without hardcoded limits
    const serverBasedMinimum = Math.max(32768, Math.floor(serverWindow * 0.1)); // 10% of server window as minimum
    const serverBasedMaximum = Math.min(serverWindow, Math.floor(serverWindow * 1.5)); // 150% of server window as maximum
    const targetWindow = Math.floor(serverWindow * 0.8); // 80% utilization target
    
    const optimalSize = Math.max(serverBasedMinimum, Math.min(serverBasedMaximum, targetWindow));
    
    this.emit('debug', `Window calculation: server=${serverWindow}, target=${targetWindow}, optimal=${optimalSize}`);
    return optimalSize;
  }

  /**
   * Dynamically adjust parameters based on transfer performance
   */
  adaptPerformance(transferSpeed: number, hadTimeout: boolean, responseTimeMs?: number): void {
    const now = Date.now();
    
    // Update metrics
    if (hadTimeout) {
      this.adaptiveMetrics.timeouts++;
      // Increase preferred timeout on repeated timeouts
      this.adaptiveMetrics.serverCapabilities.preferredTimeout = 
        Math.min(120000, this.adaptiveMetrics.serverCapabilities.preferredTimeout * 1.2);
    } else {
      this.adaptiveMetrics.successfulTransfers++;
      this.adaptiveMetrics.avgTransferSpeed = 
        (this.adaptiveMetrics.avgTransferSpeed + transferSpeed) / 2;
      
      // Update response time tracking
      if (responseTimeMs) {
        this.adaptiveMetrics.avgResponseTime = 
          (this.adaptiveMetrics.avgResponseTime + responseTimeMs) / 2;
      }
      
      // Learn optimal chunk size from successful transfers
      if (transferSpeed > 10) { // Good speed - try larger chunks
        this.adaptiveMetrics.serverCapabilities.optimalChunkSize = 
          Math.min(this.getMaxSafeChunkSize(), 
                   this.adaptiveMetrics.serverCapabilities.optimalChunkSize * 1.1);
      }
    }
    
    // Only adjust every 30 seconds to avoid oscillation
    if (now - this.adaptiveMetrics.lastAdjustmentTime < 30000) {
      return;
    }
    
    this.adaptiveMetrics.lastAdjustmentTime = now;
    
    // Calculate success rate
    const totalOps = this.adaptiveMetrics.successfulTransfers + this.adaptiveMetrics.timeouts;
    const successRate = totalOps > 0 ? this.adaptiveMetrics.successfulTransfers / totalOps : 1;
    
    this.emit('debug', `Performance metrics: success=${successRate.toFixed(2)}, speed=${this.adaptiveMetrics.avgTransferSpeed.toFixed(2)}MB/s, timeouts=${this.adaptiveMetrics.timeouts}`);
    
    // Adapt window size based on performance - fully adaptive to server capabilities
    if (successRate < 0.8 && this.adaptiveMetrics.timeouts > 2) {
      // Poor performance - reduce window size based on server capabilities
      const serverMinimum = Math.max(32768, Math.floor(this.serverMaxWindowSize * 0.1));
      const newWindow = Math.max(serverMinimum, Math.floor(this.initialWindowSize * 0.7));
      if (newWindow !== this.initialWindowSize) {
        this.emit('debug', `Reducing window size due to timeouts: ${this.initialWindowSize} → ${newWindow}`);
        this.initialWindowSize = newWindow;
      }
    } else if (successRate > 0.95 && this.adaptiveMetrics.avgTransferSpeed > 50) {
      // Excellent performance - try increasing window up to server maximum
      const newWindow = Math.min(this.serverMaxWindowSize, Math.floor(this.initialWindowSize * 1.2));
      if (newWindow !== this.initialWindowSize) {
        this.emit('debug', `Increasing window size due to good performance: ${this.initialWindowSize} → ${newWindow}`);
        this.initialWindowSize = newWindow;
      }
    }
  }

  /**
   * Send SSH keepalive ping - uses connection validation
   */
  async ping(): Promise<void> {
    if (!this.connected || !this.authenticated) {
      throw new Error('Not connected');
    }

    return new Promise((resolve, reject) => {
      try {
        // Simple connection validation - the ssh2-streams library doesn't expose
        // a ping method, so we just validate the connection state
        this.emit('debug', 'Validating SSH connection for keepalive');
        
        if (this.socket && !this.socket.destroyed && this.connected && this.authenticated) {
          this.emit('debug', 'SSH connection validation successful');
          resolve();
        } else {
          reject(new Error('SSH connection validation failed'));
        }
      } catch (err) {
        reject(err);
      }
    });
  }
}