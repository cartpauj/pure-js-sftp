import * as crypto from 'crypto';
import * as ssh2Streams from 'ssh2-streams';
// Hash algorithm functions are defined inline in child process scripts

let signingFixEnabled = false;
const originalParseKey = ssh2Streams.utils.parseKey;

interface SigningKey {
  type?: string;
  fulltype?: string;
  sign?: (data: Buffer) => Buffer;
  [key: string]: any;
  [key: symbol]: any;
}

function detectKeyTypeFromPem(pemContent: string): string {
  // Detect key type from PEM content
  if (pemContent.includes('BEGIN RSA PRIVATE KEY') || pemContent.includes('ssh-rsa')) {
    return 'ssh-rsa';
  }
  if (pemContent.includes('BEGIN DSA PRIVATE KEY') || pemContent.includes('ssh-dss')) {
    return 'ssh-dss';
  }
  if (pemContent.includes('BEGIN EC PRIVATE KEY') || pemContent.includes('ecdsa-sha2-')) {
    // Try to detect ECDSA curve from content
    if (pemContent.includes('nistp256') || pemContent.includes('prime256v1')) {
      return 'ecdsa-sha2-nistp256';
    }
    if (pemContent.includes('nistp384') || pemContent.includes('secp384r1')) {
      return 'ecdsa-sha2-nistp384';
    }
    if (pemContent.includes('nistp521') || pemContent.includes('secp521r1')) {
      return 'ecdsa-sha2-nistp521';
    }
    return 'ecdsa-sha2-nistp256'; // Default to P-256
  }
  if (pemContent.includes('ssh-ed25519') || pemContent.includes('Ed25519')) {
    return 'ssh-ed25519';
  }
  
  // Default to RSA if unknown
  return 'ssh-rsa';
}

function detectKeyTypeFromOriginal(keyData: string | Buffer): string | null {
  // Try to detect key type from original key data (OpenSSH format, PPK, etc.)
  const keyStr = Buffer.isBuffer(keyData) ? keyData.toString() : keyData;
  
  // OpenSSH format detection - parse binary format properly
  if (keyStr.includes('BEGIN OPENSSH PRIVATE KEY')) {
    try {
      const lines = keyStr.split('\n');
      const base64Data = lines
        .filter(line => !line.startsWith('-----'))
        .join('')
        .replace(/\s/g, '');
      const keyBuffer = Buffer.from(base64Data, 'base64');
      let offset = 0;
      
      // Skip magic bytes "openssh-key-v1\0"
      offset += 15;
      
      // Read cipher name
      const cipherNameLength = keyBuffer.readUInt32BE(offset);
      offset += 4;
      offset += cipherNameLength; // Skip cipher name
      
      // Read KDF name
      const kdfNameLength = keyBuffer.readUInt32BE(offset);
      offset += 4;
      offset += kdfNameLength; // Skip KDF name
      
      // Read KDF options
      const kdfOptionsLength = keyBuffer.readUInt32BE(offset);
      offset += 4;
      offset += kdfOptionsLength; // Skip KDF options
      
      // Read number of keys
      const numberOfKeys = keyBuffer.readUInt32BE(offset);
      offset += 4;
      
      // Read public key section
      const publicKeyLength = keyBuffer.readUInt32BE(offset);
      offset += 4;
      const publicKeyData = keyBuffer.subarray(offset, offset + publicKeyLength);
      
      // Parse the public key to determine type
      let pubOffset = 0;
      const keyTypeLength = publicKeyData.readUInt32BE(pubOffset);
      pubOffset += 4;
      const keyTypeName = publicKeyData.subarray(pubOffset, pubOffset + keyTypeLength).toString();
      
      return keyTypeName; // Return the actual key type from the binary data
      
    } catch (error) {
      // Fallback to string search if binary parsing fails
      if (keyStr.includes('ssh-rsa')) return 'ssh-rsa';
      if (keyStr.includes('ssh-dss')) return 'ssh-dss';
      if (keyStr.includes('ecdsa-sha2-nistp256')) return 'ecdsa-sha2-nistp256';
      if (keyStr.includes('ecdsa-sha2-nistp384')) return 'ecdsa-sha2-nistp384';
      if (keyStr.includes('ecdsa-sha2-nistp521')) return 'ecdsa-sha2-nistp521';
      if (keyStr.includes('ssh-ed25519')) return 'ssh-ed25519';
    }
  }
  
  // PPK (PuTTY) format detection
  if (keyStr.includes('PuTTY-User-Key-File-')) {
    if (keyStr.includes('ssh-rsa')) return 'ssh-rsa';
    if (keyStr.includes('ssh-dss')) return 'ssh-dss';
    if (keyStr.includes('ecdsa-sha2-nistp256')) return 'ecdsa-sha2-nistp256';
    if (keyStr.includes('ecdsa-sha2-nistp384')) return 'ecdsa-sha2-nistp384';
    if (keyStr.includes('ecdsa-sha2-nistp521')) return 'ecdsa-sha2-nistp521';
    if (keyStr.includes('ssh-ed25519')) return 'ssh-ed25519';
  }
  
  // Traditional PEM format detection (fallback)
  if (keyStr.includes('BEGIN RSA PRIVATE KEY')) return 'ssh-rsa';
  if (keyStr.includes('BEGIN DSA PRIVATE KEY')) return 'ssh-dss';
  if (keyStr.includes('BEGIN EC PRIVATE KEY')) return 'ecdsa-sha2-nistp256'; // Default curve
  
  return null; // Unknown format
}

// Moved to shared utility: getHashAlgorithmForKeyType

function signWithPureJSCrypto(traditionalPem: string, passphrase: string | undefined, data: Buffer, keyType: string): Buffer {
  try {
    // Use child process approach for VSCode compatibility
    return signWithSystemCrypto(traditionalPem, passphrase, data, keyType);
  } catch (error) {
    throw new Error(`Pure JS crypto signing failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function signWithSystemCrypto(traditionalPem: string, passphrase: string | undefined, data: Buffer, keyType?: string): Buffer {
  const fs = require('fs');
  const { execSync } = require('child_process');
  const tempFilename = '/tmp/ssh_sign_' + Math.random().toString(36).substring(7) + '.js';
  
  const signingScript = `
const crypto = require('crypto');
try {
    const input = JSON.parse(process.argv[2]);
    const { privateKey, passphrase, data, keyType } = input;
    
    // Determine hash algorithm based on SSH key type
    function getHashAlgorithmForKeyType(keyType) {
        if (!keyType) return 'SHA1'; // Default for unknown types
        
        switch(keyType.toLowerCase()) {
            case 'ssh-rsa':
            case 'ssh-dss':
                return 'SHA1';
            case 'ecdsa-sha2-nistp256':
                return 'SHA256';
            case 'ecdsa-sha2-nistp384':
                return 'SHA384';
            case 'ecdsa-sha2-nistp521':
                return 'SHA512';
            case 'ssh-ed25519':
                return null; // Ed25519 uses direct signing
            default:
                return 'SHA1'; // Fallback to RSA default
        }
    }
    
    const hashAlgorithm = getHashAlgorithmForKeyType(keyType);
    
    let signature;
    
    // Determine if this is an OpenSSH format key
    const isOpenSSH = privateKey.includes('BEGIN OPENSSH PRIVATE KEY');
    let keyOptions = { key: privateKey, passphrase: passphrase || undefined };
    
    // For OpenSSH format keys, use ssh2-streams to convert to traditional PEM first
    if (isOpenSSH) {
        try {
            const ssh2Streams = require('ssh2-streams');
            const ssh2Key = ssh2Streams.utils.parseKey(privateKey, passphrase);
            
            // If ssh2-streams can parse it, try to get traditional PEM
            if (ssh2Key && !ssh2Key instanceof Error) {
                // Look for PEM symbol in ssh2-streams key
                const privateKeyPemSymbol = Object.getOwnPropertySymbols(ssh2Key).find(s => 
                    s.toString().includes('Private key PEM')
                );
                
                if (privateKeyPemSymbol && ssh2Key[privateKeyPemSymbol]) {
                    // Use the traditional PEM format
                    keyOptions = { 
                        key: ssh2Key[privateKeyPemSymbol], 
                        passphrase: passphrase || undefined
                    };
                } else {
                    // ssh2-streams couldn't extract PEM, try Node.js crypto directly
                    keyOptions = { 
                        key: privateKey, 
                        passphrase: passphrase || undefined
                    };
                }
            } else {
                // ssh2-streams failed, try Node.js crypto directly with OpenSSH format
                keyOptions = { 
                    key: privateKey, 
                    passphrase: passphrase || undefined
                };
            }
        } catch (ssh2Error) {
            // ssh2-streams failed, try Node.js crypto directly
            keyOptions = { 
                key: privateKey, 
                passphrase: passphrase || undefined
            };
        }
    }
    
    if (hashAlgorithm === null) {
        // Ed25519 keys use direct signing without hash algorithm
        signature = crypto.sign(null, Buffer.from(data, 'base64'), keyOptions);
    } else {
        // Traditional signing with hash algorithm
        const sign = crypto.createSign(hashAlgorithm);
        sign.update(Buffer.from(data, 'base64'));
        signature = sign.sign(keyOptions);
    }
    
    process.stdout.write(signature.toString('base64'));
} catch (error) {
    process.stderr.write('SIGNING_ERROR: ' + error.message);
    process.exit(1);
}`;
  
  try {
    fs.writeFileSync(tempFilename, signingScript);
    
    const input = JSON.stringify({
      privateKey: traditionalPem,
      passphrase: passphrase || undefined,
      data: data.toString('base64'),
      keyType: keyType
    });
    
    const result = execSync(`node ${tempFilename} ${JSON.stringify(input)}`, {
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    fs.unlinkSync(tempFilename);
    return Buffer.from(result.trim(), 'base64');
    
  } catch (error) {
    try { fs.unlinkSync(tempFilename); } catch {}
    throw error;
  }
}

export function enablePureJSSigningFix(): void {
  if (signingFixEnabled) {
    return; // Already enabled
  }
  
  signingFixEnabled = true;
  
  // Monkey patch ssh2-streams parseKey function
  ssh2Streams.utils.parseKey = function(keyData: string | Buffer, passphrase?: string): any {
    if (!signingFixEnabled || !keyData) {
      return originalParseKey.call(this, keyData, passphrase);
    }
    
    const originalResult = originalParseKey.call(this, keyData, passphrase);
    
    // If ssh2-streams failed to parse an OpenSSH key, try to create our own key object with child process signing
    if (!originalResult || originalResult instanceof Error) {
      const keyStr = Buffer.isBuffer(keyData) ? keyData.toString() : keyData;
      
      // Check if this is an OpenSSH format key that we can handle with child process signing
      if (keyStr.includes('BEGIN OPENSSH PRIVATE KEY')) {
        const keyType = detectKeyTypeFromOriginal(keyData);
        
        if (keyType) {
          // Create a minimal key object with child process signing
          const fallbackKey = {
            type: keyType,
            comment: '',
            sign: function(data: Buffer) {
              try {
                return signWithSystemCrypto(keyStr, passphrase, data, keyType);
              } catch (error) {
                throw new Error(`Fallback OpenSSH signing failed for ${keyType}: ${error instanceof Error ? error.message : String(error)}`);
              }
            }
          };
          
          return fallbackKey;
        }
      }
      
      // If we can't handle it, return the original result (which might be an Error)
      return originalResult;
    }
    
    const keysToProcess = Array.isArray(originalResult) ? originalResult : [originalResult];
    
    const processedKeys = keysToProcess.map((key: any) => {
      if (!key || typeof key.sign !== 'function') {
        return key;
      }
      
      // Try to find key material from ssh2-streams Symbol properties
      const privateKeyPemSymbol = Object.getOwnPropertySymbols(key).find(s => 
        s.toString().includes('Private key PEM')
      );
      
      // If no traditional PEM found, use child process signing for OpenSSH keys
      if (!privateKeyPemSymbol) {
        // Check if this is an OpenSSH format key that needs child process signing
        const keyStr = Buffer.isBuffer(keyData) ? keyData.toString() : keyData;
        if (keyStr.includes('BEGIN OPENSSH PRIVATE KEY')) {
          // This is an OpenSSH key - use child process signing directly with the original key
          const keyType = detectKeyTypeFromOriginal(keyData) || 'unknown';
          
          // Replace sign method with child process signing
          key.sign = function(data: Buffer) {
            try {
              return signWithSystemCrypto(keyStr, passphrase, data, keyType);
            } catch (error) {
              throw new Error(`Child process OpenSSH signing failed for ${keyType}: ${error instanceof Error ? error.message : String(error)}`);
            }
          };
          
          return key;
        }
        
        // Try to get key type from ssh2-streams key object
        const keyType = key.type || key.fulltype || detectKeyTypeFromOriginal(keyData);
        
        if (!keyType || !key.sign) {
          return key; // Skip fix if we can't determine key type
        }
        
        // For non-PEM keys, use original ssh2-streams signing with better error handling
        const originalSign = key.sign;
        key.sign = function(data: Buffer) {
          try {
            const result = originalSign.call(this, data);
            if (!result || result instanceof Error) {
              throw new Error('Original ssh2-streams signing failed');
            }
            return result;
          } catch (error) {
            throw new Error(`SSH2-streams signing failed for ${keyType}: ${error instanceof Error ? error.message : String(error)}`);
          }
        };
        
        return key;
      }
      
      const traditionalKeyPem = key[privateKeyPemSymbol];
      if (!traditionalKeyPem || typeof traditionalKeyPem !== 'string') {
        return key; // Skip if PEM content is invalid
      }
      
      // Detect key type from the key object and PEM content
      const keyType = key.type || key.fulltype || detectKeyTypeFromPem(traditionalKeyPem);
      
      // Replace sign method with pure JS crypto implementation
      const originalSign = key.sign;
      key.sign = function(data: Buffer) {
        try {
          return signWithPureJSCrypto(traditionalKeyPem, passphrase, data, keyType);
        } catch (error) {
          // Fallback to original signing if pure JS crypto fails
          try {
            return originalSign.call(this, data);
          } catch (fallbackError) {
            throw new Error(`Both pure JS and original signing failed. Pure JS: ${error instanceof Error ? error.message : String(error)}. Original: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
          }
        }
      };
      
      return key;
    });
    
    return Array.isArray(originalResult) ? processedKeys : processedKeys[0];
  };
}

export function disablePureJSSigningFix(): void {
  if (!signingFixEnabled) {
    return; // Already disabled
  }
  
  signingFixEnabled = false;
  
  // Restore original parseKey function
  ssh2Streams.utils.parseKey = originalParseKey;
}

export function isPureJSSigningFixEnabled(): boolean {
  return signingFixEnabled;
}