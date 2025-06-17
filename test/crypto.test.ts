/**
 * Cryptographic utilities tests
 */

import { CryptoUtils } from '../src/crypto/utils';

describe('CryptoUtils', () => {
  describe('randomBytes', () => {
    test('should generate random bytes of specified length', () => {
      const bytes = CryptoUtils.randomBytes(32);
      expect(bytes).toBeInstanceOf(Buffer);
      expect(bytes.length).toBe(32);
    });

    test('should generate different random values', () => {
      const bytes1 = CryptoUtils.randomBytes(16);
      const bytes2 = CryptoUtils.randomBytes(16);
      expect(bytes1.equals(bytes2)).toBe(false);
    });
  });

  describe('SHA hashing', () => {
    const testData = Buffer.from('Hello, World!', 'utf8');

    test('should compute SHA-256 hash correctly', () => {
      const hash = CryptoUtils.sha256(testData);
      expect(hash).toBeInstanceOf(Buffer);
      expect(hash.length).toBe(32); // SHA-256 produces 32-byte hash
      
      // Known SHA-256 hash of "Hello, World!"
      const expected = 'dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f';
      expect(hash.toString('hex')).toBe(expected);
    });

    test('should compute SHA-512 hash correctly', () => {
      const hash = CryptoUtils.sha512(testData);
      expect(hash).toBeInstanceOf(Buffer);
      expect(hash.length).toBe(64); // SHA-512 produces 64-byte hash
      
      // Known SHA-512 hash of "Hello, World!"
      const expected = '374d794a95cdcfd8b35993185fef9ba368f160d8daf432d08ba9f1ed1e5abe6cc69291e0fa2fe0006a52570ef18c19def4e617c33ce52ef0a6e5fbe318cb0387';
      expect(hash.toString('hex')).toBe(expected);
    });

    test('should compute SHA-1 hash correctly', () => {
      const hash = CryptoUtils.sha1(testData);
      expect(hash).toBeInstanceOf(Buffer);
      expect(hash.length).toBe(20); // SHA-1 produces 20-byte hash
      
      // Known SHA-1 hash of "Hello, World!"
      const expected = '0a0a9f2a6772942557ab5355d76af442f8f65e01';
      expect(hash.toString('hex')).toBe(expected);
    });
  });

  describe('HMAC functions', () => {
    const key = Buffer.from('secret-key', 'utf8');
    const data = Buffer.from('test-data', 'utf8');

    test('should compute HMAC-SHA256 correctly', () => {
      const hmac = CryptoUtils.hmacSha256(key, data);
      expect(hmac).toBeInstanceOf(Buffer);
      expect(hmac.length).toBe(32);
      
      // Test deterministic output
      const hmac2 = CryptoUtils.hmacSha256(key, data);
      expect(hmac.equals(hmac2)).toBe(true);
    });

    test('should compute HMAC-SHA512 correctly', () => {
      const hmac = CryptoUtils.hmacSha512(key, data);
      expect(hmac).toBeInstanceOf(Buffer);
      expect(hmac.length).toBe(64);
    });

    test('should compute HMAC-SHA1 correctly', () => {
      const hmac = CryptoUtils.hmacSha1(key, data);
      expect(hmac).toBeInstanceOf(Buffer);
      expect(hmac.length).toBe(20);
    });

    test('should produce different HMACs for different keys', () => {
      const key1 = Buffer.from('key1', 'utf8');
      const key2 = Buffer.from('key2', 'utf8');
      
      const hmac1 = CryptoUtils.hmacSha256(key1, data);
      const hmac2 = CryptoUtils.hmacSha256(key2, data);
      
      expect(hmac1.equals(hmac2)).toBe(false);
    });
  });

  describe('BigInt utilities', () => {
    test('should convert bigint to buffer correctly', () => {
      const bn = BigInt('0x1234567890abcdef');
      const buffer = CryptoUtils.bnToBuffer(bn);
      
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.toString('hex')).toBe('1234567890abcdef');
    });

    // Note: Removed bufferToBn tests as this manual implementation was removed
    // All BigInt conversions now use Node.js built-in Buffer methods for security
    test('should handle buffer to BigInt conversion via native methods', () => {
      const buffer = Buffer.from('1234567890abcdef', 'hex');
      const bn = BigInt('0x' + buffer.toString('hex'));
      
      expect(typeof bn).toBe('bigint');
      expect(bn).toBe(BigInt('0x1234567890abcdef'));
    });

    test('should handle small numbers correctly', () => {
      const small = BigInt(42);
      const buffer = CryptoUtils.bnToBuffer(small);
      
      expect(buffer.toString('hex')).toBe('2a');
    });

    test('should handle zero correctly', () => {
      const zero = BigInt(0);
      const buffer = CryptoUtils.bnToBuffer(zero);
      
      expect(buffer.toString('hex')).toBe('00');
    });
  });

  // Note: Removed modPow tests as this manual implementation was removed for security
  // All modular exponentiation is now handled by Node.js crypto module in DH/ECDH operations
});