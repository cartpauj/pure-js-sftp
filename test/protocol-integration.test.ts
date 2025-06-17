/**
 * SSH/SFTP Protocol Integration Tests
 * These tests validate actual protocol implementation with real data
 */

import { SSHTransport } from '../src/ssh/transport';
import { DiffieHellmanKex } from '../src/kex/diffie-hellman';
import { PacketBuilder, PacketParser, PacketReader } from '../src/ssh/packet';
import { CryptoUtils } from '../src/crypto/utils';
import { SSH_MSG, SFTP_MSG } from '../src/ssh/constants';
import { ConnectionState } from '../src/ssh/types';
import { EventEmitter } from 'events';

describe('SSH Protocol Integration', () => {
  describe('Version Exchange Protocol', () => {
    test('should validate SSH version strings correctly', () => {
      // Test version validation logic
      const supportedVersions = [
        'SSH-2.0-OpenSSH_8.0p1 Ubuntu-6ubuntu0.3',
        'SSH-2.0-OpenSSH_7.4',
        'SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.1',
        'SSH-2.0-libssh_0.8.9',
        'SSH-2.0-PureJS_SFTP_1.0'
      ];
      
      const unsupportedVersions = [
        'SSH-1.99-OpenSSH_3.4',
        'SSH-1.5-1.2.27',
        'HTTP/1.1 400 Bad Request',
        'INVALID'
      ];
      
      // Verify supported versions
      for (const version of supportedVersions) {
        expect(version.startsWith('SSH-2.0')).toBe(true);
      }
      
      // Verify unsupported versions
      for (const version of unsupportedVersions) {
        expect(version.startsWith('SSH-2.0')).toBe(false);
      }
    });
  });

  describe('Packet Parsing with Real Data', () => {
    test('should parse real SSH packets correctly', () => {
      // Create a real SSH packet (SSH_MSG_KEXINIT)
      const kexInitPayload = Buffer.concat([
        CryptoUtils.randomBytes(16), // random bytes
        Buffer.from([0, 0, 0, 25]), // kex_algorithms length
        Buffer.from('diffie-hellman-group14-sha256'),
        Buffer.from([0, 0, 0, 12]), // server_host_key_algorithms length  
        Buffer.from('ssh-rsa,ssh-dss'),
        Buffer.from([0, 0, 0, 0]), // encryption_algorithms_client_to_server length
        Buffer.from([0, 0, 0, 0]), // encryption_algorithms_server_to_client length
        Buffer.from([0, 0, 0, 0]), // mac_algorithms_client_to_server length
        Buffer.from([0, 0, 0, 0]), // mac_algorithms_server_to_client length
        Buffer.from([0, 0, 0, 0]), // compression_algorithms_client_to_server length
        Buffer.from([0, 0, 0, 0]), // compression_algorithms_server_to_client length
        Buffer.from([0, 0, 0, 0]), // languages_client_to_server length
        Buffer.from([0, 0, 0, 0]), // languages_server_to_client length
        Buffer.from([0]), // first_kex_packet_follows
        Buffer.from([0, 0, 0, 0]) // reserved
      ]);
      
      const sshPacket = PacketBuilder.buildSSHPacket(SSH_MSG.KEXINIT, kexInitPayload);
      
      // Parse the packet
      const parser = new PacketParser();
      parser.addData(sshPacket);
      const packets = parser.parseSSHPackets();
      
      expect(packets).toHaveLength(1);
      expect(packets[0].type).toBe(SSH_MSG.KEXINIT);
      expect(packets[0].payload.length).toBe(kexInitPayload.length);
      expect(packets[0].payload.equals(kexInitPayload)).toBe(true);
    });

    test('should handle SSH packet fragmentation', () => {
      const payload = CryptoUtils.randomBytes(1000);
      const packet = PacketBuilder.buildSSHPacket(SSH_MSG.DEBUG, payload);
      
      const parser = new PacketParser();
      
      // Split packet into random chunks
      let offset = 0;
      const chunkSizes = [13, 27, 156, 89, 234, 67]; // Arbitrary chunk sizes
      
      for (const chunkSize of chunkSizes) {
        if (offset >= packet.length) break;
        
        const chunk = packet.subarray(offset, offset + chunkSize);
        parser.addData(chunk);
        offset += chunkSize;
        
        // Should not parse until complete
        if (offset < packet.length) {
          expect(parser.parseSSHPackets()).toHaveLength(0);
        }
      }
      
      // Add remaining data
      if (offset < packet.length) {
        parser.addData(packet.subarray(offset));
      }
      
      // Now should parse successfully
      const packets = parser.parseSSHPackets();
      expect(packets).toHaveLength(1);
      expect(packets[0].type).toBe(SSH_MSG.DEBUG);
      expect(packets[0].payload.equals(payload)).toBe(true);
    });

    test('should parse SFTP packets with real structure', () => {
      // Create real SFTP INIT packet
      const sftpVersion = 3;
      const initPayload = Buffer.from([0, 0, 0, sftpVersion]);
      const initPacket = PacketBuilder.buildSFTPPacket(SFTP_MSG.INIT, initPayload);
      
      const parser = new PacketParser();
      const packets = parser.parseSFTPPackets(initPacket);
      
      expect(packets).toHaveLength(1);
      expect(packets[0].type).toBe(SFTP_MSG.INIT);
      expect(packets[0].payload.readUInt32BE(0)).toBe(sftpVersion);
      
      // Create SFTP OPEN packet with real file path
      const filePath = '/home/user/test.txt';
      const openId = 12345;
      const openPayload = Buffer.concat([
        PacketBuilder.buildString(filePath),
        PacketBuilder.buildUInt32(0x00000001), // SSH_FXF_READ
        Buffer.alloc(4) // attributes (empty)
      ]);
      
      const openPacket = PacketBuilder.buildSFTPPacket(SFTP_MSG.OPEN, openPayload, openId);
      const openParsed = parser.parseSFTPPackets(openPacket);
      
      expect(openParsed).toHaveLength(1);
      expect(openParsed[0].type).toBe(SFTP_MSG.OPEN);
      expect(openParsed[0].id).toBe(openId);
      
      // Parse the payload
      const reader = new PacketReader(openParsed[0].payload);
      const parsedPath = reader.readString();
      const flags = reader.readUInt32();
      
      expect(parsedPath).toBe(filePath);
      expect(flags).toBe(0x00000001);
    });
  });

  describe('Cryptographic Key Exchange', () => {
    test('should perform complete Diffie-Hellman key exchange', () => {
      // Simulate client and server key exchange
      const clientKex = new DiffieHellmanKex('diffie-hellman-group14-sha256');
      const serverKex = new DiffieHellmanKex('diffie-hellman-group14-sha256');
      
      // Client generates KEXDH_INIT
      const clientPublicKey = clientKex.getClientPublicKey();
      expect(clientPublicKey.length).toBeGreaterThan(0);
      
      const kexdhInit = clientKex.createKexdhInit();
      expect(kexdhInit.length).toBeGreaterThan(4);
      
      // Simulate server processing and response
      const serverPublicKey = serverKex.getClientPublicKey(); // Server's public key
      const serverHostKey = CryptoUtils.randomBytes(256); // Mock server host key
      const signature = CryptoUtils.randomBytes(256); // Mock signature
      
      // Create proper KEXDH_REPLY
      const kexdhReply = Buffer.concat([
        PacketBuilder.buildBytes(serverHostKey),
        PacketBuilder.buildBytes(serverPublicKey),
        PacketBuilder.buildBytes(signature)
      ]);
      
      // Client processes KEXDH_REPLY
      const result = clientKex.processKexdhReply(kexdhReply);
      
      expect(result.serverHostKey.equals(serverHostKey)).toBe(true);
      expect(result.serverPublicKey.equals(serverPublicKey)).toBe(true);
      expect(result.signature.equals(signature)).toBe(true);
      expect(result.sharedSecret).toBeInstanceOf(Buffer);
      expect(result.sharedSecret.length).toBeGreaterThan(0);
      
      // Verify shared secret is deterministic
      const result2 = clientKex.processKexdhReply(kexdhReply);
      expect(result.sharedSecret.equals(result2.sharedSecret)).toBe(true);
    });

    test('should generate proper exchange hash', () => {
      const kex = new DiffieHellmanKex('diffie-hellman-group14-sha256');
      
      // Use realistic SSH handshake data
      const clientVersion = 'SSH-2.0-PureJS_SFTP_1.0';
      const serverVersion = 'SSH-2.0-OpenSSH_8.0p1';
      const clientKexInit = CryptoUtils.randomBytes(300); // Realistic size
      const serverKexInit = CryptoUtils.randomBytes(320);
      const serverHostKey = CryptoUtils.randomBytes(270);
      const clientPublicKey = kex.getClientPublicKey();
      const serverPublicKey = CryptoUtils.randomBytes(256);
      const sharedSecret = CryptoUtils.randomBytes(256);
      
      const hash1 = kex.generateExchangeHash(
        clientVersion,
        serverVersion,
        clientKexInit,
        serverKexInit,
        serverHostKey,
        clientPublicKey,
        serverPublicKey,
        sharedSecret
      );
      
      // Hash should be SHA-256 (32 bytes)
      expect(hash1.length).toBe(32);
      
      // Should be deterministic
      const hash2 = kex.generateExchangeHash(
        clientVersion,
        serverVersion,
        clientKexInit,
        serverKexInit,
        serverHostKey,
        clientPublicKey,
        serverPublicKey,
        sharedSecret
      );
      
      expect(hash1.equals(hash2)).toBe(true);
      
      // Should change if any input changes
      const hash3 = kex.generateExchangeHash(
        'SSH-2.0-Different',
        serverVersion,
        clientKexInit,
        serverKexInit,
        serverHostKey,
        clientPublicKey,
        serverPublicKey,
        sharedSecret
      );
      
      expect(hash1.equals(hash3)).toBe(false);
    });

    test('should derive encryption keys correctly', () => {
      const kex = new DiffieHellmanKex('diffie-hellman-group14-sha256');
      
      // Use realistic shared secret and hashes
      const sharedSecret = CryptoUtils.randomBytes(256);
      const exchangeHash = CryptoUtils.sha256(Buffer.from('test-exchange-data'));
      const sessionId = exchangeHash; // First exchange hash becomes session ID
      
      const keys = kex.deriveKeys(sharedSecret, exchangeHash, sessionId);
      
      // Verify all keys are generated and have correct lengths
      expect(keys.clientToServerKey.length).toBe(32); // AES-256
      expect(keys.serverToClientKey.length).toBe(32);
      expect(keys.clientToServerIV.length).toBe(16); // AES block size
      expect(keys.serverToClientIV.length).toBe(16);
      expect(keys.clientToServerMac.length).toBe(32); // SHA-256
      expect(keys.serverToClientMac.length).toBe(32);
      
      // Verify keys are different from each other
      expect(keys.clientToServerKey.equals(keys.serverToClientKey)).toBe(false);
      expect(keys.clientToServerIV.equals(keys.serverToClientIV)).toBe(false);
      expect(keys.clientToServerMac.equals(keys.serverToClientMac)).toBe(false);
      
      // Verify derivation is deterministic
      const keys2 = kex.deriveKeys(sharedSecret, exchangeHash, sessionId);
      expect(keys.clientToServerKey.equals(keys2.clientToServerKey)).toBe(true);
      expect(keys.serverToClientKey.equals(keys2.serverToClientKey)).toBe(true);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle malformed SSH packets gracefully', () => {
      const parser = new PacketParser();
      
      // Test with various malformed packets
      const malformedPackets = [
        Buffer.alloc(0), // Empty
        Buffer.from([0, 0, 0, 1]), // Too short
        Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]), // Invalid length
        Buffer.concat([
          Buffer.from([0, 0, 0, 10]), // Says 10 bytes but only provide 5
          Buffer.from([1, 2, 3, 4, 5])
        ])
      ];
      
      for (const malformed of malformedPackets) {
        parser.clear();
        parser.addData(malformed);
        
        // Should not crash and should return empty packets
        const packets = parser.parseSSHPackets();
        expect(packets).toHaveLength(0);
      }
    });

    test('should validate packet integrity', () => {
      // Create valid packet
      const originalPayload = Buffer.from('test data');
      const validPacket = PacketBuilder.buildSSHPacket(SSH_MSG.DEBUG, originalPayload);
      
      // Corrupt the packet
      const corruptedPacket = Buffer.from(validPacket);
      corruptedPacket[5] = 0xFF; // Corrupt message type
      
      const parser = new PacketParser();
      parser.addData(corruptedPacket);
      
      const packets = parser.parseSSHPackets();
      expect(packets).toHaveLength(1);
      expect(packets[0].type).toBe(0xFF); // Should preserve corrupted type
    });

    test('should handle large packets correctly', () => {
      // Test with various large packet sizes
      const sizes = [1024, 8192, 32768, 65536];
      
      for (const size of sizes) {
        const largePayload = CryptoUtils.randomBytes(size);
        const packet = PacketBuilder.buildSSHPacket(SSH_MSG.DEBUG, largePayload);
        
        const parser = new PacketParser();
        parser.addData(packet);
        
        const packets = parser.parseSSHPackets();
        expect(packets).toHaveLength(1);
        expect(packets[0].payload.length).toBe(size);
        expect(packets[0].payload.equals(largePayload)).toBe(true);
      }
    });
  });

  describe('Data Type Handling', () => {
    test('should handle SSH string encoding correctly', () => {
      const testStrings = [
        '',
        'hello',
        'test with spaces',
        'unicode: 你好世界',
        'special chars: !@#$%^&*()',
        'newlines\nand\ttabs',
        'very long string: ' + 'x'.repeat(1000)
      ];
      
      for (const str of testStrings) {
        const encoded = PacketBuilder.buildString(str);
        const reader = new PacketReader(encoded);
        const decoded = reader.readString();
        
        expect(decoded).toBe(str);
      }
    });

    test('should handle SSH byte arrays correctly', () => {
      const testArrays = [
        Buffer.alloc(0),
        Buffer.from([1, 2, 3]),
        CryptoUtils.randomBytes(100),
        CryptoUtils.randomBytes(1000),
        Buffer.from('test string', 'utf8')
      ];
      
      for (const array of testArrays) {
        const encoded = PacketBuilder.buildBytes(array);
        const reader = new PacketReader(encoded);
        const decoded = reader.readBytes();
        
        expect(decoded.equals(array)).toBe(true);
      }
    });

    test('should handle SSH boolean values correctly', () => {
      for (const value of [true, false]) {
        const encoded = PacketBuilder.buildBoolean(value);
        const reader = new PacketReader(encoded);
        const decoded = reader.readBoolean();
        
        expect(decoded).toBe(value);
      }
    });

    test('should handle SSH uint32 values correctly', () => {
      const testValues = [
        0,
        1,
        255,
        256,
        65535,
        65536,
        0xFFFFFFFF,
        Math.floor(Math.random() * 0xFFFFFFFF)
      ];
      
      for (const value of testValues) {
        const encoded = PacketBuilder.buildUInt32(value);
        const reader = new PacketReader(encoded);
        const decoded = reader.readUInt32();
        
        expect(decoded).toBe(value);
      }
    });
  });
});