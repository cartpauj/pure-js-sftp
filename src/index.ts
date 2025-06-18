/**
 * Pure JS SFTP Client
 * A pure JavaScript SFTP client with no native dependencies
 */

import { SSH2StreamsSFTPClient, SFTPClientOptions } from './sftp/ssh2-streams-client';

export class SftpClient {
  private client: SSH2StreamsSFTPClient | null = null;

  constructor(_name?: string) {
    // name parameter for ssh2-sftp-client compatibility
  }

  // ssh2-sftp-client compatible connect method
  async connect(config: SFTPClientOptions): Promise<void> {
    this.client = new SSH2StreamsSFTPClient(config);
    
    // Forward events
    this.client.on('ready', () => this.emit?.('ready'));
    this.client.on('error', (err) => this.emit?.('error', err));
    this.client.on('close', () => this.emit?.('close'));
    this.client.on('debug', (msg) => this.emit?.('debug', msg));
    
    return this.client.connect();
  }

  // Delegate methods to the client
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

  async stat(path: string) {
    if (!this.client) throw new Error('Not connected');
    return this.client.stat(path);
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

  // Event emitter support
  private emit?: (event: string, ...args: any[]) => boolean;
  on?: (event: string, listener: (...args: any[]) => void) => this;
  once?: (event: string, listener: (...args: any[]) => void) => this;
}

export default SftpClient;

// Export types and classes for TypeScript users
export * from './ssh/types';
export type { SFTPClientOptions } from './sftp/ssh2-streams-client';
export type { SSH2StreamsConfig } from './ssh/ssh2-streams-transport';
export { SSH2StreamsSFTPClient } from './sftp/ssh2-streams-client';
export { SSH2StreamsTransport } from './ssh/ssh2-streams-transport';