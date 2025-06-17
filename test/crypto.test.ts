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

    test('should convert buffer to bigint correctly', () => {
      const buffer = Buffer.from('1234567890abcdef', 'hex');
      const bn = CryptoUtils.bufferToBn(buffer);
      
      expect(typeof bn).toBe('bigint');
      expect(bn).toBe(BigInt('0x1234567890abcdef'));
    });

    test('should round-trip bigint <-> buffer conversion', () => {
      const original = BigInt('0x123456789abcdef0123456789abcdef');
      const buffer = CryptoUtils.bnToBuffer(original);
      const restored = CryptoUtils.bufferToBn(buffer);
      
      expect(restored).toBe(original);
    });

    test('should handle small numbers correctly', () => {
      const small = BigInt(42);
      const buffer = CryptoUtils.bnToBuffer(small);
      const restored = CryptoUtils.bufferToBn(buffer);
      
      expect(restored).toBe(small);
      expect(buffer.toString('hex')).toBe('2a');
    });

    test('should handle zero correctly', () => {
      const zero = BigInt(0);
      const buffer = CryptoUtils.bnToBuffer(zero);
      const restored = CryptoUtils.bufferToBn(buffer);
      
      expect(restored).toBe(zero);
      expect(buffer.toString('hex')).toBe('00');
    });
  });

  describe('modPow function', () => {
    test('should compute modular exponentiation correctly', () => {
      // Test: 3^4 mod 5 = 81 mod 5 = 1
      const result = CryptoUtils.modPow(BigInt(3), BigInt(4), BigInt(5));
      expect(result).toBe(BigInt(1));
    });

    test('should handle large numbers', () => {
      // Test a larger case
      const base = BigInt('123456789');
      const exponent = BigInt('987654321');
      const modulus = BigInt('1000000007');
      
      const result = CryptoUtils.modPow(base, exponent, modulus);
      expect(result).toBeGreaterThanOrEqual(BigInt(0));
      expect(result).toBeLessThan(modulus);
    });

    test('should handle edge cases', () => {
      // Test: anything^0 mod m = 1 (if m > 1)
      expect(CryptoUtils.modPow(BigInt(123), BigInt(0), BigInt(456))).toBe(BigInt(1));
      
      // Test: 0^anything mod m = 0 (if exponent > 0)
      expect(CryptoUtils.modPow(BigInt(0), BigInt(5), BigInt(7))).toBe(BigInt(0));
      
      // Test: modulus = 1 should return 0
      expect(CryptoUtils.modPow(BigInt(5), BigInt(3), BigInt(1))).toBe(BigInt(0));
    });

    test('should be consistent with JavaScript ** operator for small numbers', () => {
      const base = 7;
      const exponent = 3;
      const modulus = 13;
      
      const expected = BigInt((base ** exponent) % modulus);
      const actual = CryptoUtils.modPow(BigInt(base), BigInt(exponent), BigInt(modulus));
      
      expect(actual).toBe(expected);
    });
  });
});