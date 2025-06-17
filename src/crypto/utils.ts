/**
 * Cryptographic utilities for SSH implementation
 */

import { createHash, createHmac, randomBytes } from 'crypto';

export class CryptoUtils {
  /**
   * Generate random bytes
   */
  static randomBytes(length: number): Buffer {
    return randomBytes(length);
  }

  /**
   * SHA-256 hash
   */
  static sha256(data: Buffer): Buffer {
    return createHash('sha256').update(data).digest();
  }

  /**
   * SHA-384 hash
   */
  static sha384(data: Buffer): Buffer {
    return createHash('sha384').update(data).digest();
  }

  /**
   * SHA-512 hash
   */
  static sha512(data: Buffer): Buffer {
    return createHash('sha512').update(data).digest();
  }

  /**
   * SHA-1 hash
   */
  static sha1(data: Buffer): Buffer {
    return createHash('sha1').update(data).digest();
  }

  /**
   * HMAC-SHA256
   */
  static hmacSha256(key: Buffer, data: Buffer): Buffer {
    return createHmac('sha256', key).update(data).digest();
  }

  /**
   * HMAC-SHA512
   */
  static hmacSha512(key: Buffer, data: Buffer): Buffer {
    return createHmac('sha512', key).update(data).digest();
  }

  /**
   * HMAC-SHA1
   */
  static hmacSha1(key: Buffer, data: Buffer): Buffer {
    return createHmac('sha1', key).update(data).digest();
  }

  /**
   * Convert big integer to Buffer (network byte order)
   */
  static bnToBuffer(bn: bigint): Buffer {
    const hex = bn.toString(16);
    const paddedHex = hex.length % 2 === 0 ? hex : '0' + hex;
    return Buffer.from(paddedHex, 'hex');
  }

  // Note: Removed manual crypto implementations (bufferToBn, modPow) as they're not needed.
  // All cryptographic operations are handled by Node.js crypto module for security and correctness.
}