/**
 * Bulk SFTP Operations (uploadDir, downloadDir)
 */

import { promises as fs } from 'fs';
import { join, relative, dirname } from 'path';
import { SFTPClient } from './sftp-client';
import { FileOperations } from './file-operations';

export class BulkOperations {
  private sftpClient: SFTPClient;
  private fileOps: FileOperations;
  private concurrency: number;

  constructor(sftpClient: SFTPClient, options: { concurrency?: number } = {}) {
    this.sftpClient = sftpClient;
    this.fileOps = new FileOperations(sftpClient);
    this.concurrency = options.concurrency || 4;
  }

  /**
   * Upload entire directory recursively
   */
  async uploadDir(
    localDir: string, 
    remoteDir: string, 
    options: { filter?: (path: string) => boolean; progress?: (transferred: number, total: number) => void } = {}
  ): Promise<string> {
    // Collect all files to upload
    const filesToUpload = await this.collectLocalFiles(localDir, options.filter);
    
    let transferred = 0;
    const total = filesToUpload.length;

    // Create remote directories first
    const remoteDirs = new Set<string>();
    for (const file of filesToUpload) {
      const relativePath = relative(localDir, file);
      const remoteFilePath = this.joinPaths(remoteDir, relativePath);
      const remoteFileDir = dirname(remoteFilePath);
      remoteDirs.add(remoteFileDir);
    }

    // Create directories in order
    const sortedDirs = Array.from(remoteDirs).sort();
    for (const dir of sortedDirs) {
      try {
        await this.fileOps.mkdir(dir);
      } catch (error) {
        // Directory might already exist, check if it's actually a directory
        try {
          const stats = await this.fileOps.stat(dir);
          if (!(stats.permissions && (stats.permissions & 0o040000))) {
            throw new Error(`${dir} exists but is not a directory`);
          }
        } catch {
          throw error;
        }
      }
    }

    // Upload files with limited concurrency
    await this.processConcurrently(filesToUpload, this.concurrency, async (localFile) => {
      const relativePath = relative(localDir, localFile);
      const remoteFilePath = this.joinPaths(remoteDir, relativePath);
      
      await this.fileOps.put(localFile, remoteFilePath);
      transferred++;
      
      if (options.progress) {
        options.progress(transferred, total);
      }
    });

    return remoteDir;
  }

  /**
   * Download entire directory recursively
   */
  async downloadDir(
    remoteDir: string,
    localDir: string,
    options: { filter?: (path: string) => boolean; progress?: (transferred: number, total: number) => void } = {}
  ): Promise<string> {
    // Collect all remote files
    const filesToDownload = await this.collectRemoteFiles(remoteDir, options.filter);
    
    let transferred = 0;
    const total = filesToDownload.length;

    // Create local directories first
    const localDirs = new Set<string>();
    for (const remoteFile of filesToDownload) {
      const relativePath = relative(remoteDir, remoteFile);
      const localFilePath = join(localDir, relativePath);
      const localFileDir = dirname(localFilePath);
      localDirs.add(localFileDir);
    }

    // Create local directories
    for (const dir of localDirs) {
      await fs.mkdir(dir, { recursive: true });
    }

    // Download files with limited concurrency
    await this.processConcurrently(filesToDownload, this.concurrency, async (remoteFile) => {
      const relativePath = relative(remoteDir, remoteFile);
      const localFilePath = join(localDir, relativePath);
      
      await this.fileOps.get(remoteFile, localFilePath);
      transferred++;
      
      if (options.progress) {
        options.progress(transferred, total);
      }
    });

    return localDir;
  }

  /**
   * Collect all files in local directory recursively
   */
  private async collectLocalFiles(dir: string, filter?: (path: string) => boolean): Promise<string[]> {
    const files: string[] = [];
    
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (filter && !filter(fullPath)) {
        continue;
      }
      
      if (entry.isDirectory()) {
        const subFiles = await this.collectLocalFiles(fullPath, filter);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  /**
   * Collect all files in remote directory recursively
   */
  private async collectRemoteFiles(dir: string, filter?: (path: string) => boolean): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await this.sftpClient.listDirectory(dir);
      
      for (const entry of entries) {
        if (entry.filename === '.' || entry.filename === '..') {
          continue;
        }
        
        const fullPath = this.joinPaths(dir, entry.filename);
        
        if (filter && !filter(fullPath)) {
          continue;
        }
        
        const isDirectory = (entry.attrs.permissions || 0) & 0o040000;
        
        if (isDirectory) {
          const subFiles = await this.collectRemoteFiles(fullPath, filter);
          files.push(...subFiles);
        } else {
          files.push(fullPath);
        }
      }
    } catch (error) {
      throw new Error(`Failed to list remote directory ${dir}: ${error}`);
    }
    
    return files;
  }

  /**
   * Process items with limited concurrency
   */
  private async processConcurrently<T>(
    items: T[],
    concurrency: number,
    processor: (item: T) => Promise<void>
  ): Promise<void> {
    const semaphore = new Array(concurrency).fill(null);
    
    await Promise.all(
      semaphore.map(async () => {
        while (items.length > 0) {
          const item = items.shift();
          if (item) {
            await processor(item);
          }
        }
      })
    );
  }

  /**
   * Join paths using forward slashes (Unix-style)
   */
  private joinPaths(...parts: string[]): string {
    return parts
      .map(part => part.replace(/\/+$/, '')) // Remove trailing slashes
      .join('/')
      .replace(/\/+/g, '/'); // Normalize multiple slashes
  }
}