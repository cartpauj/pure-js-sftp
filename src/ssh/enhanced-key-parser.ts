/**
 * Simplified SSH Key Parser using Node.js crypto + sshpk fallback
 * This removes all the pure JS implementations since sshpk handles everything
 */

import * as crypto from 'crypto';

interface ParsedKey {
  type: string;
  comment: string;
  sign(data: Buffer, algorithm?: string): Buffer;
  verify(data: Buffer, signature: Buffer, algorithm?: string): boolean;
  isPrivateKey(): boolean;
  getPrivatePEM(): string;
  getPublicPEM(): string;
  getPublicSSH(): Buffer;
  equals(other: ParsedKey): boolean;
}

interface RSAKeyComponents {
  n: Buffer;  // modulus
  e: Buffer;  // public exponent
  d: Buffer;  // private exponent
  p: Buffer;  // prime 1
  q: Buffer;  // prime 2
  dmp1: Buffer; // d mod (p-1)
  dmq1: Buffer; // d mod (q-1)
  iqmp: Buffer; // inverse of q mod p
}

export function parseKey(keyData: string | Buffer, passphrase?: string): ParsedKey | null {
  let keyString: string;
  
  if (Buffer.isBuffer(keyData)) {
    keyString = keyData.toString('utf8');
  } else {
    keyString = keyData;
  }
  
  // Normalize line endings and trim
  keyString = keyString.replace(/\r\n/g, '\n').trim();
  
  try {
    // Try Node.js crypto first (handles modern formats supported by Node.js)
    const keyOptions: any = {
      key: keyString
    };
    
    // Detect format based on content
    if (!keyString.includes('-----BEGIN OPENSSH PRIVATE KEY-----')) {
      // Traditional PEM format
      keyOptions.format = 'pem';
    }
    
    // Only include passphrase if it's provided
    if (passphrase !== undefined && passphrase !== null && passphrase !== '') {
      keyOptions.passphrase = passphrase;
    }
    
    const keyObject = crypto.createPrivateKey(keyOptions);
    
    // Detect key type from the KeyObject
    const keyType = keyObject.asymmetricKeyType;
    
    switch (keyType) {
      case 'rsa':
        return parseRSAFromKeyObject(keyObject);
      case 'ec':
        return parseECDSAFromKeyObject(keyObject);
      case 'ed25519':
        return parseEd25519FromKeyObject(keyObject);
      default:
        return null;
    }
  } catch (error) {
    // Try sshpk library for comprehensive SSH key support (including encrypted OpenSSH keys)
    try {
      const sshpk = require('sshpk');
      const options: any = {};
      if (passphrase !== undefined && passphrase !== null && passphrase !== '') {
        options.passphrase = passphrase;
      }
      
      const sshpkKey = sshpk.parsePrivateKey(keyString, 'auto', options);
      if (sshpkKey) {
        return createKeyFromSSHPK(sshpkKey);
      }
    } catch (sshpkError) {
      // Both parsers failed
    }
    
    return null;
  }
}

function parseRSAFromKeyObject(keyObject: crypto.KeyObject): ParsedKey {
  try {
    // Export as PKCS#1 to get RSA components
    const pkcs1Der = keyObject.export({ format: 'der', type: 'pkcs1' });
    const components = parseRSAPrivateKeyDER(pkcs1Der);
    
    if (!components) {
      throw new Error('Failed to parse RSA components');
    }
    
    return createRSAKeyObject(components, keyObject);
  } catch (error) {
    throw new Error(`RSA key parsing failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseECDSAFromKeyObject(keyObject: crypto.KeyObject): ParsedKey {
  // For ECDSA, we can just use the KeyObject directly
  return createGenericKeyObject('ecdsa', keyObject);
}

function parseEd25519FromKeyObject(keyObject: crypto.KeyObject): ParsedKey {
  // For Ed25519, we can just use the KeyObject directly
  return createGenericKeyObject('ssh-ed25519', keyObject);
}

function createRSAKeyObject(components: RSAKeyComponents, keyObject: crypto.KeyObject): ParsedKey {
  return {
    type: 'ssh-rsa',
    comment: '',
    
    sign(data: Buffer, _algorithm?: string): Buffer {
      // Default to RSA-SHA2-256 for better security (RFC 8332)
      let signingAlgo = 'RSA-SHA256';
      
      if (_algorithm === 'ssh-rsa') {
        signingAlgo = 'RSA-SHA1';
      } else if (_algorithm === 'rsa-sha2-256') {
        signingAlgo = 'RSA-SHA256';
      } else if (_algorithm === 'rsa-sha2-512') {
        signingAlgo = 'RSA-SHA512';
      }
      
      return crypto.sign(signingAlgo, data, keyObject);
    },
    
    verify(data: Buffer, signature: Buffer, _algorithm?: string): boolean {
      try {
        const publicKey = crypto.createPublicKey(keyObject);
        
        let signingAlgo = 'RSA-SHA256';
        if (_algorithm === 'ssh-rsa') {
          signingAlgo = 'RSA-SHA1';
        } else if (_algorithm === 'rsa-sha2-256') {
          signingAlgo = 'RSA-SHA256';
        } else if (_algorithm === 'rsa-sha2-512') {
          signingAlgo = 'RSA-SHA512';
        }
        
        return crypto.verify(signingAlgo, data, publicKey, signature);
      } catch (error) {
        return false;
      }
    },
    
    isPrivateKey(): boolean {
      return true;
    },
    
    getPrivatePEM(): string {
      return keyObject.export({ format: 'pem', type: 'pkcs1' }) as string;
    },
    
    getPublicPEM(): string {
      const publicKey = crypto.createPublicKey(keyObject);
      return publicKey.export({ format: 'pem', type: 'spki' }) as string;
    },
    
    getPublicSSH(): Buffer {
      // SSH RSA public key format: string "ssh-rsa" + mpint e + mpint n
      const keyType = Buffer.from('ssh-rsa');
      const keyTypeLength = Buffer.allocUnsafe(4);
      keyTypeLength.writeUInt32BE(keyType.length, 0);
      
      const eBuffer = encodeMPInt(components.e);
      const nBuffer = encodeMPInt(components.n);
      
      return Buffer.concat([keyTypeLength, keyType, eBuffer, nBuffer]);
    },
    
    equals(other: ParsedKey): boolean {
      try {
        return this.type === other.type && this.getPublicSSH().equals(other.getPublicSSH());
      } catch (error) {
        return false;
      }
    }
  };
}

function createGenericKeyObject(type: string, keyObject: crypto.KeyObject): ParsedKey {
  return {
    type: type,
    comment: '',
    
    sign(data: Buffer, _algorithm?: string): Buffer {
      return crypto.sign(null, data, keyObject);
    },
    
    verify(data: Buffer, signature: Buffer, _algorithm?: string): boolean {
      try {
        const publicKey = crypto.createPublicKey(keyObject);
        return crypto.verify(null, data, publicKey, signature);
      } catch (error) {
        return false;
      }
    },
    
    isPrivateKey(): boolean {
      return true;
    },
    
    getPrivatePEM(): string {
      return keyObject.export({ format: 'pem', type: 'pkcs8' }) as string;
    },
    
    getPublicPEM(): string {
      const publicKey = crypto.createPublicKey(keyObject);
      return publicKey.export({ format: 'pem', type: 'spki' }) as string;
    },
    
    getPublicSSH(): Buffer {
      // For non-RSA keys, we'll need to construct the SSH format manually
      // This is a limitation we need to handle
      throw new Error('SSH format export for non-RSA keys requires sshpk fallback');
    },
    
    equals(other: ParsedKey): boolean {
      try {
        return this.type === other.type && this.getPublicSSH().equals(other.getPublicSSH());
      } catch (error) {
        return false;
      }
    }
  };
}

// Create our ParsedKey interface from sshpk key objects
function createKeyFromSSHPK(sshpkKey: any): ParsedKey {
  // Map sshpk types to our SSH types
  const typeMapping: { [key: string]: string } = {
    'rsa': 'ssh-rsa',
    'ed25519': 'ssh-ed25519',
    'ecdsa': getECDSAType(sshpkKey)
  };

  const sshType = typeMapping[sshpkKey.type] || sshpkKey.type;

  return {
    type: sshType,
    comment: sshpkKey.comment || '',

    sign(data: Buffer, algorithm?: string): Buffer {
      try {
        // Use sshpk's signing capability
        const signer = sshpkKey.createSign(getHashAlgorithm(sshType, algorithm));
        signer.update(data);
        const signature = signer.sign();
        
        // Convert sshpk signature to raw buffer format expected by SSH
        if (signature.toBuffer) {
          return signature.toBuffer('ssh');
        } else if (signature.signature) {
          return signature.signature;
        } else {
          return signature;
        }
      } catch (error) {
        throw new Error(`sshpk signing failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },

    verify(data: Buffer, signature: Buffer, algorithm?: string): boolean {
      try {
        // Use sshpk's verification capability
        const verifier = sshpkKey.createVerify(getHashAlgorithm(sshType, algorithm));
        verifier.update(data);
        
        // Try to parse the signature buffer as SSH format
        let sshpkSig;
        try {
          const sshpk = require('sshpk');
          sshpkSig = sshpk.parseSignature(signature, sshType, 'ssh');
        } catch (parseError) {
          // If parsing fails, try with raw signature
          sshpkSig = signature;
        }
        
        return verifier.verify(sshpkSig);
      } catch (error) {
        return false;
      }
    },

    isPrivateKey(): boolean {
      return sshpkKey.isPrivate();
    },

    getPrivatePEM(): string {
      try {
        return sshpkKey.toBuffer('pem').toString();
      } catch (error) {
        throw new Error(`sshpk PEM export failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },

    getPublicPEM(): string {
      try {
        const publicKey = sshpkKey.toPublic();
        return publicKey.toBuffer('pem').toString();
      } catch (error) {
        throw new Error(`sshpk public PEM export failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },

    getPublicSSH(): Buffer {
      try {
        const publicKey = sshpkKey.toPublic();
        return publicKey.toBuffer('ssh');
      } catch (error) {
        throw new Error(`sshpk SSH export failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },

    equals(other: ParsedKey): boolean {
      try {
        return this.type === other.type && this.getPublicSSH().equals(other.getPublicSSH());
      } catch (error) {
        return false;
      }
    }
  };
}

function getECDSAType(sshpkKey: any): string {
  if (sshpkKey.curve) {
    switch (sshpkKey.curve) {
      case 'nistp256': return 'ecdsa-sha2-nistp256';
      case 'nistp384': return 'ecdsa-sha2-nistp384';
      case 'nistp521': return 'ecdsa-sha2-nistp521';
      default: return 'ecdsa-sha2-' + sshpkKey.curve;
    }
  }
  return 'ecdsa-sha2-nistp256'; // default
}

function getHashAlgorithm(sshType: string, algorithm?: string): string {
  if (algorithm) {
    if (algorithm.includes('sha1') || algorithm === 'ssh-rsa') {
      return 'sha1';
    } else if (algorithm.includes('sha256') || algorithm === 'rsa-sha2-256') {
      return 'sha256';
    } else if (algorithm.includes('sha512') || algorithm === 'rsa-sha2-512') {
      return 'sha512';
    }
  }
  
  // Default hash algorithms based on key type
  switch (sshType) {
    case 'ssh-rsa': return 'sha256'; // Default to SHA256 for RSA
    case 'ssh-ed25519': return 'sha512'; // Ed25519 uses SHA512
    case 'ecdsa-sha2-nistp256': return 'sha256';
    case 'ecdsa-sha2-nistp384': return 'sha384';
    case 'ecdsa-sha2-nistp521': return 'sha512';
    default: return 'sha256';
  }
}

// Minimal RSA DER parsing for SSH wire format (keep only what we need)
function parseRSAPrivateKeyDER(derBuffer: Buffer): RSAKeyComponents | null {
  try {
    let offset = 0;
    
    // Parse SEQUENCE tag and length
    if (derBuffer[offset] !== 0x30) {
      throw new Error('Expected SEQUENCE tag');
    }
    offset++;
    
    const _seqLength = parseLength(derBuffer, offset);
    offset += getLengthBytes(derBuffer, offset);
    
    // Parse version (should be 0)
    const _version = parseInteger(derBuffer, offset);
    offset += getIntegerBytes(derBuffer, offset);
    
    // Parse modulus (n)
    const n = parseInteger(derBuffer, offset);
    offset += getIntegerBytes(derBuffer, offset);
    
    // Parse public exponent (e)
    const e = parseInteger(derBuffer, offset);
    offset += getIntegerBytes(derBuffer, offset);
    
    // Parse private exponent (d)
    const d = parseInteger(derBuffer, offset);
    offset += getIntegerBytes(derBuffer, offset);
    
    // Parse prime1 (p)
    const p = parseInteger(derBuffer, offset);
    offset += getIntegerBytes(derBuffer, offset);
    
    // Parse prime2 (q)
    const q = parseInteger(derBuffer, offset);
    offset += getIntegerBytes(derBuffer, offset);
    
    // Parse exponent1 (dmp1)
    const dmp1 = parseInteger(derBuffer, offset);
    offset += getIntegerBytes(derBuffer, offset);
    
    // Parse exponent2 (dmq1)
    const dmq1 = parseInteger(derBuffer, offset);
    offset += getIntegerBytes(derBuffer, offset);
    
    // Parse coefficient (iqmp)
    const iqmp = parseInteger(derBuffer, offset);
    
    return { n, e, d, p, q, dmp1, dmq1, iqmp };
  } catch (error) {
    console.error('Error parsing DER:', error);
    return null;
  }
}

function parseLength(buffer: Buffer, offset: number): number {
  const firstByte = buffer[offset];
  
  if ((firstByte & 0x80) === 0) {
    return firstByte;
  } else {
    const lengthBytes = firstByte & 0x7f;
    let length = 0;
    
    for (let i = 1; i <= lengthBytes; i++) {
      length = (length << 8) | buffer[offset + i];
    }
    
    return length;
  }
}

function getLengthBytes(buffer: Buffer, offset: number): number {
  const firstByte = buffer[offset];
  
  if ((firstByte & 0x80) === 0) {
    return 1;
  } else {
    return 1 + (firstByte & 0x7f);
  }
}

function parseInteger(buffer: Buffer, offset: number): Buffer {
  if (buffer[offset] !== 0x02) {
    throw new Error('Expected INTEGER tag');
  }
  
  const length = parseLength(buffer, offset + 1);
  const lengthBytes = getLengthBytes(buffer, offset + 1);
  const dataOffset = offset + 1 + lengthBytes;
  
  let data = buffer.subarray(dataOffset, dataOffset + length);
  
  // Remove leading zero if present (ASN.1 encoding for positive integers)
  if (data.length > 1 && data[0] === 0x00 && (data[1] & 0x80) !== 0) {
    data = data.subarray(1);
  }
  
  return data;
}

function getIntegerBytes(buffer: Buffer, offset: number): number {
  const length = parseLength(buffer, offset + 1);
  const lengthBytes = getLengthBytes(buffer, offset + 1);
  return 1 + lengthBytes + length;
}

function encodeMPInt(data: Buffer): Buffer {
  // SSH mpint format: length (4 bytes) + data
  // If the high bit is set, prepend a zero byte
  let mpintData = data;
  
  if (data.length > 0 && (data[0] & 0x80) !== 0) {
    mpintData = Buffer.concat([Buffer.from([0x00]), data]);
  }
  
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(mpintData.length, 0);
  
  return Buffer.concat([length, mpintData]);
}