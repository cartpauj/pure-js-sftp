/**
 * SSH Encryption/Decryption Implementation
 */

import { createCipheriv, createDecipheriv, createHmac } from 'crypto';

export class SSHCipher {
  private algorithm: string;
  private encryptCipher: any;
  private decryptCipher: any;
  private encryptMac: Buffer;
  private decryptMac: Buffer;
  private macAlgorithm: string;
  private sequenceNumber: number = 0;

  constructor(
    algorithm: string,
    encryptKey: Buffer,
    decryptKey: Buffer,
    encryptIV: Buffer,
    decryptIV: Buffer,
    encryptMacKey: Buffer,
    decryptMacKey: Buffer,
    macAlgorithm: string
  ) {
    this.algorithm = algorithm;
    this.macAlgorithm = macAlgorithm;
    this.encryptMac = encryptMacKey;
    this.decryptMac = decryptMacKey;

    // Create ciphers based on algorithm
    const cipherName = this.getCipherName(algorithm);
    
    this.encryptCipher = createCipheriv(cipherName, encryptKey, encryptIV);
    this.decryptCipher = createDecipheriv(cipherName, decryptKey, decryptIV);
  }

  /**
   * Encrypt SSH packet
   */
  encrypt(data: Buffer): Buffer {
    return this.encryptCipher.update(data);
  }

  /**
   * Decrypt SSH packet
   */
  decrypt(data: Buffer): Buffer {
    return this.decryptCipher.update(data);
  }

  /**
   * Calculate MAC for packet
   */
  calculateMAC(packetData: Buffer, isOutgoing: boolean = true): Buffer {
    const macKey = isOutgoing ? this.encryptMac : this.decryptMac;
    const seqBuffer = Buffer.alloc(4);
    seqBuffer.writeUInt32BE(this.sequenceNumber, 0);
    
    const hmacInput = Buffer.concat([seqBuffer, packetData]);
    
    const hmac = createHmac(this.getMacAlgorithm(), macKey);
    hmac.update(hmacInput);
    
    if (isOutgoing) {
      this.sequenceNumber++;
    }
    
    return hmac.digest();
  }

  /**
   * Verify MAC for incoming packet
   */
  verifyMAC(packetData: Buffer, receivedMAC: Buffer): boolean {
    const calculatedMAC = this.calculateMAC(packetData, false);
    return calculatedMAC.equals(receivedMAC);
  }

  /**
   * Get Node.js cipher name from SSH algorithm name
   */
  private getCipherName(algorithm: string): string {
    switch (algorithm) {
      case 'aes128-ctr':
        return 'aes-128-ctr';
      case 'aes192-ctr':
        return 'aes-192-ctr';
      case 'aes256-ctr':
        return 'aes-256-ctr';
      case 'aes128-gcm@openssh.com':
        return 'aes-128-gcm';
      case 'aes256-gcm@openssh.com':
        return 'aes-256-gcm';
      default:
        throw new Error(`Unsupported cipher algorithm: ${algorithm}`);
    }
  }

  /**
   * Get Node.js MAC algorithm name
   */
  private getMacAlgorithm(): string {
    switch (this.macAlgorithm) {
      case 'hmac-sha2-256':
        return 'sha256';
      case 'hmac-sha2-512':
        return 'sha512';
      case 'hmac-sha1':
        return 'sha1';
      default:
        throw new Error(`Unsupported MAC algorithm: ${this.macAlgorithm}`);
    }
  }
}