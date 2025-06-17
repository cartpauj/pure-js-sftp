# Pure JS SFTP Client

A pure JavaScript SFTP client with no native dependencies, designed to work seamlessly in environments where native modules fail to load (like VSCode extensions on Linux).

## 🚀 Features

- **Pure JavaScript**: No native dependencies or .node files
- **Promise-based API**: Modern async/await support
- **ssh2-sftp-client Compatible**: Drop-in replacement API
- **TypeScript Support**: Full type definitions included
- **Cross-platform**: Works on all platforms supported by Node.js
- **VSCode Compatible**: Designed specifically for VSCode extension compatibility

## 📦 Installation

```bash
npm install pure-js-sftp
```

## 🔧 Usage

### Basic JavaScript Example
```javascript
const SftpClient = require('pure-js-sftp').default;

const sftp = new SftpClient();

async function example() {
  try {
    await sftp.connect({
      host: 'example.com',
      username: 'user',
      password: 'password'
    });
    
    // Upload a file
    await sftp.put('local-file.txt', '/remote/path/file.txt');
    
    // Download a file
    await sftp.get('/remote/path/file.txt', 'local-file.txt');
    
    // List directory contents
    const list = await sftp.list('/remote/directory');
    console.log(list);
    
  } catch (error) {
    console.error('SFTP Error:', error);
  } finally {
    await sftp.end();
  }
}
```

### TypeScript Example
```typescript
import SftpClient, { SSHConfig, FileInfo } from 'pure-js-sftp';

const sftp = new SftpClient();

const config: SSHConfig = {
  host: 'example.com',
  username: 'user',
  password: 'password',
  timeout: 30000
};

const files: FileInfo[] = await sftp.list('/remote/directory');
```

### API Compatibility

This library provides a **drop-in replacement** for `ssh2-sftp-client`:

```javascript
// Before (ssh2-sftp-client)
const Client = require('ssh2-sftp-client');

// After (pure-js-sftp) 
const Client = require('pure-js-sftp').default;

// Same API, zero changes needed!
```

## 🏗️ Development Status

This project is rapidly approaching MVP status! See [PROJECT-PITCH.md](./PROJECT-PITCH.md) for the complete implementation roadmap.

### 🎉 PRODUCTION READY! v1.0.0 🚀

**✅ ALL PHASES COMPLETE (100%):**
- ✅ **Phase 1**: Foundation & Core Protocol  
- ✅ **Phase 2**: Low-Level SFTP Operations
- ✅ **Phase 3**: High-Level API Layer
- ✅ **Phase 4**: Advanced Features
- ✅ **Phase 5**: Polish & Optimization
- ✅ **Phase 6**: Release Preparation

**🚀 Full Feature Set:**
- ✅ Complete file transfers (`get`, `put`, `fastGet`, `fastPut`)
- ✅ Directory operations (`list`, `mkdir`, `rmdir`, recursive)
- ✅ File management (`delete`, `rename`, `stat`, `exists`, `chmod`)
- ✅ Stream support (`createReadStream`, `createWriteStream`)
- ✅ Bulk operations (`uploadDir`, `downloadDir` with progress)
- ✅ Advanced features (filtering, concurrency control, progress tracking)

## 🤝 Contributing

This project is in early development. Contributions welcome!

## 📄 License

GPL-3.0 License - see [LICENSE](LICENSE) file for details.

## 🔗 Related Projects

- [ssh2](https://github.com/mscdex/ssh2) - The original SSH2 implementation
- [ssh2-sftp-client](https://github.com/theophilusx/ssh2-sftp-client) - High-level SFTP client wrapper