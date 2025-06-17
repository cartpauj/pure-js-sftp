/**
 * Public Key Authentication Support
 */

import { readFileSync } from 'fs';
import { CryptoUtils } from '../crypto/utils';
import { PacketBuilder } from '../ssh/packet';

export class PublicKeyAuth {
  private privateKey: Buffer;
  private publicKey: Buffer;
  private keyType: string;

  constructor(privateKeyPath: string, passphrase?: string) {
    this.privateKey = this.loadPrivateKey(privateKeyPath, passphrase);
    this.publicKey = this.extractPublicKey(this.privateKey);
    this.keyType = this.detectKeyType(this.privateKey);
  }

  /**
   * Load private key from file
   */
  private loadPrivateKey(keyPath: string, passphrase?: string): Buffer {
    const keyData = readFileSync(keyPath);
    
    // For now, assume unencrypted PEM format
    // TODO: Add support for encrypted keys and other formats
    if (passphrase) {
      throw new Error('Encrypted private keys not yet supported');
    }
    
    return keyData;
  }

  /**
   * Extract public key from private key
   */
  private extractPublicKey(privateKey: Buffer): Buffer {
    // TODO: Implement proper key extraction
    // For now, return placeholder
    return Buffer.from('placeholder-public-key');
  }

  /**
   * Detect key type (RSA, DSA, ECDSA, Ed25519)
   */
  private detectKeyType(privateKey: Buffer): string {
    const keyStr = privateKey.toString();
    
    if (keyStr.includes('BEGIN RSA PRIVATE KEY')) {
      return 'ssh-rsa';
    } else if (keyStr.includes('BEGIN DSA PRIVATE KEY')) {
      return 'ssh-dss';
    } else if (keyStr.includes('BEGIN EC PRIVATE KEY')) {
      return 'ecdsa-sha2-nistp256';
    } else if (keyStr.includes('BEGIN OPENSSH PRIVATE KEY')) {
      return 'ssh-ed25519';
    }
    
    throw new Error('Unsupported private key format');
  }

  /**
   * Create authentication signature
   */
  createSignature(sessionId: Buffer, username: string, service: string): Buffer {
    // Build data to sign
    const signData = Buffer.concat([
      PacketBuilder.buildBytes(sessionId),
      PacketBuilder.buildUInt32(50), // SSH_MSG_USERAUTH_REQUEST
      PacketBuilder.buildString(username),
      PacketBuilder.buildString(service),
      PacketBuilder.buildString('publickey'),
      PacketBuilder.buildBoolean(true),
      PacketBuilder.buildString(this.keyType),
      PacketBuilder.buildBytes(this.publicKey)
    ]);

    // TODO: Implement actual signature creation based on key type
    // For now, return placeholder
    return CryptoUtils.sha256(signData);
  }

  /**
   * Get public key for authentication
   */
  getPublicKey(): Buffer {
    return this.publicKey;
  }

  /**
   * Get key type
   */
  getKeyType(): string {
    return this.keyType;
  }
}