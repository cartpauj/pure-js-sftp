/**
 * REAL CONNECTION TEST - Test actual SSH key authentication with real keys
 */

import { SSHClient } from '../src/client/ssh-client';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Real Connection Tests', () => {
  const testKeysDir = join(__dirname, 'fixtures', 'keys');
  
  // Test configuration - using a known test server
  const testConfig = {
    host: '142.93.27.188',
    port: 2390,
    username: 'cartpauj',
    timeout: 10000,
    debug: true
  };

  describe('RSA Key Authentication', () => {
    test('should authenticate with RSA 2048-bit key (no passphrase)', async () => {
      const privateKey = readFileSync(join(testKeysDir, 'test_rsa_2048'), 'utf8');
      
      const client = new SSHClient({
        ...testConfig,
        privateKey,
        passphrase: undefined
      });
      
      console.log('Testing RSA 2048-bit key without passphrase...');
      console.log('Key length:', privateKey.length);
      console.log('Key starts with:', privateKey.substring(0, 50));
      
      try {
        await client.connect();
        console.log('✅ RSA 2048 (no pass) connection successful!');
        client.end();
      } catch (error: any) {
        console.log('❌ RSA 2048 (no pass) failed:', error.message);
        throw error;
      }
    }, 30000);

    test('should authenticate with RSA 2048-bit key WITH passphrase', async () => {
      const privateKey = readFileSync(join(testKeysDir, 'test_rsa_2048_pass'), 'utf8');
      
      const client = new SSHClient({
        ...testConfig,
        privateKey,
        passphrase: 'testpass123'  // This is the test passphrase
      });
      
      console.log('Testing RSA 2048-bit key WITH passphrase...');
      console.log('Key is encrypted:', privateKey.includes('ENCRYPTED'));
      
      try {
        await client.connect();
        console.log('✅ RSA 2048 (with pass) connection successful!');
        client.end();
      } catch (error: any) {
        console.log('❌ RSA 2048 (with pass) failed:', error.message);
        throw error;
      }
    }, 30000);

    test('should authenticate with RSA 4096-bit key', async () => {
      const privateKey = readFileSync(join(testKeysDir, 'test_rsa_4096'), 'utf8');
      
      const client = new SSHClient({
        ...testConfig,
        privateKey,
        passphrase: undefined
      });
      
      console.log('Testing RSA 4096-bit key...');
      
      try {
        await client.connect();
        console.log('✅ RSA 4096 connection successful!');
        client.end();
      } catch (error: any) {
        console.log('❌ RSA 4096 failed:', error.message);
        throw error;
      }
    }, 30000);
  });

  describe('ECDSA Key Authentication', () => {
    test('should authenticate with ECDSA P-256 key (no passphrase)', async () => {
      const privateKey = readFileSync(join(testKeysDir, 'test_ecdsa_256'), 'utf8');
      
      const client = new SSHClient({
        ...testConfig,
        privateKey,
        passphrase: undefined
      });
      
      console.log('Testing ECDSA P-256 key...');
      
      try {
        await client.connect();
        console.log('✅ ECDSA P-256 connection successful!');
        client.end();
      } catch (error: any) {
        console.log('❌ ECDSA P-256 failed:', error.message);
        throw error;
      }
    }, 30000);

    test('should authenticate with ECDSA P-256 key WITH passphrase', async () => {
      const privateKey = readFileSync(join(testKeysDir, 'test_ecdsa_256_pass'), 'utf8');
      
      const client = new SSHClient({
        ...testConfig,
        privateKey,
        passphrase: 'testpass123'
      });
      
      console.log('Testing ECDSA P-256 key WITH passphrase...');
      
      try {
        await client.connect();
        console.log('✅ ECDSA P-256 (with pass) connection successful!');
        client.end();
      } catch (error: any) {
        console.log('❌ ECDSA P-256 (with pass) failed:', error.message);
        throw error;
      }
    }, 30000);
  });

  describe('Ed25519 Key Authentication', () => {
    test('should authenticate with Ed25519 key', async () => {
      const privateKey = readFileSync(join(testKeysDir, 'test_ed25519_pem'), 'utf8');
      
      const client = new SSHClient({
        ...testConfig,
        privateKey,
        passphrase: undefined
      });
      
      console.log('Testing Ed25519 key...');
      
      try {
        await client.connect();
        console.log('✅ Ed25519 connection successful!');
        client.end();
      } catch (error: any) {
        console.log('❌ Ed25519 failed:', error.message);
        throw error;
      }
    }, 30000);
  });

  describe('Different Key Formats', () => {
    test('should handle OpenSSH format RSA key', async () => {
      const privateKey = readFileSync(join(testKeysDir, 'test_rsa_4096_openssh'), 'utf8');
      
      const client = new SSHClient({
        ...testConfig,
        privateKey,
        passphrase: undefined
      });
      
      console.log('Testing OpenSSH format RSA key...');
      console.log('Key format check:', privateKey.includes('BEGIN OPENSSH PRIVATE KEY'));
      
      try {
        await client.connect();
        console.log('✅ OpenSSH format connection successful!');
        client.end();
      } catch (error: any) {
        console.log('❌ OpenSSH format failed:', error.message);
        throw error;
      }
    }, 30000);
  });

  describe('Error Handling', () => {
    test('should fail gracefully with wrong passphrase', async () => {
      const privateKey = readFileSync(join(testKeysDir, 'test_rsa_2048_pass'), 'utf8');
      
      const client = new SSHClient({
        ...testConfig,
        privateKey,
        passphrase: 'wrongpassword'
      });
      
      console.log('Testing wrong passphrase handling...');
      
      try {
        await client.connect();
        fail('Should have failed with wrong passphrase');
      } catch (error: any) {
        console.log('✅ Correctly failed with wrong passphrase:', error.message);
        expect(error.message).toContain('passphrase');
      }
    }, 30000);

    test('should fail gracefully with missing passphrase', async () => {
      const privateKey = readFileSync(join(testKeysDir, 'test_rsa_2048_pass'), 'utf8');
      
      const client = new SSHClient({
        ...testConfig,
        privateKey,
        passphrase: undefined  // Missing required passphrase
      });
      
      console.log('Testing missing passphrase handling...');
      
      try {
        await client.connect();
        fail('Should have failed with missing passphrase');
      } catch (error: any) {
        console.log('✅ Correctly failed with missing passphrase:', error.message);
        expect(error.message).toContain('passphrase');
      }
    }, 30000);
  });
});