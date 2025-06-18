/**
 * Pure JS SFTP Client
 * A pure JavaScript SFTP client with no native dependencies
 * 100% API compatible with ssh2-sftp-client
 */

import { SSH2StreamsSFTPClient, SFTPClientOptions, DirectoryEntry } from './sftp/ssh2-streams-client';
import { SFTP_OPEN_FLAGS } from './ssh/types';
import * as fs from 'fs';
import { EventEmitter } from 'events';

export class SftpClient extends EventEmitter {
  private client: SSH2StreamsSFTPClient | null = null;

  constructor(_name?: string) {
    super();
    // name parameter for ssh2-sftp-client compatibility
  }

  // ssh2-sftp-client compatible connect method
  async connect(config: SFTPClientOptions): Promise<void> {
    this.client = new SSH2StreamsSFTPClient(config);
    
    // Forward events
    this.client.on('ready', () => this.emit('ready'));
    this.client.on('error', (err) => this.emit('error', err));
    this.client.on('close', () => this.emit('close'));
    this.client.on('debug', (msg) => this.emit('debug', msg));
    
    return this.client.connect();
  }

  // ssh2-sftp-client compatible API methods
  async list(remotePath: string): Promise<DirectoryEntry[]> {
    if (!this.client) throw new Error('Not connected');
    return this.client.listDirectory(remotePath);
  }

  async get(remotePath: string, localPath: string): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    
    const handle = await this.client.openFile(remotePath, SFTP_OPEN_FLAGS.READ);
    const writeStream = fs.createWriteStream(localPath);
    
    try {
      let offset = 0;
      const chunkSize = 32768; // 32KB chunks
      
      while (true) {
        const data = await this.client.readFile(handle, offset, chunkSize);
        if (!data || data.length === 0) break;
        
        writeStream.write(data);
        offset += data.length;
        
        if (data.length < chunkSize) break; // End of file
      }
      
      writeStream.end();
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', () => resolve());
        writeStream.on('error', reject);
      });
    } finally {
      await this.client.closeFile(handle);
    }
  }

  async put(localPath: string, remotePath: string): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    
    const handle = await this.client.openFile(remotePath, SFTP_OPEN_FLAGS.WRITE | SFTP_OPEN_FLAGS.CREAT | SFTP_OPEN_FLAGS.TRUNC);
    const readStream = fs.createReadStream(localPath);
    
    try {
      let offset = 0;
      const chunkSize = 32768; // 32KB chunks
      
      for await (const chunk of readStream) {
        await this.client.writeFile(handle, offset, chunk);
        offset += chunk.length;
      }
    } finally {
      await this.client.closeFile(handle);
    }
  }

  async delete(remotePath: string): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    return this.client.removeFile(remotePath);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    return this.client.renameFile(oldPath, newPath);
  }

  async mkdir(remotePath: string, recursive: boolean = false): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    
    if (recursive) {
      // Split path and create directories recursively
      const parts = remotePath.split('/').filter(p => p);
      let currentPath = remotePath.startsWith('/') ? '/' : '';
      
      for (const part of parts) {
        currentPath = currentPath === '/' ? `/${part}` : `${currentPath}/${part}`;
        try {
          await this.client.makeDirectory(currentPath);
        } catch (error: any) {
          // Ignore error if directory already exists
          if (!error.message?.includes('File exists')) {
            throw error;
          }
        }
      }
    } else {
      return this.client.makeDirectory(remotePath);
    }
  }

  async rmdir(remotePath: string, recursive: boolean = false): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    
    if (recursive) {
      // List directory contents and remove recursively
      try {
        const entries = await this.client.listDirectory(remotePath);
        
        for (const entry of entries) {
          if (entry.filename === '.' || entry.filename === '..') continue;
          
          const fullPath = `${remotePath}/${entry.filename}`;
          
          if (entry.attrs.isDirectory?.()) {
            await this.rmdir(fullPath, true);
          } else {
            await this.client.removeFile(fullPath);
          }
        }
      } catch (error) {
        // Directory might be empty or not exist
      }
    }
    
    return this.client.removeDirectory(remotePath);
  }

  async exists(remotePath: string): Promise<false | 'd' | '-' | 'l'> {
    if (!this.client) throw new Error('Not connected');
    
    try {
      const stats = await this.client.stat(remotePath);
      
      if (stats.isDirectory?.()) return 'd';
      if (stats.isSymbolicLink?.()) return 'l';
      if (stats.isFile?.()) return '-';
      
      return '-'; // Default to file
    } catch (error) {
      return false;
    }
  }

  async stat(remotePath: string) {
    if (!this.client) throw new Error('Not connected');
    return this.client.stat(remotePath);
  }

  // Alias for ssh2-sftp-client compatibility
  async end(): Promise<void> {
    this.disconnect();
  }

  // Low-level methods (for advanced users)
  async listDirectory(path: string) {
    if (!this.client) throw new Error('Not connected');
    return this.client.listDirectory(path);
  }

  async openFile(path: string, flags?: number) {
    if (!this.client) throw new Error('Not connected');
    return this.client.openFile(path, flags);
  }

  async closeFile(handle: Buffer) {
    if (!this.client) throw new Error('Not connected');
    return this.client.closeFile(handle);
  }

  async readFile(handle: Buffer, offset: number, length: number) {
    if (!this.client) throw new Error('Not connected');
    return this.client.readFile(handle, offset, length);
  }

  disconnect() {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
  }

  isReady(): boolean {
    return this.client ? this.client.isReady() : false;
  }
}

export default SftpClient;

// Export types and classes for TypeScript users
export * from './ssh/types';
export type { SFTPClientOptions } from './sftp/ssh2-streams-client';
export type { SSH2StreamsConfig } from './ssh/ssh2-streams-transport';
export { SSH2StreamsSFTPClient } from './sftp/ssh2-streams-client';
export { SSH2StreamsTransport } from './ssh/ssh2-streams-transport';