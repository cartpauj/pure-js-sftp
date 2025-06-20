/**
 * Pure JavaScript SSH Key Parser using sshpk only
 * Eliminates all Node.js crypto dependencies for maximum VSCode/webpack compatibility
 */

// @ts-ignore
import * as sshpk from 'sshpk';

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
    // Use sshpk exclusively for all key parsing
    const options: any = {};
    if (passphrase !== undefined && passphrase !== null && passphrase !== '') {
      options.passphrase = passphrase;
    }
    
    const sshpkKey = (sshpk as any).parsePrivateKey(keyString, 'auto', options);
    if (sshpkKey) {
      return createKeyFromSSHPK(sshpkKey);
    }
  } catch (sshpkError) {
    // If sshpk fails, return null
    console.warn(`Key parsing failed: ${sshpkError instanceof Error ? sshpkError.message : String(sshpkError)}`);
  }
  
  return null;
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
        // Determine signing algorithm
        let signingAlgo: string;
        if (sshType === 'ssh-rsa') {
          if (algorithm === 'ssh-rsa') {
            signingAlgo = 'sha1';
          } else if (algorithm === 'rsa-sha2-256') {
            signingAlgo = 'sha256';
          } else if (algorithm === 'rsa-sha2-512') {
            signingAlgo = 'sha512';
          } else {
            // Default to sha256 for RSA-SHA2 compatibility
            signingAlgo = 'sha256';
          }
        } else {
          signingAlgo = getHashAlgorithm(sshType, algorithm);
        }
        
        const signer = sshpkKey.createSign(signingAlgo);
        signer.update(data);
        const signature = signer.sign();
        
        // Extract raw signature bytes properly from sshpk signature object
        if (sshType === 'ssh-rsa') {
          // For RSA keys, ssh2-streams expects raw signature bytes
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
        } else {
          // For Ed25519/ECDSA, ssh2-streams expects different format
          if (signature && typeof signature.toBuffer === 'function') {
            return signature.toBuffer('ssh');
          } else if (signature && signature.signature && Buffer.isBuffer(signature.signature)) {
            return signature.signature;
          } else if (Buffer.isBuffer(signature)) {
            return signature;
          } else {
            throw new Error('Unable to extract signature bytes from sshpk signature object');
          }
        }
      } catch (error) {
        throw new Error(`sshpk signing failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },

    verify(data: Buffer, signature: Buffer, algorithm?: string): boolean {
      try {
        // Use sshpk's verification capability
        const hashAlgo = getHashAlgorithm(sshType, algorithm);
        const verifier = sshpkKey.createVerify(hashAlgo);
        verifier.update(data);
        
        // Try to parse the signature buffer as SSH format
        let sshpkSig;
        try {
          sshpkSig = (sshpk as any).parseSignature(signature, sshType, 'ssh');
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
    case 'ssh-rsa': return 'sha256'; // Default to SHA256 for RSA (RSA-SHA2)
    case 'ssh-ed25519': return 'sha512'; // Ed25519 uses SHA512
    case 'ecdsa-sha2-nistp256': return 'sha256';
    case 'ecdsa-sha2-nistp384': return 'sha384';
    case 'ecdsa-sha2-nistp521': return 'sha512';
    default: return 'sha256';
  }
}