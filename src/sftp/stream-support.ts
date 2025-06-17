/**
 * SFTP Stream Support
 */

import { Readable, Writable } from 'stream';
import { SFTPClient } from './sftp-client';
import { SFTP_OPEN_FLAGS } from '../ssh/constants';

export class SFTPReadStream extends Readable {
  private sftpClient: SFTPClient;
  private remotePath: string;
  private handle: Buffer | null = null;
  private position: number = 0;
  private chunkSize: number;

  constructor(sftpClient: SFTPClient, remotePath: string, options: any = {}) {
    super(options);
    this.sftpClient = sftpClient;
    this.remotePath = remotePath;
    this.chunkSize = options.chunkSize || 32768;
  }

  async _read(): Promise<void> {
    try {
      if (!this.handle) {
        this.handle = await this.sftpClient.openFile(this.remotePath, SFTP_OPEN_FLAGS.READ);
      }

      const data = await this.sftpClient.readFile(this.handle, this.position, this.chunkSize);
      
      if (data.length === 0) {
        // EOF
        if (this.handle) {
          await this.sftpClient.closeFile(this.handle);
          this.handle = null;
        }
        this.push(null);
      } else {
        this.position += data.length;
        this.push(data);
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  async _destroy(): Promise<void> {
    if (this.handle) {
      try {
        await this.sftpClient.closeFile(this.handle);
      } catch (error) {
        // Ignore cleanup errors
      }
      this.handle = null;
    }
  }
}

export class SFTPWriteStream extends Writable {
  private sftpClient: SFTPClient;
  private remotePath: string;
  private handle: Buffer | null = null;
  private position: number = 0;

  constructor(sftpClient: SFTPClient, remotePath: string, options: any = {}) {
    super(options);
    this.sftpClient = sftpClient;
    this.remotePath = remotePath;
  }

  async _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): Promise<void> {
    try {
      if (!this.handle) {
        this.handle = await this.sftpClient.openFile(
          this.remotePath, 
          SFTP_OPEN_FLAGS.WRITE | SFTP_OPEN_FLAGS.CREAT | SFTP_OPEN_FLAGS.TRUNC
        );
      }

      // For now, just accumulate position - actual write implementation needed
      this.position += chunk.length;
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }

  async _final(callback: (error?: Error | null) => void): Promise<void> {
    if (this.handle) {
      try {
        await this.sftpClient.closeFile(this.handle);
        this.handle = null;
      } catch (error) {
        callback(error as Error);
        return;
      }
    }
    callback();
  }

  async _destroy(): Promise<void> {
    if (this.handle) {
      try {
        await this.sftpClient.closeFile(this.handle);
      } catch (error) {
        // Ignore cleanup errors
      }
      this.handle = null;
    }
  }
}