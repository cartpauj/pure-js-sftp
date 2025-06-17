/**
 * Public Key Authentication Tests
 * 
 * This test suite validates the public key authentication implementation
 */

import { AuthManager } from '../src/auth/auth-manager';
import { SSHTransport } from '../src/ssh/transport';
import { SSHConfig } from '../src/ssh/types';
import { generateKeyPairSync } from 'crypto';

describe('Public Key Authentication', () => {
  let authManager: AuthManager;
  let mockTransport: jest.Mocked<SSHTransport>;
  let config: SSHConfig;
  let privateKey: string;
  let publicKey: string;

  beforeEach(() => {
    // Generate a test key pair
    const keyPair = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });

    privateKey = keyPair.privateKey;
    publicKey = keyPair.publicKey;

    // Mock transport
    mockTransport = {
      getSessionId: jest.fn(),
      sendPacket: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      emit: jest.fn(),
      removeAllListeners: jest.fn()
    } as any;

    config = {
      host: 'test.example.com',
      port: 22,
      username: 'testuser',
      privateKey: privateKey
    };

    authManager = new AuthManager(mockTransport, config);
  });

  test('should have proper crypto imports', () => {
    // Verify that the crypto module imports are working
    const crypto = require('crypto');
    expect(crypto.createSign).toBeDefined();
    expect(crypto.createPublicKey).toBeDefined();
    expect(crypto.constants).toBeDefined();
  });

  test('should parse RSA private key correctly', () => {
    // Test that parsePrivateKey method can handle RSA keys
    // This is tested indirectly through the authenticatePublicKey method
    mockTransport.getSessionId.mockReturnValue(Buffer.from('test-session-id'));
    
    // Mock the transport to trigger the public key flow
    const authSpy = jest.spyOn(authManager as any, 'authenticatePublicKey');
    
    expect(() => {
      (authManager as any).authenticatePublicKey();
    }).not.toThrow();
    
    expect(mockTransport.sendPacket).toHaveBeenCalled();
  });

  test('should create signature blob correctly', () => {
    // Test the signature creation
    const testData = Buffer.from('test data to sign');
    const algorithm = 'ssh-rsa';
    mockTransport.getSessionId.mockReturnValue(Buffer.from('test-session-id'));
    
    const signature = (authManager as any).signData(testData, algorithm);
    
    expect(signature).toBeInstanceOf(Buffer);
    expect(signature.length).toBeGreaterThan(0);
  });

  test('should handle missing session ID gracefully', () => {
    mockTransport.getSessionId.mockReturnValue(null);
    
    expect(() => {
      (authManager as any).sendPublicKeySignature(Buffer.from('test-key'), 'ssh-rsa');
    }).toThrow('Session ID not available');
  });

  test('should handle missing private key gracefully', () => {
    const configWithoutKey = {
      ...config,
      privateKey: undefined
    };
    
    const authManagerWithoutKey = new AuthManager(mockTransport, configWithoutKey);
    
    expect(() => {
      (authManagerWithoutKey as any).authenticatePublicKey();
    }).toThrow('Private key not provided');
  });

  test('should support different key algorithms', () => {
    mockTransport.getSessionId.mockReturnValue(Buffer.from('test-session-id'));
    
    const testData = Buffer.from('test data');
    
    // Test RSA
    const rsaSignature = (authManager as any).signData(testData, 'ssh-rsa');
    expect(rsaSignature).toBeInstanceOf(Buffer);
    expect(rsaSignature.length).toBeGreaterThan(0);
    
    // Test that other algorithms are recognized but fail due to key type mismatch
    expect(() => {
      (authManager as any).signData(testData, 'ecdsa-sha2-nistp256');
    }).toThrow('Key type rsa does not match algorithm ecdsa-sha2-nistp256');
    
    expect(() => {
      (authManager as any).signData(testData, 'ssh-ed25519');  
    }).toThrow('Key type rsa does not match algorithm ssh-ed25519');
  });

  test('should build SSH signature blob correctly', () => {
    mockTransport.getSessionId.mockReturnValue(Buffer.from('test-session-id'));
    
    const publicKeyBuffer = Buffer.from('test-public-key');
    const algorithm = 'ssh-rsa';
    
    // This tests the full signature blob creation process
    const sendSpy = jest.spyOn(mockTransport, 'sendPacket');
    
    (authManager as any).sendPublicKeySignature(publicKeyBuffer, algorithm);
    
    expect(sendSpy).toHaveBeenCalled();
    
    // Verify the packet structure
    const [messageType, payload] = sendSpy.mock.calls[0];
    expect(messageType).toBe(50); // SSH_MSG.USERAUTH_REQUEST
    expect(payload).toBeInstanceOf(Buffer);
    expect(payload.length).toBeGreaterThan(0);
  });

  test('should emit authentication events correctly', (done) => {
    // Test error emission for invalid key
    const invalidConfig = {
      ...config,
      privateKey: 'invalid-key-data'
    };
    
    const invalidAuthManager = new AuthManager(mockTransport, invalidConfig);
    
    // Listen for the error event
    invalidAuthManager.on('error', (error) => {
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('Public key authentication failed');
      done();
    });
    
    // This should emit an error event
    (invalidAuthManager as any).authenticatePublicKey();
  });

  test('should properly format SSH public key', () => {
    // Test the public key formatting for SSH
    const testKeyPair = generateKeyPairSync('rsa', {
      modulusLength: 1024, // Smaller for faster test
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });
    
    const testConfig = {
      ...config,
      privateKey: testKeyPair.privateKey
    };
    
    const testAuthManager = new AuthManager(mockTransport, testConfig);
    
    mockTransport.getSessionId.mockReturnValue(Buffer.from('session-id'));
    
    expect(() => {
      (testAuthManager as any).authenticatePublicKey();
    }).not.toThrow();
  });
});