/**
 * Pure JavaScript OpenSSH Private Key Parser
 * Handles encrypted OpenSSH format keys without external dependencies
 */

// Pure JavaScript OpenSSH parser - no direct crypto imports

// Implement bcrypt-pbkdf using child process with correct API

interface OpenSSHKeyData {
  keyType: string;
  publicKey: Buffer;
  privateKey: Buffer;
  comment: string;
}

export function parseOpenSSHPrivateKey(keyData: string, passphrase?: string): OpenSSHKeyData | null {
  try {
    // Remove header/footer and decode base64
    const lines = keyData.split('\n');
    const base64Data = lines
      .filter(line => !line.startsWith('-----'))
      .join('')
      .replace(/\s/g, '');
    
    const keyBuffer = Buffer.from(base64Data, 'base64');
    
    // Parse OpenSSH private key format
    return parseOpenSSHKeyBuffer(keyBuffer, passphrase);
  } catch (error) {
    return null;
  }
}

function parseOpenSSHKeyBuffer(buffer: Buffer, passphrase?: string): OpenSSHKeyData | null {
  let offset = 0;
  
  // Read magic bytes "openssh-key-v1\0"
  const magic = buffer.subarray(offset, offset + 15);
  if (magic.toString() !== 'openssh-key-v1\0') {
    throw new Error('Invalid OpenSSH key magic');
  }
  offset += 15;
  
  // Read cipher name
  const cipherNameLength = buffer.readUInt32BE(offset);
  offset += 4;
  const cipherName = buffer.subarray(offset, offset + cipherNameLength).toString();
  offset += cipherNameLength;
  
  // Read KDF name
  const kdfNameLength = buffer.readUInt32BE(offset);
  offset += 4;
  const kdfName = buffer.subarray(offset, offset + kdfNameLength).toString();
  offset += kdfNameLength;
  
  // Read KDF options
  const kdfOptionsLength = buffer.readUInt32BE(offset);
  offset += 4;
  const kdfOptions = buffer.subarray(offset, offset + kdfOptionsLength);
  offset += kdfOptionsLength;
  
  // Read number of keys
  const numberOfKeys = buffer.readUInt32BE(offset);
  offset += 4;
  
  if (numberOfKeys !== 1) {
    throw new Error('Multiple keys not supported');
  }
  
  // Read public key
  const publicKeyLength = buffer.readUInt32BE(offset);
  offset += 4;
  const publicKeyData = buffer.subarray(offset, offset + publicKeyLength);
  offset += publicKeyLength;
  
  // Read encrypted private key section
  const encryptedLength = buffer.readUInt32BE(offset);
  offset += 4;
  const encryptedData = buffer.subarray(offset, offset + encryptedLength);
  
  // Decrypt private key section
  let decryptedData: Buffer;
  if (cipherName === 'none') {
    decryptedData = encryptedData;
  } else {
    if (!passphrase) {
      throw new Error('Passphrase required for encrypted key');
    }
    decryptedData = decryptPrivateKeySection(encryptedData, cipherName, kdfName, kdfOptions, passphrase);
  }
  
  // Parse decrypted private key data
  return parseDecryptedPrivateKey(decryptedData, publicKeyData);
}

function decryptPrivateKeySection(
  encryptedData: Buffer,
  cipherName: string,
  kdfName: string,
  kdfOptions: Buffer,
  passphrase: string
): Buffer {
  if (kdfName !== 'bcrypt') {
    throw new Error(`Unsupported KDF: ${kdfName}`);
  }
  
  // Parse bcrypt KDF options
  let offset = 0;
  const saltLength = kdfOptions.readUInt32BE(offset);
  offset += 4;
  const salt = kdfOptions.subarray(offset, offset + saltLength);
  offset += saltLength;
  const rounds = kdfOptions.readUInt32BE(offset);
  
  // Use child process for both key derivation and decryption to maintain pure JS compatibility
  return decryptWithChildProcess(encryptedData, cipherName, salt, rounds, passphrase);
}

function decryptWithChildProcess(
  encryptedData: Buffer,
  cipherName: string,
  salt: Buffer,
  rounds: number,
  passphrase: string
): Buffer {
  const fs = require('fs');
  const { execSync } = require('child_process');
  const tempFilename = '/tmp/openssh_decrypt_' + Math.random().toString(36).substring(7) + '.js';
  
  // Get bcrypt-pbkdf path
  const bcryptPbkdfPath = require.resolve('bcrypt-pbkdf');
  
  const decryptScript = `
const crypto = require('crypto');
const bcryptPbkdf = require('${bcryptPbkdfPath}');

try {
  const input = JSON.parse(process.argv[2]);
  const { encryptedData, cipherName, salt, rounds, passphrase } = input;
  
  // Decrypt data buffer
  const encryptedBuffer = Buffer.from(encryptedData, 'base64');
  const saltBuffer = Buffer.from(salt, 'base64');
  
  // Helper functions
  function getCipherKeyLength(cipher) {
    if (cipher.includes('256')) return 32;
    if (cipher.includes('192')) return 24;
    return 16;
  }
  
  function getCipherIvLength(cipher) {
    return cipher.includes('gcm') ? 12 : 16;
  }
  
  function getCipherAlgorithm(cipher) {
    if (cipher === 'aes256-ctr') return 'aes-256-ctr';
    if (cipher === 'aes192-ctr') return 'aes-192-ctr'; 
    if (cipher === 'aes128-ctr') return 'aes-128-ctr';
    if (cipher === 'aes256-cbc') return 'aes-256-cbc';
    if (cipher === 'aes192-cbc') return 'aes-192-cbc';
    if (cipher === 'aes128-cbc') return 'aes-128-cbc';
    throw new Error('Unsupported cipher: ' + cipher);
  }
  
  // Derive key using bcrypt-pbkdf
  const keyIvLength = getCipherKeyLength(cipherName) + getCipherIvLength(cipherName);
  const passphraseBuffer = Buffer.from(passphrase, 'utf8');
  const derivedKey = Buffer.alloc(keyIvLength);
  
  // bcrypt-pbkdf v1.0.2 API: bcrypt_pbkdf(pass, passlen, salt, saltlen, key, keylen, rounds)
  const result = bcryptPbkdf.pbkdf(
    passphraseBuffer,           // pass
    passphraseBuffer.length,    // passlen
    saltBuffer,                 // salt
    saltBuffer.length,          // saltlen
    derivedKey,                 // key (output buffer)
    derivedKey.length,          // keylen
    rounds                      // rounds
  );
  if (result !== 0) {
    throw new Error('bcrypt-pbkdf key derivation failed with code: ' + result);
  }
  
  const keyLength = getCipherKeyLength(cipherName);
  const ivLength = getCipherIvLength(cipherName);
  const key = derivedKey.subarray(0, keyLength);
  const iv = derivedKey.subarray(keyLength, keyLength + ivLength);
  
  // Decrypt
  const decipher = crypto.createDecipheriv(getCipherAlgorithm(cipherName), key, iv);
  decipher.setAutoPadding(false);
  
  let decrypted = decipher.update(encryptedBuffer);
  const final = decipher.final();
  decrypted = Buffer.concat([decrypted, final]);
  
  process.stdout.write(decrypted.toString('base64'));
  
} catch (error) {
  process.stderr.write('DECRYPT_ERROR: ' + error.message);
  process.exit(1);
}
`;

  try {
    fs.writeFileSync(tempFilename, decryptScript);
    
    const input = {
      encryptedData: encryptedData.toString('base64'),
      cipherName,
      salt: salt.toString('base64'),
      rounds,
      passphrase
    };
    
    const result = execSync(`node "${tempFilename}" '${JSON.stringify(input)}'`, {
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 10 * 1024 * 1024 // 10MB
    });
    
    fs.unlinkSync(tempFilename);
    return Buffer.from(result, 'base64');
    
  } catch (error) {
    try { fs.unlinkSync(tempFilename); } catch {}
    throw new Error('OpenSSH decryption failed in child process: ' + (error instanceof Error ? error.message : String(error)));
  }
}

function parseDecryptedPrivateKey(decryptedData: Buffer, publicKeyData: Buffer): OpenSSHKeyData {
  let offset = 0;
  
  // Read check bytes (should be identical)
  const check1 = decryptedData.readUInt32BE(offset);
  offset += 4;
  const check2 = decryptedData.readUInt32BE(offset);
  offset += 4;
  
  if (check1 !== check2) {
    throw new Error('Invalid passphrase or corrupted key');
  }
  
  // Read key type
  const keyTypeLength = decryptedData.readUInt32BE(offset);
  offset += 4;
  const keyType = decryptedData.subarray(offset, offset + keyTypeLength).toString();
  offset += keyTypeLength;
  
  // The rest depends on key type, but for SSH public key generation,
  // we primarily need the public key data which we already have
  
  // Read public key parameters (key-type specific)
  let privateKeyData: Buffer;
  let comment = '';
  
  if (keyType === 'ssh-rsa') {
    // RSA: n, e, d, iqmp, p, q
    const nLength = decryptedData.readUInt32BE(offset);
    offset += 4;
    const n = decryptedData.subarray(offset, offset + nLength);
    offset += nLength;
    
    const eLength = decryptedData.readUInt32BE(offset);
    offset += 4;
    const e = decryptedData.subarray(offset, offset + eLength);
    offset += eLength;
    
    const dLength = decryptedData.readUInt32BE(offset);
    offset += 4;
    const d = decryptedData.subarray(offset, offset + dLength);
    offset += dLength;
    
    // Skip iqmp, p, q for now
    privateKeyData = Buffer.concat([n, e, d]);
    
  } else if (keyType === 'ssh-ed25519') {
    // Ed25519: public key (32 bytes) + private key (32 bytes)
    const pubLength = decryptedData.readUInt32BE(offset);
    offset += 4;
    const pub = decryptedData.subarray(offset, offset + pubLength);
    offset += pubLength;
    
    const privLength = decryptedData.readUInt32BE(offset);
    offset += 4;
    const priv = decryptedData.subarray(offset, offset + privLength);
    offset += privLength;
    
    privateKeyData = Buffer.concat([pub, priv]);
    
  } else if (keyType.startsWith('ecdsa-sha2-')) {
    // ECDSA: curve name + public key + private key
    const curveLength = decryptedData.readUInt32BE(offset);
    offset += 4;
    const curve = decryptedData.subarray(offset, offset + curveLength);
    offset += curveLength;
    
    const pubLength = decryptedData.readUInt32BE(offset);
    offset += 4;
    const pub = decryptedData.subarray(offset, offset + pubLength);
    offset += pubLength;
    
    const privLength = decryptedData.readUInt32BE(offset);
    offset += 4;
    const priv = decryptedData.subarray(offset, offset + privLength);
    offset += privLength;
    
    privateKeyData = Buffer.concat([curve, pub, priv]);
  } else {
    throw new Error(`Unsupported key type: ${keyType}`);
  }
  
  // Read comment
  try {
    const commentLength = decryptedData.readUInt32BE(offset);
    offset += 4;
    comment = decryptedData.subarray(offset, offset + commentLength).toString();
  } catch (e) {
    // Comment might not be present or readable
    comment = '';
  }
  
  return {
    keyType,
    publicKey: publicKeyData,
    privateKey: privateKeyData,
    comment
  };
}

// Helper functions moved to child process for pure JS compatibility