/**
 * SSH2 Library Compatibility Tests
 * 
 * This test suite validates that our pure-js implementation follows the same
 * standards and formats as the ssh2 library for public key authentication.
 */

import { AuthManager } from '../src/auth/auth-manager';
import { SSHTransport } from '../src/ssh/transport';
import { SSHConfig } from '../src/ssh/types';
import { generateKeyPairSync } from 'crypto';

describe('SSH2 Library Compatibility', () => {
  let mockTransport: jest.Mocked<SSHTransport>;
  let config: SSHConfig;

  beforeEach(() => {
    mockTransport = {
      getSessionId: jest.fn(),
      sendPacket: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      emit: jest.fn(),
      removeAllListeners: jest.fn()
    } as any;

    mockTransport.getSessionId.mockReturnValue(Buffer.from('test-session-id'));
  });

  describe('RSA Key Handling', () => {
    test('should use modern RSA signature algorithms', () => {
      const keyPair = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      config = {
        host: 'test.example.com',
        port: 22,
        username: 'testuser',
        privateKey: keyPair.privateKey
      };

      const authManager = new AuthManager(mockTransport, config);
      
      // Test that we use rsa-sha2-256 instead of deprecated ssh-rsa
      const result = (authManager as any).parsePrivateKey(keyPair.privateKey);
      expect(result.algorithm).toBe('rsa-sha2-256');
    });

    test('should generate correct SSH RSA public key format', () => {
      const keyPair = generateKeyPairSync('rsa', {
        modulusLength: 1024, // Smaller for test speed
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      config = {
        host: 'test.example.com',
        port: 22,
        username: 'testuser',
        privateKey: keyPair.privateKey
      };

      const authManager = new AuthManager(mockTransport, config);
      const result = (authManager as any).parsePrivateKey(keyPair.privateKey);
      
      // The public key blob should start with "ssh-rsa" even when using stronger signature algorithms
      const publicKeyString = result.publicKey.toString();
      expect(publicKeyString).toContain('ssh-rsa');
      
      // Should not be placeholder values
      expect(result.publicKey.length).toBeGreaterThan(100);
    });

    test('should support multiple RSA signature algorithms', () => {
      const keyPair = generateKeyPairSync('rsa', {
        modulusLength: 1024,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      config = {
        host: 'test.example.com',
        port: 22,
        username: 'testuser',
        privateKey: keyPair.privateKey
      };

      const authManager = new AuthManager(mockTransport, config);
      const testData = Buffer.from('test signature data');

      // Test RSA-SHA256
      const sha256Sig = (authManager as any).signData(testData, 'rsa-sha2-256');
      expect(sha256Sig).toBeInstanceOf(Buffer);
      expect(sha256Sig.length).toBeGreaterThan(0);

      // Test RSA-SHA512
      const sha512Sig = (authManager as any).signData(testData, 'rsa-sha2-512');
      expect(sha512Sig).toBeInstanceOf(Buffer);
      expect(sha512Sig.length).toBeGreaterThan(0);

      // Test legacy ssh-rsa (should use SHA-256 internally)
      const legacySig = (authManager as any).signData(testData, 'ssh-rsa');
      expect(legacySig).toBeInstanceOf(Buffer);
      expect(legacySig.length).toBeGreaterThan(0);
    });
  });

  describe('ECDSA Key Handling', () => {
    test('should generate correct SSH ECDSA public key format for P-256', () => {
      const keyPair = generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      config = {
        host: 'test.example.com',
        port: 22,
        username: 'testuser',
        privateKey: keyPair.privateKey
      };

      const authManager = new AuthManager(mockTransport, config);
      const result = (authManager as any).parsePrivateKey(keyPair.privateKey);
      
      expect(result.algorithm).toBe('ecdsa-sha2-nistp256');
      
      // Check public key structure follows RFC 5656
      const publicKeyString = result.publicKey.toString();
      expect(publicKeyString).toContain('ecdsa-sha2-nistp256');
      expect(publicKeyString).toContain('nistp256');
    });

    test('should support different ECDSA curves', () => {
      const curves = [
        { name: 'prime256v1', expected: 'ecdsa-sha2-nistp256' },
        { name: 'secp384r1', expected: 'ecdsa-sha2-nistp384' },
        { name: 'secp521r1', expected: 'ecdsa-sha2-nistp521' }
      ];

      curves.forEach(({ name, expected }) => {
        const keyPair = generateKeyPairSync('ec', {
          namedCurve: name,
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });

        config = {
          host: 'test.example.com',
          port: 22,
          username: 'testuser',
          privateKey: keyPair.privateKey
        };

        const authManager = new AuthManager(mockTransport, config);
        const result = (authManager as any).parsePrivateKey(keyPair.privateKey);
        
        expect(result.algorithm).toBe(expected);
      });
    });
  });

  describe('Ed25519 Key Handling', () => {
    test('should generate correct SSH Ed25519 public key format', () => {
      const keyPair = generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      config = {
        host: 'test.example.com',
        port: 22,
        username: 'testuser',
        privateKey: keyPair.privateKey
      };

      const authManager = new AuthManager(mockTransport, config);
      const result = (authManager as any).parsePrivateKey(keyPair.privateKey);
      
      expect(result.algorithm).toBe('ssh-ed25519');
      
      // Check public key follows RFC 8709
      const publicKeyString = result.publicKey.toString();
      expect(publicKeyString).toContain('ssh-ed25519');
      
      // Ed25519 public keys should be 32 bytes + string length encoding
      expect(result.publicKey.length).toBeGreaterThan(32);
    });

    test('should create valid Ed25519 signatures', () => {
      const keyPair = generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      config = {
        host: 'test.example.com',
        port: 22,
        username: 'testuser',
        privateKey: keyPair.privateKey
      };

      const authManager = new AuthManager(mockTransport, config);
      const testData = Buffer.from('test signature data');

      const signature = (authManager as any).signData(testData, 'ssh-ed25519');
      expect(signature).toBeInstanceOf(Buffer);
      expect(signature.length).toBeGreaterThan(0);
      // Ed25519 signatures are typically 64 bytes
      expect(signature.length).toBe(64);
    });
  });

  describe('SSH Wire Format Compliance', () => {
    test('should use correct SSH mpint format for RSA keys', () => {
      const testBigint = BigInt('65537'); // Common RSA exponent
      
      const authManager = new AuthManager(mockTransport, config);
      const mpintBuffer = (authManager as any).bigintToMpint(testBigint);
      
      // mpint format: 4-byte length + data
      expect(mpintBuffer.length).toBeGreaterThan(4);
      
      // First 4 bytes should be length
      const length = mpintBuffer.readUInt32BE(0);
      expect(length).toBe(mpintBuffer.length - 4);
    });

    test('should handle SSH mpint padding correctly', () => {
      // Test a value that would have high bit set (needs padding)
      const testBigint = BigInt('0x80000000');
      
      const authManager = new AuthManager(mockTransport, config);
      const mpintBuffer = (authManager as any).bigintToMpint(testBigint);
      
      // Should have padding byte (0x00) if high bit would be set
      const dataStart = 4; // Skip length bytes
      const firstDataByte = mpintBuffer[dataStart];
      
      if (firstDataByte & 0x80) {
        // If high bit is set, there should be padding
        expect(firstDataByte).toBe(0x00);
      }
    });

    test('should build correct SSH signature packets', () => {
      const keyPair = generateKeyPairSync('rsa', {
        modulusLength: 1024,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      config = {
        host: 'test.example.com',
        port: 22,
        username: 'testuser',
        privateKey: keyPair.privateKey
      };

      const authManager = new AuthManager(mockTransport, config);
      const { publicKey, algorithm } = (authManager as any).parsePrivateKey(keyPair.privateKey);
      
      // Test the signature packet building
      (authManager as any).sendPublicKeySignature(publicKey, algorithm);
      
      expect(mockTransport.sendPacket).toHaveBeenCalled();
      
      const [messageType, payload] = mockTransport.sendPacket.mock.calls[0];
      expect(messageType).toBe(50); // SSH_MSG.USERAUTH_REQUEST
      expect(payload).toBeInstanceOf(Buffer);
      
      // The payload should contain the signature blob with algorithm identifier
      const payloadStr = payload.toString();
      expect(payloadStr).toContain('rsa-sha2-256');
    });
  });

  describe('Error Handling and Compatibility', () => {
    test('should handle invalid key formats gracefully', () => {
      config = {
        host: 'test.example.com',
        port: 22,
        username: 'testuser',
        privateKey: 'invalid-key-content'
      };

      const authManager = new AuthManager(mockTransport, config);
      
      expect(() => {
        (authManager as any).parsePrivateKey('invalid-key-content');
      }).toThrow('Failed to parse private key');
    });

    test('should validate key type against algorithm', () => {
      const rsaKeyPair = generateKeyPairSync('rsa', {
        modulusLength: 1024,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      config = {
        host: 'test.example.com',
        port: 22,
        username: 'testuser',
        privateKey: rsaKeyPair.privateKey
      };

      const authManager = new AuthManager(mockTransport, config);
      const testData = Buffer.from('test data');

      // Should reject ECDSA algorithm with RSA key
      expect(() => {
        (authManager as any).signData(testData, 'ecdsa-sha2-nistp256');
      }).toThrow('Key type rsa does not match algorithm ecdsa-sha2-nistp256');
    });
  });
});