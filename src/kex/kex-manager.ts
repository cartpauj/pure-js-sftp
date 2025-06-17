/**
 * Key Exchange Manager
 * Handles the complete SSH key exchange process
 */

import { EventEmitter } from 'events';
import { DiffieHellmanKex } from './diffie-hellman';
import { PacketBuilder, PacketReader } from '../ssh/packet';
import { SSHTransport } from '../ssh/transport';
import { KEXInitMessage, SSHError } from '../ssh/types';
import { SSH_MSG, KEX_ALGORITHMS, HOST_KEY_ALGORITHMS, ENCRYPTION_ALGORITHMS, MAC_ALGORITHMS, COMPRESSION_ALGORITHMS } from '../ssh/constants';
import { CryptoUtils } from '../crypto/utils';

export class KexManager extends EventEmitter {
  private transport: SSHTransport;
  private clientKexInit: Buffer | null = null;
  private serverKexInit: Buffer | null = null;
  private kexAlgorithm: string | null = null;
  private dhKex: DiffieHellmanKex | null = null;
  private exchangeHash: Buffer | null = null;
  private sessionId: Buffer | null = null;

  constructor(transport: SSHTransport) {
    super();
    this.transport = transport;
    this.setupTransportHandlers();
  }

  /**
   * Set up transport event handlers
   */
  private setupTransportHandlers(): void {
    this.transport.on('versionExchange', () => {
      this.startKeyExchange();
    });

    this.transport.on('kexinit', (payload: Buffer) => {
      this.handleServerKexInit(payload);
    });
  }

  /**
   * Start key exchange by sending KEXINIT
   */
  private startKeyExchange(): void {
    const kexInitMessage = this.createKexInitMessage();
    const payload = this.buildKexInitPayload(kexInitMessage);
    
    // Store our KEXINIT for hash calculation
    this.clientKexInit = payload;
    
    this.transport.sendPacket(SSH_MSG.KEXINIT, payload);
    this.debug('Sent KEXINIT');
  }

  /**
   * Create KEXINIT message with our supported algorithms
   */
  private createKexInitMessage(): KEXInitMessage {
    return {
      cookie: CryptoUtils.randomBytes(16),
      kex_algorithms: [...KEX_ALGORITHMS],
      server_host_key_algorithms: [...HOST_KEY_ALGORITHMS],
      encryption_algorithms_client_to_server: [...ENCRYPTION_ALGORITHMS],
      encryption_algorithms_server_to_client: [...ENCRYPTION_ALGORITHMS],
      mac_algorithms_client_to_server: [...MAC_ALGORITHMS],
      mac_algorithms_server_to_client: [...MAC_ALGORITHMS],
      compression_algorithms_client_to_server: [...COMPRESSION_ALGORITHMS],
      compression_algorithms_server_to_client: [...COMPRESSION_ALGORITHMS],
      languages_client_to_server: [],
      languages_server_to_client: [],
      first_kex_packet_follows: false,
      reserved: 0
    };
  }

  /**
   * Build KEXINIT payload
   */
  private buildKexInitPayload(kexInit: KEXInitMessage): Buffer {
    const parts = [
      kexInit.cookie,
      PacketBuilder.buildString(kexInit.kex_algorithms.join(',')),
      PacketBuilder.buildString(kexInit.server_host_key_algorithms.join(',')),
      PacketBuilder.buildString(kexInit.encryption_algorithms_client_to_server.join(',')),
      PacketBuilder.buildString(kexInit.encryption_algorithms_server_to_client.join(',')),
      PacketBuilder.buildString(kexInit.mac_algorithms_client_to_server.join(',')),
      PacketBuilder.buildString(kexInit.mac_algorithms_server_to_client.join(',')),
      PacketBuilder.buildString(kexInit.compression_algorithms_client_to_server.join(',')),
      PacketBuilder.buildString(kexInit.compression_algorithms_server_to_client.join(',')),
      PacketBuilder.buildString(kexInit.languages_client_to_server.join(',')),
      PacketBuilder.buildString(kexInit.languages_server_to_client.join(',')),
      PacketBuilder.buildBoolean(kexInit.first_kex_packet_follows),
      PacketBuilder.buildUInt32(kexInit.reserved)
    ];

    return Buffer.concat(parts);
  }

  /**
   * Handle server's KEXINIT message
   */
  private handleServerKexInit(payload: Buffer): void {
    // Store server's KEXINIT for hash calculation
    this.serverKexInit = payload;
    
    try {
      const serverKexInit = this.parseKexInitPayload(payload);
      this.debug('Received server KEXINIT');
      
      // Choose algorithms
      this.kexAlgorithm = this.chooseAlgorithm(KEX_ALGORITHMS, serverKexInit.kex_algorithms);
      
      if (!this.kexAlgorithm) {
        throw new SSHError('No compatible KEX algorithm found', 'KEX_ALGORITHM_MISMATCH');
      }
      
      this.debug(`Chosen KEX algorithm: ${this.kexAlgorithm}`);
      
      // Start Diffie-Hellman exchange
      this.startDHExchange();
      
    } catch (error) {
      this.emit('error', new SSHError(`KEX failed: ${error}`, 'KEX_FAILED'));
    }
  }

  /**
   * Parse KEXINIT payload
   */
  private parseKexInitPayload(payload: Buffer): KEXInitMessage {
    const reader = new PacketReader(payload);
    
    return {
      cookie: reader.getRemainingBytes().subarray(0, 16),
      kex_algorithms: reader.readString().split(','),
      server_host_key_algorithms: reader.readString().split(','),
      encryption_algorithms_client_to_server: reader.readString().split(','),
      encryption_algorithms_server_to_client: reader.readString().split(','),
      mac_algorithms_client_to_server: reader.readString().split(','),
      mac_algorithms_server_to_client: reader.readString().split(','),
      compression_algorithms_client_to_server: reader.readString().split(','),
      compression_algorithms_server_to_client: reader.readString().split(','),
      languages_client_to_server: reader.readString().split(','),
      languages_server_to_client: reader.readString().split(','),
      first_kex_packet_follows: reader.readBoolean(),
      reserved: reader.readUInt32()
    };
  }

  /**
   * Choose first compatible algorithm from lists
   */
  private chooseAlgorithm(clientList: readonly string[], serverList: string[]): string | null {
    for (const clientAlg of clientList) {
      if (serverList.includes(clientAlg)) {
        return clientAlg;
      }
    }
    return null;
  }

  /**
   * Start Diffie-Hellman key exchange
   */
  private startDHExchange(): void {
    if (!this.kexAlgorithm) {
      throw new Error('KEX algorithm not chosen');
    }
    
    this.dhKex = new DiffieHellmanKex(this.kexAlgorithm);
    
    // Send KEXDH_INIT
    const kexdhInitPayload = this.dhKex.createKexdhInit();
    this.transport.sendPacket(SSH_MSG.KEXDH_INIT, kexdhInitPayload);
    this.debug('Sent KEXDH_INIT');
    
    // Listen for KEXDH_REPLY
    this.transport.once('kexdhReply', (payload: Buffer) => {
      this.handleKexdhReply(payload);
    });
  }

  /**
   * Handle KEXDH_REPLY from server
   */
  private handleKexdhReply(payload: Buffer): void {
    if (!this.dhKex || !this.clientKexInit || !this.serverKexInit) {
      throw new Error('KEX state invalid');
    }
    
    try {
      const {
        serverHostKey,
        serverPublicKey,
        signature: _signature,
        sharedSecret
      } = this.dhKex.processKexdhReply(payload);
      
      this.debug('Received KEXDH_REPLY');
      
      // Generate exchange hash
      this.exchangeHash = this.dhKex.generateExchangeHash(
        this.transport.getClientVersion(),
        this.transport.getServerVersion(),
        this.clientKexInit,
        this.serverKexInit,
        serverHostKey,
        this.dhKex.getClientPublicKey(),
        serverPublicKey,
        sharedSecret
      );
      
      // First exchange hash becomes session ID
      if (!this.sessionId) {
        this.sessionId = this.exchangeHash;
        // Set session ID on transport for use by other components
        this.transport.setSessionId(this.sessionId);
      }
      
      // Derive encryption keys
      const keys = this.dhKex.deriveKeys(sharedSecret, this.exchangeHash, this.sessionId);
      
      // TODO: Verify server signature
      // TODO: Set up encryption with derived keys
      
      // Send NEWKEYS
      this.transport.sendPacket(SSH_MSG.NEWKEYS);
      this.debug('Sent NEWKEYS');
      
      // Wait for server NEWKEYS
      this.transport.once('newkeys', () => {
        this.debug('Received NEWKEYS');
        this.emit('kexComplete', {
          sessionId: this.sessionId,
          exchangeHash: this.exchangeHash,
          keys
        });
      });
      
    } catch (error) {
      this.emit('error', new SSHError(`KEXDH_REPLY failed: ${error}`, 'KEXDH_FAILED'));
    }
  }

  /**
   * Get session ID
   */
  getSessionId(): Buffer | null {
    return this.sessionId;
  }

  /**
   * Get exchange hash
   */
  getExchangeHash(): Buffer | null {
    return this.exchangeHash;
  }

  /**
   * Debug logging
   */
  private debug(message: string): void {
    // TODO: Use transport debug flag
    console.log(`[KEX Manager] ${message}`);
  }
}