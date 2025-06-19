/**
 * RSA-SHA2 Signature Wrapper
 * Wraps ssh2-streams RSA keys to use RSA-SHA2 signatures instead of RSA-SHA1
 * This enables compatibility with modern SSH servers that reject RSA-SHA1
 */

import * as crypto from 'crypto';

export interface WrappedRSAKey {
  type: string;
  getPublicSSH(): Buffer;
  sign(data: Buffer): Buffer;
  verify(data: Buffer, signature: Buffer): boolean;
}

/**
 * Wraps an ssh2-streams RSA key to use RSA-SHA2 signatures
 * @param originalKey - The original ssh2-streams key object
 * @param privateKeyPEM - The raw private key in PEM format
 * @param algorithm - RSA signature algorithm ('sha256' or 'sha512')
 * @returns Wrapped key object with RSA-SHA2 signatures
 */
export function wrapRSAKeyWithSHA2(
  originalKey: any, 
  privateKeyPEM: string, 
  algorithm: 'sha256' | 'sha512' = 'sha256'
): WrappedRSAKey {
  
  // Validate that this is an RSA key
  if (!originalKey || originalKey.type !== 'ssh-rsa') {
    throw new Error('RSA-SHA2 wrapper can only be applied to RSA keys');
  }

  // Create Node.js private key object for RSA-SHA2 signing
  let nodePrivateKey: crypto.KeyObject;
  let nodePublicKey: crypto.KeyObject;
  
  try {
    nodePrivateKey = crypto.createPrivateKey({
      key: privateKeyPEM,
      format: 'pem'
    });
    
    nodePublicKey = crypto.createPublicKey(nodePrivateKey);
  } catch (error) {
    throw new Error(`Failed to create Node.js key objects: ${error instanceof Error ? error.message : String(error)}`);
  }

  const wrappedKey: WrappedRSAKey = {
    type: originalKey.type,

    getPublicSSH(): Buffer {
      // Use original key's public SSH format
      return originalKey.getPublicSSH();
    },

    sign(data: Buffer): Buffer {
      try {
        // Use Node.js crypto for RSA-SHA2 signature instead of ssh2-streams RSA-SHA1
        const signature = crypto.sign(algorithm, data, nodePrivateKey);
        return signature;
      } catch (error) {
        // Fallback to original ssh2-streams signing if Node.js crypto fails
        console.warn(`RSA-SHA2 wrapper signing failed, falling back to original: ${error instanceof Error ? error.message : String(error)}`);
        return originalKey.sign(data);
      }
    },

    verify(data: Buffer, signature: Buffer): boolean {
      try {
        // Use Node.js crypto for verification
        return crypto.verify(algorithm, data, nodePublicKey, signature);
      } catch (error) {
        // Fallback to original verification
        console.warn(`RSA-SHA2 wrapper verification failed, falling back to original: ${error instanceof Error ? error.message : String(error)}`);
        return originalKey.verify(data, signature);
      }
    }
  };

  return wrappedKey;
}

/**
 * Creates an RSA-SHA2 signature callback for ssh2-streams authentication
 * @param originalKey - The original ssh2-streams key object
 * @param privateKeyPEM - The raw private key in PEM format
 * @param passphrase - Optional passphrase for encrypted keys
 * @param algorithm - RSA signature algorithm ('sha256' or 'sha512')
 * @returns Signature callback function for ssh2-streams authPK
 */
export function createRSASHA2SignatureCallback(
  originalKey: any,
  privateKeyPEM: string,
  passphrase?: string,
  algorithm: 'sha256' | 'sha512' = 'sha256'
) {
  // Validate that this is an RSA key
  if (!originalKey || originalKey.type !== 'ssh-rsa') {
    // Return original callback for non-RSA keys
    return (buf: Buffer, cb: (signature: Buffer) => void) => {
      try {
        const signature = originalKey.sign(buf);
        cb(signature);
      } catch (error) {
        throw new Error(`Original key signing failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
  }

  // Try to create Node.js private key object
  let nodePrivateKey: crypto.KeyObject | null = null;
  
  // First, try direct PEM parsing
  try {
    const keyOptions: any = { key: privateKeyPEM, format: 'pem' };
    if (passphrase) {
      keyOptions.passphrase = passphrase;
    }
    
    nodePrivateKey = crypto.createPrivateKey(keyOptions);
  } catch (pemError) {
    // If direct PEM parsing fails, try to convert OpenSSH format to PEM using sshpk
    try {
      const sshpk = require('sshpk');
      
      // Parse with sshpk and convert to PEM (handles passphrases)
      const sshpkOptions: any = {};
      if (passphrase) {
        sshpkOptions.passphrase = passphrase;
      }
      
      const sshpkKey = sshpk.parsePrivateKey(privateKeyPEM, 'auto', sshpkOptions);
      const pemKey = sshpkKey.toString('pem');
      
      // Now try to create Node.js key from converted PEM (no passphrase needed as it's now decrypted)
      nodePrivateKey = crypto.createPrivateKey({
        key: pemKey,
        format: 'pem'
      });
    } catch (sshpkError) {
      console.warn(`Failed to create Node.js private key for RSA-SHA2 (both PEM and sshpk conversion failed), using original signing`);
    }
  }
  
  // If we couldn't create a Node.js key, fall back to original signing
  if (!nodePrivateKey) {
    return (buf: Buffer, cb: (signature: Buffer) => void) => {
      try {
        const signature = originalKey.sign(buf);
        cb(signature);
      } catch (signError) {
        throw new Error(`Fallback signing failed: ${signError instanceof Error ? signError.message : String(signError)}`);
      }
    };
  }

  // Return RSA-SHA2 signature callback
  return (buf: Buffer, cb: (signature: Buffer) => void) => {
    try {
      // Generate RSA-SHA2 signature using Node.js crypto
      const signature = crypto.sign(algorithm, buf, nodePrivateKey);
      cb(signature);
    } catch (error) {
      console.warn(`RSA-SHA2 signing failed, falling back to original: ${error instanceof Error ? error.message : String(error)}`);
      
      try {
        // Fallback to original ssh2-streams signing
        const fallbackSignature = originalKey.sign(buf);
        cb(fallbackSignature);
      } catch (fallbackError) {
        throw new Error(`Both RSA-SHA2 and fallback signing failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
      }
    }
  };
}

/**
 * Determines if a key should use the RSA-SHA2 wrapper
 * @param keyType - The SSH key type (e.g., 'ssh-rsa', 'ssh-ed25519')
 * @returns True if the key should be wrapped for RSA-SHA2
 */
export function shouldUseRSASHA2Wrapper(keyType: string): boolean {
  return keyType === 'ssh-rsa';
}

/**
 * Gets the appropriate RSA-SHA2 algorithm based on key size
 * @param keySize - RSA key size in bits
 * @returns Recommended algorithm ('sha256' or 'sha512')
 */
export function getRecommendedRSASHA2Algorithm(keySize: number): 'sha256' | 'sha512' {
  // Use SHA-512 for larger keys (4096+), SHA-256 for smaller keys
  return keySize >= 4096 ? 'sha512' : 'sha256';
}