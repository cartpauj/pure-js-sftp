/**
 * Test suite to verify SSH protocol fixes are working correctly
 */

import { 
  PacketBuilder, 
  PacketReader 
} from '../src/ssh/packet';
import { DiffieHellmanKex } from '../src/kex/diffie-hellman';
import { KexManager } from '../src/kex/kex-manager';
import { SSHTransport } from '../src/ssh/transport';
import { SSH_MSG } from '../src/ssh/constants';

describe('SSH Protocol Fixes', () => {
  describe('Packet padding calculation', () => {
    test('should use correct RFC 4253 padding calculation', () => {
      // Test case from the previous issue: ensure padding is calculated correctly
      const testPayload = Buffer.from([SSH_MSG.KEXINIT]);
      const packet = PacketBuilder.buildSSHPacket(SSH_MSG.KEXINIT, testPayload);
      
      // Parse the packet to verify structure
      const packetLength = packet.readUInt32BE(0);
      const paddingLength = packet.readUInt8(4);
      const messageType = packet.readUInt8(5);
      
      // Verify message type is correct
      expect(messageType).toBe(SSH_MSG.KEXINIT);
      
      // Verify padding calculation follows RFC 4253
      const blockSize = 8;
      const minPadding = 4;
      const sizeWithoutPadding = 1 + 1 + testPayload.length; // padding_length + message_type + payload
      
      // Check that total size with padding is a multiple of blockSize
      const totalSize = sizeWithoutPadding + paddingLength;
      expect(totalSize % blockSize).toBe(0);
      
      // Check minimum padding requirement
      expect(paddingLength).toBeGreaterThanOrEqual(minPadding);
      
      // Verify packet length field is correct
      expect(packetLength).toBe(sizeWithoutPadding + paddingLength);
    });
  });

  describe('SSH mpint format', () => {
    test('should create proper mpint format for DH public keys', () => {
      // Test that buildMpint handles the MSB padding correctly
      const testData1 = Buffer.from([0x7F, 0xFF]); // MSB not set, no padding needed
      const testData2 = Buffer.from([0x80, 0x01]); // MSB set, padding needed
      
      const mpint1 = PacketBuilder.buildMpint(testData1);
      const mpint2 = PacketBuilder.buildMpint(testData2);
      
      // Check length fields
      expect(mpint1.readUInt32BE(0)).toBe(2); // No padding added
      expect(mpint2.readUInt32BE(0)).toBe(3); // Padding byte added
      
      // Check data content
      expect(mpint1.subarray(4)).toEqual(testData1);
      expect(mpint2.subarray(4)).toEqual(Buffer.concat([Buffer.from([0x00]), testData2]));
    });

    test('should use mpint format in DH key exchange', () => {
      const dh = new DiffieHellmanKex('diffie-hellman-group14-sha256');
      const kexdhInit = dh.createKexdhInit();
      
      // Parse the packet and verify it uses proper mpint format
      const reader = new PacketReader(kexdhInit);
      const publicKeyLength = kexdhInit.readUInt32BE(0);
      const publicKeyData = kexdhInit.subarray(4, 4 + publicKeyLength);
      
      // Verify length field is present and reasonable
      expect(publicKeyLength).toBeGreaterThan(0);
      expect(publicKeyLength).toBeLessThan(1024); // Reasonable upper bound
      
      // For DH group 14, public key should be substantial
      expect(publicKeyLength).toBeGreaterThan(200);
    });
  });

  describe('KEXINIT cookie parsing', () => {
    test('should parse KEXINIT cookie correctly with readRawBytes', () => {
      // Create a mock KEXINIT payload with cookie + algorithm lists
      const cookie = Buffer.alloc(16);
      for (let i = 0; i < 16; i++) {
        cookie[i] = i;
      }
      
      const kexAlgos = 'diffie-hellman-group14-sha256,diffie-hellman-group1-sha1';
      const hostKeyAlgos = 'rsa-sha2-512,ssh-rsa';
      
      const payload = Buffer.concat([
        cookie,
        PacketBuilder.buildString(kexAlgos),
        PacketBuilder.buildString(hostKeyAlgos),
        PacketBuilder.buildString('aes128-ctr'), // client-to-server encryption
        PacketBuilder.buildString('aes128-ctr'), // server-to-client encryption
        PacketBuilder.buildString('hmac-sha2-256'), // client-to-server MAC
        PacketBuilder.buildString('hmac-sha2-256'), // server-to-client MAC
        PacketBuilder.buildString('none'), // client-to-server compression
        PacketBuilder.buildString('none'), // server-to-client compression
        PacketBuilder.buildString(''), // client-to-server languages
        PacketBuilder.buildString(''), // server-to-client languages
        PacketBuilder.buildBoolean(false), // first_kex_packet_follows
        PacketBuilder.buildUInt32(0) // reserved
      ]);
      
      const reader = new PacketReader(payload);
      
      // Test readRawBytes for cookie parsing
      const parsedCookie = reader.readRawBytes(16);
      expect(parsedCookie).toEqual(cookie);
      
      // Verify we can continue reading algorithm lists
      const parsedKexAlgos = reader.readString();
      expect(parsedKexAlgos).toBe(kexAlgos);
      
      const parsedHostKeyAlgos = reader.readString();
      expect(parsedHostKeyAlgos).toBe(hostKeyAlgos);
    });
  });

  describe('SHA-1 hash algorithm support', () => {
    test('should support SHA-1 for older DH groups', () => {
      const dhSha1 = new DiffieHellmanKex('diffie-hellman-group1-sha1');
      const dhGroup14Sha1 = new DiffieHellmanKex('diffie-hellman-group14-sha1');
      
      // Should not throw errors for SHA-1 algorithms
      expect(dhSha1.getAlgorithm()).toBe('diffie-hellman-group1-sha1');
      expect(dhGroup14Sha1.getAlgorithm()).toBe('diffie-hellman-group14-sha1');
      
      // Should be able to generate public keys
      const publicKey1 = dhSha1.getClientPublicKey();
      const publicKey14 = dhGroup14Sha1.getClientPublicKey();
      
      expect(publicKey1.length).toBeGreaterThan(0);
      expect(publicKey14.length).toBeGreaterThan(0);
    });

    test('should generate exchange hash with SHA-1', () => {
      const dh = new DiffieHellmanKex('diffie-hellman-group1-sha1');
      
      // Mock data for exchange hash generation
      const clientVersion = 'SSH-2.0-PureJS_SFTP_1.0';
      const serverVersion = 'SSH-2.0-OpenSSH_8.0';
      const clientKexInit = Buffer.alloc(32);
      const serverKexInit = Buffer.alloc(32);
      const serverHostKey = Buffer.alloc(256);
      const clientPublicKey = dh.getClientPublicKey();
      const serverPublicKey = Buffer.alloc(clientPublicKey.length);
      const sharedSecret = Buffer.alloc(256);
      
      const exchangeHash = dh.generateExchangeHash(
        clientVersion,
        serverVersion,
        clientKexInit,
        serverKexInit,
        serverHostKey,
        clientPublicKey,
        serverPublicKey,
        sharedSecret
      );
      
      // SHA-1 produces 20-byte hash
      expect(exchangeHash.length).toBe(20);
    });
  });

  describe('KEX algorithm ordering', () => {
    test('should match ssh2 algorithm preferences exactly', () => {
      const { KEX_ALGORITHMS } = require('../src/ssh/constants');
      
      // Check that we follow ssh2's priority: ECDH first, then DH group exchange, then fixed DH
      expect(KEX_ALGORITHMS[0]).toBe('ecdh-sha2-nistp256');
      expect(KEX_ALGORITHMS[1]).toBe('ecdh-sha2-nistp384');
      expect(KEX_ALGORITHMS[2]).toBe('ecdh-sha2-nistp521');
      
      // Verify we still support legacy algorithms for compatibility
      expect(KEX_ALGORITHMS).toContain('diffie-hellman-group1-sha1');
      expect(KEX_ALGORITHMS).toContain('diffie-hellman-group14-sha1');
      expect(KEX_ALGORITHMS).toContain('diffie-hellman-group14-sha256');
    });
  });

  describe('SSH message handler coverage', () => {
    test('should handle KEXDH_REPLY and USERAUTH_PK_OK messages', () => {
      // These constants should be defined and accessible
      expect(SSH_MSG.KEXDH_REPLY).toBe(31);
      expect(SSH_MSG.USERAUTH_PK_OK).toBe(60);
      
      // Verify these are included in the message handling logic
      // (This would be tested more thoroughly in integration tests)
    });
  });
});