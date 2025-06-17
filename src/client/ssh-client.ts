/**
 * Main SSH Client that integrates all components
 */

import { EventEmitter } from 'events';
import { SSHTransport } from '../ssh/transport';
import { KexManager } from '../kex/kex-manager';
import { AuthManager } from '../auth/auth-manager';
import { SFTPClient } from '../sftp/sftp-client';
import { SSHConfig, ConnectionState, SSHError } from '../ssh/types';

export class SSHClient extends EventEmitter {
  private config: SSHConfig;
  private transport: SSHTransport;
  private kexManager: KexManager;
  private authManager: AuthManager;
  private sftpClient: SFTPClient;
  private connected: boolean = false;

  constructor(config: SSHConfig) {
    super();
    this.config = config;
    this.transport = new SSHTransport(config);
    this.kexManager = new KexManager(this.transport);
    this.authManager = new AuthManager(this.transport, config);
    this.sftpClient = new SFTPClient(this.transport);
    
    this.setupEventHandlers();
  }

  /**
   * Set up event handlers between components
   */
  private setupEventHandlers(): void {
    // Transport events
    this.transport.on('error', (error) => this.emit('error', error));
    this.transport.on('close', () => {
      this.connected = false;
      this.emit('close');
    });

    // KEX events
    this.kexManager.on('kexComplete', () => {
      this.authManager.authenticate();
    });
    this.kexManager.on('error', (error) => this.emit('error', error));

    // Auth events
    this.authManager.on('authComplete', () => {
      this.connected = true;
      this.emit('ready');
    });
    this.authManager.on('error', (error) => this.emit('error', error));

    // SFTP events
    this.sftpClient.on('error', (error) => this.emit('error', error));
  }

  /**
   * Connect to SSH server
   */
  async connect(): Promise<void> {
    try {
      await this.transport.connect();
      // KEX will start automatically after version exchange
    } catch (error) {
      throw new SSHError(`Connection failed: ${error}`, 'CONNECTION_FAILED');
    }
  }

  /**
   * Initialize SFTP subsystem
   */
  async sftp(): Promise<SFTPClient> {
    if (!this.connected) {
      throw new SSHError('Not connected', 'NOT_CONNECTED');
    }

    await this.sftpClient.initSFTP();
    return this.sftpClient;
  }

  /**
   * End connection
   */
  end(): void {
    this.transport.disconnect();
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get connection state
   */
  getState(): ConnectionState {
    return this.transport.getState();
  }

  /**
   * Get SSH session ID
   * The session ID is generated during key exchange and remains constant for the connection
   */
  getSessionId(): Buffer | null {
    return this.kexManager.getSessionId();
  }
}