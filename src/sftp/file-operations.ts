/**
 * SFTP File Operations Implementation
 */

import { SFTPClient } from './sftp-client';
import { SFTP_OPEN_FLAGS, SFTP_ATTR } from '../ssh/constants';
import { PacketBuilder } from '../ssh/packet';
import { createReadStream, createWriteStream, promises as fs } from 'fs';
import { Readable, Writable } from 'stream';

export class FileOperations {
  private sftpClient: SFTPClient;

  constructor(sftpClient: SFTPClient) {
    this.sftpClient = sftpClient;
  }

  /**
   * Download file from remote to local
   */
  async get(remotePath: string, localPath?: string): Promise<string | Buffer> {
    const handle = await this.sftpClient.openFile(remotePath, SFTP_OPEN_FLAGS.READ);
    
    try {
      // Get file size first
      const attrs = await this.stat(remotePath);
      const fileSize = attrs.size || 0;
      
      const chunks: Buffer[] = [];
      let offset = 0;
      const chunkSize = 32768; // 32KB chunks
      
      while (offset < fileSize) {
        const readSize = Math.min(chunkSize, fileSize - offset);
        const data = await this.sftpClient.readFile(handle, offset, readSize);
        chunks.push(data);
        offset += data.length;
        
        if (data.length === 0) break; // EOF
      }
      
      const fileData = Buffer.concat(chunks);
      
      if (localPath) {
        await fs.writeFile(localPath, fileData);
        return localPath;
      } else {
        return fileData;
      }
    } finally {
      await this.sftpClient.closeFile(handle);
    }
  }

  /**
   * Upload file from local to remote
   */
  async put(localPath: string, remotePath: string): Promise<string> {
    const fileData = await fs.readFile(localPath);
    const handle = await this.sftpClient.openFile(
      remotePath, 
      SFTP_OPEN_FLAGS.WRITE | SFTP_OPEN_FLAGS.CREAT | SFTP_OPEN_FLAGS.TRUNC
    );
    
    try {
      let offset = 0;
      const chunkSize = 32768; // 32KB chunks
      
      while (offset < fileData.length) {
        const chunk = fileData.subarray(offset, offset + chunkSize);
        await this.writeFile(handle, offset, chunk);
        offset += chunk.length;
      }
      
      return remotePath;
    } finally {
      await this.sftpClient.closeFile(handle);
    }
  }

  /**
   * Write data to file handle
   */
  private async writeFile(handle: Buffer, offset: number, data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = Math.floor(Math.random() * 0xFFFFFFFF);
      
      const payload = Buffer.concat([
        handle,
        PacketBuilder.buildUInt32(0), // offset high
        PacketBuilder.buildUInt32(offset), // offset low
        PacketBuilder.buildBytes(data)
      ]);

      this.sftpClient.once('sftpStatus', (statusData) => {
        if (statusData.id === id) {
          resolve();
        }
      });

      this.sftpClient.once('sftpError', reject);
      // this.sftpClient.sendSFTPPacket(SFTP_MSG.WRITE, payload, id);
    });
  }

  /**
   * Get file statistics
   */
  async stat(remotePath: string): Promise<{ size?: number; permissions?: number; uid?: number; gid?: number; atime?: number; mtime?: number }> {
    return new Promise((resolve, reject) => {
      const id = Math.floor(Math.random() * 0xFFFFFFFF);
      
      this.sftpClient.once('sftpAttrs', (data) => {
        if (data.id === id) {
          resolve(data.attrs);
        }
      });

      this.sftpClient.once('sftpError', reject);
      // this.sftpClient.sendSFTPPacket(SFTP_MSG.STAT, PacketBuilder.buildString(remotePath), id);
    });
  }

  /**
   * Delete file
   */
  async remove(remotePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = Math.floor(Math.random() * 0xFFFFFFFF);
      
      this.sftpClient.once('sftpStatus', (data) => {
        if (data.id === id) {
          resolve();
        }
      });

      this.sftpClient.once('sftpError', reject);
      // this.sftpClient.sendSFTPPacket(SFTP_MSG.REMOVE, PacketBuilder.buildString(remotePath), id);
    });
  }

  /**
   * Rename/move file
   */
  async rename(oldPath: string, newPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = Math.floor(Math.random() * 0xFFFFFFFF);
      
      const payload = Buffer.concat([
        PacketBuilder.buildString(oldPath),
        PacketBuilder.buildString(newPath)
      ]);

      this.sftpClient.once('sftpStatus', (data) => {
        if (data.id === id) {
          resolve();
        }
      });

      this.sftpClient.once('sftpError', reject);
      // this.sftpClient.sendSFTPPacket(SFTP_MSG.RENAME, payload, id);
    });
  }

  /**
   * Create directory
   */
  async mkdir(remotePath: string, attrs?: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = Math.floor(Math.random() * 0xFFFFFFFF);
      
      const payload = Buffer.concat([
        PacketBuilder.buildString(remotePath),
        this.buildAttrs(attrs || {})
      ]);

      this.sftpClient.once('sftpStatus', (data) => {
        if (data.id === id) {
          resolve();
        }
      });

      this.sftpClient.once('sftpError', reject);
      // this.sftpClient.sendSFTPPacket(SFTP_MSG.MKDIR, payload, id);
    });
  }

  /**
   * Remove directory
   */
  async rmdir(remotePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = Math.floor(Math.random() * 0xFFFFFFFF);
      
      this.sftpClient.once('sftpStatus', (data) => {
        if (data.id === id) {
          resolve();
        }
      });

      this.sftpClient.once('sftpError', reject);
      // this.sftpClient.sendSFTPPacket(SFTP_MSG.RMDIR, PacketBuilder.buildString(remotePath), id);
    });
  }

  /**
   * Build file attributes for SFTP
   */
  private buildAttrs(attrs: any): Buffer {
    let flags = 0;
    const parts: Buffer[] = [];

    if ('size' in attrs) {
      flags |= SFTP_ATTR.SIZE;
      parts.push(PacketBuilder.buildUInt32(attrs.size));
    }

    if ('uid' in attrs && 'gid' in attrs) {
      flags |= SFTP_ATTR.UIDGID;
      parts.push(PacketBuilder.buildUInt32(attrs.uid));
      parts.push(PacketBuilder.buildUInt32(attrs.gid));
    }

    if ('permissions' in attrs) {
      flags |= SFTP_ATTR.PERMISSIONS;
      parts.push(PacketBuilder.buildUInt32(attrs.permissions));
    }

    if ('atime' in attrs && 'mtime' in attrs) {
      flags |= SFTP_ATTR.ACMODTIME;
      parts.push(PacketBuilder.buildUInt32(attrs.atime));
      parts.push(PacketBuilder.buildUInt32(attrs.mtime));
    }

    return Buffer.concat([
      PacketBuilder.buildUInt32(flags),
      ...parts
    ]);
  }

  /**
   * Create readable stream for remote file
   */
  createReadStream(remotePath: string, options: any = {}): Readable {
    // TODO: Implement SFTP read stream
    throw new Error('Read streams not implemented yet');
  }

  /**
   * Create writable stream for remote file
   */
  createWriteStream(remotePath: string, options: any = {}): Writable {
    // TODO: Implement SFTP write stream
    throw new Error('Write streams not implemented yet');
  }
}