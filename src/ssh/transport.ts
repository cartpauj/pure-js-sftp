/**
 * SSH Transport Layer
 * Handles low-level SSH connection, version exchange, and packet transport
 */

import { Socket } from 'net';
import { EventEmitter } from 'events';
import { PacketParser, PacketBuilder, PacketReader } from './packet';
import { SSHConfig, SSHPacket, ConnectionState, SSHError } from './types';
import { SSH_MSG, PROTOCOL_VERSION } from './constants';

export class SSHTransport extends EventEmitter {
  private socket: Socket | null = null;
  private config: SSHConfig;
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private packetParser: PacketParser;
  private serverVersion: string = '';
  private clientVersion: string = PROTOCOL_VERSION;
  private versionBuffer: string = '';
  private sessionId: Buffer | null = null;

  constructor(config: SSHConfig) {
    super();
    this.config = config;
    this.packetParser = new PacketParser();
  }

  /**
   * Reset state for new connection
   */
  private reset(): void {
    this.serverVersion = '';
    this.versionBuffer = '';
    this.state = ConnectionState.DISCONNECTED;
    this.socket = null;
    this.sessionId = null;
  }

  /**
   * Connect to SSH server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.reset();
        this.state = ConnectionState.CONNECTING;
        
        // Create socket connection
        this.socket = new Socket();
        
        // Set up socket event handlers
        this.setupSocketHandlers(resolve, reject);
        
        // Connect to server
        const port = this.config.port || 22;
        this.socket.connect(port, this.config.host);
        
        // Set timeout if specified
        if (this.config.timeout) {
          this.socket.setTimeout(this.config.timeout);
        }
        
      } catch (error) {
        reject(new SSHError(`Connection failed: ${error}`, 'CONNECTION_ERROR'));
      }
    });
  }

  /**
   * Set up socket event handlers
   */
  private setupSocketHandlers(resolve: (value: void) => void, reject: (reason: any) => void): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this.debug('Socket connected');
      this.state = ConnectionState.VERSION_EXCHANGE;
      this.startVersionExchange();
    });

    this.socket.on('data', (data: Buffer) => {
      this.handleIncomingData(data, resolve, reject);
    });

    this.socket.on('error', (error: Error) => {
      this.debug(`Socket error: ${error.message}`);
      const sshError = new SSHError(`Socket error: ${error.message}`, 'SOCKET_ERROR');
      if (this.state === ConnectionState.CONNECTING || this.state === ConnectionState.VERSION_EXCHANGE) {
        reject(sshError);
      } else {
        this.emit('error', sshError);
      }
    });

    this.socket.on('close', () => {
      this.debug(`Socket closed (was in state: ${this.state})`);
      this.state = ConnectionState.DISCONNECTED;
      this.emit('close');
    });

    this.socket.on('timeout', () => {
      this.debug('Socket timeout');
      const error = new SSHError('Connection timeout', 'TIMEOUT');
      if (this.state === ConnectionState.CONNECTING || this.state === ConnectionState.VERSION_EXCHANGE) {
        reject(error);
      } else {
        this.emit('error', error);
      }
    });
  }

  /**
   * Handle incoming data from socket
   */
  private handleIncomingData(data: Buffer, resolve?: (value: void) => void, reject?: (reason: any) => void): void {
    this.debug(`Received ${data.length} bytes: ${data.subarray(0, Math.min(32, data.length)).toString('hex')}${data.length > 32 ? '...' : ''}`);

    if (this.state === ConnectionState.VERSION_EXCHANGE) {
      this.handleVersionExchange(data, resolve, reject);
    } else {
      // Add data to packet parser and process SSH packets
      this.packetParser.addData(data);
      const packets = this.packetParser.parseSSHPackets();
      
      for (const packet of packets) {
        this.handleSSHPacket(packet);
      }
    }
  }

  /**
   * Start SSH version exchange
   */
  private startVersionExchange(): void {
    if (!this.socket) return;
    
    // Send client version string
    const versionString = `${this.clientVersion}\r\n`;
    this.socket.write(versionString);
    this.debug(`Sent version: ${this.clientVersion}`);
  }

  /**
   * Handle SSH version exchange
   */
  private handleVersionExchange(data: Buffer, resolve?: (value: void) => void, reject?: (reason: any) => void): void {
    // Accumulate data in version buffer
    this.versionBuffer += data.toString('utf8');
    
    // Check if we have a complete version line (ending with \r\n)
    if (this.versionBuffer.includes('\r\n')) {
      const lines = this.versionBuffer.split('\r\n');
      
      for (const line of lines) {
        if (line.startsWith('SSH-')) {
          this.serverVersion = line.trim();
          this.debug(`Server version: ${this.serverVersion}`);
          
          // Validate server version
          if (!this.serverVersion.startsWith('SSH-2.0')) {
            const error = new SSHError(`Unsupported SSH version: ${this.serverVersion}`, 'VERSION_ERROR');
            if (reject) {
              reject(error);
              return;
            }
            throw error;
          }
          
          // Version exchange complete, move to key exchange
          this.state = ConnectionState.KEY_EXCHANGE;
          this.emit('versionExchange', this.serverVersion);
          
          // Clear the version buffer
          this.versionBuffer = '';
          
          if (resolve) resolve();
          return;
        }
      }
    }
  }

  /**
   * Handle SSH packets
   */
  private handleSSHPacket(packet: SSHPacket): void {
    this.debug(`Received SSH packet type: ${packet.type}, payload size: ${packet.payload.length}`);
    
    switch (packet.type) {
      case SSH_MSG.KEXINIT:
        this.emit('kexinit', packet.payload);
        break;
      case SSH_MSG.KEXDH_REPLY:  // ADDED
        this.emit('kexdhReply', packet.payload);
        break;
      case SSH_MSG.NEWKEYS:
        this.emit('newkeys');
        break;
      case SSH_MSG.SERVICE_ACCEPT:
        this.emit('serviceAccept', packet.payload);
        break;
      case SSH_MSG.USERAUTH_SUCCESS:
        this.state = ConnectionState.AUTHENTICATED;
        this.emit('authSuccess');
        break;
      case SSH_MSG.USERAUTH_FAILURE:
        this.emit('authFailure', packet.payload);
        break;
      case SSH_MSG.USERAUTH_PK_OK:  // ADDED  
        this.emit('pkOk', packet.payload);
        break;
      case SSH_MSG.CHANNEL_OPEN_CONFIRMATION:
        this.emit('channelOpenConfirmation', packet.payload);
        break;
      case SSH_MSG.CHANNEL_DATA:
        this.emit('channelData', packet.payload);
        break;
      case SSH_MSG.DISCONNECT:
        this.handleDisconnect(packet.payload);
        break;
      default:
        this.debug(`Unhandled SSH packet type: ${packet.type}`);
        break;
    }
  }

  /**
   * Handle disconnect message
   */
  private handleDisconnect(payload: Buffer): void {
    try {
      const reader = new PacketReader(payload);
      const reasonCode = reader.readUInt32();
      const description = reader.readString();
      const languageTag = reader.readString();
      
      this.debug(`Server disconnected: reason=${reasonCode}, description="${description}", language="${languageTag}"`);
      this.emit('error', new SSHError(`Server disconnected: ${description} (code: ${reasonCode})`, 'DISCONNECT'));
    } catch (error) {
      this.debug(`Server disconnected (could not parse reason): ${error}`);
      this.emit('error', new SSHError('Server disconnected unexpectedly', 'DISCONNECT'));
    }
    this.disconnect();
  }

  /**
   * Send SSH packet
   */
  sendPacket(type: SSH_MSG, payload: Buffer = Buffer.alloc(0)): void {
    if (!this.socket || this.state === ConnectionState.DISCONNECTED) {
      throw new SSHError('Not connected', 'NOT_CONNECTED');
    }
    
    const packet = PacketBuilder.buildSSHPacket(type, payload);
    this.socket.write(packet);
    this.debug(`Sent SSH packet type: ${type}, size: ${packet.length}`);
  }

  /**
   * Send raw data (for version exchange)
   */
  sendRawData(data: Buffer): void {
    if (!this.socket) {
      throw new SSHError('Not connected', 'NOT_CONNECTED');
    }
    
    this.socket.write(data);
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    if (this.socket) {
      this.state = ConnectionState.DISCONNECTING;
      this.socket.destroy();
      this.socket = null;
    }
    this.state = ConnectionState.DISCONNECTED;
  }

  /**
   * Get connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Set connection state
   */
  setState(state: ConnectionState): void {
    this.state = state;
  }

  /**
   * Get server version
   */
  getServerVersion(): string {
    return this.serverVersion;
  }

  /**
   * Get client version
   */
  getClientVersion(): string {
    return this.clientVersion;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.socket !== null && this.state !== ConnectionState.DISCONNECTED;
  }

  /**
   * Set session ID (called by KexManager after key exchange)
   */
  setSessionId(sessionId: Buffer): void {
    this.sessionId = sessionId;
  }

  /**
   * Get session ID
   */
  getSessionId(): Buffer | null {
    return this.sessionId;
  }

  /**
   * Debug logging
   */
  private debug(message: string): void {
    if (this.config.debug) {
      console.log(`[SSH Transport] ${message}`);
    }
  }
}