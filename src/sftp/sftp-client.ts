/**
 * SFTP Client Implementation
 */

import { EventEmitter } from 'events';
import { SSHTransport } from '../ssh/transport';
import { PacketBuilder, PacketReader } from '../ssh/packet';
import { SSH_MSG, SFTP_MSG, SFTP_VERSION, SFTP_STATUS, SFTP_OPEN_FLAGS, SFTP_ATTR } from '../ssh/constants';
import { SFTPPacket, FileAttributes, DirectoryEntry, FileStats, FileInfo, SSHError, SFTPError } from '../ssh/types';

export class SFTPClient extends EventEmitter {
  private transport: SSHTransport;
  private channelId: number = 0;
  private remoteChannelId: number = 0;
  private requestId: number = 0;
  private handles: Map<string, Buffer> = new Map();
  private ready: boolean = false;

  constructor(transport: SSHTransport) {
    super();
    this.transport = transport;
    this.setupTransportHandlers();
  }

  /**
   * Set up transport event handlers
   */
  private setupTransportHandlers(): void {
    this.transport.on('channelOpenConfirmation', (payload: Buffer) => {
      this.handleChannelOpenConfirmation(payload);
    });

    this.transport.on('channelData', (payload: Buffer) => {
      this.handleChannelData(payload);
    });
  }

  /**
   * Initialize SFTP subsystem
   */
  async initSFTP(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Open channel for SFTP
      this.openSFTPChannel()
        .then(() => {
          this.once('sftpReady', () => {
            this.ready = true;
            resolve();
          });
          this.once('error', reject);
        })
        .catch(reject);
    });
  }

  /**
   * Open SFTP channel
   */
  private async openSFTPChannel(): Promise<void> {
    return new Promise((resolve, reject) => {
      const payload = Buffer.concat([
        PacketBuilder.buildString('session'),
        PacketBuilder.buildUInt32(this.channelId),
        PacketBuilder.buildUInt32(65536), // window size
        PacketBuilder.buildUInt32(32768)  // max packet size
      ]);

      this.transport.sendPacket(SSH_MSG.CHANNEL_OPEN, payload);
      
      this.once('channelOpen', resolve);
      this.once('error', reject);
    });
  }

  /**
   * Handle channel open confirmation
   */
  private handleChannelOpenConfirmation(payload: Buffer): void {
    const reader = new PacketReader(payload);
    const localChannel = reader.readUInt32();
    this.remoteChannelId = reader.readUInt32();
    const windowSize = reader.readUInt32();
    const maxPacketSize = reader.readUInt32();

    // Request SFTP subsystem
    const subsystemPayload = Buffer.concat([
      PacketBuilder.buildUInt32(this.remoteChannelId),
      PacketBuilder.buildString('subsystem'),
      PacketBuilder.buildBoolean(true), // want reply
      PacketBuilder.buildString('sftp')
    ]);

    this.transport.sendPacket(SSH_MSG.CHANNEL_REQUEST, subsystemPayload);
    this.emit('channelOpen');
  }

  /**
   * Handle channel data (SFTP packets)
   */
  private handleChannelData(payload: Buffer): void {
    const reader = new PacketReader(payload);
    const channelId = reader.readUInt32();
    const data = reader.readBytes();

    // Parse SFTP packets
    const packets = this.parseSFTPData(data);
    for (const packet of packets) {
      this.handleSFTPPacket(packet);
    }
  }

  /**
   * Parse SFTP data into packets
   */
  private parseSFTPData(data: Buffer): SFTPPacket[] {
    const packets: SFTPPacket[] = [];
    let offset = 0;

    while (offset + 4 <= data.length) {
      const length = data.readUInt32BE(offset);
      if (offset + 4 + length > data.length) break;

      const packetData = data.subarray(offset + 4, offset + 4 + length);
      const type = packetData.readUInt8(0) as SFTP_MSG;
      
      let id: number | undefined;
      let payload = packetData.subarray(1);

      if (type !== SFTP_MSG.INIT && type !== SFTP_MSG.VERSION) {
        id = payload.readUInt32BE(0);
        payload = payload.subarray(4);
      }

      packets.push({ type, id, payload });
      offset += 4 + length;
    }

    return packets;
  }

  /**
   * Handle SFTP packet
   */
  private handleSFTPPacket(packet: SFTPPacket): void {
    switch (packet.type) {
      case SFTP_MSG.VERSION:
        this.handleSFTPVersion(packet);
        break;
      case SFTP_MSG.STATUS:
        this.handleSFTPStatus(packet);
        break;
      case SFTP_MSG.HANDLE:
        this.handleSFTPHandle(packet);
        break;
      case SFTP_MSG.DATA:
        this.handleSFTPData(packet);
        break;
      case SFTP_MSG.NAME:
        this.handleSFTPName(packet);
        break;
      case SFTP_MSG.ATTRS:
        this.handleSFTPAttrs(packet);
        break;
      default:
        console.log(`Unhandled SFTP packet type: ${packet.type}`);
    }
  }

  /**
   * Handle SFTP version packet
   */
  private handleSFTPVersion(packet: SFTPPacket): void {
    const version = packet.payload.readUInt32BE(0);
    if (version === SFTP_VERSION) {
      this.emit('sftpReady');
    } else {
      this.emit('error', new SFTPError(`Unsupported SFTP version: ${version}`));
    }
  }

  /**
   * Handle SFTP status packet
   */
  private handleSFTPStatus(packet: SFTPPacket): void {
    const reader = new PacketReader(packet.payload);
    const code = reader.readUInt32() as SFTP_STATUS;
    const message = reader.readString();
    
    if (code !== SFTP_STATUS.OK) {
      this.emit('sftpError', new SFTPError(message, code));
    }
  }

  /**
   * Handle SFTP handle packet
   */
  private handleSFTPHandle(packet: SFTPPacket): void {
    const handle = packet.payload;
    this.emit('sftpHandle', { id: packet.id, handle });
  }

  /**
   * Handle SFTP data packet
   */
  private handleSFTPData(packet: SFTPPacket): void {
    const data = new PacketReader(packet.payload).readBytes();
    this.emit('sftpData', { id: packet.id, data });
  }

  /**
   * Handle SFTP name packet
   */
  private handleSFTPName(packet: SFTPPacket): void {
    const reader = new PacketReader(packet.payload);
    const count = reader.readUInt32();
    const entries: DirectoryEntry[] = [];

    for (let i = 0; i < count; i++) {
      const filename = reader.readString();
      const longname = reader.readString();
      const attrs = this.parseFileAttributes(reader);
      entries.push({ filename, longname, attrs });
    }

    this.emit('sftpName', { id: packet.id, entries });
  }

  /**
   * Handle SFTP attrs packet
   */
  private handleSFTPAttrs(packet: SFTPPacket): void {
    const reader = new PacketReader(packet.payload);
    const attrs = this.parseFileAttributes(reader);
    this.emit('sftpAttrs', { id: packet.id, attrs });
  }

  /**
   * Parse file attributes from packet
   */
  private parseFileAttributes(reader: PacketReader): FileAttributes {
    const flags = reader.readUInt32();
    const attrs: FileAttributes = { flags };

    if (flags & SFTP_ATTR.SIZE) {
      attrs.size = reader.readUInt32(); // Note: This is simplified, should handle 64-bit
    }
    if (flags & SFTP_ATTR.UIDGID) {
      attrs.uid = reader.readUInt32();
      attrs.gid = reader.readUInt32();
    }
    if (flags & SFTP_ATTR.PERMISSIONS) {
      attrs.permissions = reader.readUInt32();
    }
    if (flags & SFTP_ATTR.ACMODTIME) {
      attrs.atime = reader.readUInt32();
      attrs.mtime = reader.readUInt32();
    }

    return attrs;
  }

  /**
   * Send SFTP packet
   */
  public sendSFTPPacket(type: SFTP_MSG, payload: Buffer = Buffer.alloc(0), id?: number): void {
    const packet = PacketBuilder.buildSFTPPacket(type, payload, id);
    
    const channelData = Buffer.concat([
      PacketBuilder.buildUInt32(this.remoteChannelId),
      PacketBuilder.buildBytes(packet)
    ]);

    this.transport.sendPacket(SSH_MSG.CHANNEL_DATA, channelData);
  }

  /**
   * Send SFTP INIT
   */
  sendSFTPInit(): void {
    const payload = PacketBuilder.buildUInt32(SFTP_VERSION);
    this.sendSFTPPacket(SFTP_MSG.INIT, payload);
  }

  /**
   * Open file
   */
  async openFile(path: string, flags: number = SFTP_OPEN_FLAGS.READ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      
      const payload = Buffer.concat([
        PacketBuilder.buildString(path),
        PacketBuilder.buildUInt32(flags),
        PacketBuilder.buildUInt32(0) // empty attrs
      ]);

      this.once('sftpHandle', (data) => {
        if (data.id === id) {
          resolve(data.handle);
        }
      });

      this.once('sftpError', reject);
      this.sendSFTPPacket(SFTP_MSG.OPEN, payload, id);
    });
  }

  /**
   * Close file
   */
  async closeFile(handle: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      
      this.once('sftpStatus', (data) => {
        if (data.id === id) {
          resolve();
        }
      });

      this.once('sftpError', reject);
      this.sendSFTPPacket(SFTP_MSG.CLOSE, handle, id);
    });
  }

  /**
   * Read file data
   */
  async readFile(handle: Buffer, offset: number, length: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      
      const payload = Buffer.concat([
        handle,
        PacketBuilder.buildUInt32(0), // offset high
        PacketBuilder.buildUInt32(offset), // offset low
        PacketBuilder.buildUInt32(length)
      ]);

      this.once('sftpData', (data) => {
        if (data.id === id) {
          resolve(data.data);
        }
      });

      this.once('sftpError', reject);
      this.sendSFTPPacket(SFTP_MSG.READ, payload, id);
    });
  }

  /**
   * List directory
   */
  async listDirectory(path: string): Promise<DirectoryEntry[]> {
    const handle = await this.openDirectory(path);
    const entries: DirectoryEntry[] = [];
    
    try {
      while (true) {
        try {
          const batch = await this.readDirectory(handle);
          entries.push(...batch);
        } catch (error) {
          if (error instanceof SFTPError && error.code === SFTP_STATUS.EOF) {
            break;
          }
          throw error;
        }
      }
    } finally {
      await this.closeFile(handle);
    }

    return entries;
  }

  /**
   * Open directory
   */
  private async openDirectory(path: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      
      this.once('sftpHandle', (data) => {
        if (data.id === id) {
          resolve(data.handle);
        }
      });

      this.once('sftpError', reject);
      this.sendSFTPPacket(SFTP_MSG.OPENDIR, PacketBuilder.buildString(path), id);
    });
  }

  /**
   * Read directory
   */
  private async readDirectory(handle: Buffer): Promise<DirectoryEntry[]> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      
      this.once('sftpName', (data) => {
        if (data.id === id) {
          resolve(data.entries);
        }
      });

      this.once('sftpError', reject);
      this.sendSFTPPacket(SFTP_MSG.READDIR, handle, id);
    });
  }

  /**
   * Check if SFTP is ready
   */
  isReady(): boolean {
    return this.ready;
  }
}