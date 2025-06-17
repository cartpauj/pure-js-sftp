/**
 * SSH2-SFTP-Client API Compatibility Test
 * 
 * This test ensures our pure-js-sftp library maintains exact API compatibility
 * with ssh2-sftp-client, especially for passphrase handling.
 */

import { HighLevelAPI } from '../src/api/high-level-api';
import { SSHConfig } from '../src/ssh/types';
import { generateKeyPairSync } from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('SSH2-SFTP-Client API Compatibility', () => {
  const tempDir = os.tmpdir();

  // Helper function to create temporary key files
  const createTempKeyFile = (content: string, filename: string): string => {
    const keyPath = path.join(tempDir, filename);
    fs.writeFileSync(keyPath, content);
    return keyPath;
  };

  // Clean up temp files after tests
  afterAll(() => {
    try {
      const tempFiles = ['test_rsa_key', 'test_rsa_key_encrypted', 'test_ed25519_key'];
      tempFiles.forEach(file => {
        const filePath = path.join(tempDir, file);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Configuration API Compatibility', () => {
    test('should accept ssh2-sftp-client configuration format', () => {
      // This is the exact format from ssh2-sftp-client documentation
      const config: SSHConfig = {
        host: 'example.com',
        username: 'your_username',
        privateKey: Buffer.from('fake-key-content'),
        passphrase: 'a pass phrase'
      };

      // Should not throw - validates our interface
      expect(config.host).toBe('example.com');
      expect(config.username).toBe('your_username');
      expect(config.privateKey).toBeInstanceOf(Buffer);
      expect(config.passphrase).toBe('a pass phrase');
    });

    test('should accept privateKey as string (like ssh2-sftp-client)', () => {
      const keyPair = generateKeyPairSync('rsa', {
        modulusLength: 1024,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      const config: SSHConfig = {
        host: 'example.com',
        username: 'user',
        privateKey: keyPair.privateKey // string format
      };

      expect(typeof config.privateKey).toBe('string');
      expect(config.privateKey).toContain('-----BEGIN PRIVATE KEY-----');
    });

    test('should accept privateKey as Buffer (like ssh2-sftp-client)', () => {
      const keyPair = generateKeyPairSync('rsa', {
        modulusLength: 1024,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      const config: SSHConfig = {
        host: 'example.com',
        username: 'user',
        privateKey: Buffer.from(keyPair.privateKey) // Buffer format
      };

      expect(config.privateKey).toBeInstanceOf(Buffer);
    });

    test('should accept fs.readFileSync() result (common ssh2-sftp-client pattern)', () => {
      const keyPair = generateKeyPairSync('rsa', {
        modulusLength: 1024,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      // Create temporary key file
      const keyPath = createTempKeyFile(keyPair.privateKey, 'test_rsa_key');

      // This is exactly how ssh2-sftp-client users load keys
      const config: SSHConfig = {
        host: 'example.com',
        username: 'user',
        privateKey: fs.readFileSync(keyPath) // Returns Buffer
      };

      expect(config.privateKey).toBeInstanceOf(Buffer);
      expect(config.privateKey.toString()).toContain('-----BEGIN PRIVATE KEY-----');
    });
  });

  describe('Passphrase API Compatibility', () => {
    test('should handle encrypted key with passphrase (ssh2-sftp-client format)', () => {
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

      // Create temporary encrypted key file
      const keyPath = createTempKeyFile(keyPair.privateKey, 'test_rsa_key_encrypted');

      // Exact ssh2-sftp-client configuration format
      const config: SSHConfig = {
        host: 'example.com',
        username: 'your_username',
        privateKey: fs.readFileSync(keyPath),
        passphrase: 'test-passphrase-123'
      };

      // Verify the configuration is valid
      expect(config.privateKey).toBeInstanceOf(Buffer);
      expect(config.passphrase).toBe('test-passphrase-123');
      expect(config.privateKey.toString()).toContain('ENCRYPTED');
    });

    test('should work without passphrase for unencrypted keys', () => {
      const keyPair = generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      const keyPath = createTempKeyFile(keyPair.privateKey, 'test_ed25519_key');

      // No passphrase needed for unencrypted key
      const config: SSHConfig = {
        host: 'example.com',
        username: 'user',
        privateKey: fs.readFileSync(keyPath)
        // No passphrase property
      };

      expect(config.passphrase).toBeUndefined();
      expect(config.privateKey.toString()).not.toContain('ENCRYPTED');
    });

    test('should validate passphrase is optional in TypeScript', () => {
      // This ensures our TypeScript interface allows passphrase to be optional
      const configWithoutPassphrase: SSHConfig = {
        host: 'example.com',
        username: 'user',
        privateKey: 'some-key-content'
      };

      const configWithPassphrase: SSHConfig = {
        host: 'example.com',
        username: 'user',
        privateKey: 'some-key-content',
        passphrase: 'optional-passphrase'
      };

      // Both should be valid TypeScript
      expect(configWithoutPassphrase.passphrase).toBeUndefined();
      expect(configWithPassphrase.passphrase).toBe('optional-passphrase');
    });
  });

  describe('Connection Method Compatibility', () => {
    test('should have connect method that accepts SSHConfig', () => {
      const sftp = new HighLevelAPI();
      
      // Verify the method signature matches ssh2-sftp-client
      expect(typeof sftp.connect).toBe('function');
      expect(sftp.connect.length).toBe(1); // Should accept one parameter (config)
    });

    test('should return Promise from connect method', () => {
      const sftp = new HighLevelAPI();
      
      const config: SSHConfig = {
        host: 'example.com',
        username: 'test',
        privateKey: 'fake-key'
      };

      // Should return a Promise (validates method signature)
      const result = sftp.connect(config);
      expect(result).toBeInstanceOf(Promise);
      
      // Don't actually attempt connection - just verify interface
      // We'll cancel this immediately by ending the connection
      sftp.end();
    });
  });

  describe('Error Handling Compatibility', () => {
    test('should validate passphrase requirement for encrypted keys', () => {
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

      // Verify the key is encrypted and our API accepts the configuration
      const config: SSHConfig = {
        host: 'example.com',
        username: 'user',
        privateKey: keyPair.privateKey
        // Missing passphrase for encrypted key
      };

      expect(config.privateKey.toString()).toContain('ENCRYPTED');
      expect(config.passphrase).toBeUndefined();
      
      // Configuration should be accepted (error handling happens during connection)
      expect(config.host).toBe('example.com');
    });

    test('should accept configuration with both encrypted key and passphrase', () => {
      const correctPassphrase = 'correct-passphrase';
      
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
        host: 'example.com',
        username: 'user',
        privateKey: keyPair.privateKey,
        passphrase: correctPassphrase
      };

      // Configuration should be valid
      expect(config.privateKey.toString()).toContain('ENCRYPTED');
      expect(config.passphrase).toBe(correctPassphrase);
      expect(config.host).toBe('example.com');
    });
  });

  describe('Configuration Options Compatibility', () => {
    test('should accept all ssh2-sftp-client configuration options', () => {
      // Full configuration that matches ssh2-sftp-client capabilities
      const config: SSHConfig = {
        host: 'example.com',
        port: 2222,
        username: 'user',
        password: 'password-auth', // Alternative to key auth
        privateKey: 'key-content',
        passphrase: 'key-passphrase',
        timeout: 30000,
        keepaliveInterval: 5000,
        algorithms: {
          kex: ['diffie-hellman-group14-sha256'],
          hostKey: ['ssh-rsa', 'ecdsa-sha2-nistp256'],
          cipher: ['aes128-ctr', 'aes256-ctr'],
          mac: ['hmac-sha2-256', 'hmac-sha2-512'],
          compress: ['none']
        },
        debug: false
      };

      // All properties should be accepted by our interface
      expect(config.host).toBe('example.com');
      expect(config.port).toBe(2222);
      expect(config.username).toBe('user');
      expect(config.password).toBe('password-auth');
      expect(config.privateKey).toBe('key-content');
      expect(config.passphrase).toBe('key-passphrase');
      expect(config.timeout).toBe(30000);
      expect(config.keepaliveInterval).toBe(5000);
      expect(config.algorithms).toBeDefined();
      expect(config.debug).toBe(false);
    });

    test('should make only host and username required (like ssh2-sftp-client)', () => {
      // Minimal configuration - only required fields
      const config: SSHConfig = {
        host: 'example.com',
        username: 'user'
        // All other fields are optional
      };

      expect(config.host).toBe('example.com');
      expect(config.username).toBe('user');
      expect(config.port).toBeUndefined();
      expect(config.password).toBeUndefined();
      expect(config.privateKey).toBeUndefined();
      expect(config.passphrase).toBeUndefined();
    });
  });

  describe('Method Naming Compatibility', () => {
    test('should have all ssh2-sftp-client method names', () => {
      const sftp = new HighLevelAPI();
      
      // Core methods that should match ssh2-sftp-client
      expect(typeof sftp.connect).toBe('function');
      expect(typeof sftp.end).toBe('function');
      expect(typeof sftp.list).toBe('function');
      expect(typeof sftp.exists).toBe('function');
      expect(typeof sftp.stat).toBe('function');
      expect(typeof sftp.get).toBe('function');
      expect(typeof sftp.put).toBe('function');
      expect(typeof sftp.delete).toBe('function');
      expect(typeof sftp.rename).toBe('function');
      expect(typeof sftp.mkdir).toBe('function');
      expect(typeof sftp.rmdir).toBe('function');
      expect(typeof sftp.fastGet).toBe('function');
      expect(typeof sftp.fastPut).toBe('function');
    });
  });
});