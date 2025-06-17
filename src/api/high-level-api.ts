/**
 * High-level API implementation (ssh2-sftp-client compatible)
 */

import { SSHClient } from '../client/ssh-client';
import { FileOperations } from '../sftp/file-operations';
import { BulkOperations } from '../sftp/bulk-operations';
import { SFTPReadStream, SFTPWriteStream } from '../sftp/stream-support';
import { SSHConfig, FileInfo, FileStats } from '../ssh/types';

export class HighLevelAPI {
  private sshClient: SSHClient | null = null;
  private fileOps: FileOperations | null = null;
  private bulkOps: BulkOperations | null = null;
  private sftpClient: any = null;

  constructor() {
    // Initialize when needed
  }

  /**
   * Connect to SFTP server
   */
  async connect(config: SSHConfig): Promise<any> {
    this.sshClient = new SSHClient(config);
    
    return new Promise((resolve, reject) => {
      this.sshClient!.once('ready', async () => {
        try {
          this.sftpClient = await this.sshClient!.sftp();
          this.fileOps = new FileOperations(this.sftpClient);
          this.bulkOps = new BulkOperations(this.sftpClient);
          resolve(this.sftpClient);
        } catch (error) {
          reject(error);
        }
      });

      this.sshClient!.once('error', reject);
      this.sshClient!.connect().catch(reject);
    });
  }

  /**
   * End connection
   */
  async end(): Promise<void> {
    if (this.sshClient) {
      this.sshClient.end();
    }
  }

  /**
   * List directory contents
   */
  async list(remotePath: string, filter?: RegExp | ((item: FileInfo) => boolean)): Promise<FileInfo[]> {
    if (!this.fileOps) throw new Error('Not connected');
    
    // TODO: Implement list via fileOps
    const items: FileInfo[] = [];
    
    if (!filter) return items;
    
    if (filter instanceof RegExp) {
      return items.filter(item => filter.test(item.name));
    } else {
      return items.filter(filter);
    }
  }

  /**
   * Check if file/directory exists
   */
  async exists(remotePath: string): Promise<boolean | string> {
    try {
      const stats = await this.stat(remotePath);
      if (stats.isDirectory()) return 'd';
      if (stats.isSymbolicLink()) return 'l';
      return '-';
    } catch {
      return false;
    }
  }

  /**
   * Get file statistics
   */
  async stat(remotePath: string): Promise<FileStats> {
    if (!this.fileOps) throw new Error('Not connected');
    
    const attrs = await this.fileOps.stat(remotePath);
    const mode = attrs.permissions || 0;
    
    return {
      mode,
      uid: attrs.uid || 0,
      gid: attrs.gid || 0,
      size: attrs.size || 0,
      atime: new Date((attrs.atime || 0) * 1000),
      mtime: new Date((attrs.mtime || 0) * 1000),
      isFile: () => (mode & 0o170000) === 0o100000,
      isDirectory: () => (mode & 0o170000) === 0o040000,
      isBlockDevice: () => (mode & 0o170000) === 0o060000,
      isCharacterDevice: () => (mode & 0o170000) === 0o020000,
      isSymbolicLink: () => (mode & 0o170000) === 0o120000,
      isFIFO: () => (mode & 0o170000) === 0o010000,
      isSocket: () => (mode & 0o170000) === 0o140000
    };
  }

  /**
   * Download file
   */
  async get(remotePath: string, localPath?: string, options?: any): Promise<string | Buffer> {
    if (!this.fileOps) throw new Error('Not connected');
    return this.fileOps.get(remotePath, localPath);
  }

  /**
   * Fast download (optimized)
   */
  async fastGet(remotePath: string, localPath: string, options?: any): Promise<string> {
    const result = await this.get(remotePath, localPath, options);
    return typeof result === 'string' ? result : localPath;
  }

  /**
   * Upload file
   */
  async put(source: string | Buffer, remotePath: string, options?: any): Promise<string> {
    if (!this.fileOps) throw new Error('Not connected');
    
    if (typeof source === 'string') {
      return this.fileOps.put(source, remotePath);
    } else {
      // Handle Buffer upload
      throw new Error('Buffer upload not implemented yet');
    }
  }

  /**
   * Fast upload (optimized)
   */
  async fastPut(localPath: string, remotePath: string, options?: any): Promise<string> {
    return this.put(localPath, remotePath, options);
  }

  /**
   * Append to file
   */
  async append(input: string | Buffer, remotePath: string, options?: any): Promise<string> {
    throw new Error('Append not implemented yet');
  }

  /**
   * Delete file
   */
  async delete(remotePath: string, noErrorOK?: boolean): Promise<string> {
    if (!this.fileOps) throw new Error('Not connected');
    
    try {
      await this.fileOps.remove(remotePath);
      return remotePath;
    } catch (error) {
      if (noErrorOK) return remotePath;
      throw error;
    }
  }

  /**
   * Rename file
   */
  async rename(fromPath: string, toPath: string): Promise<string> {
    if (!this.fileOps) throw new Error('Not connected');
    await this.fileOps.rename(fromPath, toPath);
    return toPath;
  }

  /**
   * POSIX rename (overwrite destination)
   */
  async posixRename(fromPath: string, toPath: string): Promise<string> {
    // For now, same as regular rename
    return this.rename(fromPath, toPath);
  }

  /**
   * Change file permissions
   */
  async chmod(remotePath: string, mode: number): Promise<string> {
    throw new Error('chmod not implemented yet');
  }

  /**
   * Create directory
   */
  async mkdir(remotePath: string, recursive?: boolean): Promise<string> {
    if (!this.fileOps) throw new Error('Not connected');
    
    if (recursive) {
      // Create parent directories recursively
      const parts = remotePath.split('/').filter(p => p);
      let currentPath = remotePath.startsWith('/') ? '/' : '';
      
      for (const part of parts) {
        currentPath += (currentPath.endsWith('/') ? '' : '/') + part;
        try {
          await this.fileOps.mkdir(currentPath);
        } catch (error) {
          // Ignore if directory already exists
          const exists = await this.exists(currentPath);
          if (exists !== 'd') throw error;
        }
      }
    } else {
      await this.fileOps.mkdir(remotePath);
    }
    
    return remotePath;
  }

  /**
   * Remove directory
   */
  async rmdir(remotePath: string, recursive?: boolean): Promise<string> {
    if (!this.fileOps) throw new Error('Not connected');
    
    if (recursive) {
      // Remove contents recursively
      const items = await this.list(remotePath);
      for (const item of items) {
        if (item.name === '.' || item.name === '..') continue;
        
        const fullPath = remotePath + '/' + item.name;
        if (item.type === 'd') {
          await this.rmdir(fullPath, true);
        } else {
          await this.delete(fullPath);
        }
      }
    }
    
    await this.fileOps.rmdir(remotePath);
    return remotePath;
  }

  /**
   * Upload entire directory
   */
  async uploadDir(srcDir: string, dstDir: string, options?: any): Promise<string> {
    if (!this.bulkOps) throw new Error('Not connected');
    return this.bulkOps.uploadDir(srcDir, dstDir, options);
  }

  /**
   * Download entire directory
   */
  async downloadDir(srcDir: string, dstDir: string, options?: any): Promise<string> {
    if (!this.bulkOps) throw new Error('Not connected');
    return this.bulkOps.downloadDir(srcDir, dstDir, options);
  }

  /**
   * Get real path
   */
  async realPath(remotePath: string): Promise<string> {
    throw new Error('realPath not implemented yet');
  }

  /**
   * Get current working directory
   */
  async cwd(): Promise<string> {
    return await this.realPath('.');
  }

  /**
   * Remote copy
   */
  async rcopy(srcPath: string, dstPath: string): Promise<string> {
    throw new Error('rcopy not implemented yet');
  }

  /**
   * Create read stream
   */
  createReadStream(remotePath: string, options?: any): SFTPReadStream {
    if (!this.sftpClient) throw new Error('Not connected');
    return new SFTPReadStream(this.sftpClient, remotePath, options);
  }

  /**
   * Create write stream
   */
  createWriteStream(remotePath: string, options?: any): SFTPWriteStream {
    if (!this.sftpClient) throw new Error('Not connected');
    return new SFTPWriteStream(this.sftpClient, remotePath, options);
  }
}