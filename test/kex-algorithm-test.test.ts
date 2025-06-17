/**
 * Test which KEX algorithm is being chosen
 */

import { SSHClient } from '../src/client/ssh-client';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('KEX Algorithm Test', () => {
  const testKeysDir = join(__dirname, 'fixtures', 'keys');
  
  test('should show which KEX algorithm is chosen', async () => {
    const privateKey = readFileSync(join(testKeysDir, 'test_rsa_2048'), 'utf8');
    
    const client = new SSHClient({
      host: '142.93.27.188',
      port: 2390,
      username: 'cartpauj',
      timeout: 5000,
      debug: true,
      privateKey,
      passphrase: undefined
    });
    
    console.log('Testing KEX algorithm selection...');
    
    try {
      await client.connect();
      console.log('✅ Connection successful!');
      await new Promise(resolve => setTimeout(resolve, 100)); // Brief delay
      client.end();
      await new Promise(resolve => setTimeout(resolve, 100)); // Wait for cleanup
    } catch (error: any) {
      console.log('Connection details:', error.message);
      client.end();
      await new Promise(resolve => setTimeout(resolve, 100)); // Wait for cleanup
      // We mainly want to see the debug output showing which algorithm was chosen
    }
  }, 10000);
});