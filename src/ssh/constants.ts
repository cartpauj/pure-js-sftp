/**
 * SSH Protocol Constants
 * Based on RFC 4253 (SSH Transport Layer Protocol)
 */

// SSH Protocol Version
export const SSH_VERSION = 'SSH-2.0';
export const SOFTWARE_VERSION = 'PureJS_SFTP_1.0';
export const PROTOCOL_VERSION = `${SSH_VERSION}-${SOFTWARE_VERSION}`;

// SSH Message Types
export enum SSH_MSG {
  DISCONNECT = 1,
  IGNORE = 2,
  UNIMPLEMENTED = 3,
  DEBUG = 4,
  SERVICE_REQUEST = 5,
  SERVICE_ACCEPT = 6,
  KEXINIT = 20,
  NEWKEYS = 21,
  KEXDH_INIT = 30,
  KEXDH_REPLY = 31,
  USERAUTH_REQUEST = 50,
  USERAUTH_FAILURE = 51,
  USERAUTH_SUCCESS = 52,
  USERAUTH_BANNER = 53,
  GLOBAL_REQUEST = 80,
  REQUEST_SUCCESS = 81,
  REQUEST_FAILURE = 82,
  CHANNEL_OPEN = 90,
  CHANNEL_OPEN_CONFIRMATION = 91,
  CHANNEL_OPEN_FAILURE = 92,
  CHANNEL_WINDOW_ADJUST = 93,
  CHANNEL_DATA = 94,
  CHANNEL_EXTENDED_DATA = 95,
  CHANNEL_EOF = 96,
  CHANNEL_CLOSE = 97,
  CHANNEL_REQUEST = 98,
  CHANNEL_SUCCESS = 99,
  CHANNEL_FAILURE = 100,
}

// SSH Disconnect Reason Codes
export enum SSH_DISCONNECT {
  HOST_NOT_ALLOWED_TO_CONNECT = 1,
  PROTOCOL_ERROR = 2,
  KEY_EXCHANGE_FAILED = 3,
  RESERVED = 4,
  MAC_ERROR = 5,
  COMPRESSION_ERROR = 6,
  SERVICE_NOT_AVAILABLE = 7,
  PROTOCOL_VERSION_NOT_SUPPORTED = 8,
  HOST_KEY_NOT_VERIFIABLE = 9,
  CONNECTION_LOST = 10,
  BY_APPLICATION = 11,
  TOO_MANY_CONNECTIONS = 12,
  AUTH_CANCELLED_BY_USER = 13,
  NO_MORE_AUTH_METHODS_AVAILABLE = 14,
  ILLEGAL_USER_NAME = 15,
}

// Key Exchange Algorithms
export const KEX_ALGORITHMS = [
  'diffie-hellman-group14-sha256',
  'diffie-hellman-group16-sha512',
  'diffie-hellman-group18-sha512',
] as const;

// Server Host Key Algorithms
export const HOST_KEY_ALGORITHMS = [
  'rsa-sha2-512',
  'rsa-sha2-256',
  'ssh-rsa',
] as const;

// Encryption Algorithms
export const ENCRYPTION_ALGORITHMS = [
  'aes128-ctr',
  'aes192-ctr', 
  'aes256-ctr',
  'aes128-gcm@openssh.com',
  'aes256-gcm@openssh.com',
] as const;

// MAC Algorithms
export const MAC_ALGORITHMS = [
  'hmac-sha2-256',
  'hmac-sha2-512',
  'hmac-sha1',
] as const;

// Compression Algorithms
export const COMPRESSION_ALGORITHMS = [
  'none',
  'zlib@openssh.com',
] as const;

// Authentication Methods
export const AUTH_METHODS = [
  'password',
  'publickey',
  'keyboard-interactive',
] as const;

// Channel Types
export const CHANNEL_TYPES = {
  SESSION: 'session',
  DIRECT_TCPIP: 'direct-tcpip',
  FORWARDED_TCPIP: 'forwarded-tcpip',
} as const;

// SFTP Constants
export const SFTP_VERSION = 3;
export const SFTP_PACKET_SIZE = 32768; // 32KB default

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