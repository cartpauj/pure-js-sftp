# Migration Guide: From ssh2-sftp-client to pure-js-sftp

This guide helps you migrate from `ssh2-sftp-client` to `pure-js-sftp` - a pure JavaScript drop-in replacement.

## Why Migrate?

- **No Native Dependencies**: Eliminates `.node` file issues in VSCode extensions and other environments
- **Cross-platform Compatibility**: Works everywhere Node.js runs
- **Same API**: Drop-in replacement with identical interface
- **Modern Implementation**: Built with TypeScript and latest JavaScript features
- **Better Error Handling**: Improved error types and debugging

## Quick Migration

### 1. Install pure-js-sftp

```bash
npm uninstall ssh2-sftp-client
npm install pure-js-sftp
```

### 2. Update Import/Require Statements

**CommonJS (Node.js):**
```javascript
// Before
const Client = require('ssh2-sftp-client');

// After
const Client = require('pure-js-sftp').default;
```

**ES Modules/TypeScript:**
```typescript
// Before
import Client from 'ssh2-sftp-client';

// After
import Client from 'pure-js-sftp';
```

### 3. No Code Changes Required!

The API is 100% compatible:

```javascript
const sftp = new Client();

await sftp.connect({
  host: 'example.com',
  username: 'user',
  password: 'password'
});

// All existing code works unchanged
const files = await sftp.list('/remote/directory');
await sftp.put('./local-file.txt', '/remote/file.txt');
await sftp.get('/remote/file.txt', './downloaded-file.txt');
await sftp.end();
```

## Feature Comparison

| Feature | ssh2-sftp-client | pure-js-sftp | Notes |
|---------|------------------|---------------|-------|
| Basic Operations | ✅ | ✅ | Full compatibility |
| Streams | ✅ | ✅ | Enhanced implementation |
| Bulk Operations | ✅ | ✅ | Better progress tracking |
| TypeScript | ✅ | ✅ | Improved type definitions |
| Native Dependencies | ❌ (uses ssh2) | ✅ | Pure JavaScript |
| VSCode Extensions | ⚠️ (issues) | ✅ | Works perfectly |
| Cross-platform | ⚠️ (compilation) | ✅ | No compilation needed |

## Enhanced Features

### Better Progress Tracking

```javascript
// Enhanced progress callbacks
await sftp.uploadDir('./local-dir', '/remote/dir', {
  progress: (transferred, total) => {
    console.log(`Progress: ${transferred}/${total} files`);
  }
});
```

### Improved Error Handling

```typescript
import { SSHError, SFTPError } from 'pure-js-sftp';

try {
  await sftp.connect(config);
} catch (error) {
  if (error instanceof SSHError) {
    console.log('SSH connection error:', error.code);
  } else if (error instanceof SFTPError) {
    console.log('SFTP operation error:', error.code);
  }
}
```

### Enhanced Filtering

```javascript
// More flexible filtering options
await sftp.uploadDir('./src', '/remote/src', {
  filter: (path) => {
    return !path.includes('node_modules') && 
           !path.includes('.git') &&
           path.endsWith('.js') || path.endsWith('.ts');
  }
});
```

## Configuration Differences

Most configuration options are identical, but some enhancements:

```javascript
const config = {
  host: 'example.com',
  username: 'user',
  password: 'password',
  
  // Enhanced options in pure-js-sftp
  timeout: 30000,        // Connection timeout
  debug: true,           // Debug logging
  keepaliveInterval: 0,  // Keepalive frequency
  
  // All ssh2-sftp-client options supported
  algorithms: {
    kex: ['diffie-hellman-group14-sha256'],
    cipher: ['aes128-ctr', 'aes256-ctr'],
    hmac: ['hmac-sha2-256']
  }
};
```

## Testing Your Migration

1. **Run Existing Tests**: Your existing test suite should pass without changes
2. **Check VSCode Extensions**: If migrating for VSCode, verify the extension loads properly
3. **Performance Testing**: Compare transfer speeds (should be similar or better)

## Common Issues

### Import/Export Issues

If you encounter import issues:

```javascript
// Try explicit default import
const SftpClient = require('pure-js-sftp').default;

// Or destructured import
const { default: SftpClient } = require('pure-js-sftp');
```

### TypeScript Errors

Update your TypeScript imports:

```typescript
// Preferred import style
import SftpClient, { SSHConfig, FileInfo } from 'pure-js-sftp';
```

## Rollback Plan

If you need to rollback:

```bash
npm uninstall pure-js-sftp
npm install ssh2-sftp-client
```

Then revert your import statements. All your application code will work unchanged.

## Getting Help

- **GitHub Issues**: [Report issues](https://github.com/your-repo/pure-js-sftp/issues)
- **Documentation**: See README.md and examples/
- **API Reference**: TypeScript definitions provide complete API docs

## Performance Notes

- **Memory Usage**: Similar to ssh2-sftp-client
- **Transfer Speeds**: Comparable performance for most operations
- **Startup Time**: Faster startup due to no native module loading
- **Bundle Size**: Larger JavaScript bundle, but no native compilation needed

This migration should be seamless for most applications. The pure JavaScript implementation solves native dependency issues while maintaining full API compatibility.