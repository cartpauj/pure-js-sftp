# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2024-12-17

### Added
- **Complete SSH2/SFTP Protocol Implementation**
  - Pure JavaScript SSH transport layer with version exchange
  - Diffie-Hellman key exchange (Groups 14 & 16) 
  - Password authentication system
  - Full SFTP subsystem with packet parsing and handling

- **ssh2-sftp-client Compatible API**
  - Drop-in replacement for ssh2-sftp-client
  - All major methods: `connect`, `end`, `list`, `get`, `put`, `delete`, `rename`
  - Directory operations: `mkdir`, `rmdir` with recursive support
  - File operations: `stat`, `exists`, `chmod`
  - Advanced transfers: `fastGet`, `fastPut` with optimized chunking

- **Stream Support**
  - `createReadStream()` for streaming downloads
  - `createWriteStream()` for streaming uploads
  - Configurable buffer sizes and chunk sizes
  - Proper stream lifecycle management and cleanup

- **Bulk Operations**
  - `uploadDir()` - Upload entire directories recursively
  - `downloadDir()` - Download entire directories recursively
  - File filtering capabilities
  - Progress tracking callbacks
  - Concurrent operation limiting

- **Advanced Features**
  - TypeScript support with full type definitions
  - Comprehensive error handling (SSHError, SFTPError)
  - Configurable timeouts and connection options
  - Debug logging support
  - Memory-efficient buffer management

- **Developer Experience**
  - Complete example suite (basic, streams, bulk operations)
  - Professional TypeScript configuration
  - Jest testing framework
  - ESLint code quality enforcement
  - Comprehensive documentation

### Technical Details
- **Zero Native Dependencies** - Pure JavaScript implementation
- **Cross-platform Compatibility** - Works on all Node.js supported platforms
- **VSCode Extension Ready** - Solves native module loading issues
- **Modern ES2020+ Features** - Built with latest JavaScript standards
- **GPL-3.0 License** - Open source with strong copyleft protection

### Migration from ssh2-sftp-client
```javascript
// Before
const Client = require('ssh2-sftp-client');

// After  
const Client = require('pure-js-sftp').default;

// Same API - no code changes needed!
```

This release represents a complete, production-ready SFTP client implementation that solves the original problem of native dependency issues in VSCode extensions while providing a modern, feature-rich API.