/**
 * SSH/SFTP Packet handling tests
 */

import { PacketParser, PacketBuilder, PacketReader } from '../src/ssh/packet';
import { SSH_MSG, SFTP_MSG } from '../src/ssh/constants';

describe('PacketBuilder', () => {
  describe('SSH packet building', () => {
    test('should build basic SSH packet', () => {
      const payload = Buffer.from('test-payload');
      const packet = PacketBuilder.buildSSHPacket(SSH_MSG.DEBUG, payload);
      
      expect(packet).toBeInstanceOf(Buffer);
      expect(packet.length).toBeGreaterThan(payload.length + 4);
      
      // Check packet length field
      const packetLength = packet.readUInt32BE(0);
      expect(packetLength).toBe(packet.length - 4);
    });

    test('should build packet with proper padding', () => {
      const payload = Buffer.from('short');
      const packet = PacketBuilder.buildSSHPacket(SSH_MSG.DEBUG, payload);
      
      // Extract components
      const packetLength = packet.readUInt32BE(0);
      const paddingLength = packet.readUInt8(4);
      const messageType = packet.readUInt8(5);
      
      expect(messageType).toBe(SSH_MSG.DEBUG);
      expect(paddingLength).toBeGreaterThanOrEqual(4); // Minimum padding
      expect(packetLength).toBe(1 + 1 + payload.length + paddingLength);
    });

    test('should build empty packet', () => {
      const packet = PacketBuilder.buildSSHPacket(SSH_MSG.IGNORE);
      
      expect(packet).toBeInstanceOf(Buffer);
      expect(packet.length).toBeGreaterThan(6); // Length + padding + type + minimum padding
    });
  });

  describe('SFTP packet building', () => {
    test('should build SFTP packet with ID', () => {
      const payload = Buffer.from('sftp-data');
      const packet = PacketBuilder.buildSFTPPacket(SFTP_MSG.READ, payload, 123);
      
      expect(packet).toBeInstanceOf(Buffer);
      
      // Check length prefix
      const length = packet.readUInt32BE(0);
      expect(length).toBe(packet.length - 4);
      
      // Check message type
      const messageType = packet.readUInt8(4);
      expect(messageType).toBe(SFTP_MSG.READ);
      
      // Check ID
      const id = packet.readUInt32BE(5);
      expect(id).toBe(123);
    });

    test('should build SFTP INIT packet without ID', () => {
      const payload = Buffer.from([0, 0, 0, 3]); // SFTP version 3
      const packet = PacketBuilder.buildSFTPPacket(SFTP_MSG.INIT, payload);
      
      expect(packet).toBeInstanceOf(Buffer);
      
      const messageType = packet.readUInt8(4);
      expect(messageType).toBe(SFTP_MSG.INIT);
      
      // Should not have ID field for INIT
      const version = packet.readUInt32BE(5);
      expect(version).toBe(3);
    });
  });

  describe('data type builders', () => {
    test('should build string correctly', () => {
      const str = 'hello world';
      const buffer = PacketBuilder.buildString(str);
      
      expect(buffer.length).toBe(4 + str.length);
      expect(buffer.readUInt32BE(0)).toBe(str.length);
      expect(buffer.subarray(4).toString('utf8')).toBe(str);
    });

    test('should build bytes correctly', () => {
      const data = Buffer.from([1, 2, 3, 4, 5]);
      const buffer = PacketBuilder.buildBytes(data);
      
      expect(buffer.length).toBe(4 + data.length);
      expect(buffer.readUInt32BE(0)).toBe(data.length);
      expect(buffer.subarray(4).equals(data)).toBe(true);
    });

    test('should build boolean correctly', () => {
      const trueBuffer = PacketBuilder.buildBoolean(true);
      const falseBuffer = PacketBuilder.buildBoolean(false);
      
      expect(trueBuffer.length).toBe(1);
      expect(falseBuffer.length).toBe(1);
      expect(trueBuffer.readUInt8(0)).toBe(1);
      expect(falseBuffer.readUInt8(0)).toBe(0);
    });

    test('should build uint32 correctly', () => {
      const value = 0x12345678;
      const buffer = PacketBuilder.buildUInt32(value);
      
      expect(buffer.length).toBe(4);
      expect(buffer.readUInt32BE(0)).toBe(value);
    });
  });
});

describe('PacketParser', () => {
  let parser: PacketParser;

  beforeEach(() => {
    parser = new PacketParser();
  });

  describe('SSH packet parsing', () => {
    test('should parse complete SSH packet', () => {
      const payload = Buffer.from('test-data');
      const originalPacket = PacketBuilder.buildSSHPacket(SSH_MSG.DEBUG, payload);
      
      parser.addData(originalPacket);
      const packets = parser.parseSSHPackets();
      
      expect(packets).toHaveLength(1);
      expect(packets[0].type).toBe(SSH_MSG.DEBUG);
      expect(packets[0].payload.equals(payload)).toBe(true);
    });

    test('should handle incomplete packets', () => {
      const payload = Buffer.from('test-data');
      const originalPacket = PacketBuilder.buildSSHPacket(SSH_MSG.DEBUG, payload);
      
      // Send only half the packet
      const halfPacket = originalPacket.subarray(0, Math.floor(originalPacket.length / 2));
      parser.addData(halfPacket);
      
      let packets = parser.parseSSHPackets();
      expect(packets).toHaveLength(0);
      
      // Send the rest
      const remainingPacket = originalPacket.subarray(halfPacket.length);
      parser.addData(remainingPacket);
      
      packets = parser.parseSSHPackets();
      expect(packets).toHaveLength(1);
      expect(packets[0].type).toBe(SSH_MSG.DEBUG);
    });

    test('should parse multiple packets in one buffer', () => {
      const packet1 = PacketBuilder.buildSSHPacket(SSH_MSG.DEBUG, Buffer.from('data1'));
      const packet2 = PacketBuilder.buildSSHPacket(SSH_MSG.IGNORE, Buffer.from('data2'));
      
      const combinedBuffer = Buffer.concat([packet1, packet2]);
      parser.addData(combinedBuffer);
      
      const packets = parser.parseSSHPackets();
      expect(packets).toHaveLength(2);
      expect(packets[0].type).toBe(SSH_MSG.DEBUG);
      expect(packets[1].type).toBe(SSH_MSG.IGNORE);
    });
  });

  describe('SFTP packet parsing', () => {
    test('should parse SFTP packet with ID', () => {
      const payload = Buffer.from('sftp-test-data');
      const originalPacket = PacketBuilder.buildSFTPPacket(SFTP_MSG.READ, payload, 456);
      
      const packets = parser.parseSFTPPackets(originalPacket);
      
      expect(packets).toHaveLength(1);
      expect(packets[0].type).toBe(SFTP_MSG.READ);
      expect(packets[0].id).toBe(456);
      expect(packets[0].payload.equals(payload)).toBe(true);
    });

    test('should parse SFTP INIT packet without ID', () => {
      const versionPayload = Buffer.from([0, 0, 0, 3]);
      const originalPacket = PacketBuilder.buildSFTPPacket(SFTP_MSG.INIT, versionPayload);
      
      const packets = parser.parseSFTPPackets(originalPacket);
      
      expect(packets).toHaveLength(1);
      expect(packets[0].type).toBe(SFTP_MSG.INIT);
      expect(packets[0].id).toBeUndefined();
    });
  });

  describe('parser state management', () => {
    test('should handle remaining data correctly', () => {
      const testData = Buffer.from('some test data');
      parser.addData(testData);
      
      const remaining = parser.getRemainingData();
      expect(remaining.equals(testData)).toBe(true);
    });

    test('should clear buffer correctly', () => {
      parser.addData(Buffer.from('test data'));
      parser.clear();
      
      const remaining = parser.getRemainingData();
      expect(remaining.length).toBe(0);
    });
  });
});

describe('PacketReader', () => {
  test('should read string correctly', () => {
    const testString = 'hello world';
    const buffer = PacketBuilder.buildString(testString);
    const reader = new PacketReader(buffer);
    
    const result = reader.readString();
    expect(result).toBe(testString);
  });

  test('should read bytes correctly', () => {
    const testData = Buffer.from([1, 2, 3, 4, 5]);
    const buffer = PacketBuilder.buildBytes(testData);
    const reader = new PacketReader(buffer);
    
    const result = reader.readBytes();
    expect(result.equals(testData)).toBe(true);
  });

  test('should read boolean correctly', () => {
    const trueBuffer = PacketBuilder.buildBoolean(true);
    const falseBuffer = PacketBuilder.buildBoolean(false);
    
    const trueReader = new PacketReader(trueBuffer);
    const falseReader = new PacketReader(falseBuffer);
    
    expect(trueReader.readBoolean()).toBe(true);
    expect(falseReader.readBoolean()).toBe(false);
  });

  test('should read uint32 correctly', () => {
    const value = 0x12345678;
    const buffer = PacketBuilder.buildUInt32(value);
    const reader = new PacketReader(buffer);
    
    expect(reader.readUInt32()).toBe(value);
  });

  test('should read uint8 correctly', () => {
    const buffer = Buffer.from([0x42]);
    const reader = new PacketReader(buffer);
    
    expect(reader.readUInt8()).toBe(0x42);
  });

  test('should track remaining data correctly', () => {
    const buffer = Buffer.concat([
      PacketBuilder.buildString('test'),
      PacketBuilder.buildUInt32(123),
      Buffer.from([0xFF])
    ]);
    
    const reader = new PacketReader(buffer);
    
    expect(reader.hasMoreData()).toBe(true);
    reader.readString();
    expect(reader.hasMoreData()).toBe(true);
    reader.readUInt32();
    expect(reader.hasMoreData()).toBe(true);
    
    const remaining = reader.getRemainingBytes();
    expect(remaining.length).toBe(1);
    expect(remaining[0]).toBe(0xFF);
  });

  test('should throw error on insufficient data', () => {
    const buffer = Buffer.from([0, 0]); // Too short for uint32
    const reader = new PacketReader(buffer);
    
    expect(() => reader.readUInt32()).toThrow('Insufficient data');
  });

  test('should throw error on invalid string length', () => {
    const buffer = Buffer.from([0, 0, 0, 10, 1, 2]); // Says 10 bytes but only has 2
    const reader = new PacketReader(buffer);
    
    expect(() => reader.readString()).toThrow('Insufficient data');
  });
});