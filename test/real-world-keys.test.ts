/**
 * Real-World SSH Key Scenarios Test
 * 
 * Tests scenarios that users commonly encounter with different SSH key setups.
 */

import { AuthManager } from '../src/auth/auth-manager';
import { SSHTransport } from '../src/ssh/transport';
import { SSHConfig } from '../src/ssh/types';
import { generateKeyPairSync } from 'crypto';

describe('Real-World SSH Key Scenarios', () => {
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

  describe('Common SSH Key Scenarios', () => {
    test('should handle default GitHub SSH key (RSA 2048)', () => {
      // GitHub's default key generation creates RSA 2048-bit keys
      const keyPair = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      const config: SSHConfig = {
        host: 'github.com',
        port: 22,
        username: 'git',
        privateKey: keyPair.privateKey
      };

      const authManager = new AuthManager(mockTransport, config);
      const result = (authManager as any).parsePrivateKey(keyPair.privateKey);
      
      expect(result.algorithm).toBe('rsa-sha2-256');
      expect(result.publicKey).toBeInstanceOf(Buffer);
    });

    test('should handle GitLab SSH key (Ed25519)', () => {
      // GitLab recommends Ed25519 keys
      const keyPair = generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      const config: SSHConfig = {
        host: 'gitlab.com',
        port: 22,
        username: 'git',
        privateKey: keyPair.privateKey
      };

      const authManager = new AuthManager(mockTransport, config);
      const result = (authManager as any).parsePrivateKey(keyPair.privateKey);
      
      expect(result.algorithm).toBe('ssh-ed25519');
      expect(result.publicKey).toBeInstanceOf(Buffer);
    });

    test('should handle AWS EC2 SSH key (RSA 2048)', () => {
      // AWS EC2 instances typically use RSA 2048-bit keys
      const keyPair = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs1', format: 'pem' } // Traditional format
      });

      const config: SSHConfig = {
        host: 'ec2-instance.amazonaws.com',
        port: 22,
        username: 'ec2-user',
        privateKey: keyPair.privateKey
      };

      const authManager = new AuthManager(mockTransport, config);
      const result = (authManager as any).parsePrivateKey(keyPair.privateKey);
      
      expect(result.algorithm).toBe('rsa-sha2-256');
      expect(result.publicKey).toBeInstanceOf(Buffer);
    });

    test('should handle high-security environment (ECDSA P-384)', () => {
      // High-security environments often use ECDSA P-384
      const keyPair = generateKeyPairSync('ec', {
        namedCurve: 'secp384r1',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      const config: SSHConfig = {
        host: 'secure-server.gov',
        port: 22,
        username: 'admin',
        privateKey: keyPair.privateKey
      };

      const authManager = new AuthManager(mockTransport, config);
      const result = (authManager as any).parsePrivateKey(keyPair.privateKey);
      
      expect(result.algorithm).toBe('ecdsa-sha2-nistp384');
      expect(result.publicKey).toBeInstanceOf(Buffer);
    });

    test('should handle corporate environment with passphrase policy', () => {
      // Corporate environments often require passphrase-protected keys
      const passphrase = 'CorporatePolicy2024!';
      
      const keyPair = generateKeyPairSync('rsa', {
        modulusLength: 3072, // Corporate security often requires larger keys
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { 
          type: 'pkcs8', 
          format: 'pem',
          cipher: 'aes-256-cbc',
          passphrase: passphrase
        }
      });

      const config: SSHConfig = {
        host: 'corporate-server.company.com',
        port: 22,
        username: 'employee',
        privateKey: keyPair.privateKey,
        passphrase: passphrase
      };

      const authManager = new AuthManager(mockTransport, config);
      const result = (authManager as any).parsePrivateKey(keyPair.privateKey, passphrase);
      
      expect(result.algorithm).toBe('rsa-sha2-256');
      expect(result.publicKey).toBeInstanceOf(Buffer);
    });
  });

  describe('Legacy System Compatibility', () => {
    test('should handle older OpenSSH format (Traditional RSA)', () => {
      // Some older systems still use traditional RSA format
      const keyPair = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
      });

      // Verify it's traditional format
      expect(keyPair.privateKey).toContain('-----BEGIN RSA PRIVATE KEY-----');

      const config: SSHConfig = {
        host: 'legacy-server.old',
        port: 22,
        username: 'legacy-user',
        privateKey: keyPair.privateKey
      };

      const authManager = new AuthManager(mockTransport, config);
      const result = (authManager as any).parsePrivateKey(keyPair.privateKey);
      
      expect(result.algorithm).toBe('rsa-sha2-256');
      expect(result.publicKey).toBeInstanceOf(Buffer);
    });

    test('should handle minimum viable RSA key (2048-bit)', () => {
      // 2048-bit is the minimum recommended size for RSA
      const keyPair = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      const config: SSHConfig = {
        host: 'standard-server.com',
        port: 22,
        username: 'user',
        privateKey: keyPair.privateKey
      };

      const authManager = new AuthManager(mockTransport, config);
      const result = (authManager as any).parsePrivateKey(keyPair.privateKey);
      
      expect(result.algorithm).toBe('rsa-sha2-256');
      expect(result.publicKey).toBeInstanceOf(Buffer);
    });
  });

  describe('Performance and Security Trade-offs', () => {
    test('should handle performance-optimized key (Ed25519)', () => {
      // Ed25519 offers best performance for signing/verification
      const keyPair = generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      const config: SSHConfig = {
        host: 'performance-server.com',
        port: 22,
        username: 'speeduser',
        privateKey: keyPair.privateKey
      };

      const authManager = new AuthManager(mockTransport, config);
      
      // Test signing performance (should be fast)
      const start = Date.now();
      const testData = Buffer.from('performance test data');
      const signature = (authManager as any).signData(testData, 'ssh-ed25519');
      const duration = Date.now() - start;
      
      expect(signature).toBeInstanceOf(Buffer);
      expect(signature.length).toBe(64); // Ed25519 signatures are always 64 bytes
      expect(duration).toBeLessThan(100); // Should be very fast
    });

    test('should handle maximum security key (RSA 4096)', () => {
      // RSA 4096-bit for maximum security (slower but more secure)
      const keyPair = generateKeyPairSync('rsa', {
        modulusLength: 4096,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      const config: SSHConfig = {
        host: 'max-security-server.mil',
        port: 22,
        username: 'secureuser',
        privateKey: keyPair.privateKey
      };

      const authManager = new AuthManager(mockTransport, config);
      const result = (authManager as any).parsePrivateKey(keyPair.privateKey);
      
      expect(result.algorithm).toBe('rsa-sha2-512'); // 4096-bit RSA should use SHA-512
      expect(result.publicKey).toBeInstanceOf(Buffer);
      expect(result.publicKey.length).toBeGreaterThan(500); // Larger key = larger public key blob
    });

    test('should handle balanced security/performance (ECDSA P-256)', () => {
      // ECDSA P-256 offers good balance of security and performance
      const keyPair = generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      const config: SSHConfig = {
        host: 'balanced-server.net',
        port: 22,
        username: 'balanceduser',
        privateKey: keyPair.privateKey
      };

      const authManager = new AuthManager(mockTransport, config);
      const result = (authManager as any).parsePrivateKey(keyPair.privateKey);
      
      expect(result.algorithm).toBe('ecdsa-sha2-nistp256');
      expect(result.publicKey).toBeInstanceOf(Buffer);
      
      // Test that signature is reasonable size
      const testData = Buffer.from('balance test data');
      const signature = (authManager as any).signData(testData, 'ecdsa-sha2-nistp256');
      expect(signature).toBeInstanceOf(Buffer);
      expect(signature.length).toBeGreaterThan(0);
      expect(signature.length).toBeLessThan(200); // ECDSA signatures are compact
    });
  });

  describe('Error Scenarios Users Encounter', () => {
    test('should provide helpful error for missing passphrase', () => {
      const passphrase = 'secret123';
      
      const keyPair = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { 
          type: 'pkcs8', 
          format: 'pem',
          cipher: 'aes-256-cbc',
          passphrase: passphrase
        }
      });

      const config: SSHConfig = {
        host: 'server.com',
        port: 22,
        username: 'user',
        privateKey: keyPair.privateKey
        // No passphrase provided
      };

      const authManager = new AuthManager(mockTransport, config);
      
      expect(() => {
        (authManager as any).parsePrivateKey(keyPair.privateKey);
      }).toThrow('Private key is encrypted but no passphrase provided');
    });

    test('should provide helpful error for wrong passphrase', () => {
      const correctPassphrase = 'correct123';
      const wrongPassphrase = 'wrong456';
      
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
        host: 'server.com',
        port: 22,
        username: 'user',
        privateKey: keyPair.privateKey,
        passphrase: wrongPassphrase
      };

      const authManager = new AuthManager(mockTransport, config);
      
      expect(() => {
        (authManager as any).parsePrivateKey(keyPair.privateKey, wrongPassphrase);
      }).toThrow('Failed to parse private key');
    });

    test('should handle corrupted key data gracefully', () => {
      const corruptedKey = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDC7XyVjXXXXXXX
CORRUPTED_DATA_HERE_THAT_IS_NOT_VALID_BASE64_ENCODING_AT_ALL
-----END PRIVATE KEY-----`;

      const config: SSHConfig = {
        host: 'server.com',
        port: 22,
        username: 'user',
        privateKey: corruptedKey
      };

      const authManager = new AuthManager(mockTransport, config);
      
      expect(() => {
        (authManager as any).parsePrivateKey(corruptedKey);
      }).toThrow('Failed to parse private key');
    });
  });
});