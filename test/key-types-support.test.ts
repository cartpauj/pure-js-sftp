/**
 * SSH Key Types and Passphrase Support Tests
 * 
 * This test suite validates support for different SSH key types and formats,
 * including passphrase-protected keys.
 */

import { AuthManager } from '../src/auth/auth-manager';
import { SSHTransport } from '../src/ssh/transport';
import { SSHConfig } from '../src/ssh/types';
import { generateKeyPairSync } from 'crypto';

describe('SSH Key Types and Passphrase Support', () => {
  let mockTransport: jest.Mocked<SSHTransport>;

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

  describe('Supported Key Types', () => {
    test('should support RSA keys (2048-bit)', () => {
      const keyPair = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      const config: SSHConfig = {
        host: 'test.example.com',
        port: 22,
        username: 'testuser',
        privateKey: keyPair.privateKey
      };

      const authManager = new AuthManager(mockTransport, config);
      const result = (authManager as any).parsePrivateKey(keyPair.privateKey);
      
      expect(result.algorithm).toBe('rsa-sha2-256');
      expect(result.publicKey).toBeInstanceOf(Buffer);
      expect(result.publicKey.length).toBeGreaterThan(100);
    });

    test('should support RSA keys (4096-bit)', () => {
      const keyPair = generateKeyPairSync('rsa', {
        modulusLength: 4096,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      const config: SSHConfig = {
        host: 'test.example.com',
        port: 22,
        username: 'testuser',
        privateKey: keyPair.privateKey
      };

      const authManager = new AuthManager(mockTransport, config);
      const result = (authManager as any).parsePrivateKey(keyPair.privateKey);
      
      expect(result.algorithm).toBe('rsa-sha2-256');
      expect(result.publicKey).toBeInstanceOf(Buffer);
    });

    test('should support ECDSA P-256 keys', () => {
      const keyPair = generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      const config: SSHConfig = {
        host: 'test.example.com',
        port: 22,
        username: 'testuser',
        privateKey: keyPair.privateKey
      };

      const authManager = new AuthManager(mockTransport, config);
      const result = (authManager as any).parsePrivateKey(keyPair.privateKey);
      
      expect(result.algorithm).toBe('ecdsa-sha2-nistp256');
      expect(result.publicKey).toBeInstanceOf(Buffer);
    });

    test('should support ECDSA P-384 keys', () => {
      const keyPair = generateKeyPairSync('ec', {
        namedCurve: 'secp384r1',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      const config: SSHConfig = {
        host: 'test.example.com',
        port: 22,
        username: 'testuser',
        privateKey: keyPair.privateKey
      };

      const authManager = new AuthManager(mockTransport, config);
      const result = (authManager as any).parsePrivateKey(keyPair.privateKey);
      
      expect(result.algorithm).toBe('ecdsa-sha2-nistp384');
      expect(result.publicKey).toBeInstanceOf(Buffer);
    });

    test('should support ECDSA P-521 keys', () => {
      const keyPair = generateKeyPairSync('ec', {
        namedCurve: 'secp521r1',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      const config: SSHConfig = {
        host: 'test.example.com',
        port: 22,
        username: 'testuser',
        privateKey: keyPair.privateKey
      };

      const authManager = new AuthManager(mockTransport, config);
      const result = (authManager as any).parsePrivateKey(keyPair.privateKey);
      
      expect(result.algorithm).toBe('ecdsa-sha2-nistp521');
      expect(result.publicKey).toBeInstanceOf(Buffer);
    });

    test('should support Ed25519 keys', () => {
      const keyPair = generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      const config: SSHConfig = {
        host: 'test.example.com',
        port: 22,
        username: 'testuser',
        privateKey: keyPair.privateKey
      };

      const authManager = new AuthManager(mockTransport, config);
      const result = (authManager as any).parsePrivateKey(keyPair.privateKey);
      
      expect(result.algorithm).toBe('ssh-ed25519');
      expect(result.publicKey).toBeInstanceOf(Buffer);
    });
  });

  describe('Key Format Support', () => {
    test('should support PKCS#8 format', () => {
      const keyPair = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      // PKCS#8 keys start with "-----BEGIN PRIVATE KEY-----"
      expect(keyPair.privateKey).toContain('-----BEGIN PRIVATE KEY-----');

      const config: SSHConfig = {
        host: 'test.example.com',
        port: 22,
        username: 'testuser',
        privateKey: keyPair.privateKey
      };

      const authManager = new AuthManager(mockTransport, config);
      
      expect(() => {
        (authManager as any).parsePrivateKey(keyPair.privateKey);
      }).not.toThrow();
    });

    test('should support traditional RSA format', () => {
      const keyPair = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
      });

      // Traditional RSA keys start with "-----BEGIN RSA PRIVATE KEY-----"
      expect(keyPair.privateKey).toContain('-----BEGIN RSA PRIVATE KEY-----');

      const config: SSHConfig = {
        host: 'test.example.com',
        port: 22,
        username: 'testuser',
        privateKey: keyPair.privateKey
      };

      const authManager = new AuthManager(mockTransport, config);
      
      expect(() => {
        (authManager as any).parsePrivateKey(keyPair.privateKey);
      }).not.toThrow();
    });

    test('should support Buffer input', () => {
      const keyPair = generateKeyPairSync('rsa', {
        modulusLength: 1024,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      const keyBuffer = Buffer.from(keyPair.privateKey);

      const config: SSHConfig = {
        host: 'test.example.com',
        port: 22,
        username: 'testuser',
        privateKey: keyBuffer
      };

      const authManager = new AuthManager(mockTransport, config);
      
      expect(() => {
        (authManager as any).parsePrivateKey(keyBuffer);
      }).not.toThrow();
    });
  });

  describe('Passphrase Support', () => {
    test('should handle passphrase-protected RSA keys', () => {
      const passphrase = 'test-passphrase-123';
      
      const keyPair = generateKeyPairSync('rsa', {
        modulusLength: 1024,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { 
          type: 'pkcs8', 
          format: 'pem',
          cipher: 'aes-256-cbc',
          passphrase: passphrase
        }
      });

      // Encrypted keys should contain "ENCRYPTED"
      expect(keyPair.privateKey).toContain('ENCRYPTED');

      const config: SSHConfig = {
        host: 'test.example.com',
        port: 22,
        username: 'testuser',
        privateKey: keyPair.privateKey,
        passphrase: passphrase
      };

      const authManager = new AuthManager(mockTransport, config);
      
      // This should work with correct passphrase
      expect(() => {
        (authManager as any).parsePrivateKey(keyPair.privateKey, passphrase);
      }).not.toThrow();
    });

    test('should handle passphrase-protected ECDSA keys', () => {
      const passphrase = 'ecdsa-test-passphrase';
      
      const keyPair = generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { 
          type: 'pkcs8', 
          format: 'pem',
          cipher: 'aes-256-cbc',
          passphrase: passphrase
        }
      });

      expect(keyPair.privateKey).toContain('ENCRYPTED');

      const config: SSHConfig = {
        host: 'test.example.com',
        port: 22,
        username: 'testuser',
        privateKey: keyPair.privateKey,
        passphrase: passphrase
      };

      const authManager = new AuthManager(mockTransport, config);
      
      expect(() => {
        (authManager as any).parsePrivateKey(keyPair.privateKey, passphrase);
      }).not.toThrow();
    });

    test('should fail with wrong passphrase', () => {
      const correctPassphrase = 'correct-passphrase';
      const wrongPassphrase = 'wrong-passphrase';
      
      const keyPair = generateKeyPairSync('rsa', {
        modulusLength: 1024,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { 
          type: 'pkcs8', 
          format: 'pem',
          cipher: 'aes-256-cbc',
          passphrase: correctPassphrase
        }
      });

      const config: SSHConfig = {
        host: 'test.example.com',
        port: 22,
        username: 'testuser',
        privateKey: keyPair.privateKey,
        passphrase: wrongPassphrase
      };

      const authManager = new AuthManager(mockTransport, config);
      
      expect(() => {
        (authManager as any).parsePrivateKey(keyPair.privateKey, wrongPassphrase);
      }).toThrow();
    });

    test('should fail without passphrase for encrypted key', () => {
      const passphrase = 'required-passphrase';
      
      const keyPair = generateKeyPairSync('rsa', {
        modulusLength: 1024,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { 
          type: 'pkcs8', 
          format: 'pem',
          cipher: 'aes-256-cbc',
          passphrase: passphrase
        }
      });

      const config: SSHConfig = {
        host: 'test.example.com',
        port: 22,
        username: 'testuser',
        privateKey: keyPair.privateKey
        // No passphrase provided
      };

      const authManager = new AuthManager(mockTransport, config);
      
      expect(() => {
        (authManager as any).parsePrivateKey(keyPair.privateKey);
      }).toThrow();
    });
  });

  describe('Legacy Key Format Support', () => {
    test('should reject unsupported key types gracefully', () => {
      // Try to use a DSA key (not supported)
      const fakeUnsupportedKey = `-----BEGIN PRIVATE KEY-----
MIICXgIBAAKBgQDTgvwjlRHZ0pBiLZe7pKd1dfW6Pp6w9JM9LHsZGdVktMH2p0X5
fakeunsupportedkeydata123456789012345678901234567890123456789
-----END PRIVATE KEY-----`;

      const config: SSHConfig = {
        host: 'test.example.com',
        port: 22,
        username: 'testuser',
        privateKey: fakeUnsupportedKey
      };

      const authManager = new AuthManager(mockTransport, config);
      
      expect(() => {
        (authManager as any).parsePrivateKey(fakeUnsupportedKey);
      }).toThrow('Failed to parse private key');
    });

    test('should handle malformed keys gracefully', () => {
      const malformedKey = 'this-is-not-a-valid-key';

      const config: SSHConfig = {
        host: 'test.example.com',
        port: 22,
        username: 'testuser',
        privateKey: malformedKey
      };

      const authManager = new AuthManager(mockTransport, config);
      
      expect(() => {
        (authManager as any).parsePrivateKey(malformedKey);
      }).toThrow('Failed to parse private key');
    });
  });

  describe('Key Size Support', () => {
    test('should support small RSA keys (1024-bit) for testing', () => {
      const keyPair = generateKeyPairSync('rsa', {
        modulusLength: 1024,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      const config: SSHConfig = {
        host: 'test.example.com',
        port: 22,
        username: 'testuser',
        privateKey: keyPair.privateKey
      };

      const authManager = new AuthManager(mockTransport, config);
      const result = (authManager as any).parsePrivateKey(keyPair.privateKey);
      
      expect(result.algorithm).toBe('rsa-sha2-256');
    });

    test('should support large RSA keys (3072-bit)', () => {
      const keyPair = generateKeyPairSync('rsa', {
        modulusLength: 3072,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      const config: SSHConfig = {
        host: 'test.example.com',
        port: 22,
        username: 'testuser',
        privateKey: keyPair.privateKey
      };

      const authManager = new AuthManager(mockTransport, config);
      const result = (authManager as any).parsePrivateKey(keyPair.privateKey);
      
      expect(result.algorithm).toBe('rsa-sha2-256');
    });
  });
});