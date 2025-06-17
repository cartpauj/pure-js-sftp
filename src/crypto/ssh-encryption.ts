/**
 * SSH Encryption Implementation
 * Based on ssh2-streams approach for packet encryption/MAC after NEWKEYS
 */

import { createCipheriv, createDecipheriv, createHmac } from 'crypto';
import { CryptoUtils } from './utils';

export interface EncryptionKeys {
  clientToServerKey: Buffer;
  serverToClientKey: Buffer;
  clientToServerIV: Buffer;
  serverToClientIV: Buffer;
  clientToServerMac: Buffer;
  serverToClientMac: Buffer;
}

export interface CipherInfo {
  keyLen: number;
  ivLen: number;
  blockSize: number;
  opensslName: string;
}

export interface MacInfo {
  keyLen: number;
  actualLen: number;
  opensslName: string;
}

// Cipher configurations (based on ssh2-streams constants)
export const CIPHER_INFO: Record<string, CipherInfo> = {
  'aes128-ctr': { keyLen: 16, ivLen: 16, blockSize: 16, opensslName: 'aes-128-ctr' },
  'aes256-ctr': { keyLen: 32, ivLen: 16, blockSize: 16, opensslName: 'aes-256-ctr' },
  'aes128-gcm@openssh.com': { keyLen: 16, ivLen: 12, blockSize: 16, opensslName: 'aes-128-gcm' },
  'aes256-gcm@openssh.com': { keyLen: 32, ivLen: 12, blockSize: 16, opensslName: 'aes-256-gcm' },
};

// MAC configurations (based on ssh2-streams constants)
export const MAC_INFO: Record<string, MacInfo> = {
  'hmac-sha2-256': { keyLen: 32, actualLen: 32, opensslName: 'sha256' },
  'hmac-sha2-512': { keyLen: 64, actualLen: 64, opensslName: 'sha512' },
  'hmac-sha1': { keyLen: 20, actualLen: 20, opensslName: 'sha1' },
  'hmac-sha2-256-etm@openssh.com': { keyLen: 32, actualLen: 32, opensslName: 'sha256' },
  'hmac-sha2-512-etm@openssh.com': { keyLen: 64, actualLen: 64, opensslName: 'sha512' },
};

export class SSHEncryption {
  private outSeqno = 0;
  private inSeqno = 0;
  private cipherAlgo: string;
  private macAlgo: string;
  private keys: EncryptionKeys;
  private cipherInfo: CipherInfo;
  private macInfo: MacInfo;

  constructor(
    cipherAlgo: string,
    macAlgo: string, 
    kexHash: (data: Buffer) => Buffer,
    sharedSecret: Buffer,
    exchangeHash: Buffer,
    sessionId: Buffer
  ) {
    this.cipherAlgo = cipherAlgo;
    this.macAlgo = macAlgo;
    
    // Get cipher and MAC info
    this.cipherInfo = CIPHER_INFO[cipherAlgo];
    this.macInfo = MAC_INFO[macAlgo];
    
    if (!this.cipherInfo) {
      throw new Error(`Unsupported cipher: ${cipherAlgo}`);
    }
    if (!this.macInfo) {
      throw new Error(`Unsupported MAC: ${macAlgo}`);
    }

    // Derive encryption keys (based on RFC 4253)
    this.keys = this.deriveKeys(kexHash, sharedSecret, exchangeHash, sessionId);
  }

  /**
   * Derive encryption keys from shared secret (RFC 4253 Section 7.2)
   */
  private deriveKeys(
    kexHash: (data: Buffer) => Buffer, 
    sharedSecret: Buffer, 
    exchangeHash: Buffer, 
    sessionId: Buffer
  ): EncryptionKeys {
    const mpintSecret = this.convertToMpint(sharedSecret);
    
    // Key derivation: HASH(K || H || X || session_id)
    // Where X is: 'A' for IV C->S, 'B' for IV S->C, 'C' for key C->S, etc.
    
    const deriveKey = (letter: string, length: number): Buffer => {
      let hash = kexHash(Buffer.concat([mpintSecret, exchangeHash, Buffer.from(letter), sessionId]));
      
      // If key needs to be longer, keep hashing
      while (hash.length < length) {
        hash = Buffer.concat([hash, kexHash(Buffer.concat([mpintSecret, exchangeHash, hash]))]);
      }
      
      return hash.subarray(0, length);
    };

    return {
      clientToServerIV: deriveKey('A', this.cipherInfo.ivLen),
      serverToClientIV: deriveKey('B', this.cipherInfo.ivLen), 
      clientToServerKey: deriveKey('C', this.cipherInfo.keyLen),
      serverToClientKey: deriveKey('D', this.cipherInfo.keyLen),
      clientToServerMac: deriveKey('E', this.macInfo.keyLen),
      serverToClientMac: deriveKey('F', this.macInfo.keyLen),
    };
  }

  /**
   * Convert buffer to SSH mpint format
   */
  private convertToMpint(data: Buffer): Buffer {
    // Remove leading zeros
    let start = 0;
    while (start < data.length && data[start] === 0) {
      start++;
    }
    
    if (start === data.length) {
      return Buffer.from([0, 0, 0, 0]);
    }
    
    const trimmed = data.subarray(start);
    
    // If high bit is set, prepend zero byte
    if (trimmed[0] & 0x80) {
      const result = Buffer.alloc(4 + 1 + trimmed.length);
      result.writeUInt32BE(1 + trimmed.length, 0);
      result[4] = 0;
      trimmed.copy(result, 5);
      return result;
    } else {
      const result = Buffer.alloc(4 + trimmed.length);
      result.writeUInt32BE(trimmed.length, 0);
      trimmed.copy(result, 4);
      return result;
    }
  }

  /**
   * Encrypt outgoing packet
   */
  encryptPacket(packet: Buffer): Buffer {
    // For now, implement basic AES-CTR encryption
    if (this.cipherAlgo.includes('ctr')) {
      return this.encryptCTR(packet, true);
    }
    
    // TODO: Implement GCM mode
    throw new Error(`Encryption mode not yet implemented: ${this.cipherAlgo}`);
  }

  /**
   * Decrypt incoming packet  
   */
  decryptPacket(packet: Buffer): Buffer {
    // For now, implement basic AES-CTR decryption
    if (this.cipherAlgo.includes('ctr')) {
      return this.decryptCTR(packet, false);
    }
    
    // TODO: Implement GCM mode
    throw new Error(`Decryption mode not yet implemented: ${this.cipherAlgo}`);
  }

  /**
   * Calculate MAC for outgoing packet
   */
  calculateMac(packet: Buffer): Buffer {
    const seqno = Buffer.alloc(4);
    seqno.writeUInt32BE(this.outSeqno, 0);
    
    const data = Buffer.concat([seqno, packet]);
    const hmac = createHmac(this.macInfo.opensslName, this.keys.clientToServerMac);
    hmac.update(data);
    
    this.outSeqno++;
    return hmac.digest().subarray(0, this.macInfo.actualLen);
  }

  /**
   * Verify MAC for incoming packet
   */
  verifyMac(packet: Buffer, receivedMac: Buffer): boolean {
    const seqno = Buffer.alloc(4);
    seqno.writeUInt32BE(this.inSeqno, 0);
    
    const data = Buffer.concat([seqno, packet]);
    const hmac = createHmac(this.macInfo.opensslName, this.keys.serverToClientMac);
    hmac.update(data);
    
    const expectedMac = hmac.digest().subarray(0, this.macInfo.actualLen);
    this.inSeqno++;
    
    return expectedMac.equals(receivedMac);
  }

  /**
   * Basic AES-CTR encryption (simplified implementation)
   */
  private encryptCTR(data: Buffer, outgoing: boolean): Buffer {
    const key = outgoing ? this.keys.clientToServerKey : this.keys.serverToClientKey;
    const iv = outgoing ? this.keys.clientToServerIV : this.keys.serverToClientIV;
    
    const cipher = createCipheriv(this.cipherInfo.opensslName, key, iv);
    cipher.setAutoPadding(false);
    
    return Buffer.concat([cipher.update(data), cipher.final()]);
  }

  /**
   * Basic AES-CTR decryption (simplified implementation)
   */
  private decryptCTR(data: Buffer, outgoing: boolean): Buffer {
    const key = outgoing ? this.keys.clientToServerKey : this.keys.serverToClientKey;
    const iv = outgoing ? this.keys.clientToServerIV : this.keys.serverToClientIV;
    
    const decipher = createDecipheriv(this.cipherInfo.opensslName, key, iv);
    decipher.setAutoPadding(false);
    
    return Buffer.concat([decipher.update(data), decipher.final()]);
  }
}