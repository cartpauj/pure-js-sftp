/**
 * SSH Packet Parsing and Construction
 */

import { SSHPacket, SFTPPacket } from './types';
import { SSH_MSG, SFTP_MSG } from './constants';
import { randomBytes } from 'crypto';

export class PacketParser {
  private buffer: Buffer = Buffer.alloc(0);

  /**
   * Add data to the internal buffer
   */
  addData(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);
  }

  /**
   * Parse SSH packets from buffer
   */
  parseSSHPackets(): SSHPacket[] {
    const packets: SSHPacket[] = [];
    
    while (this.buffer.length >= 5) { // Minimum packet size: 4 bytes length + 1 byte padding
      // Read packet length (first 4 bytes)
      const packetLength = this.buffer.readUInt32BE(0);
      
      // Check if we have the complete packet
      if (this.buffer.length < packetLength + 4) {
        break; // Wait for more data
      }
      
      // Extract packet data (excluding length field)
      const packetData = this.buffer.subarray(4, packetLength + 4);
      
      // Remove processed packet from buffer
      this.buffer = this.buffer.subarray(packetLength + 4);
      
      // Parse packet
      const packet = this.parseSSHPacket(packetData);
      if (packet) {
        packets.push(packet);
      }
    }
    
    return packets;
  }

  /**
   * Parse individual SSH packet
   */
  private parseSSHPacket(data: Buffer): SSHPacket | null {
    if (data.length < 2) return null;
    
    const paddingLength = data.readUInt8(0);
    const messageType = data.readUInt8(1) as SSH_MSG;
    
    // Extract payload (excluding padding length, message type, and padding)
    const payloadLength = data.length - 2 - paddingLength;
    if (payloadLength < 0) return null;
    
    const payload = data.subarray(2, 2 + payloadLength);
    
    return {
      type: messageType,
      payload
    };
  }

  /**
   * Parse SFTP packets from SSH channel data
   */
  parseSFTPPackets(data: Buffer): SFTPPacket[] {
    const packets: SFTPPacket[] = [];
    let offset = 0;
    
    while (offset + 4 <= data.length) {
      // Read SFTP packet length
      const packetLength = data.readUInt32BE(offset);
      
      // Check if we have the complete SFTP packet
      if (offset + 4 + packetLength > data.length) {
        break; // Incomplete packet
      }
      
      // Extract SFTP packet data
      const packetData = data.subarray(offset + 4, offset + 4 + packetLength);
      
      // Parse SFTP packet
      const packet = this.parseSFTPPacket(packetData);
      if (packet) {
        packets.push(packet);
      }
      
      offset += 4 + packetLength;
    }
    
    return packets;
  }

  /**
   * Parse individual SFTP packet
   */
  private parseSFTPPacket(data: Buffer): SFTPPacket | null {
    if (data.length < 1) return null;
    
    const messageType = data.readUInt8(0) as SFTP_MSG;
    let payload = data.subarray(1);
    let id: number | undefined;
    
    // Most SFTP messages (except INIT/VERSION) have an ID field
    if (messageType !== SFTP_MSG.INIT && messageType !== SFTP_MSG.VERSION) {
      if (payload.length < 4) return null;
      id = payload.readUInt32BE(0);
      payload = payload.subarray(4);
    }
    
    return {
      type: messageType,
      id,
      payload
    };
  }

  /**
   * Get remaining buffer data
   */
  getRemainingData(): Buffer {
    return this.buffer;
  }

  /**
   * Clear internal buffer
   */
  clear(): void {
    this.buffer = Buffer.alloc(0);
  }
}

export class PacketBuilder {
  /**
   * Build SSH packet
   */
  static buildSSHPacket(type: SSH_MSG, payload: Buffer = Buffer.alloc(0)): Buffer {
    // SSH packet structure: [packet_length(4)][padding_length(1)][message_type(1)][payload][padding]
    // RFC 4253: The total length of (padding_length + message_type + payload + padding) 
    // must be a multiple of the cipher block size (8 bytes for no encryption)
    const blockSize = 8;
    const minPadding = 4; // Minimum padding required by RFC 4253

    // Calculate the size that needs to be padded: padding_length(1) + message_type(1) + payload
    const baseSizeWithoutPadding = 1 + 1 + payload.length;

    // Find padding length that makes (baseSizeWithoutPadding + paddingLength) a multiple of blockSize
    // Start with minimum padding and adjust upward
    let paddingLength = minPadding;
    while ((baseSizeWithoutPadding + paddingLength) % blockSize !== 0) {
        paddingLength++;
    }
    
    // Use cryptographically secure random padding (following ssh2's approach)
    const padding = randomBytes(paddingLength);
    
    // Build packet: [packet_length][padding_length][message_type][payload][padding]
    // packet_length excludes itself, so it's the length of everything after it
    const packetLength = 1 + 1 + payload.length + paddingLength; // padding_length + message_type + payload + padding
    
    const packet = Buffer.alloc(4 + packetLength);
    let offset = 0;
    
    // Write packet length (excludes the 4-byte length field itself)
    packet.writeUInt32BE(packetLength, offset);
    offset += 4;
    
    // Write padding length
    packet.writeUInt8(paddingLength, offset);
    offset += 1;
    
    // Write message type
    packet.writeUInt8(type, offset);
    offset += 1;
    
    // Write payload
    payload.copy(packet, offset);
    offset += payload.length;
    
    // Write padding
    padding.copy(packet, offset);
    
    return packet;
  }

  /**
   * Build SFTP packet
   */
  static buildSFTPPacket(type: SFTP_MSG, payload: Buffer = Buffer.alloc(0), id?: number): Buffer {
    let packetPayload = Buffer.alloc(1);
    packetPayload.writeUInt8(type, 0);
    
    // Add ID field for most message types
    if (type !== SFTP_MSG.INIT && type !== SFTP_MSG.VERSION && id !== undefined) {
      const idBuffer = Buffer.alloc(4);
      idBuffer.writeUInt32BE(id, 0);
      packetPayload = Buffer.concat([packetPayload, idBuffer]);
    }
    
    // Add payload
    if (payload.length > 0) {
      packetPayload = Buffer.concat([packetPayload, payload]);
    }
    
    // Build final packet with length prefix
    const packet = Buffer.alloc(4 + packetPayload.length);
    packet.writeUInt32BE(packetPayload.length, 0);
    packetPayload.copy(packet, 4);
    
    return packet;
  }

  /**
   * Build string field for SSH packets
   */
  static buildString(str: string): Buffer {
    const strBuffer = Buffer.from(str, 'utf8');
    const result = Buffer.alloc(4 + strBuffer.length);
    result.writeUInt32BE(strBuffer.length, 0);
    strBuffer.copy(result, 4);
    return result;
  }

  /**
   * Build byte array field for SSH packets
   */
  static buildBytes(data: Buffer): Buffer {
    const result = Buffer.alloc(4 + data.length);
    result.writeUInt32BE(data.length, 0);
    data.copy(result, 4);
    return result;
  }

  /**
   * Build boolean field for SSH packets
   */
  static buildBoolean(value: boolean): Buffer {
    const result = Buffer.alloc(1);
    result.writeUInt8(value ? 1 : 0, 0);
    return result;
  }

  /**
   * Build uint32 field for SSH packets
   */
  static buildUInt32(value: number): Buffer {
    const result = Buffer.alloc(4);
    result.writeUInt32BE(value, 0);
    return result;
  }

  /**
   * Convert to SSH mpint format (following ssh2's convertToMpint logic exactly)
   */
  static convertToMpint(key: Buffer): Buffer {
    // Handle empty buffer
    if (key.length === 0) {
      return Buffer.alloc(0);
    }
    
    let newKey: Buffer;
    let idx = 0;
    let len = key.length;
    
    // Strip leading zeros (ssh2's approach)
    while (idx < key.length && key[idx] === 0x00) {
      ++idx;
      --len;
    }

    // If all bytes were zero, return a single zero byte
    if (len === 0) {
      return Buffer.from([0]);
    }

    // If MSB is set, prepend zero byte to ensure positive integer
    if (key[idx] & 0x80) {
      newKey = Buffer.allocUnsafe(1 + len);
      newKey[0] = 0;
      key.copy(newKey, 1, idx);
      return newKey;
    }

    // If we stripped zeros, create new buffer
    if (len !== key.length) {
      newKey = Buffer.allocUnsafe(len);
      key.copy(newKey, 0, idx);
      key = newKey;
    }
    
    return key;
  }

  /**
   * Build SSH mpint format for big integers (needed for DH key exchange)
   */
  static buildMpint(data: Buffer): Buffer {
    // First convert to proper mpint format following ssh2's logic
    const mpintData = PacketBuilder.convertToMpint(data);

    // Return length-prefixed mpint
    const result = Buffer.alloc(4 + mpintData.length);
    result.writeUInt32BE(mpintData.length, 0);
    mpintData.copy(result, 4);
    return result;
  }
}

export class PacketReader {
  private buffer: Buffer;
  private offset: number = 0;

  constructor(data: Buffer) {
    this.buffer = data;
  }

  /**
   * Read string from packet
   */
  readString(): string {
    if (this.offset + 4 > this.buffer.length) {
      throw new Error('Insufficient data to read string length');
    }
    
    const length = this.buffer.readUInt32BE(this.offset);
    this.offset += 4;
    
    if (this.offset + length > this.buffer.length) {
      throw new Error('Insufficient data to read string data');
    }
    
    const str = this.buffer.subarray(this.offset, this.offset + length).toString('utf8');
    this.offset += length;
    
    return str;
  }

  /**
   * Read bytes from packet
   */
  readBytes(): Buffer {
    if (this.offset + 4 > this.buffer.length) {
      throw new Error('Insufficient data to read bytes length');
    }
    
    const length = this.buffer.readUInt32BE(this.offset);
    this.offset += 4;
    
    if (this.offset + length > this.buffer.length) {
      throw new Error('Insufficient data to read bytes data');
    }
    
    const data = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    
    return data;
  }

  /**
   * Read boolean from packet
   */
  readBoolean(): boolean {
    if (this.offset + 1 > this.buffer.length) {
      throw new Error('Insufficient data to read boolean');
    }
    
    const value = this.buffer.readUInt8(this.offset);
    this.offset += 1;
    
    return value !== 0;
  }

  /**
   * Read uint32 from packet
   */
  readUInt32(): number {
    if (this.offset + 4 > this.buffer.length) {
      throw new Error('Insufficient data to read uint32');
    }
    
    const value = this.buffer.readUInt32BE(this.offset);
    this.offset += 4;
    
    return value;
  }

  /**
   * Read uint8 from packet
   */
  readUInt8(): number {
    if (this.offset + 1 > this.buffer.length) {
      throw new Error('Insufficient data to read uint8');
    }
    
    const value = this.buffer.readUInt8(this.offset);
    this.offset += 1;
    
    return value;
  }

  /**
   * Read raw bytes from packet (fixed length, for KEXINIT cookie)
   */
  readRawBytes(length: number): Buffer {
    if (this.offset + length > this.buffer.length) {
      throw new Error('Insufficient data to read raw bytes');
    }
    const data = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return data;
  }

  /**
   * Check if more data is available
   */
  hasMoreData(): boolean {
    return this.offset < this.buffer.length;
  }

  /**
   * Get remaining bytes
   */
  getRemainingBytes(): Buffer {
    return this.buffer.subarray(this.offset);
  }
}