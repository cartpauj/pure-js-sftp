/**
 * Cryptographic Interoperability Tests
 * Tests that our crypto implementations match known standards
 */

import { CryptoUtils } from '../src/crypto/utils';
import { DiffieHellmanKex } from '../src/kex/diffie-hellman';
import { createHash, createHmac } from 'crypto';

describe('Cryptographic Interoperability', () => {
  describe('Hash Function Compatibility', () => {
    test('should match Node.js built-in SHA implementations', () => {
      const testVectors = [
        '',
        'a',
        'abc',
        'message digest',
        'abcdefghijklmnopqrstuvwxyz',
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
        '1234567890'.repeat(8), // 80 chars
        'The quick brown fox jumps over the lazy dog',
        'The quick brown fox jumps over the lazy dog.',
        Buffer.alloc(1000, 0x41).toString(), // 1000 'A's
      ];
      
      for (const input of testVectors) {
        const inputBuffer = Buffer.from(input, 'utf8');
        
        // Test SHA-1
        const ourSha1 = CryptoUtils.sha1(inputBuffer);
        const nodeSha1 = createHash('sha1').update(inputBuffer).digest();
        expect(ourSha1.equals(nodeSha1)).toBe(true);
        
        // Test SHA-256
        const ourSha256 = CryptoUtils.sha256(inputBuffer);
        const nodeSha256 = createHash('sha256').update(inputBuffer).digest();
        expect(ourSha256.equals(nodeSha256)).toBe(true);
        
        // Test SHA-512
        const ourSha512 = CryptoUtils.sha512(inputBuffer);
        const nodeSha512 = createHash('sha512').update(inputBuffer).digest();
        expect(ourSha512.equals(nodeSha512)).toBe(true);
      }
    });

    test('should match HMAC implementations', () => {
      const keys = [
        Buffer.alloc(16, 0x0b),
        Buffer.from('Jefe'),
        Buffer.alloc(20, 0xaa),
        Buffer.alloc(131, 0xaa), // Longer than block size
        Buffer.from('key', 'utf8'),
        CryptoUtils.randomBytes(32),
      ];
      
      const messages = [
        Buffer.from('Hi There'),
        Buffer.from('what do ya want for nothing?'),
        Buffer.alloc(50, 0xdd),
        Buffer.from('Test Using Larger Than Block-Size Key - Hash Key First'),
        Buffer.from(''),
        CryptoUtils.randomBytes(1000),
      ];
      
      for (const key of keys) {
        for (const message of messages) {
          // Test HMAC-SHA1
          const ourHmacSha1 = CryptoUtils.hmacSha1(key, message);
          const nodeHmacSha1 = createHmac('sha1', key).update(message).digest();
          expect(ourHmacSha1.equals(nodeHmacSha1)).toBe(true);
          
          // Test HMAC-SHA256
          const ourHmacSha256 = CryptoUtils.hmacSha256(key, message);
          const nodeHmacSha256 = createHmac('sha256', key).update(message).digest();
          expect(ourHmacSha256.equals(nodeHmacSha256)).toBe(true);
          
          // Test HMAC-SHA512
          const ourHmacSha512 = CryptoUtils.hmacSha512(key, message);
          const nodeHmacSha512 = createHmac('sha512', key).update(message).digest();
          expect(ourHmacSha512.equals(nodeHmacSha512)).toBe(true);
        }
      }
    });
  });

  describe('Known Test Vectors', () => {
    test('should match SHA-256 test vectors from NIST', () => {
      // NIST test vectors for SHA-256
      const testVectors = [
        {
          input: '',
          expected: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
        },
        {
          input: 'abc',
          expected: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
        },
        {
          input: 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
          expected: '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
        },
        {
          input: 'a'.repeat(1000000),
          expected: 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0'
        }
      ];
      
      for (const { input, expected } of testVectors) {
        const result = CryptoUtils.sha256(Buffer.from(input));
        expect(result.toString('hex')).toBe(expected);
      }
    });

    test('should match HMAC-SHA256 test vectors from RFC 4231', () => {
      // RFC 4231 test vectors
      const testVectors = [
        {
          key: '0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b',
          data: '4869205468657265',
          expected: 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7'
        },
        {
          key: '4a656665',
          data: '7768617420646f2079612077616e7420666f72206e6f7468696e673f',
          expected: '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843'
        },
        {
          key: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          data: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
          expected: '773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe'
        }
      ];
      
      for (const { key, data, expected } of testVectors) {
        const keyBuffer = Buffer.from(key, 'hex');
        const dataBuffer = Buffer.from(data, 'hex');
        const result = CryptoUtils.hmacSha256(keyBuffer, dataBuffer);
        expect(result.toString('hex')).toBe(expected);
      }
    });
  });

  describe('BigInt Arithmetic Compatibility', () => {
    test('should handle large numbers correctly', () => {
      // Test with numbers used in DH groups
      const dhPrime14 = BigInt('0xFFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AACAA68FFFFFFFFFFFFFFFF');
      
      const testBases = [BigInt(2), BigInt(5), BigInt(65537), BigInt('0x10001')];
      const testExponents = [BigInt(1), BigInt(2), BigInt(16), BigInt(65537)];
      
      for (const base of testBases) {
        for (const exp of testExponents) {
          // Test modular exponentiation
          const result = CryptoUtils.modPow(base, exp, dhPrime14);
          
          // Verify result is in valid range
          expect(result).toBeGreaterThanOrEqual(BigInt(0));
          expect(result).toBeLessThan(dhPrime14);
          
          // Test BigInt conversion round-trip
          const resultBuffer = CryptoUtils.bnToBuffer(result);
          const roundTrip = CryptoUtils.bufferToBn(resultBuffer);
          expect(roundTrip).toBe(result);
        }
      }
    });

    test('should handle edge cases in BigInt conversion', () => {
      const testCases = [
        BigInt(0),
        BigInt(1),
        BigInt(255),
        BigInt(256),
        BigInt(65535),
        BigInt(65536),
        BigInt('0xFFFFFFFF'),
        BigInt('0x100000000'),
        BigInt('0xFFFFFFFFFFFFFFFF'),
      ];
      
      for (const value of testCases) {
        const buffer = CryptoUtils.bnToBuffer(value);
        const restored = CryptoUtils.bufferToBn(buffer);
        expect(restored).toBe(value);
        
        // Test with leading zeros
        const paddedBuffer = Buffer.concat([Buffer.alloc(4, 0), buffer]);
        const restoredPadded = CryptoUtils.bufferToBn(paddedBuffer);
        expect(restoredPadded).toBe(value);
      }
    });
  });

  describe('SSH Key Exchange Validation', () => {
    test('should generate valid Diffie-Hellman parameters', () => {
      const algorithms = ['diffie-hellman-group14-sha256', 'diffie-hellman-group16-sha512'];
      
      for (const algorithm of algorithms) {
        const kex = new DiffieHellmanKex(algorithm);
        
        // Test multiple key generations
        for (let i = 0; i < 5; i++) {
          const publicKey = kex.getClientPublicKey();
          
          // Verify public key is valid
          expect(publicKey.length).toBeGreaterThan(0);
          
          // Convert to BigInt and verify it's in valid range
          const pubKeyBN = CryptoUtils.bufferToBn(publicKey);
          expect(pubKeyBN).toBeGreaterThan(BigInt(1));
          
          // Verify each generation produces different keys
          const publicKey2 = new DiffieHellmanKex(algorithm).getClientPublicKey();
          expect(publicKey.equals(publicKey2)).toBe(false);
        }
      }
    });

    test('should produce consistent exchange hashes', () => {
      const kex = new DiffieHellmanKex('diffie-hellman-group14-sha256');
      
      // Use consistent test data
      const clientVersion = 'SSH-2.0-TestClient';
      const serverVersion = 'SSH-2.0-TestServer';
      const clientKexInit = Buffer.alloc(100, 0x41); // 100 'A's
      const serverKexInit = Buffer.alloc(100, 0x42); // 100 'B's
      const serverHostKey = Buffer.alloc(50, 0x43); // 50 'C's
      const clientPublicKey = kex.getClientPublicKey();
      const serverPublicKey = Buffer.alloc(256, 0x44); // 256 'D's
      const sharedSecret = Buffer.alloc(256, 0x45); // 256 'E's
      
      // Generate hash multiple times - should be identical
      const hash1 = kex.generateExchangeHash(
        clientVersion, serverVersion, clientKexInit, serverKexInit,
        serverHostKey, clientPublicKey, serverPublicKey, sharedSecret
      );
      
      const hash2 = kex.generateExchangeHash(
        clientVersion, serverVersion, clientKexInit, serverKexInit,
        serverHostKey, clientPublicKey, serverPublicKey, sharedSecret
      );
      
      expect(hash1.equals(hash2)).toBe(true);
      expect(hash1.length).toBe(32); // SHA-256
      
      // Test with group16 (SHA-512)
      const kex16 = new DiffieHellmanKex('diffie-hellman-group16-sha512');
      const clientPublicKey16 = kex16.getClientPublicKey();
      
      const hash16 = kex16.generateExchangeHash(
        clientVersion, serverVersion, clientKexInit, serverKexInit,
        serverHostKey, clientPublicKey16, serverPublicKey, sharedSecret
      );
      
      expect(hash16.length).toBe(64); // SHA-512
      expect(hash1.equals(hash16)).toBe(false); // Different algorithms should produce different hashes
    });

    test('should derive encryption keys deterministically', () => {
      const kex = new DiffieHellmanKex('diffie-hellman-group14-sha256');
      
      const sharedSecret = CryptoUtils.randomBytes(256);
      const exchangeHash = CryptoUtils.randomBytes(32);
      const sessionId = exchangeHash;
      
      // Derive keys multiple times
      const keys1 = kex.deriveKeys(sharedSecret, exchangeHash, sessionId);
      const keys2 = kex.deriveKeys(sharedSecret, exchangeHash, sessionId);
      
      // Should be identical
      expect(keys1.clientToServerKey.equals(keys2.clientToServerKey)).toBe(true);
      expect(keys1.serverToClientKey.equals(keys2.serverToClientKey)).toBe(true);
      expect(keys1.clientToServerIV.equals(keys2.clientToServerIV)).toBe(true);
      expect(keys1.serverToClientIV.equals(keys2.serverToClientIV)).toBe(true);
      expect(keys1.clientToServerMac.equals(keys2.clientToServerMac)).toBe(true);
      expect(keys1.serverToClientMac.equals(keys2.serverToClientMac)).toBe(true);
      
      // Test that changing inputs changes output
      const differentSharedSecret = CryptoUtils.randomBytes(256);
      const keys3 = kex.deriveKeys(differentSharedSecret, exchangeHash, sessionId);
      
      expect(keys1.clientToServerKey.equals(keys3.clientToServerKey)).toBe(false);
    });
  });

  describe('Performance and Security', () => {
    test('should generate cryptographically secure random data', () => {
      const samples = 100;
      const sampleSize = 256;
      const allSamples: Buffer[] = [];
      
      // Generate multiple random samples
      for (let i = 0; i < samples; i++) {
        const sample = CryptoUtils.randomBytes(sampleSize);
        expect(sample.length).toBe(sampleSize);
        allSamples.push(sample);
      }
      
      // Verify no two samples are identical (extremely unlikely with good RNG)
      for (let i = 0; i < samples; i++) {
        for (let j = i + 1; j < samples; j++) {
          expect(allSamples[i].equals(allSamples[j])).toBe(false);
        }
      }
      
      // Basic entropy check - no byte value should dominate
      const byteCounts = new Array(256).fill(0);
      for (const sample of allSamples) {
        for (const byte of sample) {
          byteCounts[byte]++;
        }
      }
      
      const totalBytes = samples * sampleSize;
      const expectedFreq = totalBytes / 256;
      const tolerance = expectedFreq * 0.5; // 50% tolerance for randomness
      
      for (let i = 0; i < 256; i++) {
        expect(byteCounts[i]).toBeGreaterThan(expectedFreq - tolerance);
        expect(byteCounts[i]).toBeLessThan(expectedFreq + tolerance);
      }
    });

    test('should handle large scale operations efficiently', () => {
      const startTime = Date.now();
      
      // Perform many crypto operations
      for (let i = 0; i < 100; i++) {
        const data = CryptoUtils.randomBytes(1024);
        CryptoUtils.sha256(data);
        CryptoUtils.hmacSha256(data.subarray(0, 32), data.subarray(32));
      }
      
      // Perform DH operations
      for (let i = 0; i < 10; i++) {
        const kex = new DiffieHellmanKex('diffie-hellman-group14-sha256');
        kex.getClientPublicKey();
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete in reasonable time (less than 5 seconds)
      expect(duration).toBeLessThan(5000);
    });
  });
});