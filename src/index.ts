/**
 * Pure JS SFTP Client
 * A pure JavaScript SFTP client with no native dependencies
 * 100% API compatible with ssh2-sftp-client
 */

import { SSH2StreamsSFTPClient, SFTPClientOptions, DirectoryEntry } from './sftp/ssh2-streams-client';
import { SFTP_OPEN_FLAGS } from './ssh/types';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';

// ssh2-sftp-client compatible types
export interface FileInfo {
  type: 'd' | '-' | 'l';  // directory, file, or symlink
  name: string;           // filename
  size: number;           // file size in bytes
  modifyTime: number;     // modification timestamp
  accessTime: number;     // access timestamp
  rights: {
    user: string;         // user permissions (e.g., "rwx")
    group: string;        // group permissions
    other: string;        // other permissions
  };
  owner: number;          // owner UID
  group: number;          // group GID
}

export type FileInfoType = 'd' | '-' | 'l';

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
  async list(remotePath: string, filter?: (fileInfo: FileInfo) => boolean): Promise<FileInfo[]> {
    if (!this.client) throw new Error('Not connected');
    const entries = await this.client.listDirectory(remotePath);
    
    // Convert DirectoryEntry[] to FileInfo[] for ssh2-sftp-client compatibility
    const fileInfos: FileInfo[] = entries.map(entry => {
      // Determine file type
      let type: FileInfoType = '-'; // default to file
      if (entry.attrs.isDirectory?.()) {
        type = 'd';
      } else if (entry.attrs.isSymbolicLink?.()) {
        type = 'l';
      }
      
      // Parse permissions from mode
      const mode = entry.attrs.permissions || 0;
      const formatPermissions = (perm: number): string => {
        const r = (perm & 4) ? 'r' : '-';
        const w = (perm & 2) ? 'w' : '-';
        const x = (perm & 1) ? 'x' : '-';
        return r + w + x;
      };
      
      const fileInfo: FileInfo = {
        type,
        name: entry.filename,
        size: entry.attrs.size || 0,
        modifyTime: entry.attrs.mtime || 0,
        accessTime: entry.attrs.atime || 0,
        rights: {
          user: formatPermissions((mode >> 6) & 7),
          group: formatPermissions((mode >> 3) & 7),
          other: formatPermissions(mode & 7)
        },
        owner: entry.attrs.uid || 0,
        group: entry.attrs.gid || 0
      };
      
      return fileInfo;
    });
    
    // Apply filter if provided
    return filter ? fileInfos.filter(filter) : fileInfos;
  }

  async get(remotePath: string, dst?: string | Writable): Promise<string | Writable | Buffer> {
    if (!this.client) throw new Error('Not connected');
    
    const handle = await this.client.openFile(remotePath, SFTP_OPEN_FLAGS.READ);
    
    try {
      // Read entire file into memory first
      const chunks: Buffer[] = [];
      let offset = 0;
      const chunkSize = 32768; // 32KB chunks
      
      while (true) {
        const data = await this.client.readFile(handle, offset, chunkSize);
        if (!data || data.length === 0) break;
        
        chunks.push(data);
        offset += data.length;
        
        if (data.length < chunkSize) break; // End of file
      }
      
      const fileBuffer = Buffer.concat(chunks);
      
      if (dst === undefined) {
        // No destination specified - return Buffer
        return fileBuffer;
      } else if (typeof dst === 'string') {
        // String destination - write to local file
        await fsPromises.writeFile(dst, fileBuffer);
        return dst;
      } else {
        // Writable stream destination
        return new Promise<Writable>((resolve, reject) => {
          dst.write(fileBuffer, (error) => {
            if (error) {
              reject(error);
            } else {
              dst.end();
              resolve(dst);
            }
          });
        });
      }
    } finally {
      await this.client.closeFile(handle);
    }
  }

  async put(input: string | Buffer | Readable, remotePath: string, options?: any): Promise<string> {
    if (!this.client) throw new Error('Not connected');
    
    const handle = await this.client.openFile(remotePath, SFTP_OPEN_FLAGS.WRITE | SFTP_OPEN_FLAGS.CREAT | SFTP_OPEN_FLAGS.TRUNC);
    
    try {
      let dataBuffer: Buffer;
      
      if (Buffer.isBuffer(input)) {
        // Input is already a Buffer
        dataBuffer = input;
      } else if (typeof input === 'string') {
        // Input is a file path - read the file
        dataBuffer = await fsPromises.readFile(input);
      } else {
        // Input is a Readable stream - collect all data
        const chunks: Buffer[] = [];
        
        await new Promise<void>((resolve, reject) => {
          input.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
          });
          
          input.on('end', () => {
            resolve();
          });
          
          input.on('error', (error) => {
            reject(error);
          });
        });
        
        dataBuffer = Buffer.concat(chunks);
      }
      
      // Write data in chunks
      let offset = 0;
      const chunkSize = 32768; // 32KB chunks
      
      while (offset < dataBuffer.length) {
        const end = Math.min(offset + chunkSize, dataBuffer.length);
        const chunk = dataBuffer.subarray(offset, end);
        
        await this.client.writeFile(handle, offset, chunk);
        offset += chunk.length;
      }
      
      return remotePath;
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
      // Normalize path and split into parts
      const normalizedPath = remotePath.replace(/\/+/g, '/'); // Remove duplicate slashes
      const parts = normalizedPath.split('/').filter(p => p);
      let currentPath = normalizedPath.startsWith('/') ? '' : '';
      
      for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : (normalizedPath.startsWith('/') ? `/${part}` : part);
        
        try {
          // Check if directory already exists first
          const stats = await this.client.stat(currentPath);
          if (stats.isDirectory?.()) {
            continue; // Directory exists, skip
          } else {
            throw new Error(`Path exists but is not a directory: ${currentPath}`);
          }
        } catch (error: any) {
          // Use SFTP status codes instead of error message parsing
          const isNotFound = error instanceof Error && error.name === 'SFTPError' && 
                           (error as any).code === 2; // SFTP_STATUS.NO_SUCH_FILE
          
          if (isNotFound || error.message?.includes('No such file') || error.message?.includes('not a directory')) {
            try {
              await this.client.makeDirectory(currentPath);
            } catch (createError: any) {
              // Only ignore if directory was created by another process
              const alreadyExists = createError instanceof Error && createError.name === 'SFTPError' && 
                                  (createError as any).code === 4; // SFTP_STATUS.FAILURE for existing dir
              
              if (!alreadyExists && !createError.message?.includes('File exists')) {
                throw new Error(`Failed to create directory ${currentPath}: ${createError.message}`);
              }
            }
          } else {
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
      // First check if directory exists and is actually a directory
      try {
        const stats = await this.client.stat(remotePath);
        if (!stats.isDirectory?.()) {
          throw new Error(`Path is not a directory: ${remotePath}`);
        }
      } catch (error: any) {
        const isNotFound = error instanceof Error && error.name === 'SFTPError' && 
                         (error as any).code === 2; // SFTP_STATUS.NO_SUCH_FILE
        
        if (isNotFound || error.message?.includes('No such file')) {
          return; // Directory doesn't exist, nothing to remove
        }
        throw error;
      }

      // List directory contents and remove recursively
      try {
        const entries = await this.client.listDirectory(remotePath);
        
        for (const entry of entries) {
          if (entry.filename === '.' || entry.filename === '..') continue;
          
          // Normalize path construction
          const fullPath = remotePath.endsWith('/') 
            ? `${remotePath}${entry.filename}` 
            : `${remotePath}/${entry.filename}`;
          
          if (entry.attrs.isDirectory?.()) {
            await this.rmdir(fullPath, true);
          } else {
            await this.client.removeFile(fullPath);
          }
        }
      } catch (error: any) {
        // If we can't list the directory, it might be empty or permission denied
        const isNotFound = error instanceof Error && error.name === 'SFTPError' && 
                         (error as any).code === 2; // SFTP_STATUS.NO_SUCH_FILE
        
        if (!isNotFound && !error.message?.includes('No such file')) {
          throw new Error(`Failed to list directory contents: ${error.message}`);
        }
      }
    }
    
    return this.client.removeDirectory(remotePath);
  }

  async exists(remotePath: string): Promise<false | FileInfoType> {
    if (!this.client) throw new Error('Not connected');
    
    try {
      const stats = await this.client.stat(remotePath);
      
      // Determine file type based on attributes
      if (stats.isDirectory?.()) {
        return 'd';
      } else if (stats.isSymbolicLink?.()) {
        return 'l';
      } else {
        return '-'; // regular file
      }
    } catch (error) {
      return false;
    }
  }

  async stat(remotePath: string) {
    if (!this.client) throw new Error('Not connected');
    return this.client.stat(remotePath);
  }

  // Fast transfer methods (optimized versions)
  async fastGet(remotePath: string, localPath: string, options?: any): Promise<string> {
    if (!this.client) throw new Error('Not connected');
    
    // For now, use regular get - can be optimized later with parallel streams
    await this.get(remotePath, localPath);
    return localPath;
  }

  async fastPut(localPath: string, remotePath: string, options?: any): Promise<string> {
    if (!this.client) throw new Error('Not connected');
    
    // For now, use regular put - can be optimized later with parallel streams
    await this.put(localPath, remotePath);
    return remotePath;
  }

  async append(input: string | Buffer, remotePath: string, options?: any): Promise<string> {
    if (!this.client) throw new Error('Not connected');
    
    const data = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
    
    // For append, we need to get current file size to know where to write
    let fileSize = 0;
    try {
      const stats = await this.client.stat(remotePath);
      fileSize = stats.size || 0;
    } catch (error: any) {
      // File doesn't exist, start at 0
      if (!(error.message?.includes('No such file') || error.message?.includes('not found'))) {
        throw error;
      }
    }
    
    const handle = await this.client.openFile(remotePath, SFTP_OPEN_FLAGS.WRITE | SFTP_OPEN_FLAGS.CREAT);
    
    try {
      // Write at end of file using actual file size
      await this.client.writeFile(handle, fileSize, data);
    } finally {
      await this.client.closeFile(handle);
    }
    
    return remotePath;
  }

  async chmod(remotePath: string, mode: string | number): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    
    const numericMode = typeof mode === 'string' ? parseInt(mode, 8) : mode;
    return this.client.setAttributes(remotePath, { permissions: numericMode });
  }

  async realPath(remotePath: string): Promise<string> {
    if (!this.client) throw new Error('Not connected');
    return this.client.realPath(remotePath);
  }

  async uploadDir(srcDir: string, dstDir: string, options?: { filter?: (path: string, isDirectory: boolean) => boolean }): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    
    // Verify source directory exists
    try {
      const srcStats = await fsPromises.stat(srcDir);
      if (!srcStats.isDirectory()) {
        throw new Error(`Source path is not a directory: ${srcDir}`);
      }
    } catch (error: any) {
      throw new Error(`Source directory not accessible: ${srcDir} - ${error.message}`);
    }
    
    // Create destination directory if it doesn't exist
    try {
      await this.mkdir(dstDir, true);
    } catch (error: any) {
      // Only ignore if directory already exists
      if (!error.message?.includes('File exists')) {
        throw new Error(`Failed to create destination directory: ${dstDir} - ${error.message}`);
      }
    }
    
    const entries = await fsPromises.readdir(srcDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(srcDir, entry.name);
      const dstPath = `${dstDir}/${entry.name}`;
      
      // Apply filter if provided
      if (options?.filter && !options.filter(srcPath, entry.isDirectory())) {
        continue;
      }
      
      try {
        if (entry.isDirectory()) {
          await this.uploadDir(srcPath, dstPath, options);
        } else {
          await this.put(srcPath, dstPath);
        }
      } catch (error: any) {
        throw new Error(`Failed to upload ${srcPath}: ${error.message}`);
      }
    }
  }

  async downloadDir(srcDir: string, dstDir: string, options?: { filter?: (path: string, isDirectory: boolean) => boolean }): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    
    // Verify source directory exists on remote
    try {
      const srcStats = await this.client.stat(srcDir);
      if (!srcStats.isDirectory?.()) {
        throw new Error(`Remote path is not a directory: ${srcDir}`);
      }
    } catch (error: any) {
      throw new Error(`Remote directory not accessible: ${srcDir} - ${error.message}`);
    }
    
    // Create local destination directory if it doesn't exist
    try {
      await fsPromises.mkdir(dstDir, { recursive: true });
    } catch (error: any) {
      throw new Error(`Failed to create local directory: ${dstDir} - ${error.message}`);
    }
    
    const entries = await this.client.listDirectory(srcDir);
    
    for (const entry of entries) {
      if (entry.filename === '.' || entry.filename === '..') continue;
      
      const srcPath = `${srcDir}/${entry.filename}`;
      const dstPath = path.join(dstDir, entry.filename);
      
      // Apply filter if provided
      if (options?.filter && !options.filter(srcPath, entry.attrs.isDirectory?.() || false)) {
        continue;
      }
      
      try {
        if (entry.attrs.isDirectory?.()) {
          await this.downloadDir(srcPath, dstPath, options);
        } else {
          await this.get(srcPath, dstPath);
        }
      } catch (error: any) {
        throw new Error(`Failed to download ${srcPath}: ${error.message}`);
      }
    }
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