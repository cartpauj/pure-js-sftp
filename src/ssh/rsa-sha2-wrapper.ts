/**
 * Pure JavaScript RSA-SHA2 Signature Wrapper using sshpk only
 * Eliminates all Node.js crypto dependencies for maximum VSCode/webpack compatibility
 */

// @ts-ignore
import * as sshpk from 'sshpk';

export interface WrappedRSAKey {
  type: string;
  getPublicSSH(): Buffer;
  sign(data: Buffer): Buffer;
  verify(data: Buffer, signature: Buffer): boolean;
}

/**
 * Wraps an ssh2-streams RSA key to use RSA-SHA2 signatures via sshpk
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

  // Parse key with sshpk
  let sshpkKey: any;
  
  try {
    sshpkKey = (sshpk as any).parsePrivateKey(privateKeyPEM, 'auto');
  } catch (error) {
    throw new Error(`Failed to parse private key with sshpk: ${error instanceof Error ? error.message : String(error)}`);
  }

  const wrappedKey: WrappedRSAKey = {
    type: originalKey.type,

    getPublicSSH(): Buffer {
      // Use original key's public SSH format
      return originalKey.getPublicSSH();
    },

    sign(data: Buffer): Buffer {
      try {
        // Use sshpk for RSA-SHA2 signature
        const signer = sshpkKey.createSign(algorithm);
        signer.update(data);
        const signature = signer.sign();
        
        // Extract raw RSA signature bytes for ssh2-streams compatibility
        if (signature && typeof signature.toBuffer === 'function') {
          // Try to get raw signature (not SSH wire format)
          try {
            return signature.toBuffer('asn1');
          } catch (e) {
            // Fallback to raw buffer
            return signature.toBuffer();
          }
        } else if (signature && signature.signature && Buffer.isBuffer(signature.signature)) {
          return signature.signature;
        } else if (Buffer.isBuffer(signature)) {
          return signature;
        } else {
          throw new Error('Unable to extract raw signature bytes from sshpk signature object');
        }
      } catch (error) {
        // Fallback to original ssh2-streams signing if sshpk fails
        console.warn(`sshpk RSA-SHA2 signing failed, falling back to original: ${error instanceof Error ? error.message : String(error)}`);
        return originalKey.sign(data);
      }
    },

    verify(data: Buffer, signature: Buffer): boolean {
      try {
        // Use sshpk for verification
        const verifier = sshpkKey.createVerify(algorithm);
        verifier.update(data);
        
        // Try to parse signature
        let sshpkSig;
        try {
          sshpkSig = (sshpk as any).parseSignature(signature, 'ssh-rsa', 'ssh');
        } catch (parseError) {
          sshpkSig = signature;
        }
        
        return verifier.verify(sshpkSig);
      } catch (error) {
        // Fallback to original verification
        console.warn(`sshpk RSA-SHA2 verification failed, falling back to original: ${error instanceof Error ? error.message : String(error)}`);
        return originalKey.verify(data, signature);
      }
    }
  };

  return wrappedKey;
}

/**
 * Creates an RSA-SHA2 signature callback for ssh2-streams authentication using sshpk only
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

  // Try to parse key with sshpk
  let sshpkKey: any = null;
  
  try {
    const sshpkOptions: any = {};
    if (passphrase) {
      sshpkOptions.passphrase = passphrase;
    }
    
    sshpkKey = (sshpk as any).parsePrivateKey(privateKeyPEM, 'auto', sshpkOptions);
  } catch (sshpkError) {
    console.warn(`Failed to parse key with sshpk for RSA-SHA2, using original signing: ${sshpkError instanceof Error ? sshpkError.message : String(sshpkError)}`);
  }
  
  // If we couldn't parse with sshpk, fall back to original signing
  if (!sshpkKey) {
    return (buf: Buffer, cb: (signature: Buffer) => void) => {
      try {
        const signature = originalKey.sign(buf);
        cb(signature);
      } catch (signError) {
        throw new Error(`Fallback signing failed: ${signError instanceof Error ? signError.message : String(signError)}`);
      }
    };
  }

  // Return sshpk RSA-SHA2 signature callback
  return (buf: Buffer, cb: (signature: Buffer) => void) => {
    try {
      // Generate RSA-SHA2 signature using sshpk
      const signer = sshpkKey.createSign(algorithm);
      signer.update(buf);
      const signature = signer.sign();
      
      // Convert to buffer format - extract raw RSA signature bytes
      let signatureBuffer: Buffer;
      if (signature && typeof signature.toBuffer === 'function') {
        // Try to get raw signature (not SSH wire format)
        try {
          signatureBuffer = signature.toBuffer('asn1');
        } catch (e) {
          // Fallback to raw buffer
          signatureBuffer = signature.toBuffer();
        }
      } else if (signature && signature.signature && Buffer.isBuffer(signature.signature)) {
        signatureBuffer = signature.signature;
      } else if (Buffer.isBuffer(signature)) {
        signatureBuffer = signature;
      } else {
        throw new Error('Unable to extract raw signature bytes from sshpk signature object');
      }
      
      cb(signatureBuffer);
    } catch (error) {
      console.warn(`sshpk RSA-SHA2 signing failed, falling back to original: ${error instanceof Error ? error.message : String(error)}`);
      
      try {
        // Fallback to original ssh2-streams signing
        const fallbackSignature = originalKey.sign(buf);
        cb(fallbackSignature);
      } catch (fallbackError) {
        throw new Error(`Both sshpk RSA-SHA2 and fallback signing failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
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