# Supported SSH Key Types and Formats

The pure-js-sftp library supports a comprehensive range of SSH key types and formats, including passphrase-protected keys, making it compatible with most modern SSH setups.

## ✅ Supported Key Types

### RSA Keys
- **Key Sizes**: 1024-bit, 2048-bit, 3072-bit, 4096-bit
- **Signature Algorithms**: 
  - `rsa-sha2-256` (preferred, modern standard)
  - `rsa-sha2-512` (high security)
  - `ssh-rsa` (legacy, automatically upgraded to SHA-256)
- **Security**: Uses SHA-256/SHA-512 instead of deprecated SHA-1

### ECDSA Keys (Elliptic Curve)
- **P-256** (`prime256v1`): `ecdsa-sha2-nistp256` with SHA-256
- **P-384** (`secp384r1`): `ecdsa-sha2-nistp384` with SHA-384  
- **P-521** (`secp521r1`): `ecdsa-sha2-nistp521` with SHA-512
- **Wire Format**: Compliant with RFC 5656

### Ed25519 Keys
- **Algorithm**: `ssh-ed25519`
- **Security**: Modern elliptic curve with built-in hashing
- **Performance**: Fast signing and verification
- **Wire Format**: Compliant with RFC 8709

## 🔐 Supported Key Formats

### PKCS#8 Format (Recommended)
```
-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----
```
- Modern standard format
- Supports all key types (RSA, ECDSA, Ed25519)
- Can be encrypted with passphrase

### PKCS#8 Encrypted Format
```
-----BEGIN ENCRYPTED PRIVATE KEY-----
...
-----END ENCRYPTED PRIVATE KEY-----
```
- Passphrase-protected keys
- AES-256-CBC encryption supported
- Automatic passphrase detection

### Traditional RSA Format
```
-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----
```
- Legacy RSA-specific format
- Can be encrypted with passphrase

### Input Types
- **String**: PEM-formatted key as string
- **Buffer**: PEM-formatted key as Buffer

## 🔑 Passphrase Support

### Configuration
```javascript
const config = {
  host: 'your-server.com',
  username: 'your-username',
  privateKey: fs.readFileSync('/path/to/encrypted/key'),
  passphrase: 'your-key-passphrase'
};
```

### Supported Encryption
- **AES-256-CBC**: Most common encryption
- **AES-128-CBC**: Legacy encryption
- **DES-EDE3-CBC**: Triple DES (legacy)

### Automatic Detection
- Automatically detects encrypted keys
- Requires passphrase for encrypted keys
- Clear error messages for missing passphrases

## 📊 Compatibility Matrix

| Key Type | Size/Curve | Algorithm | Passphrase | Status |
|----------|------------|-----------|------------|---------|
| RSA | 1024-bit | rsa-sha2-256 | ✅ | ✅ Supported |
| RSA | 2048-bit | rsa-sha2-256 | ✅ | ✅ Recommended |
| RSA | 3072-bit | rsa-sha2-256/512 | ✅ | ✅ High Security |
| RSA | 4096-bit | rsa-sha2-256/512 | ✅ | ✅ Maximum Security |
| ECDSA | P-256 | ecdsa-sha2-nistp256 | ✅ | ✅ Recommended |
| ECDSA | P-384 | ecdsa-sha2-nistp384 | ✅ | ✅ High Security |
| ECDSA | P-521 | ecdsa-sha2-nistp521 | ✅ | ✅ Maximum Security |
| Ed25519 | 256-bit | ssh-ed25519 | ✅ | ✅ Modern Standard |

## 🚫 Unsupported Key Types

- **DSA Keys**: Deprecated and insecure
- **ECDSA with non-NIST curves**: Only NIST P-256/384/521 supported
- **Ed448**: Not yet implemented (uncommon)

## 💡 Usage Examples

### Basic RSA Key
```javascript
import SftpClient from 'pure-js-sftp';

const sftp = new SftpClient();
await sftp.connect({
  host: 'example.com',
  username: 'user',
  privateKey: fs.readFileSync('~/.ssh/id_rsa')
});
```

### Passphrase-Protected Key
```javascript
await sftp.connect({
  host: 'example.com', 
  username: 'user',
  privateKey: fs.readFileSync('~/.ssh/id_rsa_encrypted'),
  passphrase: 'my-secret-passphrase'
});
```

### Ed25519 Key (Modern)
```javascript
await sftp.connect({
  host: 'example.com',
  username: 'user', 
  privateKey: fs.readFileSync('~/.ssh/id_ed25519')
});
```

### ECDSA P-256 Key
```javascript
await sftp.connect({
  host: 'example.com',
  username: 'user',
  privateKey: fs.readFileSync('~/.ssh/id_ecdsa')
});
```

## 🔒 Security Best Practices

1. **Use Ed25519 for new keys** - Modern, secure, fast
2. **RSA minimum 2048-bit** - 1024-bit is deprecated
3. **ECDSA P-256 minimum** - Good balance of security and performance
4. **Always use passphrases** - Protects keys if compromised
5. **Prefer PKCS#8 format** - Modern standard, better tool support

## 🛠 Key Generation Examples

### Generate Ed25519 Key (Recommended)
```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -C "your-email@example.com"
```

### Generate RSA 4096-bit Key
```bash
ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa -C "your-email@example.com"
```

### Generate ECDSA P-256 Key
```bash
ssh-keygen -t ecdsa -b 256 -f ~/.ssh/id_ecdsa -C "your-email@example.com"
```

### Convert to PKCS#8 Format
```bash
ssh-keygen -p -m PKCS8 -f ~/.ssh/id_rsa
```

## 🔍 Error Handling

The library provides clear error messages for key issues:

- `"Private key is encrypted but no passphrase provided"`
- `"Failed to parse private key: Invalid key format"`
- `"Key type rsa does not match algorithm ecdsa-sha2-nistp256"`
- `"Unsupported key type: dsa"`

## 📈 Performance Notes

- **Ed25519**: Fastest for signing and verification
- **ECDSA P-256**: Good balance of speed and security  
- **RSA 2048**: Acceptable performance, widely compatible
- **RSA 4096**: Slower but maximum security

The pure-js-sftp library supports the same key types and formats as the popular ssh2 library, ensuring drop-in compatibility for most use cases.