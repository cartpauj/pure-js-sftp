/**
 * Key Exchange Manager
 * Handles the complete SSH key exchange process
 */

import { EventEmitter } from 'events';
import { DiffieHellmanKex } from './diffie-hellman';
import { ECDHKeyExchange } from './ecdh-exchange';
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
  private cipherAlgorithm: string | null = null;
  private macAlgorithm: string | null = null;
  private dhKex: DiffieHellmanKex | null = null;
  private ecdhKex: ECDHKeyExchange | null = null;
  private exchangeHash: Buffer | null = null;
  private sessionId: Buffer | null = null;
  private sharedSecret: Buffer | null = null;

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

    this.transport.on('error', (error: Error) => {
      this.debug(`Transport error: ${error.message}`);
      this.emit('error', error);
    });

    this.transport.on('close', () => {
      this.debug('Transport connection closed during KEX');
      this.emit('error', new SSHError('Connection closed during key exchange', 'KEX_CONNECTION_LOST'));
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
      this.cipherAlgorithm = this.chooseAlgorithm(ENCRYPTION_ALGORITHMS, serverKexInit.encryption_algorithms_client_to_server);
      this.macAlgorithm = this.chooseAlgorithm(MAC_ALGORITHMS, serverKexInit.mac_algorithms_client_to_server);
      
      if (!this.kexAlgorithm) {
        throw new SSHError('No compatible KEX algorithm found', 'KEX_ALGORITHM_MISMATCH');
      }
      if (!this.cipherAlgorithm) {
        throw new SSHError('No compatible cipher algorithm found', 'CIPHER_ALGORITHM_MISMATCH');
      }
      if (!this.macAlgorithm) {
        throw new SSHError('No compatible MAC algorithm found', 'MAC_ALGORITHM_MISMATCH');
      }
      
      this.debug(`Chosen KEX algorithm: ${this.kexAlgorithm}`);
      this.debug(`Chosen cipher algorithm: ${this.cipherAlgorithm}`);
      this.debug(`Chosen MAC algorithm: ${this.macAlgorithm}`);
      this.debug(`KEX algorithm type: ${this.kexAlgorithm.startsWith('ecdh-sha2-') ? 'ECDH' : 'DH'}`);
      
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
    
    // Read cookie (16 bytes) - need to read it properly with offset management
    const cookie = reader.readRawBytes(16);
    
    return {
      cookie: cookie,
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
   * Start key exchange (ECDH or DH depending on chosen algorithm)
   */
  private startDHExchange(): void {
    if (!this.kexAlgorithm) {
      throw new Error('KEX algorithm not chosen');
    }
    
    // Determine if this is ECDH or DH based on algorithm name
    if (this.kexAlgorithm.startsWith('ecdh-sha2-')) {
      this.startECDHExchange();
    } else {
      this.startClassicDHExchange();
    }
  }

  /**
   * Start ECDH key exchange
   */
  private startECDHExchange(): void {
    if (!this.kexAlgorithm) {
      throw new Error('KEX algorithm not chosen');
    }
    
    this.ecdhKex = new ECDHKeyExchange(this.kexAlgorithm);
    
    // Send KEXECDH_INIT
    const kexecdhInitPayload = this.ecdhKex.createKexecdhInit();
    this.debug(`Sending KEXECDH_INIT with payload size: ${kexecdhInitPayload.length} bytes`);
    this.debug(`KEXECDH_INIT payload hex: ${kexecdhInitPayload.subarray(0, 32).toString('hex')}...`);
    this.transport.sendPacket(SSH_MSG.KEXECDH_INIT, kexecdhInitPayload);
    this.debug('Sent KEXECDH_INIT packet');
    
    // Listen for KEXECDH_REPLY (uses same message type as KEXDH_REPLY)
    this.transport.once('kexdhReply', (payload: Buffer) => {
      this.debug('Received KEXECDH_REPLY event, processing...');
      this.handleKexecdhReply(payload);
    });
    
    this.setupKexTimeout();
  }

  /**
   * Start classic Diffie-Hellman key exchange
   */
  private startClassicDHExchange(): void {
    if (!this.kexAlgorithm) {
      throw new Error('KEX algorithm not chosen');
    }
    
    this.dhKex = new DiffieHellmanKex(this.kexAlgorithm);
    
    // Send KEXDH_INIT
    const kexdhInitPayload = this.dhKex.createKexdhInit();
    this.debug(`Sending KEXDH_INIT with payload size: ${kexdhInitPayload.length} bytes`);
    this.debug(`KEXDH_INIT payload hex: ${kexdhInitPayload.subarray(0, 32).toString('hex')}...`);
    this.transport.sendPacket(SSH_MSG.KEXDH_INIT, kexdhInitPayload);
    this.debug('Sent KEXDH_INIT packet');
    
    // Listen for KEXDH_REPLY
    this.transport.once('kexdhReply', (payload: Buffer) => {
      this.debug('Received KEXDH_REPLY event, processing...');
      this.handleKexdhReply(payload);
    });
    
    this.setupKexTimeout();
  }

  /**
   * Setup timeout for KEX exchange
   */
  private setupKexTimeout(): void {
    // Add a timeout to detect if we never get reply
    const kexTimeout = setTimeout(() => {
      this.debug('Timeout waiting for KEX reply');
      this.emit('error', new SSHError('Timeout waiting for KEX reply', 'KEX_TIMEOUT'));
    }, 30000); // 30 second timeout
    
    // Clear timeout when we get the reply
    this.transport.once('kexdhReply', () => {
      clearTimeout(kexTimeout);
    });
  }

  /**
   * Handle KEXECDH_REPLY from server
   */
  private handleKexecdhReply(payload: Buffer): void {
    if (!this.ecdhKex || !this.clientKexInit || !this.serverKexInit) {
      throw new Error('ECDH KEX state invalid');
    }
    
    try {
      this.debug(`Processing KEXECDH_REPLY payload of ${payload.length} bytes`);
      const {
        serverHostKey,
        serverPublicKey,
        signature: _signature,
        sharedSecret
      } = this.ecdhKex.processKexecdhReply(payload);
      
      this.debug(`KEXECDH_REPLY processed: hostKey=${serverHostKey.length}b, pubKey=${serverPublicKey.length}b, secret=${sharedSecret.length}b`);
      
      // Generate exchange hash
      this.exchangeHash = this.ecdhKex.generateExchangeHash(
        this.transport.getClientVersion(),
        this.transport.getServerVersion(),
        this.clientKexInit,
        this.serverKexInit,
        serverHostKey,
        this.ecdhKex.getClientPublicKey(),
        serverPublicKey,
        sharedSecret
      );
      
      this.completeKeyExchange(sharedSecret);
      
    } catch (error: any) {
      this.debug(`KEXECDH_REPLY error: ${error?.message || error}`);
      this.emit('error', new SSHError(`KEXECDH_REPLY failed: ${error?.message || error}`, 'KEXECDH_FAILED'));
    }
  }

  /**
   * Handle KEXDH_REPLY from server
   */
  private handleKexdhReply(payload: Buffer): void {
    if (!this.dhKex || !this.clientKexInit || !this.serverKexInit) {
      throw new Error('KEX state invalid');
    }
    
    try {
      this.debug(`Processing KEXDH_REPLY payload of ${payload.length} bytes`);
      const {
        serverHostKey,
        serverPublicKey,
        signature: _signature,
        sharedSecret
      } = this.dhKex.processKexdhReply(payload);
      
      this.debug(`KEXDH_REPLY processed: hostKey=${serverHostKey.length}b, pubKey=${serverPublicKey.length}b, secret=${sharedSecret.length}b`);
      
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
      
      this.completeKeyExchange(sharedSecret);
      
    } catch (error: any) {
      this.debug(`KEXDH_REPLY error: ${error?.message || error}`);
      this.emit('error', new SSHError(`KEXDH_REPLY failed: ${error?.message || error}`, 'KEXDH_FAILED'));
    }
  }

  /**
   * Complete key exchange (common for both ECDH and DH)
   */
  private completeKeyExchange(sharedSecret: Buffer): void {
    // Store shared secret for later use in NEWKEYS
    this.sharedSecret = sharedSecret;
    
    // First exchange hash becomes session ID
    if (!this.sessionId) {
      this.sessionId = this.exchangeHash!;
      // Set session ID on transport for use by other components
      this.transport.setSessionId(this.sessionId);
    }
    
    // Derive encryption keys using the appropriate KEX method
    let keys;
    if (this.ecdhKex) {
      keys = this.ecdhKex.deriveKeys(sharedSecret, this.exchangeHash!, this.sessionId);
    } else if (this.dhKex) {
      keys = this.dhKex.deriveKeys(sharedSecret, this.exchangeHash!, this.sessionId);
    } else {
      throw new Error('No KEX method available for key derivation');
    }
    
    // TODO: Verify server signature
    // TODO: Set up encryption with derived keys
    
    // Send NEWKEYS
    this.transport.sendPacket(SSH_MSG.NEWKEYS);
    this.debug('Sent NEWKEYS');
    
    // Wait for server NEWKEYS
    this.transport.once('newkeys', () => {
      this.debug('Received NEWKEYS');
      
      // Enable encryption now that both sides have sent NEWKEYS
      try {
        // Use the negotiated algorithms
        if (!this.cipherAlgorithm || !this.macAlgorithm || !this.sharedSecret) {
          throw new Error('Missing negotiated algorithms or shared secret');
        }
        
        // Determine hash algorithm based on KEX method
        const hashAlgo = this.kexAlgorithm?.includes('sha2-256') ? 'sha256' : 
                         this.kexAlgorithm?.includes('sha2-384') ? 'sha384' :
                         this.kexAlgorithm?.includes('sha2-512') ? 'sha512' : 'sha1';
        
        this.transport.enableEncryption(
          this.cipherAlgorithm,
          this.macAlgorithm,
          hashAlgo,
          this.sharedSecret,
          this.exchangeHash!,
          this.sessionId!
        );
        
        this.debug('Encryption enabled after NEWKEYS exchange');
      } catch (error: any) {
        this.debug(`Failed to enable encryption: ${error.message}`);
        this.emit('error', error);
        return;
      }
      
      this.emit('kexComplete', {
        sessionId: this.sessionId,
        exchangeHash: this.exchangeHash,
        keys
      });
    });
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
    // Always log for now to help with debugging
    console.log(`[KEX Manager] ${message}`);
  }
}