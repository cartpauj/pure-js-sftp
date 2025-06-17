/**
 * Diffie-Hellman Key Exchange Implementation
 */

import { CryptoUtils } from '../crypto/utils';
import { PacketBuilder, PacketReader } from '../ssh/packet';

// Well-known DH groups (RFC 3526)
const DH_GROUPS = {
  'diffie-hellman-group14-sha256': {
    prime: BigInt('0xFFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AACAA68FFFFFFFFFFFFFFFF'),
    generator: 2n,
    hashAlgorithm: 'sha256'
  },
  'diffie-hellman-group16-sha512': {
    prime: BigInt('0xFFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AAAC42DAE33C87'),
    generator: 2n,
    hashAlgorithm: 'sha512'
  }
};

export class DiffieHellmanKex {
  private kexAlgorithm: string;
  private dhGroup: typeof DH_GROUPS[keyof typeof DH_GROUPS];
  private privateKey: bigint;
  private publicKey: bigint;
  private sharedSecret: bigint | null = null;

  constructor(kexAlgorithm: string) {
    this.kexAlgorithm = kexAlgorithm;
    
    if (!(kexAlgorithm in DH_GROUPS)) {
      throw new Error(`Unsupported KEX algorithm: ${kexAlgorithm}`);
    }
    
    this.dhGroup = DH_GROUPS[kexAlgorithm as keyof typeof DH_GROUPS];
    
    // Generate private key (random number)
    const privateKeyBytes = CryptoUtils.randomBytes(32); // 256 bits
    this.privateKey = CryptoUtils.bufferToBn(privateKeyBytes);
    
    // Calculate public key: g^x mod p
    this.publicKey = CryptoUtils.modPow(
      this.dhGroup.generator,
      this.privateKey,
      this.dhGroup.prime
    );
  }

  /**
   * Get client's public key for KEXDH_INIT
   */
  getClientPublicKey(): Buffer {
    return CryptoUtils.bnToBuffer(this.publicKey);
  }

  /**
   * Create KEXDH_INIT packet
   */
  createKexdhInit(): Buffer {
    const publicKeyBuffer = this.getClientPublicKey();
    return PacketBuilder.buildBytes(publicKeyBuffer);
  }

  /**
   * Process KEXDH_REPLY from server
   */
  processKexdhReply(payload: Buffer): {
    serverHostKey: Buffer;
    serverPublicKey: Buffer;
    signature: Buffer;
    sharedSecret: Buffer;
  } {
    const reader = new PacketReader(payload);
    
    // Read server host key
    const serverHostKey = reader.readBytes();
    
    // Read server's public key
    const serverPublicKeyBuffer = reader.readBytes();
    const serverPublicKey = CryptoUtils.bufferToBn(serverPublicKeyBuffer);
    
    // Read signature
    const signature = reader.readBytes();
    
    // Calculate shared secret: server_public^client_private mod p
    this.sharedSecret = CryptoUtils.modPow(
      serverPublicKey,
      this.privateKey,
      this.dhGroup.prime
    );
    
    const sharedSecretBuffer = CryptoUtils.bnToBuffer(this.sharedSecret);
    
    return {
      serverHostKey,
      serverPublicKey: serverPublicKeyBuffer,
      signature,
      sharedSecret: sharedSecretBuffer
    };
  }

  /**
   * Generate exchange hash (H)
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
    // Build hash input according to RFC 4253
    const hashInput = Buffer.concat([
      PacketBuilder.buildString(clientVersion),
      PacketBuilder.buildString(serverVersion),
      PacketBuilder.buildBytes(clientKexInit),
      PacketBuilder.buildBytes(serverKexInit),
      PacketBuilder.buildBytes(serverHostKey),
      PacketBuilder.buildBytes(clientPublicKey),
      PacketBuilder.buildBytes(serverPublicKey),
      PacketBuilder.buildBytes(sharedSecret)
    ]);

    // Hash using the algorithm specified for this KEX method
    if (this.dhGroup.hashAlgorithm === 'sha256') {
      return CryptoUtils.sha256(hashInput);
    } else if (this.dhGroup.hashAlgorithm === 'sha512') {
      return CryptoUtils.sha512(hashInput);
    } else {
      throw new Error(`Unsupported hash algorithm: ${this.dhGroup.hashAlgorithm}`);
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
      const hashFunc = this.dhGroup.hashAlgorithm === 'sha256' ? CryptoUtils.sha256 : CryptoUtils.sha512;
      
      let key = hashFunc(Buffer.concat([
        PacketBuilder.buildBytes(sharedSecret),
        exchangeHash,
        Buffer.from(char, 'ascii'),
        sessionId
      ]));
      
      // If we need more bytes, keep hashing
      while (key.length < length) {
        key = Buffer.concat([
          key,
          hashFunc(Buffer.concat([
            PacketBuilder.buildBytes(sharedSecret),
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
    return CryptoUtils.bnToBuffer(this.sharedSecret);
  }

  /**
   * Get KEX algorithm name
   */
  getAlgorithm(): string {
    return this.kexAlgorithm;
  }
}