/**
 * Pure JS SFTP Client
 * A pure JavaScript SFTP client with no native dependencies
 * 100% API compatible with ssh2-sftp-client
 */

import { SSH2StreamsSFTPClient, SFTPClientOptions, DirectoryEntry } from './sftp/ssh2-streams-client';
import { SFTP_OPEN_FLAGS, SFTP_STATUS, SFTPError } from './ssh/types';
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

// Operation tracking interfaces
export interface ActiveOperation {
  id: string;
  type: 'upload' | 'download' | 'list' | 'delete' | 'rename' | 'mkdir' | 'rmdir' | 'chmod' | 'stat' | 'other';
  localPath?: string;
  remotePath?: string;
  startTime: number;
  bytesTransferred?: number;
  totalBytes?: number;
}

export interface ConcurrencyOptions {
  maxConcurrentOps?: number;  // Maximum concurrent operations (default: 10)
  queueOnLimit?: boolean;     // Queue operations when limit reached (default: false)
}

// Health check and connection monitoring event types
export interface KeepaliveEvent {
  type: 'ping';
  success: boolean;
  missed?: number;
}

export interface HealthCheckEvent {
  type: 'ping' | 'realpath';
  success: boolean;
  healthy: boolean;
  error?: Error;
}

export interface ReconnectAttemptEvent {
  attempt: number;
  maxAttempts: number;
  delay: number;
}

export interface ReconnectSuccessEvent {
  attempts: number;
}

export interface ReconnectErrorEvent {
  attempt: number;
  error: Error;
}

export interface ReconnectFailedEvent {
  attempts: number;
  maxAttempts: number;
  lastError?: string;
}

export interface AutoReconnectEvent {
  reason: 'operation_limit' | 'timeout_recovery';
  operations: number;
  bytesTransferred: number;
}

// Enhanced event system for VSCode extensions and detailed operation tracking
export interface EnhancedOperationEvent {
  type: 'upload' | 'download' | 'list' | 'stat' | 'delete' | 'rename' | 'mkdir' | 'rmdir' | 'chmod';
  operation_id: string;
  remotePath: string;
  localPath?: string;
  totalBytes?: number;
  bytesTransferred?: number;
  percentage?: number;
  fileName?: string;
  startTime: number;
  chunkSize?: number;
  concurrency?: number;
  duration?: number;
  error?: Error;
  isRetryable?: boolean;
}

export interface ConnectionStateEvent {
  host?: string;
  port?: number;
  username?: string;
  authType?: 'password' | 'key';
  serverInfo?: any;
  capabilities?: any;
  error?: Error;
  phase?: 'connect' | 'auth' | 'ready';
}

export interface PerformanceMetricsEvent {
  throughput: number; // MB/s
  avgChunkTime: number; // ms
  concurrencyUtilization: number; // 0-1
  windowUtilization: number; // 0-1
  operation_id?: string;
}

export interface AdaptiveChangeEvent {
  reason: 'chunk_size_increased' | 'chunk_size_decreased' | 'concurrency_reduced' | 'concurrency_increased' | 'server_limit_detected';
  oldValue: number;
  newValue: number;
  parameter: 'chunkSize' | 'concurrency' | 'timeout';
  operation_id?: string;
}

export interface OperationRetryEvent {
  operation_id: string;
  attempt: number;
  maxAttempts: number;
  reason: 'timeout' | 'connection_lost' | 'server_error' | 'network_error';
  delay: number; // ms until retry
  error?: Error;
}

export interface ServerLimitEvent {
  limitType: 'max_operations' | 'rate_limit' | 'concurrent_limit';
  detectedLimit: number;
  adaptiveAction: 'reducing_concurrency' | 'reconnecting' | 'throttling';
  operation_id?: string;
}

export interface BatchOperationEvent {
  batchId: string;
  operationCount: number;
  totalBytes: number;
  completedOperations?: number;
  operations?: string[]; // operation_ids
}

export interface EventOptions {
  enableProgressEvents: boolean;
  enablePerformanceEvents: boolean;
  enableAdaptiveEvents: boolean;
  progressThrottle: number; // ms between progress events
  maxEventHistory: number; // max events to keep in memory
  debugMode: boolean;
}

export type ErrorCategory = 'network' | 'authentication' | 'permission' | 'server' | 'timeout' | 'filesystem' | 'protocol';

export interface ClassifiedError extends Error {
  category: ErrorCategory;
  isUserActionable: boolean;
  suggestedAction: 'retry' | 'check_permissions' | 'reconnect' | 'check_network' | 'contact_admin';
  isRetryable: boolean;
}

export class SftpClient extends EventEmitter {
  private client: SSH2StreamsSFTPClient | null = null;
  private config: SFTPClientOptions | null = null;
  private activeOperations = new Map<string, ActiveOperation>();
  private operationCounter = 0;
  private concurrencyOptions: ConcurrencyOptions = {
    maxConcurrentOps: 10,
    queueOnLimit: false
  };
  private operationQueue: Array<() => Promise<any>> = [];
  private processingQueue = false;

  // Enhanced event system
  private eventOptions: EventOptions = {
    enableProgressEvents: true,
    enablePerformanceEvents: false,
    enableAdaptiveEvents: true,
    progressThrottle: 100, // 100ms between progress events
    maxEventHistory: 1000,
    debugMode: false
  };
  private operationIdCounter = 0;
  private batchIdCounter = 0;
  private eventHistory: Array<{ timestamp: number; event: string; data: any }> = [];
  private lastProgressEmit = new Map<string, number>(); // operation_id -> timestamp
  private performanceMetrics = {
    totalOperations: 0,
    totalBytes: 0,
    totalDuration: 0,
    avgThroughput: 0,
    currentConcurrency: 0,
    maxConcurrency: 0
  };

  constructor(_name?: string, concurrencyOptions?: ConcurrencyOptions) {
    super();
    // name parameter for ssh2-sftp-client compatibility
    if (concurrencyOptions) {
      this.concurrencyOptions = { ...this.concurrencyOptions, ...concurrencyOptions };
    }
    
    // Debug logging for SFTP operations
    this.on('debug', (msg) => {
      try {
        const fs = require('fs');
        const debugMsg = `${new Date().toISOString()} - ${msg}\\n`;
        fs.appendFileSync('/tmp/pure-js-sftp-debug.log', debugMsg);
      } catch (e) { /* ignore */ }
    });

    // Operation lifecycle events
    this.on('operationStart', (op: ActiveOperation) => {
      this.emit('debug', `Operation started: ${op.type} ${op.id}`);
    });
    
    this.on('operationComplete', (op: ActiveOperation) => {
      this.emit('debug', `Operation completed: ${op.type} ${op.id} (${Date.now() - op.startTime}ms)`);
    });
    
    this.on('operationError', (opOrEvent: ActiveOperation | EnhancedOperationEvent, error?: Error) => {
      if (error) {
        // Legacy format: (ActiveOperation, Error)
        const op = opOrEvent as ActiveOperation;
        this.emit('debug', `Operation failed: ${op.type} ${op.id} - ${error.message}`);
      } else {
        // Enhanced format: (EnhancedOperationEvent)
        const event = opOrEvent as EnhancedOperationEvent;
        const errorMsg = event.error?.message || 'Unknown error';
        this.emit('debug', `Operation failed: ${event.type} ${event.operation_id} - ${errorMsg}`);
      }
    });
    
    this.on('operationProgress', (op: ActiveOperation) => {
      if (op.totalBytes && op.bytesTransferred) {
        const progress = Math.round((op.bytesTransferred / op.totalBytes) * 100);
        this.emit('debug', `Operation progress: ${op.type} ${op.id} - ${progress}%`);
      }
    });
  }

  // Enhanced Event System Methods

  /**
   * Configure event system options for VSCode and other applications
   */
  setEventOptions(options: Partial<EventOptions>): void {
    this.eventOptions = { ...this.eventOptions, ...options };
    if (this.eventOptions.debugMode) {
      this.emit('debug', `Event options updated: ${JSON.stringify(this.eventOptions)}`);
    }
  }

  /**
   * Get current event system configuration
   */
  getEventOptions(): EventOptions {
    return { ...this.eventOptions };
  }

  /**
   * Generate unique operation ID
   */
  private generateOperationId(): string {
    return `op_${++this.operationIdCounter}_${Date.now()}`;
  }

  /**
   * Generate unique batch ID
   */
  private generateBatchId(): string {
    return `batch_${++this.batchIdCounter}_${Date.now()}`;
  }

  /**
   * Extract filename from path for display purposes
   */
  private extractFileName(filePath: string): string {
    return filePath.split('/').pop() || filePath.split('\\').pop() || filePath;
  }

  /**
   * Classify error for better user messaging
   */
  private classifyError(error: Error, context?: string): ClassifiedError {
    const classifiedError = error as ClassifiedError;
    
    // Network errors
    if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND') || 
        error.message.includes('ETIMEDOUT') || error.message.includes('ECONNRESET')) {
      classifiedError.category = 'network';
      classifiedError.isUserActionable = true;
      classifiedError.suggestedAction = 'check_network';
      classifiedError.isRetryable = true;
    }
    // Authentication errors
    else if (error.message.includes('authentication') || error.message.includes('password') || 
             error.message.includes('key') || error.message.includes('auth')) {
      classifiedError.category = 'authentication';
      classifiedError.isUserActionable = true;
      classifiedError.suggestedAction = 'check_permissions';
      classifiedError.isRetryable = false;
    }
    // Permission errors
    else if (error.message.includes('permission') || error.message.includes('denied') || 
             error.message.includes('EACCES')) {
      classifiedError.category = 'permission';
      classifiedError.isUserActionable = true;
      classifiedError.suggestedAction = 'check_permissions';
      classifiedError.isRetryable = false;
    }
    // Timeout errors
    else if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
      classifiedError.category = 'timeout';
      classifiedError.isUserActionable = true;
      classifiedError.suggestedAction = 'retry';
      classifiedError.isRetryable = true;
    }
    // Server errors
    else if (error.message.includes('server') || error.message.includes('EOF') || 
             error.message.includes('protocol')) {
      classifiedError.category = 'server';
      classifiedError.isUserActionable = false;
      classifiedError.suggestedAction = 'contact_admin';
      classifiedError.isRetryable = true;
    }
    // Filesystem errors
    else if (error.message.includes('ENOENT') || error.message.includes('file') || 
             error.message.includes('directory')) {
      classifiedError.category = 'filesystem';
      classifiedError.isUserActionable = true;
      classifiedError.suggestedAction = 'check_permissions';
      classifiedError.isRetryable = false;
    }
    // Default to protocol error
    else {
      classifiedError.category = 'protocol';
      classifiedError.isUserActionable = false;
      classifiedError.suggestedAction = 'retry';
      classifiedError.isRetryable = true;
    }

    return classifiedError;
  }

  /**
   * Add event to history for debugging and tracking
   */
  private addToEventHistory(event: string, data: any): void {
    if (!this.eventOptions.debugMode) return;

    this.eventHistory.push({
      timestamp: Date.now(),
      event,
      data: JSON.parse(JSON.stringify(data)) // deep clone to avoid reference issues
    });

    // Trim history if it gets too large
    if (this.eventHistory.length > this.eventOptions.maxEventHistory) {
      this.eventHistory = this.eventHistory.slice(-this.eventOptions.maxEventHistory);
    }
  }

  /**
   * Emit enhanced operation start event
   */
  private emitOperationStart(event: EnhancedOperationEvent): void {
    this.addToEventHistory('operationStart', event);
    this.emit('operationStart', event);
    
    if (this.eventOptions.debugMode) {
      this.emit('debug', `Enhanced operation start: ${event.type} ${event.operation_id} -> ${event.remotePath}`);
    }
  }

  /**
   * Emit enhanced operation progress event with throttling
   */
  private emitOperationProgress(event: EnhancedOperationEvent): void {
    if (!this.eventOptions.enableProgressEvents) return;

    const now = Date.now();
    const lastEmit = this.lastProgressEmit.get(event.operation_id) || 0;
    
    // Throttle progress events
    if (now - lastEmit < this.eventOptions.progressThrottle) {
      return;
    }

    this.lastProgressEmit.set(event.operation_id, now);
    this.addToEventHistory('operationProgress', event);
    this.emit('operationProgress', event);
  }

  /**
   * Emit enhanced operation complete event
   */
  private emitOperationComplete(event: EnhancedOperationEvent): void {
    this.lastProgressEmit.delete(event.operation_id);
    this.addToEventHistory('operationComplete', event);
    this.emit('operationComplete', event);
    
    // Update performance metrics
    this.performanceMetrics.totalOperations++;
    if (event.totalBytes) {
      this.performanceMetrics.totalBytes += event.totalBytes;
    }
    if (event.duration) {
      this.performanceMetrics.totalDuration += event.duration;
      this.performanceMetrics.avgThroughput = 
        this.performanceMetrics.totalBytes / (this.performanceMetrics.totalDuration / 1000) / (1024 * 1024);
    }
  }

  /**
   * Emit enhanced operation error event
   */
  private emitOperationError(event: EnhancedOperationEvent): void {
    this.lastProgressEmit.delete(event.operation_id);
    this.addToEventHistory('operationError', event);
    this.emit('operationError', event);
  }

  /**
   * Emit connection state events
   */
  private emitConnectionEvent(eventType: string, data: ConnectionStateEvent): void {
    this.addToEventHistory(eventType, data);
    this.emit(eventType, data);
  }

  /**
   * Emit performance metrics event
   */
  private emitPerformanceMetrics(data: PerformanceMetricsEvent): void {
    if (!this.eventOptions.enablePerformanceEvents) return;
    this.addToEventHistory('performanceMetrics', data);
    this.emit('performanceMetrics', data);
  }

  /**
   * Emit adaptive change event
   */
  private emitAdaptiveChange(data: AdaptiveChangeEvent): void {
    if (!this.eventOptions.enableAdaptiveEvents) return;
    this.addToEventHistory('adaptiveChange', data);
    this.emit('adaptiveChange', data);
  }

  /**
   * Emit operation retry event
   */
  private emitOperationRetry(data: OperationRetryEvent): void {
    this.addToEventHistory('operationRetry', data);
    this.emit('operationRetry', data);
  }

  /**
   * Emit server limit detected event
   */
  private emitServerLimitDetected(data: ServerLimitEvent): void {
    this.addToEventHistory('serverLimitDetected', data);
    this.emit('serverLimitDetected', data);
  }

  /**
   * Emit batch operation events
   */
  private emitBatchOperation(eventType: string, data: BatchOperationEvent): void {
    this.addToEventHistory(eventType, data);
    this.emit(eventType, data);
  }

  /**
   * Get event history for debugging
   */
  getEventHistory(): Array<{ timestamp: number; event: string; data: any }> {
    return [...this.eventHistory];
  }

  /**
   * Clear event history
   */
  clearEventHistory(): void {
    this.eventHistory = [];
    this.lastProgressEmit.clear();
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics(): typeof this.performanceMetrics {
    return { ...this.performanceMetrics };
  }

  private checkConnection(): void {
    if (!this.client) throw new Error('Not connected');
    if (!this.client.isReady()) throw new Error('SFTP connection is not ready');
  }

  // Operation tracking and management methods
  private createOperation(type: ActiveOperation['type'], localPath?: string, remotePath?: string): ActiveOperation {
    const id = `op_${++this.operationCounter}_${Date.now()}`;
    const operation: ActiveOperation = {
      id,
      type,
      startTime: Date.now()
    };
    
    if (localPath) operation.localPath = localPath;
    if (remotePath) operation.remotePath = remotePath;
    
    this.activeOperations.set(id, operation);
    this.emit('operationStart', operation);
    return operation;
  }

  private completeOperation(operation: ActiveOperation): void {
    this.activeOperations.delete(operation.id);
    this.emit('operationComplete', operation);
    this.processQueue(); // Process next queued operation if any
  }

  private failOperation(operation: ActiveOperation, error: Error): void {
    this.activeOperations.delete(operation.id);
    this.emit('operationError', operation, error);
    this.processQueue(); // Process next queued operation if any
  }

  private updateOperationProgress(operation: ActiveOperation, bytesTransferred: number, totalBytes?: number): void {
    operation.bytesTransferred = bytesTransferred;
    if (totalBytes) operation.totalBytes = totalBytes;
    this.emit('operationProgress', operation);
  }

  private async executeWithConcurrencyControl<T>(operationFn: () => Promise<T>): Promise<T> {
    if (this.activeOperations.size >= this.concurrencyOptions.maxConcurrentOps!) {
      if (this.concurrencyOptions.queueOnLimit) {
        // Queue the operation
        return new Promise<T>((resolve, reject) => {
          this.operationQueue.push(async () => {
            try {
              const result = await operationFn();
              resolve(result);
            } catch (error) {
              reject(error);
            }
          });
        });
      } else {
        throw new Error(`Maximum concurrent operations limit reached (${this.concurrencyOptions.maxConcurrentOps}). Currently active: ${this.activeOperations.size}`);
      }
    }
    
    return operationFn();
  }

  private async processQueue(): Promise<void> {
    if (this.processingQueue || this.operationQueue.length === 0) return;
    if (this.activeOperations.size >= this.concurrencyOptions.maxConcurrentOps!) return;
    
    this.processingQueue = true;
    
    while (this.operationQueue.length > 0 && this.activeOperations.size < this.concurrencyOptions.maxConcurrentOps!) {
      const operation = this.operationQueue.shift();
      if (operation) {
        // Execute without awaiting to allow parallel processing
        operation().catch(() => {}); // Errors handled in individual operations
      }
    }
    
    this.processingQueue = false;
  }

  // Public API for operation management
  getActiveOperations(): ActiveOperation[] {
    return Array.from(this.activeOperations.values());
  }

  getActiveOperationCount(): number {
    return this.activeOperations.size;
  }

  getQueuedOperationCount(): number {
    return this.operationQueue.length;
  }

  cancelAllOperations(): void {
    // Clear the queue
    this.operationQueue.length = 0;
    
    // Cancel active operations (they'll fail naturally when connection is lost)
    const activeOps = Array.from(this.activeOperations.values());
    this.activeOperations.clear();
    
    activeOps.forEach(op => {
      this.emit('operationError', op, new Error('Operation cancelled'));
    });
  }

  updateConcurrencyOptions(options: ConcurrencyOptions): void {
    this.concurrencyOptions = { ...this.concurrencyOptions, ...options };
    // Process queue in case we increased the limit
    this.processQueue();
  }

  // Generic pipelined operation method for both uploads and downloads
  private async executePipelinedOperation<T>(
    handle: Buffer,
    dataSize: number,
    operation: ActiveOperation,
    chunkOperation: (offset: number, chunkSize: number) => Promise<T>,
    options?: { chunkTimeout?: number; maxConcurrentOps?: number }
  ): Promise<T[]> {
    const results: T[] = [];
    let currentOffset = 0;
    const maxConcurrentOps = options?.maxConcurrentOps ?? 12; // Reduced to be more server-friendly
    const chunkTimeout = options?.chunkTimeout ?? this.config?.chunkTimeout ?? 
                      this.client!.getTransport().getAdaptiveTimeout('data', dataSize);
    
    // Fully adaptive chunking based on server capabilities and performance
    const getChunkSize = (bytesProcessed: number): number => {
      // Use server-adaptive chunk sizing - no hardcoded values
      return this.client!.getTransport().getAdaptiveChunkSize('download', bytesProcessed);
    };
    
    while (currentOffset < dataSize) {
      const chunkSize = getChunkSize(currentOffset);
      const dynamicConcurrency = this.client!.getOptimalConcurrency(chunkSize);
      
      // Create batch of chunks
      const chunks: Array<{offset: number, size: number}> = [];
      let batchOffset = currentOffset;
      
      for (let i = 0; i < dynamicConcurrency && batchOffset < dataSize; i++) {
        const end = Math.min(batchOffset + chunkSize, dataSize);
        const size = end - batchOffset;
        chunks.push({ offset: batchOffset, size });
        batchOffset += size;
      }
      
      this.emit('debug', `Pipelined batch: ${chunks.length} chunks of ${chunkSize} bytes each (dynamic concurrency: ${dynamicConcurrency})`);
      
      // Execute batch with timeout
      const chunkPromises = chunks.map(async (chunk) => {
        const chunkStartTime = Date.now();
        
        const operationPromise = chunkOperation(chunk.offset, chunk.size);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Pipelined chunk timeout after ${chunkTimeout}ms for chunk size ${chunk.size}`));
          }, chunkTimeout);
        });
        
        const result = await Promise.race([operationPromise, timeoutPromise]);
        
        const chunkDuration = Date.now() - chunkStartTime;
        this.emit('debug', `Pipelined chunk completed: offset=${chunk.offset}, size=${chunk.size}, duration=${chunkDuration}ms`);
        return result;
      });
      
      // Wait for all chunks in this batch to complete
      const batchResults = await Promise.all(chunkPromises);
      results.push(...batchResults);
      
      currentOffset = batchOffset;
      this.updateOperationProgress(operation, currentOffset, dataSize);
    }
    
    return results;
  }

  // ssh2-sftp-client compatible connect method
  async connect(config: SFTPClientOptions): Promise<void> {
    // Store config for timeout access
    this.config = config;
    
    // Emit connection start event
    this.emitConnectionEvent('connectionStart', {
      host: config.host,
      port: config.port || 22,
      username: config.username
    });
    
    // Disconnect existing connection if any
    if (this.client) {
      this.disconnect();
    }
    
    // Emit authenticating event
    this.emitConnectionEvent('authenticating', {
      host: config.host,
      authType: config.privateKey ? 'key' : 'password'
    });
    
    try {
      this.client = new SSH2StreamsSFTPClient(config);
    } catch (error) {
      this.emitConnectionEvent('connectionError', {
        host: config.host,
        error: error as Error,
        phase: 'connect'
      });
      throw error;
    }
    
    // Forward events with enhancements
    this.client.on('ready', () => {
      this.emit('ready');
      this.emitConnectionEvent('connectionReady', {
        host: config.host,
        serverInfo: {}, // TODO: Extract server info if available
        capabilities: {} // TODO: Extract SFTP capabilities if available
      });
    });
    this.client.on('error', (err) => {
      this.emit('error', err);
      this.emitConnectionEvent('connectionError', {
        host: config.host,
        error: err,
        phase: 'ready'
      });
      // Auto-cleanup on error
      this.client = null;
    });
    this.client.on('close', () => {
      this.client = null; // Clear client on close
      this.emit('close');
    });
    this.client.on('debug', (msg) => this.emit('debug', msg));
    
    // Forward health check and connection monitoring events
    this.client.on('keepalive', (event) => this.emit('keepalive', event));
    this.client.on('healthCheck', (event) => this.emit('healthCheck', event));
    this.client.on('reconnectAttempt', (event) => this.emit('reconnectAttempt', event));
    this.client.on('reconnectSuccess', (event) => this.emit('reconnectSuccess', event));
    this.client.on('reconnectError', (event) => this.emit('reconnectError', event));
    this.client.on('reconnectFailed', (event) => this.emit('reconnectFailed', event));
    
    try {
      // Add configurable connection timeout (default 30 seconds)
      const connectTimeout = this.config?.connectTimeout ?? 30000;
      const connectPromise = this.client.connect();
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Connection timeout after ${connectTimeout}ms`));
        }, connectTimeout);
      });
      
      await Promise.race([connectPromise, timeoutPromise]);
    } catch (error) {
      this.client = null; // Clear client on connection failure
      throw error;
    }
  }

  // ssh2-sftp-client compatible API methods
  async list(remotePath: string, filter?: (fileInfo: FileInfo) => boolean): Promise<FileInfo[]> {
    return this.executeWithConcurrencyControl(async () => {
      this.checkConnection();
      
      const operation = this.createOperation('list', undefined, remotePath);
      
      try {
        const entries = await this.client!.listDirectory(remotePath);
        this.emit('debug', `Listed ${entries.length} items in ${remotePath}`);
        
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
        const result = filter ? fileInfos.filter(filter) : fileInfos;
        
        this.completeOperation(operation);
        return result;
      } catch (error) {
        this.failOperation(operation, error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    });
  }

  async get(remotePath: string, dst?: string | Writable): Promise<string | Writable | Buffer> {
    return this.executeWithConcurrencyControl(async () => {
      this.checkConnection();
      
      const localPath = typeof dst === 'string' ? dst : undefined;
      
      // Use enhanced events if enabled, otherwise use legacy events
      let operation: ActiveOperation | undefined;
      let operationId: string;
      let startEvent: EnhancedOperationEvent | undefined;
      
      if (this.eventOptions.enableProgressEvents) {
        // Enhanced event system
        operationId = this.generateOperationId();
        
        // Get file stats first for size info
        let fileSize = 0;
        try {
          const stats = await this.client!.stat(remotePath);
          fileSize = stats.size || 0;
        } catch (error) {
          // Continue without size info
        }
        
        startEvent = {
          type: 'download',
          operation_id: operationId,
          remotePath,
          totalBytes: fileSize,
          fileName: this.extractFileName(remotePath),
          startTime: Date.now()
        };
        if (localPath) {
          startEvent.localPath = localPath;
        }
        this.emitOperationStart(startEvent);
      } else {
        // Legacy event system
        operation = this.createOperation('download', localPath, remotePath);
        operationId = operation.id;
      }
      
      try {
        let handle = await this.client!.openFile(remotePath, SFTP_OPEN_FLAGS.READ);
        
        try {
          // Get file size first
          const stats = await this.client!.stat(remotePath);
          const fileSize = stats.size || 0;
          
          let fileBuffer: Buffer;
          
          if (fileSize === 0) {
            // Empty file
            fileBuffer = Buffer.alloc(0);
          } else {
            // Use optimized sequential downloads - reliable and reasonably fast
            this.emit('debug', `Using optimized sequential downloads: ${fileSize} bytes`);
            
            const chunks: Buffer[] = [];
            let offset = 0;
            let consecutiveSuccesses = 0;
            
            while (offset < fileSize) {
              // Check if we need to reconnect BEFORE making the request
              if (this.client!.isApproachingLimit()) {
                this.emit('debug', `Approaching server limits, initiating auto-reconnection at ${(offset/(1024*1024)).toFixed(2)}MB`);
                handle = await this.handleAutoReconnection(handle, remotePath);
                consecutiveSuccesses = 0; // Reset success counter after reconnection
              }

              // Use fully adaptive chunk size based on server performance
              const chunkSize = this.client!.getTransport().getAdaptiveChunkSize('download', offset);
              const requestSize = Math.min(chunkSize, fileSize - offset);
              
              const startTime = Date.now();
              try {
                // Use adaptive timeout based on request size and server performance
                const timeout = this.client!.getTransport().getAdaptiveTimeout('data', requestSize);
                const data = await this.client!.readFile(handle, offset, requestSize, timeout);
                const transferTime = Date.now() - startTime;
                
                if (data && data.length > 0) {
                  chunks.push(data);
                  offset += data.length;
                  consecutiveSuccesses++;
                  
                  // Update progress
                  if (this.eventOptions.enableProgressEvents && startEvent) {
                    // Enhanced progress event
                    const progressEvent: EnhancedOperationEvent = {
                      ...startEvent,
                      bytesTransferred: offset,
                      totalBytes: fileSize
                    };
                    this.emitOperationProgress(progressEvent);
                  } else if (operation) {
                    // Legacy progress event
                    this.updateOperationProgress(operation, offset, fileSize);
                  }
                  
                  // Aggressive server-friendly throttling for large files
                  const transport = this.client!.getTransport();
                  const avgResponseTime = transport.adaptiveMetrics.avgResponseTime;
                  const fileIsMedium = fileSize > 1024 * 1024; // > 1MB
                  const fileIsLarge = fileSize > 10 * 1024 * 1024; // > 10MB
                  
                  // Calculate adaptive throttle intervals
                  let throttleInterval = 0;
                  let throttleFrequency = 0;
                  
                  if (fileIsLarge) {
                    // Large files: throttle every 5-10 chunks with longer delays
                    throttleFrequency = Math.max(5, Math.min(10, Math.floor(avgResponseTime / 10)));
                    throttleInterval = Math.max(20, Math.min(100, avgResponseTime * 2));
                  } else if (fileIsMedium) {
                    // Medium files: throttle every 10-15 chunks with moderate delays
                    throttleFrequency = Math.max(10, Math.min(15, Math.floor(avgResponseTime / 5)));
                    throttleInterval = Math.max(10, Math.min(50, avgResponseTime));
                  } else {
                    // Small files: minimal throttling
                    throttleFrequency = 25;
                    throttleInterval = Math.max(5, Math.min(20, avgResponseTime / 2));
                  }
                  
                  if ((chunks.length % throttleFrequency) === 0 && chunks.length > 0) {
                    await new Promise(resolve => setTimeout(resolve, throttleInterval));
                  }
                  
                  // Additional throttling if server is showing stress (slower response times)
                  if (avgResponseTime > 50 && consecutiveSuccesses > 0 && (consecutiveSuccesses % 10) === 0) {
                    const stressThrottle = Math.min(200, avgResponseTime * 3);
                    await new Promise(resolve => setTimeout(resolve, stressThrottle));
                  }
                  
                  // Report success metrics with response time
                  const speed = (data.length / (transferTime / 1000)) / (1024 * 1024);
                  this.client!.reportTransferMetrics(speed, false, transferTime);
                } else {
                  // EOF reached
                  break;
                }
              } catch (error) {
                const errorTime = Date.now();
                consecutiveSuccesses = 0;
                
                // Report timeout for adaptation with response time
                if (error instanceof Error && error.message.includes('timeout')) {
                  this.client!.reportTransferMetrics(0, true, errorTime - startTime);
                  
                  // Record this as a server limit detection
                  const stats = this.client!.getOperationStats();
                  this.client!.recordServerLimit(stats.operations, stats.bytesTransferred);
                  
                  // Attempt recovery with reconnection
                  this.emit('debug', `Download timeout at ${(offset/(1024*1024)).toFixed(2)}MB, attempting recovery reconnection`);
                  try {
                    handle = await this.handleAutoReconnection(handle, remotePath);
                    this.emit('debug', 'Recovery reconnection successful, retrying read operation');
                    continue; // Retry the same offset with new connection
                  } catch (reconnectError) {
                    this.emit('debug', `Recovery reconnection failed: ${reconnectError instanceof Error ? reconnectError.message : String(reconnectError)}`);
                    throw error; // Throw original timeout error if reconnection fails
                  }
                }
                
                // Handle EOF as a normal end-of-file condition
                if (error instanceof SFTPError && error.code === SFTP_STATUS.EOF) {
                  break;
                }
                throw error;
              }
            }
            
            fileBuffer = Buffer.concat(chunks);
          }
          
          // Update final progress
          if (this.eventOptions.enableProgressEvents && startEvent) {
            // Enhanced final progress event
            const progressEvent: EnhancedOperationEvent = {
              ...startEvent,
              bytesTransferred: fileBuffer.length,
              totalBytes: fileBuffer.length
            };
            this.emitOperationProgress(progressEvent);
          } else if (operation) {
            // Legacy final progress event
            this.updateOperationProgress(operation, fileBuffer.length, fileBuffer.length);
          }
          
          let result: string | Writable | Buffer;
          if (dst === undefined) {
            // No destination specified - return Buffer
            result = fileBuffer;
          } else if (typeof dst === 'string') {
            // String destination - write to local file
            await fsPromises.writeFile(dst, fileBuffer);
            result = dst;
          } else {
            // Writable stream destination
            result = await new Promise<Writable>((resolve, reject) => {
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
          
          if (this.eventOptions.enableProgressEvents && startEvent) {
            // Enhanced completion event
            const completeEvent: EnhancedOperationEvent = {
              ...startEvent,
              duration: Date.now() - startEvent.startTime,
              bytesTransferred: fileSize
            };
            this.emitOperationComplete(completeEvent);
          } else if (operation) {
            // Legacy completion event
            this.completeOperation(operation);
          }
          return result;
        } catch (error) {
          if (this.eventOptions.enableProgressEvents && startEvent) {
            // Enhanced error event
            const errorEvent: EnhancedOperationEvent = {
              ...startEvent,
              duration: Date.now() - startEvent.startTime,
              error: error instanceof Error ? error : new Error(String(error))
            };
            this.emitOperationError(errorEvent);
          } else if (operation) {
            // Legacy error event
            this.failOperation(operation, error instanceof Error ? error : new Error(String(error)));
          }
          throw error;
        } finally {
          try {
            await this.client!.closeFile(handle);
          } catch (closeError) {
            // Log close error but don't fail the operation since data transfer succeeded
            this.emit('debug', `Warning: File close failed: ${closeError instanceof Error ? closeError.message : String(closeError)}`);
          }
        }
      } catch (error) {
        if (this.eventOptions.enableProgressEvents && startEvent) {
          // Enhanced error event
          const errorEvent: EnhancedOperationEvent = {
            ...startEvent,
            duration: Date.now() - startEvent.startTime,
            error: error instanceof Error ? error : new Error(String(error))
          };
          this.emitOperationError(errorEvent);
        } else if (operation) {
          // Legacy error event
          this.failOperation(operation, error instanceof Error ? error : new Error(String(error)));
        }
        throw error;
      }
    });
  }

  async put(input: string | Buffer | Readable, remotePath: string, options?: { 
    chunkTimeout?: number;
    usePipelined?: boolean;
    maxConcurrentWrites?: number;
  }): Promise<string> {
    return this.executeWithConcurrencyControl(async () => {
      this.checkConnection();
      
      const localPath = typeof input === 'string' ? input : undefined;
      
      // Use enhanced events if enabled, otherwise use legacy events
      let operation: ActiveOperation | undefined;
      let operationId: string;
      let startEvent: EnhancedOperationEvent | undefined;
      
      if (this.eventOptions.enableProgressEvents) {
        // Enhanced event system
        operationId = this.generateOperationId();
        
        // Estimate file size if possible
        let fileSize = 0;
        if (typeof input === 'string') {
          try {
            const stats = require('fs').statSync(input);
            fileSize = stats.size;
          } catch (error) {
            // Continue without size info
          }
        } else if (Buffer.isBuffer(input)) {
          fileSize = input.length;
        }
        
        startEvent = {
          type: 'upload',
          operation_id: operationId,
          remotePath,
          fileName: this.extractFileName(remotePath),
          startTime: Date.now()
        };
        if (localPath) {
          startEvent.localPath = localPath;
        }
        if (fileSize > 0) {
          startEvent.totalBytes = fileSize;
        }
        this.emitOperationStart(startEvent);
      } else {
        // Legacy event system
        operation = this.createOperation('upload', localPath, remotePath);
        operationId = operation.id;
      }
      
      try {
        this.emit('debug', `Starting upload to: ${remotePath}`);
        
        let handle: Buffer;
        try {
          handle = await this.client!.openFile(remotePath, SFTP_OPEN_FLAGS.WRITE | SFTP_OPEN_FLAGS.CREAT | SFTP_OPEN_FLAGS.TRUNC);
          this.emit('debug', `File opened successfully, handle size: ${handle.length}`);
        } catch (openError) {
          this.emit('debug', `Failed to open file for writing: ${openError instanceof Error ? openError.message : String(openError)}`);
          throw openError;
        }
        
        try {
          let dataBuffer: Buffer;
          
          if (Buffer.isBuffer(input)) {
            // Input is already a Buffer
            dataBuffer = input;
            this.emit('debug', `Using provided Buffer: ${dataBuffer.length} bytes`);
          } else if (typeof input === 'string') {
            // Input is a file path - read the file
            this.emit('debug', `Reading file from: ${input}`);
            dataBuffer = await fsPromises.readFile(input);
            this.emit('debug', `File read successfully: ${dataBuffer.length} bytes`);
          } else {
            // Input is a Readable stream - collect all data
            this.emit('debug', `Reading from stream`);
            const chunks: Buffer[] = [];
            
            await new Promise<void>((resolve, reject) => {
              input.on('data', (chunk: Buffer) => {
                chunks.push(chunk);
                this.emit('debug', `Stream chunk received: ${chunk.length} bytes`);
              });
              
              input.on('end', () => {
                this.emit('debug', `Stream ended`);
                resolve();
              });
              
              input.on('error', (error) => {
                this.emit('debug', `Stream error: ${error instanceof Error ? error.message : String(error)}`);
                reject(error);
              });
            });
            
            dataBuffer = Buffer.concat(chunks);
            this.emit('debug', `Stream data collected: ${dataBuffer.length} bytes from ${chunks.length} chunks`);
          }
          
          // Update operation with total bytes
          if (this.eventOptions.enableProgressEvents && startEvent) {
            // Enhanced initial progress event
            const progressEvent: EnhancedOperationEvent = {
              ...startEvent,
              bytesTransferred: 0,
              totalBytes: dataBuffer.length
            };
            this.emitOperationProgress(progressEvent);
          } else if (operation) {
            // Legacy initial progress event
            this.updateOperationProgress(operation, 0, dataBuffer.length);
          }
          
          // Check if dataBuffer is empty (this could cause issues)
          if (dataBuffer.length === 0) {
            this.emit('debug', `Warning: Attempting to upload empty file`);
            // Create empty file by just closing the handle
            if (this.eventOptions.enableProgressEvents && startEvent) {
              // Enhanced completion event for empty file
              const completeEvent: EnhancedOperationEvent = {
                ...startEvent,
                duration: Date.now() - startEvent.startTime,
                bytesTransferred: 0
              };
              this.emitOperationComplete(completeEvent);
            } else if (operation) {
              // Legacy completion event for empty file
              this.completeOperation(operation);
            }
            return remotePath;
          }
          
          // Determine write strategy
          const usePipelined = options?.usePipelined ?? (dataBuffer.length > 64 * 1024); // Auto-enable for files > 64KB
          // Use dynamic concurrency based on actual window size and chunk size
          // Will be calculated per chunk size as it grows from 8KB to 32KB
          let maxConcurrentWrites = options?.maxConcurrentWrites; // User override, or calculated dynamically
          
          // Shared adaptive chunking state - proper progression with conservative overhead accounted
          // CRITICAL FIX: Account for variable SFTP overhead (66 bytes = SSH headers + SFTP headers + handle)
          const maxSafeChunkSize = this.client?.getMaxSafeChunkSize() ?? 32702; // Default safe size for 32KB SSH packets
          const maxChunkSize = Math.min(131072, maxSafeChunkSize); // Respect SSH packet limits
          
          // Start with server-adaptive chunk size
          let chunkSize = this.client!.getTransport().getAdaptiveChunkSize('upload', 0);
          let stableChunkSize = chunkSize; // Last known good chunk size
          let consecutiveTimeouts = 0;
          let hasFailedAtSize = false; // Track if we've failed at current size
          this.emit('debug', `Max chunk size limited to ${maxChunkSize} bytes (SSH limit: ${maxSafeChunkSize})`);
          let pipelinedSucceeded = false;
          
          // Helper function for adaptive chunk size management
          const handleChunkSuccess = () => {
            consecutiveTimeouts = 0; // Reset timeout counter on success
            
            // Optimized chunking: double size after each successful packet (if not failed before)
            if (!hasFailedAtSize && chunkSize < maxChunkSize) {
              // Calculate next size with proper overhead accounting
              let targetSize;
              const overhead = 66; // Conservative SFTP + SSH overhead
              if (chunkSize <= (8192 - overhead)) {
                targetSize = Math.min(16384 - overhead, maxSafeChunkSize); // Progress to 16KB chunk
              } else if (chunkSize <= (16384 - overhead)) {
                targetSize = Math.min(32768 - overhead, maxSafeChunkSize); // Progress to 32KB chunk
              } else {
                targetSize = maxChunkSize; // Already at max
              }
              
              const newChunkSize = Math.min(maxChunkSize, targetSize);
              if (newChunkSize !== chunkSize) {
                stableChunkSize = chunkSize; // Remember last good size
                chunkSize = newChunkSize;
                this.emit('debug', `Progressing chunk size to ${chunkSize} bytes (${Math.round(chunkSize/1024)}KB with overhead accounted)`);
              }
            }
          };
          
          const handleChunkFailure = (errorMsg: string): boolean => {
            // If timeout/error and we have a stable size to fall back to, revert temporarily
            if ((errorMsg.includes('timeout') || errorMsg.includes('Fast timeout')) && 
                chunkSize > stableChunkSize && consecutiveTimeouts < 5) {
              consecutiveTimeouts++;
              // Only mark as permanently failed after 3 failures at the same size
              if (consecutiveTimeouts >= 3) {
                hasFailedAtSize = true; // Mark that we've failed, stop growing for this file
                this.emit('debug', `Permanently limiting chunk size after ${consecutiveTimeouts} failures at ${chunkSize} bytes`);
              }
              chunkSize = stableChunkSize; // Revert to last known good size
              this.emit('debug', `Reverting to stable chunk size: ${chunkSize} bytes due to: ${errorMsg} (attempt ${consecutiveTimeouts})`);
              return true; // Indicates retry should happen
            }
            return false; // Indicates permanent failure
          };

          if (usePipelined) {
            // ADAPTIVE PIPELINED WRITES: Use progressive chunking with parallel execution and retry logic
            this.emit('debug', `Using adaptive pipelined writes: ${dataBuffer.length} bytes, concurrent: ${maxConcurrentWrites}`);
            
            let pipelinedOffset = 0;
            let totalBytesWritten = 0;
            const writeStartTime = Date.now();
            
            try {
              while (pipelinedOffset < dataBuffer.length) {
                // Prepare chunks for this batch using current adaptive chunk size
                const chunks: Array<{offset: number, data: Buffer, size: number}> = [];
                let batchOffset = pipelinedOffset;
                
                // Dynamic concurrency: calculate optimal concurrency based on window size and chunk size
                const dynamicConcurrency = maxConcurrentWrites ?? this.client!.getOptimalConcurrency(chunkSize);
                this.emit('debug', `Dynamic concurrency for ${Math.round(chunkSize/1024)}KB chunks: ${dynamicConcurrency}x (window-based)`);
                
                // Create batch of chunks up to dynamic concurrency limit
                for (let i = 0; i < dynamicConcurrency && batchOffset < dataBuffer.length; i++) {
                  const end = Math.min(batchOffset + chunkSize, dataBuffer.length);
                  const chunk = dataBuffer.subarray(batchOffset, end);
                  chunks.push({ offset: batchOffset, data: chunk, size: chunk.length });
                  batchOffset += chunk.length;
                }
                
                this.emit('debug', `Pipelined batch: ${chunks.length} chunks of ${chunkSize} bytes each (dynamic concurrency: ${dynamicConcurrency})`);
                
                // Execute batch with timeout and retry logic
                const chunkTimeout = options?.chunkTimeout ?? this.config?.chunkTimeout ?? 30000; // Optimized for 32KB chunks
                let batchSuccess = false;
                let retryCount = 0;
                const maxRetries = 2;
                
                while (!batchSuccess && retryCount <= maxRetries) {
                  try {
                    // Execute all chunks in parallel with timeout
                    const chunkPromises = chunks.map(async (chunk) => {
                      const chunkStartTime = Date.now();
                      
                      const writePromise = this.client!.writeFile(handle, chunk.offset, chunk.data, chunkTimeout);
                      const timeoutPromise = new Promise<never>((_, reject) => {
                        setTimeout(() => {
                          reject(new Error(`Pipelined chunk timeout after ${chunkTimeout}ms for chunk size ${chunk.size}`));
                        }, chunkTimeout);
                      });
                      
                      await Promise.race([writePromise, timeoutPromise]);
                      
                      const chunkDuration = Date.now() - chunkStartTime;
                      this.emit('debug', `Pipelined chunk completed: offset=${chunk.offset}, size=${chunk.size}, duration=${chunkDuration}ms`);
                      return chunk.size;
                    });
                    
                    // Wait for all chunks in this batch to complete
                    const completedSizes = await Promise.all(chunkPromises);
                    const batchBytesWritten = completedSizes.reduce((sum, size) => sum + size, 0);
                    
                    totalBytesWritten += batchBytesWritten;
                    pipelinedOffset = batchOffset;
                    
                    // Update progress
                    if (this.eventOptions.enableProgressEvents && startEvent) {
                      // Enhanced progress event
                      const progressEvent: EnhancedOperationEvent = {
                        ...startEvent,
                        bytesTransferred: totalBytesWritten,
                        totalBytes: dataBuffer.length
                      };
                      this.emitOperationProgress(progressEvent);
                    } else if (operation) {
                      // Legacy progress event
                      this.updateOperationProgress(operation, totalBytesWritten, dataBuffer.length);
                    }
                    
                    // Batch succeeded - apply success logic
                    handleChunkSuccess();
                    batchSuccess = true;
                    
                  } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    this.emit('debug', `Pipelined batch failed (attempt ${retryCount + 1}): ${errorMsg}`);
                    
                    const shouldRetry = handleChunkFailure(errorMsg);
                    if (shouldRetry && retryCount < maxRetries) {
                      retryCount++;
                      this.emit('debug', `Retrying pipelined batch with smaller chunk size: ${chunkSize}`);
                      
                      // Recreate chunks with new (smaller) chunk size and dynamic concurrency
                      chunks.length = 0;
                      batchOffset = pipelinedOffset;
                      const retryDynamicConcurrency = maxConcurrentWrites ?? this.client!.getOptimalConcurrency(chunkSize);
                      for (let i = 0; i < retryDynamicConcurrency && batchOffset < dataBuffer.length; i++) {
                        const end = Math.min(batchOffset + chunkSize, dataBuffer.length);
                        const chunk = dataBuffer.subarray(batchOffset, end);
                        chunks.push({ offset: batchOffset, data: chunk, size: chunk.length });
                        batchOffset += chunk.length;
                      }
                    } else {
                      // Permanent failure in pipelined mode
                      throw new Error(`Pipelined write permanently failed: ${errorMsg}`);
                    }
                  }
                }
                
                if (!batchSuccess) {
                  throw new Error('Pipelined batch failed after all retries');
                }
              }
              
              const writeEndTime = Date.now();
              const writeDuration = writeEndTime - writeStartTime;
              const speed = Math.round(dataBuffer.length / writeDuration * 1000 / 1024);
              
              this.emit('debug', `Adaptive pipelined writes completed: ${dataBuffer.length} bytes in ${writeDuration}ms (${speed} KB/s)`);
              pipelinedSucceeded = true;
              
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              this.emit('debug', `Pipelined writes failed, falling back to sequential: ${errorMsg}`);
              
              // Reset chunk size state for sequential fallback
              chunkSize = stableChunkSize;
              hasFailedAtSize = true;
              
              // Fall through to sequential mode
            }
          }
          
          if (!pipelinedSucceeded) {
            // SEQUENTIAL WRITES: Use the same adaptive chunking but execute sequentially
            this.emit('debug', `Using sequential writes with adaptive chunking: ${dataBuffer.length} bytes`);
            
            let offset = 0;
            
            while (offset < dataBuffer.length) {
            const end = Math.min(offset + chunkSize, dataBuffer.length);
            const chunk = dataBuffer.subarray(offset, end);
            
            try {
              this.emit('debug', `Writing chunk: offset=${offset}, size=${chunk.length}`);
              
              const writeStartTime = Date.now();
              
              // Race between write operation and a configurable timeout
              const chunkTimeout = options?.chunkTimeout ?? this.config?.chunkTimeout ?? 30000;
              const writePromise = this.client!.writeFile(handle, offset, chunk, chunkTimeout);
              const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => {
                  reject(new Error(`Fast timeout after ${chunkTimeout}ms for chunk size ${chunk.length}`));
                }, chunkTimeout);
              });
              
              await Promise.race([writePromise, timeoutPromise]);
              
              const writeEndTime = Date.now();
              const writeDuration = writeEndTime - writeStartTime;
              
              this.emit('debug', `Chunk written successfully: offset=${offset}, size=${chunk.length}, duration=${writeDuration}ms`);
              offset += chunk.length;
              
              // Update progress
              if (this.eventOptions.enableProgressEvents && startEvent) {
                // Enhanced progress event
                const progressEvent: EnhancedOperationEvent = {
                  ...startEvent,
                  bytesTransferred: offset,
                  totalBytes: dataBuffer.length
                };
                this.emitOperationProgress(progressEvent);
              } else if (operation) {
                // Legacy progress event
                this.updateOperationProgress(operation, offset, dataBuffer.length);
              }
              
              // Use shared chunking logic
              handleChunkSuccess();
              
              // Progress indicator for large files
              if (dataBuffer.length > 1024 * 1024 && offset % (chunkSize * 10) === 0) {
                const progress = Math.round((offset / dataBuffer.length) * 100);
                this.emit('debug', `Upload progress: ${progress}% (${offset}/${dataBuffer.length} bytes)`);
              }
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              this.emit('debug', `Write failed at offset ${offset}: ${errorMsg}`);
              
              // Use shared chunking logic for failure handling
              const shouldRetry = handleChunkFailure(errorMsg);
              if (shouldRetry) {
                continue; // Don't increment offset, retry this chunk with smaller size
              }
              
              throw new Error(`SFTP write failed at offset ${offset}: ${errorMsg}`);
            }
            }
          }
          
          // Force sync the file before closing to ensure data is written to disk
          try {
            await this.client!.syncFile(handle);
            this.emit('debug', `File synced successfully`);
          } catch (syncError) {
            this.emit('debug', `File sync failed (non-fatal): ${syncError instanceof Error ? syncError.message : String(syncError)}`);
          }
          
          // Verify the upload was successful after sync
          try {
            const stats = await this.client!.stat(remotePath);
            const expectedSize = dataBuffer.length;
            const actualSize = stats.size || 0;
            
            if (actualSize !== expectedSize) {
              this.emit('debug', `Upload verification failed: expected ${expectedSize} bytes, but file has ${actualSize} bytes`);
            } else {
              this.emit('debug', `Upload successful: ${actualSize} bytes written to ${remotePath}`);
            }
          } catch (verifyError) {
            this.emit('debug', `Upload verification failed: ${verifyError instanceof Error ? verifyError.message : String(verifyError)}`);
          }
          
          if (this.eventOptions.enableProgressEvents && startEvent) {
            // Enhanced completion event
            const completeEvent: EnhancedOperationEvent = {
              ...startEvent,
              duration: Date.now() - startEvent.startTime,
              bytesTransferred: startEvent.totalBytes || 0
            };
            this.emitOperationComplete(completeEvent);
          } else if (operation) {
            // Legacy completion event
            this.completeOperation(operation);
          }
          return remotePath;
        } catch (error) {
          if (this.eventOptions.enableProgressEvents && startEvent) {
            // Enhanced error event
            const errorEvent: EnhancedOperationEvent = {
              ...startEvent,
              duration: Date.now() - startEvent.startTime,
              error: error instanceof Error ? error : new Error(String(error))
            };
            this.emitOperationError(errorEvent);
          } else if (operation) {
            // Legacy error event
            this.failOperation(operation, error instanceof Error ? error : new Error(String(error)));
          }
          throw error;
        } finally {
          try {
            await this.client!.closeFile(handle);
          } catch (closeError) {
            this.emit('debug', `Error closing file handle: ${closeError instanceof Error ? closeError.message : String(closeError)}`);
            // Don't throw close errors if upload was otherwise successful
          }
        }
      } catch (error) {
        if (this.eventOptions.enableProgressEvents && startEvent) {
          // Enhanced error event
          const errorEvent: EnhancedOperationEvent = {
            ...startEvent,
            duration: Date.now() - startEvent.startTime,
            error: error instanceof Error ? error : new Error(String(error))
          };
          this.emitOperationError(errorEvent);
        } else if (operation) {
          // Legacy error event
          this.failOperation(operation, error instanceof Error ? error : new Error(String(error)));
        }
        throw error;
      }
    });
  }

  async delete(remotePath: string): Promise<void> {
    return this.executeWithConcurrencyControl(async () => {
      this.checkConnection();
      
      const operation = this.createOperation('delete', undefined, remotePath);
      
      try {
        await this.client!.removeFile(remotePath);
        this.completeOperation(operation);
      } catch (error) {
        this.failOperation(operation, error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    });
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    return this.executeWithConcurrencyControl(async () => {
      this.checkConnection();
      
      const operationId = this.generateOperationId();
      
      // Emit enhanced operation start event
      const startEvent: EnhancedOperationEvent = {
        type: 'rename',
        operation_id: operationId,
        remotePath: oldPath,
        fileName: this.extractFileName(oldPath),
        startTime: Date.now()
      };
      this.emitOperationStart(startEvent);
      
      try {
        await this.client!.renameFile(oldPath, newPath);
        
        // Emit enhanced operation complete event
        const completeEvent: EnhancedOperationEvent = {
          ...startEvent,
          remotePath: newPath, // Update to new path
          duration: Date.now() - startEvent.startTime
        };
        this.emitOperationComplete(completeEvent);
      } catch (error) {
        // Emit enhanced operation error event
        const errorEvent: EnhancedOperationEvent = {
          ...startEvent,
          duration: Date.now() - startEvent.startTime,
          error: error instanceof Error ? error : new Error(String(error))
        };
        this.emitOperationError(errorEvent);
        throw error;
      }
    });
  }

  async mkdir(remotePath: string, recursive: boolean = false): Promise<void> {
    return this.executeWithConcurrencyControl(async () => {
      this.checkConnection();
      
      const operation = this.createOperation('mkdir', undefined, remotePath);
      
      try {
        if (recursive) {
          // Normalize path and split into parts
          const normalizedPath = remotePath.replace(/\/+/g, '/'); // Remove duplicate slashes
          const parts = normalizedPath.split('/').filter(p => p);
          let currentPath = normalizedPath.startsWith('/') ? '' : '';
          
          for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : (normalizedPath.startsWith('/') ? `/${part}` : part);
            
            try {
              // Check if directory already exists first
              const stats = await this.client!.stat(currentPath);
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
                  await this.client!.makeDirectory(currentPath);
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
          await this.client!.makeDirectory(remotePath);
        }
        
        this.completeOperation(operation);
      } catch (error) {
        this.failOperation(operation, error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    });
  }

  async rmdir(remotePath: string, recursive: boolean = false): Promise<void> {
    this.checkConnection();
    
    if (recursive) {
      // First check if directory exists and is actually a directory
      try {
        const stats = await this.client!.stat(remotePath);
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
        const entries = await this.client!.listDirectory(remotePath);
        
        for (const entry of entries) {
          if (entry.filename === '.' || entry.filename === '..') continue;
          
          // Normalize path construction
          const fullPath = remotePath.endsWith('/') 
            ? `${remotePath}${entry.filename}` 
            : `${remotePath}/${entry.filename}`;
          
          if (entry.attrs.isDirectory?.()) {
            await this.rmdir(fullPath, true);
          } else {
            await this.client!.removeFile(fullPath);
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
    
    return this.client!.removeDirectory(remotePath);
  }

  async exists(remotePath: string): Promise<false | FileInfoType> {
    this.checkConnection();
    
    try {
      const stats = await this.client!.stat(remotePath);
      
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
    this.checkConnection();
    return this.client!.stat(remotePath);
  }

  // Fast transfer methods (optimized versions)
  async fastGet(remotePath: string, localPath: string, options?: any): Promise<string> {
    this.checkConnection();
    
    // For now, use regular get - can be optimized later with parallel streams
    await this.get(remotePath, localPath);
    return localPath;
  }

  async fastPut(localPath: string, remotePath: string, options?: { chunkTimeout?: number }): Promise<string> {
    this.checkConnection();
    
    // For now, use regular put - can be optimized later with parallel streams
    await this.put(localPath, remotePath, options);
    return remotePath;
  }

  async append(input: string | Buffer, remotePath: string, options?: any): Promise<string> {
    this.checkConnection();
    
    const data = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
    
    // For append, we need to get current file size to know where to write
    let fileSize = 0;
    try {
      const stats = await this.client!.stat(remotePath);
      fileSize = stats.size || 0;
    } catch (error: any) {
      // File doesn't exist, start at 0
      if (!(error.message?.includes('No such file') || error.message?.includes('not found'))) {
        throw error;
      }
    }
    
    const handle = await this.client!.openFile(remotePath, SFTP_OPEN_FLAGS.WRITE | SFTP_OPEN_FLAGS.CREAT);
    
    try {
      // Write at end of file using actual file size
      await this.client!.writeFile(handle, fileSize, data, options?.chunkTimeout ?? this.config?.chunkTimeout ?? 30000);
    } finally {
      await this.client!.closeFile(handle);
    }
    
    return remotePath;
  }

  async chmod(remotePath: string, mode: string | number): Promise<void> {
    return this.executeWithConcurrencyControl(async () => {
      this.checkConnection();
      
      const operationId = this.generateOperationId();
      
      // Emit enhanced operation start event
      const startEvent: EnhancedOperationEvent = {
        type: 'chmod',
        operation_id: operationId,
        remotePath: remotePath,
        fileName: this.extractFileName(remotePath),
        startTime: Date.now()
      };
      this.emitOperationStart(startEvent);
      
      try {
        const numericMode = typeof mode === 'string' ? parseInt(mode, 8) : mode;
        await this.client!.setAttributes(remotePath, { permissions: numericMode });
        
        // Emit enhanced operation complete event
        const completeEvent: EnhancedOperationEvent = {
          ...startEvent,
          duration: Date.now() - startEvent.startTime
        };
        this.emitOperationComplete(completeEvent);
      } catch (error) {
        // Emit enhanced operation error event
        const errorEvent: EnhancedOperationEvent = {
          ...startEvent,
          duration: Date.now() - startEvent.startTime,
          error: error instanceof Error ? error : new Error(String(error))
        };
        this.emitOperationError(errorEvent);
        throw error;
      }
    });
  }

  async realPath(remotePath: string): Promise<string> {
    this.checkConnection();
    return this.client!.realPath(remotePath);
  }

  async uploadDir(srcDir: string, dstDir: string, options?: { 
    filter?: (path: string, isDirectory: boolean) => boolean;
    chunkTimeout?: number;
  }): Promise<void> {
    this.checkConnection();
    
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
          const putOptions = options?.chunkTimeout ? { chunkTimeout: options.chunkTimeout } : undefined;
          await this.put(srcPath, dstPath, putOptions);
        }
      } catch (error: any) {
        throw new Error(`Failed to upload ${srcPath}: ${error.message}`);
      }
    }
  }

  async downloadDir(srcDir: string, dstDir: string, options?: { filter?: (path: string, isDirectory: boolean) => boolean }): Promise<void> {
    this.checkConnection();
    
    // Verify source directory exists on remote
    try {
      const srcStats = await this.client!.stat(srcDir);
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
    
    const entries = await this.client!.listDirectory(srcDir);
    
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
  async end(gracefulTimeout?: number): Promise<void> {
    if (this.client && this.client.isReady()) {
      // Graceful disconnect - wait for pending operations to complete
      const timeout = gracefulTimeout ?? this.config?.gracefulTimeout ?? 3000;
      await new Promise(resolve => setTimeout(resolve, timeout));
    }
    this.disconnect();
  }

  // Low-level methods (for advanced users)
  async listDirectory(path: string) {
    this.checkConnection();
    return this.client!.listDirectory(path);
  }

  async openFile(path: string, flags?: number) {
    this.checkConnection();
    return this.client!.openFile(path, flags);
  }

  async closeFile(handle: Buffer) {
    this.checkConnection();
    return this.client!.closeFile(handle);
  }

  async readFile(handle: Buffer, offset: number, length: number) {
    this.checkConnection();
    return this.client!.readFile(handle, offset, length);
  }

  async writeFile(handle: Buffer, offset: number, data: Buffer, timeoutMs?: number) {
    this.checkConnection();
    return this.client!.writeFile(handle, offset, data, timeoutMs);
  }

  /**
   * Handle automatic reconnection when approaching server operation limits
   */
  private async handleAutoReconnection(currentHandle: Buffer, remotePath: string): Promise<Buffer> {
    if (!this.client || !this.config) {
      throw new Error('Client not connected during reconnection');
    }

    const stats = this.client.getOperationStats();
    this.emit('debug', `Auto-reconnecting: ${stats.operations} ops, ${stats.mbTransferred.toFixed(2)}MB transferred`);
    this.emit('autoReconnect', { 
      reason: 'operation_limit', 
      operations: stats.operations, 
      bytesTransferred: stats.bytesTransferred 
    });

    // Close current handle and connection
    try {
      await this.client.closeFile(currentHandle);
    } catch (closeError) {
      // Ignore close errors during reconnection
      this.emit('debug', `Handle close error during reconnection: ${closeError instanceof Error ? closeError.message : String(closeError)}`);
    }

    // Store original config for reconnection
    const originalConfig = { ...this.config };
    
    // Completely clear current client first
    if (this.client) {
      try {
        // Remove all event listeners to prevent interference
        this.client.removeAllListeners();
        this.client.disconnect();
      } catch (error) {
        // Ignore disconnect errors
      }
      this.client = null;
    }

    // Create new client directly (bypassing the problematic connect method)
    this.emit('debug', 'Creating new client for reconnection...');
    try {
      const newClient = new SSH2StreamsSFTPClient(originalConfig);
      
      // Set up event handlers for new client
      newClient.on('ready', () => this.emit('ready'));
      newClient.on('error', (err) => {
        this.emit('error', err);
        // Only clear client if it's the current one
        if (this.client === newClient) {
          this.client = null;
        }
      });
      newClient.on('close', () => {
        // Only clear client if it's the current one
        if (this.client === newClient) {
          this.client = null;
        }
        this.emit('close');
      });
      newClient.on('debug', (msg) => this.emit('debug', msg));
      
      // Connect the new client
      await newClient.connect();
      
      // Only set this.client after successful connection
      this.client = newClient;
      
      this.emit('debug', 'Reconnection completed successfully');

      // Reopen file with new connection
      const newHandle = await this.client.openFile(remotePath, SFTP_OPEN_FLAGS.READ);
      return newHandle;
      
    } catch (connectError) {
      this.emit('debug', `Reconnection failed: ${connectError instanceof Error ? connectError.message : String(connectError)}`);
      throw new Error(`Failed to reconnect: ${connectError instanceof Error ? connectError.message : String(connectError)}`);
    }
  }

  disconnect() {
    // Cancel all operations when disconnecting
    this.cancelAllOperations();
    
    if (this.client) {
      try {
        this.client.disconnect();
      } catch (error) {
        // Ignore disconnect errors - client might already be closed
      } finally {
        this.client = null;
      }
    }
  }

  isReady(): boolean {
    return this.client ? this.client.isReady() : false;
  }

  /**
   * Get connection health status
   */
  getHealthStatus(): { healthy: boolean; connected: boolean; ready: boolean } {
    if (!this.client) {
      return { healthy: false, connected: false, ready: false };
    }
    return this.client.getHealthStatus();
  }

}

export default SftpClient;

// Export types and classes for TypeScript users
export * from './ssh/types';
export type { 
  SFTPClientOptions,
  KeepaliveConfig,
  HealthCheckConfig,
  AutoReconnectConfig
} from './sftp/ssh2-streams-client';
export type { SSH2StreamsConfig } from './ssh/ssh2-streams-transport';
export { SSH2StreamsSFTPClient } from './sftp/ssh2-streams-client';
export { SSH2StreamsTransport } from './ssh/ssh2-streams-transport';
export { enablePureJSSigningFix, disablePureJSSigningFix, isPureJSSigningFixEnabled } from './ssh/pure-js-signing-fix';
export { SFTPError } from './ssh/types';