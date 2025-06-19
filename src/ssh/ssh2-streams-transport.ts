import { EventEmitter } from 'events';
import { Socket } from 'net';
import * as ssh2Streams from 'ssh2-streams';

export interface SSH2StreamsConfig {
  host: string;
  port?: number;
  username: string;
  privateKey?: Buffer | string;
  password?: string;
  passphrase?: string;
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

  constructor(config: SSH2StreamsConfig) {
    super();
    this.config = config;
    this.socket = new Socket();
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
    
    // Apply RSA-SHA2 proxy fix for modern SSH server compatibility
    const { applyRevolutionaryProxyFix } = require('./revolutionary-proxy-fix');
    this.ssh = applyRevolutionaryProxyFix(originalSSH, (msg: string) => this.emit('debug', msg));

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
      
      // Adjust channel window size if it's 0
      if (info.window === 0) {
        this.emit('debug', 'Channel window size is 0, adjusting to 65536 bytes');
        this.ssh.channelWindowAdjust(0, 65536);
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
      this.ssh.channelWindowAdjust(0, 32768);
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
        
        // First try ssh2-streams parser
        try {
          this.emit('debug', 'Attempting ssh2-streams key parsing');
          const parsedKeys = ssh2Streams.utils.parseKey(this.config.privateKey, this.config.passphrase);
          
          // Check if parsing was successful
          if (parsedKeys && (Array.isArray(parsedKeys) ? parsedKeys.length > 0 : true)) {
            const key = Array.isArray(parsedKeys) ? parsedKeys[0] : parsedKeys;
            if (key && typeof key.getPublicSSH === 'function') {
              parsedKey = key;
              this.emit('debug', 'ssh2-streams key parsing successful');
            }
          }
        } catch (ssh2StreamsError) {
          this.emit('debug', `ssh2-streams parsing failed: ${ssh2StreamsError instanceof Error ? ssh2StreamsError.message : String(ssh2StreamsError)}`);
        }
        
        // If ssh2-streams failed, try our enhanced key parser
        if (!parsedKey) {
          this.emit('debug', 'Falling back to enhanced key parser');
          const { parseKey } = require('./enhanced-key-parser');
          parsedKey = parseKey(this.config.privateKey, this.config.passphrase);
          
          if (parsedKey) {
            this.emit('debug', 'Enhanced key parsing successful');
          } else {
            throw new Error('Key parsing failed: Enhanced parser with sshpk fallback could not parse the provided key');
          }
        }
        
        const publicKeySSH = parsedKey.getPublicSSH();
        this.emit('debug', `Public key SSH format generated: ${publicKeySSH.length} bytes`);

        // Use RSA-SHA2 signature wrapper for RSA keys to ensure modern cryptographic signatures
        let signatureCallback: (buf: Buffer, cb: (signature: Buffer) => void) => void;
        
        if (parsedKey.type === 'ssh-rsa') {
          this.emit('debug', 'Using RSA-SHA2 signature wrapper');
          
          try {
            const { createRSASHA2SignatureCallback } = require('./rsa-sha2-wrapper');
            signatureCallback = createRSASHA2SignatureCallback(parsedKey, this.config.privateKey, this.config.passphrase, 'sha256');
          } catch (wrapperError) {
            this.emit('debug', `RSA-SHA2 wrapper failed, using original signing: ${wrapperError instanceof Error ? wrapperError.message : String(wrapperError)}`);
            signatureCallback = (buf: Buffer, cb: (signature: Buffer) => void) => {
              try {
                const signature = parsedKey.sign(buf);
                cb(signature);
              } catch (error) {
                throw new Error(`Signing failed: ${error instanceof Error ? error.message : String(error)}`);
              }
            };
          }
        } else {
          // Use original signing for non-RSA keys (Ed25519, ECDSA)
          this.emit('debug', `Using original signing for ${parsedKey.type} key`);
          signatureCallback = (buf: Buffer, cb: (signature: Buffer) => void) => {
            try {
              const signature = parsedKey.sign(buf);
              cb(signature);
            } catch (error) {
              throw new Error(`Signing failed: ${error instanceof Error ? error.message : String(error)}`);
            }
          };
        }

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
        this.emit('debug', `Sending channel data: ${data.length} bytes`);
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
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 30000);

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
      const timeout = setTimeout(() => {
        reject(new Error('SFTP open timeout'));
      }, 15000);

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

      // Open session channel with proper window size and packet size
      this.ssh.session(0, 65536, 32768);
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
}