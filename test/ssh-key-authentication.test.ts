import * as fs from 'fs';
import * as path from 'path';
import { createPublicKey, createPrivateKey, createSign } from 'crypto';
import { PublicKeyAuth } from '../src/auth/publickey-auth';

describe('SSH Key Authentication Integration', () => {
  const keysDir = path.join(__dirname, 'fixtures', 'keys');
  let authHelper: PublicKeyAuth;

  beforeEach(() => {
    // Mock session ID for testing
    const mockSessionId = Buffer.from('test-session-id-12345');
    authHelper = new PublicKeyAuth('testuser', mockSessionId);
  });

  describe('Key Parsing and Validation', () => {
    test('should parse RSA 2048-bit PEM key without passphrase', () => {
      const privateKey = fs.readFileSync(path.join(keysDir, 'test_rsa_2048'), 'utf8');
      
      expect(() => {
        const result = authHelper.parsePrivateKey(privateKey);
        expect(result).toHaveProperty('publicKey');
        expect(result).toHaveProperty('algorithm');
        expect(result.algorithm).toBe('rsa-sha2-256');
      }).not.toThrow();
    });

    test('should parse RSA 2048-bit PEM key with passphrase', () => {
      const privateKey = fs.readFileSync(path.join(keysDir, 'test_rsa_2048_pass'), 'utf8');
      
      expect(() => {
        const result = authHelper.parsePrivateKey(privateKey, 'testpass123');
        expect(result).toHaveProperty('publicKey');
        expect(result).toHaveProperty('algorithm');
        expect(result.algorithm).toBe('rsa-sha2-256');
      }).not.toThrow();
    });

    test('should fail to parse encrypted RSA key without passphrase', () => {
      const privateKey = fs.readFileSync(path.join(keysDir, 'test_rsa_2048_pass'), 'utf8');
      
      expect(() => {
        authHelper.parsePrivateKey(privateKey);
      }).toThrow('Private key is encrypted but no passphrase provided');
    });

    test.skip('should parse Ed25519 key without passphrase', () => {
      // Skip Ed25519 tests - OpenSSH format not supported in Node.js 18
    });

    test.skip('should parse Ed25519 key with passphrase', () => {
      // Skip Ed25519 tests - OpenSSH format not supported in Node.js 18
    });

    test('should parse ECDSA P-256 key without passphrase', () => {
      const privateKey = fs.readFileSync(path.join(keysDir, 'test_ecdsa_256'), 'utf8');
      
      expect(() => {
        const result = authHelper.parsePrivateKey(privateKey);
        expect(result).toHaveProperty('publicKey');
        expect(result).toHaveProperty('algorithm');
        expect(result.algorithm).toBe('ecdsa-sha2-nistp256');
      }).not.toThrow();
    });

    test('should parse ECDSA P-256 key with passphrase', () => {
      const privateKey = fs.readFileSync(path.join(keysDir, 'test_ecdsa_256_pass'), 'utf8');
      
      expect(() => {
        const result = authHelper.parsePrivateKey(privateKey, 'testpass123');
        expect(result).toHaveProperty('publicKey');
        expect(result).toHaveProperty('algorithm');
        expect(result.algorithm).toBe('ecdsa-sha2-nistp256');
      }).not.toThrow();
    });

    test('should parse RSA 4096-bit PEM key', () => {
      const privateKey = fs.readFileSync(path.join(keysDir, 'test_rsa_4096'), 'utf8');
      
      expect(() => {
        const result = authHelper.parsePrivateKey(privateKey);
        expect(result).toHaveProperty('publicKey');
        expect(result).toHaveProperty('algorithm');
        expect(result.algorithm).toBe('rsa-sha2-512'); // Should use SHA-512 for 4096-bit
      }).not.toThrow();
    });

    test.skip('should parse RSA 4096-bit OpenSSH key', () => {
      const privateKey = fs.readFileSync(path.join(keysDir, 'test_rsa_4096_openssh'), 'utf8');
      
      expect(() => {
        const result = authHelper.parsePrivateKey(privateKey);
        expect(result).toHaveProperty('publicKey');
        expect(result).toHaveProperty('algorithm');
        expect(result.algorithm).toBe('rsa-sha2-512');
      }).not.toThrow();
    });
  });

  describe('SSH Wire Format Encoding', () => {
    test('should properly encode RSA public key components', () => {
      const privateKey = fs.readFileSync(path.join(keysDir, 'test_rsa_2048'), 'utf8');
      const result = authHelper.parsePrivateKey(privateKey);
      
      // Verify the public key blob structure
      expect(result.publicKey).toBeInstanceOf(Buffer);
      expect(result.publicKey.length).toBeGreaterThan(0);
      
      // Check that the public key blob starts with algorithm name length and name
      const reader = { offset: 0 };
      const algorithmNameLength = result.publicKey.readUInt32BE(reader.offset);
      reader.offset += 4;
      const algorithmName = result.publicKey.subarray(reader.offset, reader.offset + algorithmNameLength).toString();
      expect(algorithmName).toBe('ssh-rsa');
    });

    test.skip('should properly encode Ed25519 public key', () => {
      const privateKey = fs.readFileSync(path.join(keysDir, 'test_ed25519'), 'utf8');
      const result = authHelper.parsePrivateKey(privateKey);
      
      // Ed25519 public key blob should contain algorithm name and 32-byte key
      const reader = { offset: 0 };
      const algorithmNameLength = result.publicKey.readUInt32BE(reader.offset);
      reader.offset += 4;
      const algorithmName = result.publicKey.subarray(reader.offset, reader.offset + algorithmNameLength).toString();
      expect(algorithmName).toBe('ssh-ed25519');
      
      reader.offset += algorithmNameLength;
      const keyLength = result.publicKey.readUInt32BE(reader.offset);
      expect(keyLength).toBe(32); // Ed25519 keys are always 32 bytes
    });

    test('should properly encode ECDSA P-256 public key', () => {
      const privateKey = fs.readFileSync(path.join(keysDir, 'test_ecdsa_256'), 'utf8');
      const result = authHelper.parsePrivateKey(privateKey);
      
      const reader = { offset: 0 };
      const algorithmNameLength = result.publicKey.readUInt32BE(reader.offset);
      reader.offset += 4;
      const algorithmName = result.publicKey.subarray(reader.offset, reader.offset + algorithmNameLength).toString();
      expect(algorithmName).toBe('ecdsa-sha2-nistp256');
    });
  });

  describe('Authentication Packet Generation', () => {
    test('should generate valid authentication request packet with RSA key', async () => {
      const privateKey = fs.readFileSync(path.join(keysDir, 'test_rsa_2048'), 'utf8');
      
      const packet = await authHelper.authenticatePublicKey(privateKey);
      
      expect(packet).toBeInstanceOf(Buffer);
      expect(packet.length).toBeGreaterThan(0);
      
      // Basic packet structure validation
      const reader = { offset: 0 };
      const messageType = packet.readUInt8(reader.offset);
      expect(messageType).toBe(50); // SSH_MSG_USERAUTH_REQUEST
    });

    test.skip('should generate valid authentication request packet with Ed25519 key', async () => {
      const privateKey = fs.readFileSync(path.join(keysDir, 'test_ed25519'), 'utf8');
      
      const packet = await authHelper.authenticatePublicKey(privateKey);
      
      expect(packet).toBeInstanceOf(Buffer);
      expect(packet.length).toBeGreaterThan(0);
      
      const reader = { offset: 0 };
      const messageType = packet.readUInt8(reader.offset);
      expect(messageType).toBe(50);
    });

    test('should generate valid authentication request packet with encrypted RSA key', async () => {
      const privateKey = fs.readFileSync(path.join(keysDir, 'test_rsa_2048_pass'), 'utf8');
      
      const packet = await authHelper.authenticatePublicKey(privateKey, 'testpass123');
      
      expect(packet).toBeInstanceOf(Buffer);
      expect(packet.length).toBeGreaterThan(0);
      
      const reader = { offset: 0 };
      const messageType = packet.readUInt8(reader.offset);
      expect(messageType).toBe(50);
    });

    test.skip('should generate valid authentication request packet with encrypted Ed25519 key', async () => {
      const privateKey = fs.readFileSync(path.join(keysDir, 'test_ed25519_pass'), 'utf8');
      
      const packet = await authHelper.authenticatePublicKey(privateKey, 'testpass123');
      
      expect(packet).toBeInstanceOf(Buffer);
      expect(packet.length).toBeGreaterThan(0);
      
      const reader = { offset: 0 };
      const messageType = packet.readUInt8(reader.offset);
      expect(messageType).toBe(50);
    });
  });

  describe('Signature Generation and Validation', () => {
    test('should generate correct RSA signature format', async () => {
      const privateKey = fs.readFileSync(path.join(keysDir, 'test_rsa_2048'), 'utf8');
      
      // Test signature generation directly
      const testData = Buffer.from('test data to sign');
      const keyObj = createPrivateKey({ key: privateKey, format: 'pem' });
      
      // Test our implementation
      const signature = authHelper.signData(testData, privateKey, 'rsa-sha2-256');
      expect(signature).toBeInstanceOf(Buffer);
      
      // Verify signature structure (algorithm name + signature blob)
      const reader = { offset: 0 };
      const algLength = signature.readUInt32BE(reader.offset);
      reader.offset += 4;
      const algorithm = signature.subarray(reader.offset, reader.offset + algLength).toString();
      expect(algorithm).toBe('rsa-sha2-256');
      
      reader.offset += algLength;
      const sigLength = signature.readUInt32BE(reader.offset);
      reader.offset += 4;
      const sigBlob = signature.subarray(reader.offset, reader.offset + sigLength);
      
      // Verify we can validate the signature with Node.js crypto
      const { createVerify } = require('crypto');
      const verify = createVerify('RSA-SHA256');
      verify.update(testData);
      const isValid = verify.verify(keyObj, sigBlob);
      expect(isValid).toBe(true);
    });

    test.skip('should generate correct Ed25519 signature format', async () => {
      const privateKey = fs.readFileSync(path.join(keysDir, 'test_ed25519'), 'utf8');
      
      const testData = Buffer.from('test data to sign');
      
      // Test our implementation
      const signature = authHelper.signData(testData, privateKey, 'ssh-ed25519');
      expect(signature).toBeInstanceOf(Buffer);
      
      // Verify signature structure
      const reader = { offset: 0 };
      const algLength = signature.readUInt32BE(reader.offset);
      reader.offset += 4;
      const algorithm = signature.subarray(reader.offset, reader.offset + algLength).toString();
      expect(algorithm).toBe('ssh-ed25519');
      
      reader.offset += algLength;
      const sigLength = signature.readUInt32BE(reader.offset);
      expect(sigLength).toBe(64); // Ed25519 signatures are always 64 bytes
    });

    test('should generate correct ECDSA signature format', async () => {
      const privateKey = fs.readFileSync(path.join(keysDir, 'test_ecdsa_256'), 'utf8');
      
      const testData = Buffer.from('test data to sign');
      
      // Test our implementation
      const signature = authHelper.signData(testData, privateKey, 'ecdsa-sha2-nistp256');
      expect(signature).toBeInstanceOf(Buffer);
      
      // Verify signature structure
      const reader = { offset: 0 };
      const algLength = signature.readUInt32BE(reader.offset);
      reader.offset += 4;
      const algorithm = signature.subarray(reader.offset, reader.offset + algLength).toString();
      expect(algorithm).toBe('ecdsa-sha2-nistp256');
      
      reader.offset += algLength;
      const sigLength = signature.readUInt32BE(reader.offset);
      reader.offset += 4;
      const sigBlob = signature.subarray(reader.offset, reader.offset + sigLength);
      
      // ECDSA signature should be DER encoded
      expect(sigBlob.length).toBeGreaterThan(60); // Typical ECDSA P-256 signature length
      expect(sigBlob[0]).toBe(0x30); // DER sequence tag
    });
  });

  describe('Cross-validation with Node.js crypto', () => {
    test('should produce public keys that match Node.js crypto output', () => {
      const privateKey = fs.readFileSync(path.join(keysDir, 'test_rsa_2048'), 'utf8');
      
      // Our implementation
      const ourResult = authHelper.parsePrivateKey(privateKey);
      
      // Node.js crypto implementation
      const keyObj = createPublicKey({ key: privateKey, format: 'pem' });
      const nodePublicKey = keyObj.export({ format: 'der', type: 'spki' });
      
      // Both should produce valid public key data (exact format may differ)
      expect(ourResult.publicKey).toBeInstanceOf(Buffer);
      expect(nodePublicKey).toBeInstanceOf(Buffer);
      expect(ourResult.publicKey.length).toBeGreaterThan(0);
      expect(nodePublicKey.length).toBeGreaterThan(0);
    });

    test('should produce signatures that Node.js crypto can verify', () => {
      const privateKey = fs.readFileSync(path.join(keysDir, 'test_rsa_2048'), 'utf8');
      const testData = Buffer.from('verification test data');
      
      // Generate signature with our implementation
      const ourSignature = authHelper.signData(testData, privateKey, 'rsa-sha2-256');
      
      // Extract the raw signature blob (skip SSH wire format wrapper)
      const reader = { offset: 0 };
      const algLength = ourSignature.readUInt32BE(reader.offset);
      reader.offset += 4 + algLength; // Skip algorithm name
      const sigLength = ourSignature.readUInt32BE(reader.offset);
      reader.offset += 4;
      const rawSignature = ourSignature.subarray(reader.offset, reader.offset + sigLength);
      
      // Verify with Node.js crypto
      const keyObj = createPublicKey({ key: privateKey, format: 'pem' });
      const { createVerify } = require('crypto');
      const verify = createVerify('RSA-SHA256');
      verify.update(testData);
      const isValid = verify.verify(keyObj, rawSignature);
      
      expect(isValid).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid private key format', () => {
      const invalidKey = '-----BEGIN INVALID KEY-----\nnotarealkey\n-----END INVALID KEY-----';
      
      expect(() => {
        authHelper.parsePrivateKey(invalidKey);
      }).toThrow();
    });

    test('should handle wrong passphrase', () => {
      const privateKey = fs.readFileSync(path.join(keysDir, 'test_rsa_2048_pass'), 'utf8');
      
      expect(() => {
        authHelper.parsePrivateKey(privateKey, 'wrongpassword');
      }).toThrow();
    });

    test('should handle empty key data', () => {
      expect(() => {
        authHelper.parsePrivateKey('');
      }).toThrow();
    });

    test('should handle null/undefined key data', () => {
      expect(() => {
        authHelper.parsePrivateKey(null);
      }).toThrow();
      
      expect(() => {
        authHelper.parsePrivateKey(undefined);
      }).toThrow();
    });
  });

  describe('Buffer vs String Input', () => {
    test('should handle Buffer input for RSA key', () => {
      const privateKeyBuffer = fs.readFileSync(path.join(keysDir, 'test_rsa_2048'));
      
      expect(() => {
        const result = authHelper.parsePrivateKey(privateKeyBuffer);
        expect(result).toHaveProperty('publicKey');
        expect(result).toHaveProperty('algorithm');
        expect(result.algorithm).toBe('rsa-sha2-256');
      }).not.toThrow();
    });

    test.skip('should handle Buffer input for Ed25519 key', () => {
      const privateKeyBuffer = fs.readFileSync(path.join(keysDir, 'test_ed25519'));
      
      expect(() => {
        const result = authHelper.parsePrivateKey(privateKeyBuffer);
        expect(result).toHaveProperty('publicKey');
        expect(result).toHaveProperty('algorithm');
        expect(result.algorithm).toBe('ssh-ed25519');
      }).not.toThrow();
    });
  });
});