/**
 * SSH Authentication Manager
 */

import { EventEmitter } from 'events';
import { SSHTransport } from '../ssh/transport';
import { PacketBuilder, PacketReader } from '../ssh/packet';
import { SSH_MSG } from '../ssh/constants';
import { SSHConfig, AuthContext, SSHError } from '../ssh/types';
import { CryptoUtils } from '../crypto/utils';
import { createSign, createPublicKey, createPrivateKey, sign, constants } from 'crypto';

export class AuthManager extends EventEmitter {
  private transport: SSHTransport;
  private config: SSHConfig;
  private context: AuthContext;

  constructor(transport: SSHTransport, config: SSHConfig) {
    super();
    this.transport = transport;
    this.config = config;
    this.context = {
      username: config.username,
      service: 'ssh-connection',
      method: '',
      authenticated: false
    };
    this.setupTransportHandlers();
  }

  /**
   * Set up transport event handlers
   */
  private setupTransportHandlers(): void {
    this.transport.on('serviceAccept', () => {
      this.startAuthentication();
    });

    this.transport.on('authSuccess', () => {
      this.context.authenticated = true;
      this.emit('authComplete', this.context);
    });

    this.transport.on('authFailure', (payload: Buffer) => {
      this.handleAuthFailure(payload);
    });
  }

  /**
   * Start authentication process
   */
  authenticate(): void {
    // Request ssh-connection service
    const servicePayload = PacketBuilder.buildString(this.context.service);
    this.transport.sendPacket(SSH_MSG.SERVICE_REQUEST, servicePayload);
  }

  /**
   * Start authentication after service accepted
   */
  private startAuthentication(): void {
    if (this.config.password) {
      this.authenticatePassword();
    } else if (this.config.privateKey) {
      this.authenticatePublicKey();
    } else {
      this.emit('error', new SSHError('No authentication method available', 'NO_AUTH_METHOD'));
    }
  }

  /**
   * Password authentication
   */
  private authenticatePassword(): void {
    if (!this.config.password) {
      throw new Error('Password not provided');
    }

    this.context.method = 'password';
    
    const payload = Buffer.concat([
      PacketBuilder.buildString(this.context.username),
      PacketBuilder.buildString(this.context.service),
      PacketBuilder.buildString('password'),
      PacketBuilder.buildBoolean(false), // change password
      PacketBuilder.buildString(this.config.password)
    ]);

    this.transport.sendPacket(SSH_MSG.USERAUTH_REQUEST, payload);
  }

  /**
   * Public key authentication
   */
  private authenticatePublicKey(): void {
    if (!this.config.privateKey) {
      throw new Error('Private key not provided');
    }

    this.context.method = 'publickey';
    
    try {
      // Parse the private key and extract public key
      const { publicKey, algorithm } = this.parsePrivateKey(this.config.privateKey, this.config.passphrase);
      
      // First, try the public key without signature (test if key is acceptable)
      const payload = Buffer.concat([
        PacketBuilder.buildString(this.context.username),
        PacketBuilder.buildString(this.context.service),
        PacketBuilder.buildString('publickey'),
        PacketBuilder.buildBoolean(false), // no signature yet
        PacketBuilder.buildString(algorithm),
        PacketBuilder.buildBytes(publicKey)
      ]);

      this.transport.sendPacket(SSH_MSG.USERAUTH_REQUEST, payload);
      
      // Listen for PK_OK response to send actual signature
      this.transport.once('pkOk', () => {
        this.sendPublicKeySignature(publicKey, algorithm);
      });
      
    } catch (error) {
      this.emit('error', new SSHError(`Public key authentication failed: ${error}`, 'AUTH_FAILED'));
    }
  }

  /**
   * Parse private key and extract public key
   */
  private parsePrivateKey(privateKey: Buffer | string, passphrase?: string): { publicKey: Buffer; algorithm: string } {
    try {
      if (!privateKey) {
        throw new Error('Private key is required');
      }

      const keyStr = privateKey instanceof Buffer ? privateKey.toString() : privateKey;
      
      if (!keyStr || (typeof keyStr === 'string' && keyStr.trim() === '')) {
        throw new Error('Private key is empty');
      }
      
      // Check if the key is encrypted and needs a passphrase
      const isEncrypted = keyStr.includes('ENCRYPTED');
      
      if (isEncrypted && !passphrase) {
        throw new Error('Private key is encrypted but no passphrase provided');
      }
      
      // Use Node.js built-in crypto to parse the key
      // For encrypted keys, we need to use createPrivateKey first, then extract public key
      let keyObj;
      try {
        if (isEncrypted) {
          const privateKeyObj = createPrivateKey({
            key: keyStr,
            format: 'pem',
            passphrase: passphrase
          });
          keyObj = createPublicKey(privateKeyObj);
        } else {
          // Try as PEM first, then as OpenSSH format
          try {
            keyObj = createPublicKey({
              key: keyStr,
              format: 'pem'
            });
          } catch (pemError) {
            // If PEM fails, try as private key (which can handle OpenSSH format)
            const privateKeyObj = createPrivateKey({
              key: keyStr,
              format: 'pem'
            });
            keyObj = createPublicKey(privateKeyObj);
          }
        }
      } catch (keyError: any) {
        throw new Error(`Unable to parse key: ${keyError?.message || keyError}`);
      }
      
      // Export public key in SSH format
      const keyType = keyObj.asymmetricKeyType;
      
      if (keyType === 'rsa') {
        return this.buildRSAPublicKey(keyObj);
      } else if (keyType === 'ec') {
        return this.buildECPublicKey(keyObj);
      } else if (keyType === 'ed25519') {
        return this.buildEd25519PublicKey(keyObj);
      } else {
        throw new Error(`Unsupported key type: ${keyType}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse private key: ${message}`);
    }
  }

  /**
   * Build RSA public key in SSH format
   */
  private buildRSAPublicKey(keyObj: any): { publicKey: Buffer; algorithm: string } {
    // According to RFC 8332, the public key blob still uses "ssh-rsa" format
    // but the signature algorithm can be rsa-sha2-256 or rsa-sha2-512
    const keyBlobAlgorithm = 'ssh-rsa';
    
    // Determine signature algorithm based on key size
    const keyDetails = keyObj.asymmetricKeyDetails;
    let signatureAlgorithm = 'rsa-sha2-256'; // Default to SHA-256
    
    if (keyDetails && keyDetails.modulusLength) {
      // Check the key size to determine best signature algorithm
      const modulusBits = keyDetails.modulusLength;
      if (modulusBits >= 4096) {
        signatureAlgorithm = 'rsa-sha2-512';
      }
    }
    
    try {
      // Parse RSA components using Node.js crypto.KeyObject asymmetricKeyDetails
      // Note: In newer Node.js versions, modulus isn't directly available in asymmetricKeyDetails
      if (!keyDetails || !keyDetails.publicExponent) {
        throw new Error('Unable to extract RSA key components from asymmetricKeyDetails');
      }
      
      // Try to get modulus from asymmetricKeyDetails first (older Node.js versions)
      if (!keyDetails.modulus) {
        throw new Error('Modulus not available in asymmetricKeyDetails, will try JWK fallback');
      }
      
      // Convert bigint to Buffer for SSH wire format
      // SSH uses mpint format: 4-byte length + big-endian integer
      const exponent = this.bigintToMpint(keyDetails.publicExponent);
      const modulus = this.bigintToMpint(keyDetails.modulus);
      
      // SSH RSA public key format per RFC 4253:
      // string "ssh-rsa"
      // mpint  e (public exponent)  
      // mpint  n (modulus)
      const publicKey = Buffer.concat([
        PacketBuilder.buildString(keyBlobAlgorithm),
        exponent,
        modulus
      ]);
      
      return { publicKey, algorithm: signatureAlgorithm };
      
    } catch (error) {
      // Fallback: try to extract from JWK format if asymmetricKeyDetails fails
      try {
        const jwk = keyObj.export({ format: 'jwk' });
        if (jwk.n && jwk.e) {
          const modulus = this.base64urlToMpint(jwk.n);
          const exponent = this.base64urlToMpint(jwk.e);
          
          const publicKey = Buffer.concat([
            PacketBuilder.buildString(keyBlobAlgorithm),
            exponent,
            modulus
          ]);
          
          return { publicKey, algorithm: signatureAlgorithm };
        }
      } catch (jwkError) {
        // If both methods fail, throw the original error
      }
      
      throw new Error(`Failed to build RSA public key: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Build EC public key in SSH format (RFC 5656)
   */
  private buildECPublicKey(keyObj: any): { publicKey: Buffer; algorithm: string } {
    const namedCurve = keyObj.asymmetricKeyDetails?.namedCurve;
    let algorithm: string;
    let curveIdentifier: string;
    
    switch (namedCurve) {
      case 'prime256v1':
        algorithm = 'ecdsa-sha2-nistp256';
        curveIdentifier = 'nistp256';
        break;
      case 'secp384r1':
        algorithm = 'ecdsa-sha2-nistp384';
        curveIdentifier = 'nistp384';
        break;
      case 'secp521r1':
        algorithm = 'ecdsa-sha2-nistp521';
        curveIdentifier = 'nistp521';
        break;
      default:
        throw new Error(`Unsupported EC curve: ${namedCurve}`);
    }
    
    try {
      // Extract the public key point in uncompressed format
      // The raw format gives us the actual EC point bytes
      const publicKeyPoint = keyObj.export({ format: 'raw', type: 'spki' });
      
      // SSH ECDSA public key format per RFC 5656:
      // string "ecdsa-sha2-[identifier]"
      // string [identifier] (curve name)
      // string Q (public key point)
      const publicKey = Buffer.concat([
        PacketBuilder.buildString(algorithm),
        PacketBuilder.buildString(curveIdentifier), 
        PacketBuilder.buildBytes(publicKeyPoint)
      ]);
      
      return { publicKey, algorithm };
      
    } catch (error) {
      // Fallback: try to get point from JWK format
      try {
        const jwk = keyObj.export({ format: 'jwk' });
        if (jwk.x && jwk.y) {
          // Convert JWK coordinates to uncompressed point format
          const x = Buffer.from(jwk.x, 'base64url');
          const y = Buffer.from(jwk.y, 'base64url');
          const uncompressedPoint = Buffer.concat([Buffer.from([0x04]), x, y]);
          
          const publicKey = Buffer.concat([
            PacketBuilder.buildString(algorithm),
            PacketBuilder.buildString(curveIdentifier),
            PacketBuilder.buildBytes(uncompressedPoint)
          ]);
          
          return { publicKey, algorithm };
        }
      } catch (jwkError) {
        // If both methods fail, throw the original error
      }
      
      throw new Error(`Failed to build EC public key: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Build Ed25519 public key in SSH format (RFC 8709)
   */
  private buildEd25519PublicKey(keyObj: any): { publicKey: Buffer; algorithm: string } {
    const algorithm = 'ssh-ed25519';
    
    try {
      // Get the Ed25519 public key in DER format first, then extract the 32-byte key
      const derBytes = keyObj.export({ format: 'der', type: 'spki' });
      
      // Ed25519 public key is the last 32 bytes of the DER-encoded SPKI
      // Skip the algorithm identifier and just get the key bytes
      const publicKeyBytes = derBytes.slice(-32);
      
      // Verify it's the correct length for Ed25519
      if (publicKeyBytes.length !== 32) {
        throw new Error(`Invalid Ed25519 public key length: ${publicKeyBytes.length}, expected 32`);
      }
      
      // SSH Ed25519 public key format per RFC 8709:
      // string "ssh-ed25519"
      // string key (32-octet public key)
      const publicKey = Buffer.concat([
        PacketBuilder.buildString(algorithm),
        PacketBuilder.buildBytes(publicKeyBytes)
      ]);
      
      return { publicKey, algorithm };
      
    } catch (error) {
      throw new Error(`Failed to build Ed25519 public key: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Send public key signature
   */
  private sendPublicKeySignature(publicKey: Buffer, algorithm: string): void {
    const sessionId = this.transport.getSessionId();
    if (!sessionId) {
      throw new Error('Session ID not available');
    }

    // Create signature data
    const signatureData = Buffer.concat([
      PacketBuilder.buildBytes(sessionId),
      Buffer.from([SSH_MSG.USERAUTH_REQUEST]),
      PacketBuilder.buildString(this.context.username),
      PacketBuilder.buildString(this.context.service),
      PacketBuilder.buildString('publickey'),
      PacketBuilder.buildBoolean(true), // with signature
      PacketBuilder.buildString(algorithm),
      PacketBuilder.buildBytes(publicKey)
    ]);

    // Generate actual signature using private key
    const rawSignature = this.signData(signatureData, algorithm);

    // Build SSH signature blob
    const signatureBlob = Buffer.concat([
      PacketBuilder.buildString(algorithm),
      PacketBuilder.buildBytes(rawSignature)
    ]);

    const payload = Buffer.concat([
      PacketBuilder.buildString(this.context.username),
      PacketBuilder.buildString(this.context.service),
      PacketBuilder.buildString('publickey'),
      PacketBuilder.buildBoolean(true), // with signature
      PacketBuilder.buildString(algorithm),
      PacketBuilder.buildBytes(publicKey),
      PacketBuilder.buildBytes(signatureBlob)
    ]);

    this.transport.sendPacket(SSH_MSG.USERAUTH_REQUEST, payload);
  }

  /**
   * Handle authentication failure
   */
  private handleAuthFailure(payload: Buffer): void {
    const reader = new PacketReader(payload);
    const methods = reader.readString().split(',');
    const partialSuccess = reader.readBoolean();

    this.emit('error', new SSHError(
      `Authentication failed. Available methods: ${methods.join(', ')}`,
      'AUTH_FAILED'
    ));
  }

  /**
   * Sign data with private key
   */
  private signData(data: Buffer, algorithm: string): Buffer {
    const keyStr = this.config.privateKey instanceof Buffer 
      ? this.config.privateKey.toString() 
      : this.config.privateKey;

    if (!keyStr) {
      throw new Error('Private key not available');
    }

    try {
      const isEncrypted = keyStr.includes('ENCRYPTED');
      
      // Create private key object for signing
      let privateKeyObj;
      try {
        privateKeyObj = createPrivateKey({
          key: keyStr,
          format: 'pem',
          passphrase: isEncrypted ? this.config.passphrase : undefined
        });
      } catch (keyError: any) {
        throw new Error(`Unable to parse private key for signing: ${keyError?.message || keyError}`);
      }
      
      // Get key information 
      const publicKeyObj = createPublicKey(privateKeyObj);
      const actualKeyType = publicKeyObj.asymmetricKeyType;
      let signAlgorithm: string | null;
      
      // Match signing algorithm to actual key type and requested algorithm
      if ((algorithm === 'ssh-rsa' || algorithm === 'rsa-sha2-256') && actualKeyType === 'rsa') {
        signAlgorithm = 'RSA-SHA256';
      } else if (algorithm === 'rsa-sha2-512' && actualKeyType === 'rsa') {
        signAlgorithm = 'RSA-SHA512';
      } else if (algorithm.startsWith('ecdsa-sha2-') && actualKeyType === 'ec') {
        const curve = publicKeyObj.asymmetricKeyDetails?.namedCurve;
        if (algorithm === 'ecdsa-sha2-nistp256' && curve === 'prime256v1') {
          signAlgorithm = 'sha256';
        } else if (algorithm === 'ecdsa-sha2-nistp384' && curve === 'secp384r1') {
          signAlgorithm = 'sha384';
        } else if (algorithm === 'ecdsa-sha2-nistp521' && curve === 'secp521r1') {
          signAlgorithm = 'sha512';
        } else {
          throw new Error(`Key curve ${curve} does not match algorithm ${algorithm}`);
        }
      } else if (algorithm === 'ssh-ed25519' && actualKeyType === 'ed25519') {
        // For Ed25519, Node.js uses null as the algorithm
        // Ed25519 has built-in hashing (PureEdDSA mode)
        signAlgorithm = null;
      } else {
        throw new Error(`Key type ${actualKeyType} does not match algorithm ${algorithm}`);
      }

      // Generate the raw signature
      let rawSignature: Buffer;
      if (signAlgorithm === null) {
        // For Ed25519, use the sign method directly
        rawSignature = sign(null, data, privateKeyObj);
      } else {
        const signer = createSign(signAlgorithm);
        signer.update(data);
        rawSignature = signer.sign(privateKeyObj);
      }
      
      // Return raw signature - the caller will wrap it in SSH format
      return rawSignature;
      
    } catch (error: any) {
      throw new Error(`Failed to sign data: ${error?.message || error}`);
    }
  }

  /**
   * Convert bigint to SSH mpint format
   */
  private bigintToMpint(value: bigint): Buffer {
    // Convert bigint to hex string, then to buffer
    let hex = value.toString(16);
    
    // Ensure even number of hex digits
    if (hex.length % 2 !== 0) {
      hex = '0' + hex;
    }
    
    const bytes = Buffer.from(hex, 'hex');
    
    // Use centralized ssh2-compatible mpint conversion
    const mpintBytes = PacketBuilder.convertToMpint(bytes);
    
    // Return length-prefixed mpint
    return PacketBuilder.buildBytes(mpintBytes);
  }

  /**
   * Convert base64url to SSH mpint format
   */
  private base64urlToMpint(base64url: string): Buffer {
    // Convert base64url to base64
    let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    
    // Add padding if needed
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    
    const bytes = Buffer.from(base64, 'base64');
    
    // Use centralized ssh2-compatible mpint conversion
    const mpintBytes = PacketBuilder.convertToMpint(bytes);
    
    // Return length-prefixed mpint
    return PacketBuilder.buildBytes(mpintBytes);
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.context.authenticated;
  }
}