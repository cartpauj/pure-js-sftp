/**
 * Diffie-Hellman Key Exchange tests
 */

import { DiffieHellmanKex } from '../src/kex/diffie-hellman';
import { CryptoUtils } from '../src/crypto/utils';

describe('DiffieHellmanKex', () => {
  describe('constructor', () => {
    test('should create instance with valid algorithm', () => {
      const kex = new DiffieHellmanKex('diffie-hellman-group14-sha256');
      expect(kex).toBeInstanceOf(DiffieHellmanKex);
      expect(kex.getAlgorithm()).toBe('diffie-hellman-group14-sha256');
    });

    test('should throw error for unsupported algorithm', () => {
      expect(() => {
        new DiffieHellmanKex('unsupported-algorithm');
      }).toThrow('Unsupported KEX algorithm');
    });

    test('should support group16-sha512', () => {
      const kex = new DiffieHellmanKex('diffie-hellman-group16-sha512');
      expect(kex.getAlgorithm()).toBe('diffie-hellman-group16-sha512');
    });
  });

  describe('public key generation', () => {
    test('should generate client public key', () => {
      const kex = new DiffieHellmanKex('diffie-hellman-group14-sha256');
      const publicKey = kex.getClientPublicKey();
      
      expect(publicKey).toBeInstanceOf(Buffer);
      expect(publicKey.length).toBeGreaterThan(0);
    });

    test('should generate different public keys for different instances', () => {
      const kex1 = new DiffieHellmanKex('diffie-hellman-group14-sha256');
      const kex2 = new DiffieHellmanKex('diffie-hellman-group14-sha256');
      
      const pubKey1 = kex1.getClientPublicKey();
      const pubKey2 = kex2.getClientPublicKey();
      
      expect(pubKey1.equals(pubKey2)).toBe(false);
    });

    test('should create valid KEXDH_INIT packet', () => {
      const kex = new DiffieHellmanKex('diffie-hellman-group14-sha256');
      const kexdhInit = kex.createKexdhInit();
      
      expect(kexdhInit).toBeInstanceOf(Buffer);
      expect(kexdhInit.length).toBeGreaterThan(4); // At least length prefix + some data
    });
  });

  describe('key exchange simulation', () => {
    test('should complete full key exchange between two parties', () => {
      // Simulate client and server
      const clientKex = new DiffieHellmanKex('diffie-hellman-group14-sha256');
      const serverKex = new DiffieHellmanKex('diffie-hellman-group14-sha256');
      
      // Get public keys
      const clientPublic = clientKex.getClientPublicKey();
      const serverPublic = serverKex.getClientPublicKey();
      
      // Simulate server host key (dummy for testing)
      const serverHostKey = Buffer.from('dummy-host-key');
      const signature = Buffer.from('dummy-signature');
      
      // Create mock KEXDH_REPLY payload using PacketBuilder
      const { PacketBuilder } = require('../src/ssh/packet');
      const kexdhReplyPayload = Buffer.concat([
        PacketBuilder.buildBytes(serverHostKey),
        PacketBuilder.buildBytes(serverPublic),
        PacketBuilder.buildBytes(signature)
      ]);
      
      // Process the exchange
      const result = clientKex.processKexdhReply(kexdhReplyPayload);
      
      expect(result.serverHostKey.equals(serverHostKey)).toBe(true);
      expect(result.serverPublicKey.equals(serverPublic)).toBe(true);
      expect(result.signature.equals(signature)).toBe(true);
      expect(result.sharedSecret).toBeInstanceOf(Buffer);
      expect(result.sharedSecret.length).toBeGreaterThan(0);
    });
  });

  describe('exchange hash generation', () => {
    test('should generate exchange hash', () => {
      const kex = new DiffieHellmanKex('diffie-hellman-group14-sha256');
      
      const clientVersion = 'SSH-2.0-Test-Client';
      const serverVersion = 'SSH-2.0-Test-Server';
      const clientKexInit = Buffer.from('client-kex-init');
      const serverKexInit = Buffer.from('server-kex-init');
      const serverHostKey = Buffer.from('server-host-key');
      const clientPublicKey = kex.getClientPublicKey();
      const serverPublicKey = Buffer.from('server-public-key');
      const sharedSecret = Buffer.from('shared-secret');
      
      const exchangeHash = kex.generateExchangeHash(
        clientVersion,
        serverVersion,
        clientKexInit,
        serverKexInit,
        serverHostKey,
        clientPublicKey,
        serverPublicKey,
        sharedSecret
      );
      
      expect(exchangeHash).toBeInstanceOf(Buffer);
      expect(exchangeHash.length).toBe(32); // SHA-256 hash length
    });

    test('should generate different hashes for different inputs', () => {
      const kex = new DiffieHellmanKex('diffie-hellman-group14-sha256');
      
      const baseParams = {
        clientVersion: 'SSH-2.0-Test-Client',
        serverVersion: 'SSH-2.0-Test-Server',
        clientKexInit: Buffer.from('client-kex-init'),
        serverKexInit: Buffer.from('server-kex-init'),
        serverHostKey: Buffer.from('server-host-key'),
        clientPublicKey: kex.getClientPublicKey(),
        serverPublicKey: Buffer.from('server-public-key'),
        sharedSecret: Buffer.from('shared-secret')
      };
      
      const hash1 = kex.generateExchangeHash(
        baseParams.clientVersion,
        baseParams.serverVersion,
        baseParams.clientKexInit,
        baseParams.serverKexInit,
        baseParams.serverHostKey,
        baseParams.clientPublicKey,
        baseParams.serverPublicKey,
        baseParams.sharedSecret
      );
      
      // Change one parameter
      const hash2 = kex.generateExchangeHash(
        'SSH-2.0-Different-Client', // Changed this
        baseParams.serverVersion,
        baseParams.clientKexInit,
        baseParams.serverKexInit,
        baseParams.serverHostKey,
        baseParams.clientPublicKey,
        baseParams.serverPublicKey,
        baseParams.sharedSecret
      );
      
      expect(hash1.equals(hash2)).toBe(false);
    });
  });

  describe('key derivation', () => {
    test('should derive encryption keys', () => {
      const kex = new DiffieHellmanKex('diffie-hellman-group14-sha256');
      
      const sharedSecret = Buffer.from('test-shared-secret');
      const exchangeHash = CryptoUtils.sha256(Buffer.from('test-exchange-hash'));
      const sessionId = exchangeHash; // First exchange hash becomes session ID
      
      const keys = kex.deriveKeys(sharedSecret, exchangeHash, sessionId);
      
      // Verify all keys are generated
      expect(keys.clientToServerKey).toBeInstanceOf(Buffer);
      expect(keys.serverToClientKey).toBeInstanceOf(Buffer);
      expect(keys.clientToServerIV).toBeInstanceOf(Buffer);
      expect(keys.serverToClientIV).toBeInstanceOf(Buffer);
      expect(keys.clientToServerMac).toBeInstanceOf(Buffer);
      expect(keys.serverToClientMac).toBeInstanceOf(Buffer);
      
      // Verify key lengths
      expect(keys.clientToServerKey.length).toBe(32); // AES-256
      expect(keys.serverToClientKey.length).toBe(32);
      expect(keys.clientToServerIV.length).toBe(16); // AES block size
      expect(keys.serverToClientIV.length).toBe(16);
      expect(keys.clientToServerMac.length).toBe(32); // SHA-256
      expect(keys.serverToClientMac.length).toBe(32);
      
      // Verify keys are different
      expect(keys.clientToServerKey.equals(keys.serverToClientKey)).toBe(false);
      expect(keys.clientToServerIV.equals(keys.serverToClientIV)).toBe(false);
      expect(keys.clientToServerMac.equals(keys.serverToClientMac)).toBe(false);
    });

    test('should be deterministic for same inputs', () => {
      const kex = new DiffieHellmanKex('diffie-hellman-group14-sha256');
      
      const sharedSecret = Buffer.from('test-shared-secret');
      const exchangeHash = CryptoUtils.sha256(Buffer.from('test-exchange-hash'));
      const sessionId = exchangeHash;
      
      const keys1 = kex.deriveKeys(sharedSecret, exchangeHash, sessionId);
      const keys2 = kex.deriveKeys(sharedSecret, exchangeHash, sessionId);
      
      expect(keys1.clientToServerKey.equals(keys2.clientToServerKey)).toBe(true);
      expect(keys1.serverToClientKey.equals(keys2.serverToClientKey)).toBe(true);
      expect(keys1.clientToServerIV.equals(keys2.clientToServerIV)).toBe(true);
      expect(keys1.serverToClientIV.equals(keys2.serverToClientIV)).toBe(true);
    });
  });

  describe('group16 SHA-512 support', () => {
    test('should work with group16-sha512', () => {
      const kex = new DiffieHellmanKex('diffie-hellman-group16-sha512');
      
      const publicKey = kex.getClientPublicKey();
      expect(publicKey).toBeInstanceOf(Buffer);
      
      const sharedSecret = Buffer.from('test-shared-secret');
      const exchangeHash = CryptoUtils.sha512(Buffer.from('test-data'));
      const sessionId = exchangeHash;
      
      const keys = kex.deriveKeys(sharedSecret, exchangeHash, sessionId);
      expect(keys.clientToServerKey.length).toBe(32);
    });
  });
});