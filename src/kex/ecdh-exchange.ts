/**
 * ECDH Key Exchange Implementation
 * Following ssh2 library's approach exactly
 */

import { createECDH, ECDH } from 'crypto';
import { CryptoUtils } from '../crypto/utils';
import { PacketBuilder, PacketReader } from '../ssh/packet';

// ECDH curve mappings (following ssh2's approach)
const ECDH_CURVES = {
  'ecdh-sha2-nistp256': {
    curveName: 'prime256v1',
    hashAlgorithm: 'sha256'
  },
  'ecdh-sha2-nistp384': {
    curveName: 'secp384r1', 
    hashAlgorithm: 'sha384'
  },
  'ecdh-sha2-nistp521': {
    curveName: 'secp521r1',
    hashAlgorithm: 'sha512'
  }
} as const;

export class ECDHKeyExchange {
  private kexAlgorithm: string;
  private curveName: string;
  private hashAlgorithm: string;
  private ecdh: ECDH;
  private clientPublicKey: Buffer;
  private sharedSecret: Buffer | null = null;

  constructor(kexAlgorithm: string) {
    this.kexAlgorithm = kexAlgorithm;
    
    if (!(kexAlgorithm in ECDH_CURVES)) {
      throw new Error(`Unsupported ECDH algorithm: ${kexAlgorithm}`);
    }
    
    const curveInfo = ECDH_CURVES[kexAlgorithm as keyof typeof ECDH_CURVES];
    this.curveName = curveInfo.curveName;
    this.hashAlgorithm = curveInfo.hashAlgorithm;
    
    // Create ECDH instance and generate keys (following ssh2's approach)
    this.ecdh = createECDH(this.curveName);
    this.clientPublicKey = this.ecdh.generateKeys();
    
    // Verify the public key is in uncompressed format (should start with 0x04)
    if (this.clientPublicKey[0] !== 0x04) {
      throw new Error(`ECDH public key not in uncompressed format: first byte is 0x${this.clientPublicKey[0].toString(16)}`);
    }
  }

  /**
   * Get client's public key for KEXECDH_INIT
   */
  getClientPublicKey(): Buffer {
    return this.clientPublicKey;
  }

  /**
   * Create KEXECDH_INIT packet payload
   * For ECDH, the payload is just the public key as SSH string (length-prefixed)
   */
  createKexecdhInit(): Buffer {
    // ECDH public key is sent as SSH string (length-prefixed bytes, not base64)
    return PacketBuilder.buildBytes(this.clientPublicKey);
  }

  /**
   * Process KEXECDH_REPLY from server
   */
  processKexecdhReply(payload: Buffer): {
    serverHostKey: Buffer;
    serverPublicKey: Buffer;
    signature: Buffer;
    sharedSecret: Buffer;
  } {
    try {
      const reader = new PacketReader(payload);
      
      // Read server host key
      const serverHostKey = reader.readBytes();
      
      // Read server's ECDH public key
      const serverPublicKey = reader.readBytes();
      
      // Read signature
      const signature = reader.readBytes();
      
      // Compute shared secret using ECDH
      const rawSecret = this.ecdh.computeSecret(serverPublicKey);
      // Convert to proper SSH mpint format like ssh2 does
      this.sharedSecret = PacketBuilder.convertToMpint(rawSecret);
      
      return {
        serverHostKey,
        serverPublicKey,
        signature,
        sharedSecret: this.sharedSecret
      };
    } catch (error: any) {
      throw new Error(`Failed to process KEXECDH_REPLY: ${error?.message || error}`);
    }
  }

  /**
   * Generate exchange hash (H) - following ssh2's exact approach
   */
  generateExchangeHash(
    clientVersion: string,
    serverVersion: string,
    clientKexInit: Buffer,
    serverKexInit: Buffer,
    serverHostKey: Buffer,
    clientPublicKey: Buffer,
    serverPublicKey: Buffer,
    sharedSecret: Buffer
  ): Buffer {
    // Convert public keys to mpint format like ssh2 does for both DH and ECDH
    const clientPublicKeyMpint = PacketBuilder.convertToMpint(clientPublicKey);
    const serverPublicKeyMpint = PacketBuilder.convertToMpint(serverPublicKey);
    const sharedSecretMpint = PacketBuilder.convertToMpint(sharedSecret);
    
    // Build hash input using ssh2's hashString approach (length + data for each component)
    const hashInput = Buffer.concat([
      PacketBuilder.buildString(clientVersion),
      PacketBuilder.buildString(serverVersion),
      PacketBuilder.buildBytes(clientKexInit),
      PacketBuilder.buildBytes(serverKexInit),
      PacketBuilder.buildBytes(serverHostKey),
      PacketBuilder.buildBytes(clientPublicKeyMpint),
      PacketBuilder.buildBytes(serverPublicKeyMpint),
      PacketBuilder.buildBytes(sharedSecretMpint)
    ]);

    // Hash using the algorithm specified for this ECDH method
    if (this.hashAlgorithm === 'sha256') {
      return CryptoUtils.sha256(hashInput);
    } else if (this.hashAlgorithm === 'sha384') {
      return CryptoUtils.sha384(hashInput);
    } else if (this.hashAlgorithm === 'sha512') {
      return CryptoUtils.sha512(hashInput);
    } else {
      throw new Error(`Unsupported hash algorithm: ${this.hashAlgorithm}`);
    }
  }

  /**
   * Derive encryption keys from shared secret and exchange hash
   */
  deriveKeys(
    sharedSecret: Buffer,
    exchangeHash: Buffer,
    sessionId: Buffer
  ): {
    clientToServerKey: Buffer;
    serverToClientKey: Buffer;
    clientToServerIV: Buffer;
    serverToClientIV: Buffer;
    clientToServerMac: Buffer;
    serverToClientMac: Buffer;
  } {
    const keyLength = 32; // AES-256
    const ivLength = 16;  // AES block size
    const macLength = 32; // SHA-256
    
    // Key derivation function as per RFC 4253
    const deriveKey = (char: string, length: number): Buffer => {
      const hashFunc = this.hashAlgorithm === 'sha256' ? CryptoUtils.sha256 :
                      this.hashAlgorithm === 'sha384' ? CryptoUtils.sha384 : CryptoUtils.sha512;
      
      let key = hashFunc(Buffer.concat([
        PacketBuilder.buildMpint(sharedSecret),
        exchangeHash,
        Buffer.from(char, 'ascii'),
        sessionId
      ]));
      
      // If we need more bytes, keep hashing
      while (key.length < length) {
        key = Buffer.concat([
          key,
          hashFunc(Buffer.concat([
            PacketBuilder.buildMpint(sharedSecret),
            exchangeHash,
            key
          ]))
        ]);
      }
      
      return key.subarray(0, length);
    };

    return {
      clientToServerIV: deriveKey('A', ivLength),
      serverToClientIV: deriveKey('B', ivLength),
      clientToServerKey: deriveKey('C', keyLength),
      serverToClientKey: deriveKey('D', keyLength),
      clientToServerMac: deriveKey('E', macLength),
      serverToClientMac: deriveKey('F', macLength)
    };
  }

  /**
   * Get the shared secret
   */
  getSharedSecret(): Buffer {
    if (!this.sharedSecret) {
      throw new Error('Shared secret not calculated yet');
    }
    return this.sharedSecret;
  }

  /**
   * Get KEX algorithm name
   */
  getAlgorithm(): string {
    return this.kexAlgorithm;
  }
}