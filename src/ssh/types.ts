/**
 * SSH Protocol Types and Interfaces
 */

import { SSH_MSG, SFTP_MSG, SFTP_STATUS } from './constants';

// Basic SSH Configuration
export interface SSHConfig {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKey?: string | Buffer;
  passphrase?: string;
  timeout?: number;
  keepaliveInterval?: number;
  algorithms?: AlgorithmConfig;
  debug?: boolean;
}

// Algorithm Configuration
export interface AlgorithmConfig {
  kex?: string[];
  hostKey?: string[];
  cipher?: string[];
  mac?: string[];
  compress?: string[];
}

// SSH Packet Structure
export interface SSHPacket {
  type: SSH_MSG;
  payload: Buffer;
}

// Key Exchange Init Message
export interface KEXInitMessage {
  cookie: Buffer; // 16 random bytes
  kex_algorithms: string[];
  server_host_key_algorithms: string[];
  encryption_algorithms_client_to_server: string[];
  encryption_algorithms_server_to_client: string[];
  mac_algorithms_client_to_server: string[];
  mac_algorithms_server_to_client: string[];
  compression_algorithms_client_to_server: string[];
  compression_algorithms_server_to_client: string[];
  languages_client_to_server: string[];
  languages_server_to_client: string[];
  first_kex_packet_follows: boolean;
  reserved: number;
}

// Authentication Context
export interface AuthContext {
  username: string;
  service: string;
  method: string;
  authenticated: boolean;
}

// Channel Information
export interface ChannelInfo {
  id: number;
  remoteId: number;
  windowSize: number;
  maxPacketSize: number;
  type: string;
  state: ChannelState;
}

export enum ChannelState {
  CLOSED = 0,
  OPEN = 1,
  EOF_SENT = 2,
  EOF_RECEIVED = 3,
  CLOSE_SENT = 4,
  CLOSE_RECEIVED = 5,
}

// SFTP Types
export interface SFTPPacket {
  type: SFTP_MSG;
  id?: number | undefined;
  payload: Buffer;
}

export interface SFTPStatus {
  code: SFTP_STATUS;
  message: string;
  language?: string;
}

export interface SFTPHandle {
  handle: Buffer;
  path?: string;
  flags?: number;
}

// File Attributes
export interface FileAttributes {
  flags: number;
  size?: number;
  uid?: number;
  gid?: number;
  permissions?: number;
  atime?: number;
  mtime?: number;
  extended?: { [key: string]: string };
}

// Directory Entry
export interface DirectoryEntry {
  filename: string;
  longname: string;
  attrs: FileAttributes;
}

// File Stats (compatible with ssh2-sftp-client)
export interface FileStats {
  mode: number;
  uid: number;
  gid: number;
  size: number;
  atime: Date;
  mtime: Date;
  isFile(): boolean;
  isDirectory(): boolean;
  isBlockDevice(): boolean;
  isCharacterDevice(): boolean;
  isSymbolicLink(): boolean;
  isFIFO(): boolean;
  isSocket(): boolean;
}

// File Info (compatible with ssh2-sftp-client)
export interface FileInfo {
  type: 'd' | '-' | 'l';
  name: string;
  size: number;
  modifyTime: Date;
  accessTime: Date;
  rights: {
    user: string;
    group: string;
    other: string;
  };
  owner: number;
  group: number;
}

// Connection State
export enum ConnectionState {
  DISCONNECTED = 0,
  CONNECTING = 1,
  VERSION_EXCHANGE = 2,
  KEY_EXCHANGE = 3,
  AUTHENTICATION = 4,
  AUTHENTICATED = 5,
  SFTP_INIT = 6,
  READY = 7,
  DISCONNECTING = 8,
}

// Error Types
export class SSHError extends Error {
  constructor(
    message: string,
    public code?: string,
    public level?: 'client' | 'protocol' | 'sftp'
  ) {
    super(message);
    this.name = 'SSHError';
  }
}

export class SFTPError extends Error {
  constructor(
    message: string,
    public code?: SFTP_STATUS,
    public path?: string
  ) {
    super(message);
    this.name = 'SFTPError';
  }
}

// Stream Options (compatible with ssh2-sftp-client)
export interface StreamOptions {
  flags?: string;
  encoding?: BufferEncoding;
  mode?: number;
  autoClose?: boolean;
  start?: number;
  end?: number;
  highWaterMark?: number;
}

// Transfer Options
export interface TransferOptions {
  concurrency?: number;
  chunkSize?: number;
  mode?: number;
  encoding?: BufferEncoding;
  debug?: boolean;
  progress?: (transferred: number, total: number, fsize: number) => void;
}