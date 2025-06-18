# Supported Algorithms and Cryptographic Features

This document provides a comprehensive list of all cryptographic algorithms, key types, and security features supported by pure-js-sftp through the ssh2-streams library.

## ⚠️ **Critical Security Notice**

**ssh2-streams Library Status:**
- **Last Updated**: 5 years ago (2019)
- **Maintenance**: Inactive development
- **Post-Quantum Support**: ❌ **None**

**Missing Modern Algorithms (OpenSSH 9.0+ Default):**
- ❌ `mlkem768x25519-sha256` (OpenSSH 10.0 default)
- ❌ `sntrup761x25519-sha512` (OpenSSH 9.0+ default)
- ❌ NIST ML-KEM family (FIPS 203)
- ❌ CRYSTALS-Dilithium signatures (FIPS 204)
- ❌ SPHINCS+ signatures (FIPS 205)

**Compatibility Risk:** This library may not connect to OpenSSH 10.0+ servers that disable legacy algorithms for security compliance.

## 🔑 SSH Key Types

### Elliptic Curve Keys (Recommended)
| Algorithm | Key Size | Node.js Version | Security | Performance | Status |
|-----------|----------|-----------------|----------|-------------|---------|
| `ssh-ed25519` | 256-bit | v12.0.0+ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ✅ **Best Choice** |
| `ecdsa-sha2-nistp256` | 256-bit | v5.2.0+ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ✅ Recommended |
| `ecdsa-sha2-nistp384` | 384-bit | v5.2.0+ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ✅ High Security |
| `ecdsa-sha2-nistp521` | 521-bit | v5.2.0+ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ✅ Maximum Security |

### Traditional Keys
| Algorithm | Key Size | Node.js Version | Security | Performance | Status |
|-----------|----------|-----------------|----------|-------------|---------|
| `ssh-rsa` | 2048-4096 bit | All versions | ⭐⭐⭐ | ⭐⭐ | ✅ Legacy Support |
| `rsa-sha2-256` | 2048-4096 bit | All versions | ⭐⭐⭐⭐ | ⭐⭐ | ✅ Better than ssh-rsa |
| `rsa-sha2-512` | 2048-4096 bit | All versions | ⭐⭐⭐⭐ | ⭐⭐ | ✅ Better than ssh-rsa |
| `ssh-dss` | 1024 bit | All versions | ⭐ | ⭐⭐ | ⚠️ **Deprecated** |

## 🔐 Key Exchange (KEX) Algorithms

### Elliptic Curve Diffie-Hellman (Recommended)
| Algorithm | Node.js Version | Security | Performance | Status |
|-----------|-----------------|----------|-------------|---------|
| `curve25519-sha256` | v13.9.0+ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ✅ **Best Choice** |
| `curve25519-sha256@libssh.org` | v13.9.0+ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ✅ **Best Choice** |
| `ecdh-sha2-nistp256` | v0.11.14+ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ✅ Good |
| `ecdh-sha2-nistp384` | v0.11.14+ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ✅ High Security |
| `ecdh-sha2-nistp521` | v0.11.14+ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ✅ Maximum Security |

### Diffie-Hellman Groups
| Algorithm | Node.js Version | Security | Performance | Status |
|-----------|-----------------|----------|-------------|---------|
| `diffie-hellman-group-exchange-sha256` | v0.11.12+ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ✅ Secure |
| `diffie-hellman-group16-sha512` | All versions | ⭐⭐⭐⭐⭐ | ⭐⭐ | ✅ High Security |
| `diffie-hellman-group18-sha512` | All versions | ⭐⭐⭐⭐⭐ | ⭐⭐ | ✅ High Security |
| `diffie-hellman-group14-sha256` | All versions | ⭐⭐⭐⭐ | ⭐⭐ | ✅ Good |
| `diffie-hellman-group14-sha1` | All versions | ⭐⭐⭐ | ⭐⭐ | ✅ Legacy |
| `diffie-hellman-group-exchange-sha1` | All versions | ⭐⭐ | ⭐⭐⭐ | ⚠️ Legacy Only |
| `diffie-hellman-group1-sha1` | All versions | ⭐ | ⭐⭐ | ⚠️ **Deprecated** |

## 🛡️ Cipher Algorithms

### Authenticated Encryption (Recommended)
| Algorithm | Key Size | Node.js Version | Security | Performance | Status |
|-----------|----------|-----------------|----------|-------------|---------|
| `chacha20-poly1305@openssh.com` | 256-bit | All versions | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ✅ **Best Choice** |
| `aes128-gcm@openssh.com` | 128-bit | v0.11.12+ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ✅ **Excellent** |
| `aes256-gcm@openssh.com` | 256-bit | v0.11.12+ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ✅ **Excellent** |
| `aes128-gcm` | 128-bit | v0.11.12+ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ✅ Standard |
| `aes256-gcm` | 256-bit | v0.11.12+ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ✅ Standard |

### AES Counter Mode
| Algorithm | Key Size | Node.js Version | Security | Performance | Status |
|-----------|----------|-----------------|----------|-------------|---------|
| `aes128-ctr` | 128-bit | All versions | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ✅ Good |
| `aes192-ctr` | 192-bit | All versions | ⭐⭐⭐⭐ | ⭐⭐⭐ | ✅ Good |
| `aes256-ctr` | 256-bit | All versions | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ✅ High Security |

### Legacy Ciphers (Compatibility Only)
| Algorithm | Key Size | Security | Performance | Status |
|-----------|----------|----------|-------------|---------|
| `aes128-cbc` | 128-bit | ⭐⭐⭐ | ⭐⭐⭐ | ⚠️ Legacy |
| `aes192-cbc` | 192-bit | ⭐⭐⭐ | ⭐⭐⭐ | ⚠️ Legacy |
| `aes256-cbc` | 256-bit | ⭐⭐⭐ | ⭐⭐⭐ | ⚠️ Legacy |
| `blowfish-cbc` | 128-bit | ⭐⭐ | ⭐⭐ | ⚠️ Legacy |
| `3des-cbc` | 168-bit | ⭐ | ⭐ | ⚠️ **Deprecated** |
| `cast128-cbc` | 128-bit | ⭐⭐ | ⭐⭐ | ⚠️ Legacy |
| `arcfour` | 128-bit | ⭐ | ⭐⭐⭐ | ⚠️ **Deprecated** |
| `arcfour128` | 128-bit | ⭐ | ⭐⭐⭐ | ⚠️ **Deprecated** |
| `arcfour256` | 256-bit | ⭐ | ⭐⭐⭐ | ⚠️ **Deprecated** |

## 🔏 MAC (Message Authentication) Algorithms

### Modern MAC Algorithms (Recommended)
| Algorithm | Hash | Node.js Version | Security | Performance | Status |
|-----------|------|-----------------|----------|-------------|---------|
| `hmac-sha2-256` | SHA-256 | All versions | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ✅ **Best Choice** |
| `hmac-sha2-512` | SHA-512 | All versions | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ✅ High Security |
| `umac-128@openssh.com` | UMAC | All versions | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ✅ Fast |
| `umac-64@openssh.com` | UMAC | All versions | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ✅ Legacy Fast |

### ETM (Encrypt-then-MAC) Variants (Recommended)
| Algorithm | Hash | Security | Performance | Status |
|-----------|------|----------|-------------|---------|
| `hmac-sha2-256-etm@openssh.com` | SHA-256 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ✅ **Best Choice** |
| `hmac-sha2-512-etm@openssh.com` | SHA-512 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ✅ High Security |
| `hmac-sha1-etm@openssh.com` | SHA-1 | ⭐⭐⭐ | ⭐⭐⭐⭐ | ✅ Legacy |
| `hmac-ripemd160-etm@openssh.com` | RIPEMD | ⭐⭐⭐ | ⭐⭐⭐ | ✅ Legacy |
| `umac-128-etm@openssh.com` | UMAC | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ✅ Fast |

### Legacy MAC Algorithms
| Algorithm | Hash | Security | Performance | Status |
|-----------|------|----------|-------------|---------|
| `hmac-sha2-256-96` | SHA-256 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ✅ Truncated |
| `hmac-sha2-512-96` | SHA-512 | ⭐⭐⭐⭐ | ⭐⭐⭐ | ✅ Truncated |
| `hmac-sha1` | SHA-1 | ⭐⭐ | ⭐⭐⭐⭐ | ⚠️ Legacy |
| `hmac-sha1-96` | SHA-1 | ⭐⭐ | ⭐⭐⭐⭐ | ⚠️ Legacy |
| `hmac-ripemd160` | RIPEMD | ⭐⭐ | ⭐⭐⭐ | ⚠️ Legacy |
| `hmac-ripemd160-96` | RIPEMD | ⭐⭐ | ⭐⭐⭐ | ⚠️ Legacy |
| `hmac-md5` | MD5 | ⭐ | ⭐⭐⭐⭐ | ⚠️ **Deprecated** |
| `hmac-md5-96` | MD5 | ⭐ | ⭐⭐⭐⭐ | ⚠️ **Deprecated** |

## 📦 Compression Algorithms

| Algorithm | Description | Performance | Status |
|-----------|-------------|-------------|---------|
| `none` | No compression | ⭐⭐⭐⭐⭐ | ✅ **Default** |
| `zlib@openssh.com` | Delayed compression | ⭐⭐⭐ | ✅ Secure |
| `zlib` | Standard compression | ⭐⭐⭐ | ✅ Compatible |

## 🛠️ Algorithm Configuration

### Recommended Configuration (Maximum Security)
```javascript
await sftp.connect({
  host: 'example.com',
  username: 'user',
  privateKey: privateKey,
  algorithms: {
    kex: [
      'curve25519-sha256@libssh.org',
      'curve25519-sha256',
      'ecdh-sha2-nistp256',
      'diffie-hellman-group16-sha512'
    ],
    cipher: [
      'chacha20-poly1305@openssh.com',
      'aes128-gcm@openssh.com',
      'aes256-gcm@openssh.com',
      'aes128-ctr'
    ],
    hmac: [
      'hmac-sha2-256-etm@openssh.com',
      'hmac-sha2-512-etm@openssh.com',
      'hmac-sha2-256'
    ],
    compress: ['none', 'zlib@openssh.com']
  }
});
```

### Balanced Configuration (Security + Compatibility)
```javascript
await sftp.connect({
  host: 'example.com',
  username: 'user',
  privateKey: privateKey,
  algorithms: {
    kex: [
      'curve25519-sha256@libssh.org',
      'ecdh-sha2-nistp256',
      'diffie-hellman-group14-sha256',
      'diffie-hellman-group14-sha1'
    ],
    cipher: [
      'aes128-gcm@openssh.com',
      'aes128-ctr',
      'aes192-ctr',
      'aes128-cbc'
    ],
    hmac: [
      'hmac-sha2-256-etm@openssh.com',
      'hmac-sha2-256',
      'hmac-sha1'
    ],
    compress: ['none']
  }
});
```

### Legacy Compatibility Configuration
```javascript
await sftp.connect({
  host: 'old-server.com',
  username: 'user',
  privateKey: privateKey,
  algorithms: {
    kex: [
      'diffie-hellman-group14-sha1',
      'diffie-hellman-group1-sha1'
    ],
    cipher: [
      'aes128-cbc',
      'aes256-cbc',
      '3des-cbc'
    ],
    hmac: [
      'hmac-sha1',
      'hmac-md5'
    ],
    compress: ['none']
  }
});
```

## 🔍 Node.js Version Requirements

| Feature | Minimum Node.js Version | Notes |
|---------|-------------------------|-------|
| **Ed25519 Keys** | v12.0.0+ | Modern elliptic curve |
| **Curve25519 KEX** | v13.9.0+ / v14.0.0+ | Best key exchange |
| **ECDSA Keys** | v5.2.0+ | Elliptic curve DSA |
| **AES-GCM** | v0.11.12+ | Authenticated encryption |
| **Group Exchange** | v0.11.12+ | Dynamic DH groups |
| **ECDH KEX** | v0.11.14+ | Elliptic curve DH |

## 🔒 Security Recommendations

### ✅ **Available in ssh2-streams (Legacy-Safe 2024)**
- **Keys**: Ed25519, ECDSA P-256/384, RSA 3072+
- **KEX**: Curve25519, ECDH P-256+
- **Ciphers**: ChaCha20-Poly1305, AES-GCM
- **MAC**: HMAC-SHA2-256/512 with ETM

### ⚠️ **Legacy Only**
- **Keys**: RSA 2048, DSA
- **KEX**: DH Group 14 SHA-1, Group 1
- **Ciphers**: AES-CBC, 3DES
- **MAC**: HMAC-SHA1, HMAC-MD5

### ❌ **Avoid (Deprecated)**
- **Keys**: DSA 1024
- **KEX**: DH Group 1 SHA-1
- **Ciphers**: RC4, DES
- **MAC**: MD5-based MACs

### 🚫 **Missing (OpenSSH 9.0+ Standard)**
- **Keys**: Post-quantum signature algorithms
- **KEX**: ML-KEM768+X25519, sntrup761+X25519 hybrids
- **Ciphers**: Next-generation authenticated encryption
- **MAC**: Post-quantum message authentication

## 🔮 **Future-Proofing Recommendations**

### **Current Use (2024-2025):**
- ssh2-streams provides **excellent compatibility** with existing SSH infrastructure
- Supports all **common enterprise SSH servers** (OpenSSH 8.x and earlier)
- Algorithms listed above are **sufficient for current security needs**

### **Migration Planning (2025-2027):**
- **Monitor ssh2 project** for post-quantum algorithm updates
- **Plan transition** to post-quantum compatible libraries
- **Assess OpenSSH upgrade timeline** in your environment
- **Consider security compliance** requirements for post-quantum cryptography

### **Post-Quantum Timeline:**
- **2024**: Current algorithms remain secure and widely compatible
- **2025-2026**: Post-quantum algorithms become standard in new deployments
- **2027+**: Legacy algorithm support may be disabled for security compliance

This comprehensive list ensures you can configure pure-js-sftp for current security requirements while understanding the future migration path for post-quantum SSH infrastructure.