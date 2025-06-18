/**
 * SSH Protocol Types and Interfaces
 */

// SFTP Constants
export const SFTP_VERSION = 3;

// SFTP Message Types
export enum SFTP_MSG {
  INIT = 1,
  VERSION = 2,
  OPEN = 3,
  CLOSE = 4,
  READ = 5,
  WRITE = 6,
  LSTAT = 7,
  FSTAT = 8,
  SETSTAT = 9,
  FSETSTAT = 10,
  OPENDIR = 11,
  READDIR = 12,
  REMOVE = 13,
  MKDIR = 14,
  RMDIR = 15,
  REALPATH = 16,
  STAT = 17,
  RENAME = 18,
  READLINK = 19,
  SYMLINK = 20,
  STATUS = 101,
  HANDLE = 102,
  DATA = 103,
  NAME = 104,
  ATTRS = 105,
  EXTENDED = 200,
  EXTENDED_REPLY = 201,
}

// SFTP Status Codes
export enum SFTP_STATUS {
  OK = 0,
  EOF = 1,
  NO_SUCH_FILE = 2,
  PERMISSION_DENIED = 3,
  FAILURE = 4,
  BAD_MESSAGE = 5,
  NO_CONNECTION = 6,
  CONNECTION_LOST = 7,
  OP_UNSUPPORTED = 8,
}

// File Open Flags
export enum SFTP_OPEN_FLAGS {
  READ = 0x00000001,
  WRITE = 0x00000002,
  APPEND = 0x00000004,
  CREAT = 0x00000008,
  TRUNC = 0x00000010,
  EXCL = 0x00000020,
}

// File Attributes
export enum SFTP_ATTR {
  SIZE = 0x00000001,
  UIDGID = 0x00000002,
  PERMISSIONS = 0x00000004,
  ACMODTIME = 0x00000008,
  EXTENDED = 0x80000000,
}

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
  type: number;
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