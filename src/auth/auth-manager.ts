/**
 * SSH Authentication Manager
 */

import { EventEmitter } from 'events';
import { SSHTransport } from '../ssh/transport';
import { PacketBuilder, PacketReader } from '../ssh/packet';
import { SSH_MSG } from '../ssh/constants';
import { SSHConfig, AuthContext, SSHError } from '../ssh/types';
import { CryptoUtils } from '../crypto/utils';

export class AuthManager extends EventEmitter {
  private transport: SSHTransport;
  private config: SSHConfig;
  private context: AuthContext;

  constructor(transport: SSHTransport, config: SSHConfig) {
    super();
    this.transport = transport;
    this.config = config;
    this.context = {
      username: config.username,
      service: 'ssh-connection',
      method: '',
      authenticated: false
    };
    this.setupTransportHandlers();
  }

  /**
   * Set up transport event handlers
   */
  private setupTransportHandlers(): void {
    this.transport.on('serviceAccept', () => {
      this.startAuthentication();
    });

    this.transport.on('authSuccess', () => {
      this.context.authenticated = true;
      this.emit('authComplete', this.context);
    });

    this.transport.on('authFailure', (payload: Buffer) => {
      this.handleAuthFailure(payload);
    });
  }

  /**
   * Start authentication process
   */
  authenticate(): void {
    // Request ssh-connection service
    const servicePayload = PacketBuilder.buildString(this.context.service);
    this.transport.sendPacket(SSH_MSG.SERVICE_REQUEST, servicePayload);
  }

  /**
   * Start authentication after service accepted
   */
  private startAuthentication(): void {
    if (this.config.password) {
      this.authenticatePassword();
    } else if (this.config.privateKey) {
      this.authenticatePublicKey();
    } else {
      this.emit('error', new SSHError('No authentication method available', 'NO_AUTH_METHOD'));
    }
  }

  /**
   * Password authentication
   */
  private authenticatePassword(): void {
    if (!this.config.password) {
      throw new Error('Password not provided');
    }

    this.context.method = 'password';
    
    const payload = Buffer.concat([
      PacketBuilder.buildString(this.context.username),
      PacketBuilder.buildString(this.context.service),
      PacketBuilder.buildString('password'),
      PacketBuilder.buildBoolean(false), // change password
      PacketBuilder.buildString(this.config.password)
    ]);

    this.transport.sendPacket(SSH_MSG.USERAUTH_REQUEST, payload);
  }

  /**
   * Public key authentication
   */
  private authenticatePublicKey(): void {
    if (!this.config.privateKey) {
      throw new Error('Private key not provided');
    }

    this.context.method = 'publickey';
    
    // For now, just implement password auth
    // TODO: Implement full public key authentication
    this.emit('error', new SSHError('Public key authentication not implemented yet', 'NOT_IMPLEMENTED'));
  }

  /**
   * Handle authentication failure
   */
  private handleAuthFailure(payload: Buffer): void {
    const reader = new PacketReader(payload);
    const methods = reader.readString().split(',');
    const partialSuccess = reader.readBoolean();

    this.emit('error', new SSHError(
      `Authentication failed. Available methods: ${methods.join(', ')}`,
      'AUTH_FAILED'
    ));
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.context.authenticated;
  }
}