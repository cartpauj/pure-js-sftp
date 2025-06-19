/**
 * Test actual SSH connection with our key parsers
 */

const fs = require('fs');
const path = require('path');
const { SSH2StreamsTransport } = require('../dist/ssh/ssh2-streams-transport');

async function testConnection() {
  console.log('🔗 Testing SSH connection with user\'s original key...');
  
  const keyPath = path.join(__dirname, 'keys', 'user_original_test_key');
  const privateKey = fs.readFileSync(keyPath, 'utf8');
  
  const config = {
    host: 'linux.server.cloud',
    port: 2222,
    username: 'testuser',
    privateKey: privateKey
  };
  
  const transport = new SSH2StreamsTransport(config);
  
  // Add debug logging
  transport.on('debug', (msg) => {
    console.log(`🐛 DEBUG: ${msg}`);
  });
  
  transport.on('error', (err) => {
    console.log(`❌ ERROR: ${err.message}`);
  });
  
  try {
    console.log('⏳ Connecting to server...');
    await transport.connect();
    console.log('✅ Connected successfully!');
    
    console.log('⏳ Opening SFTP channel...');
    const sftpChannel = await transport.openSFTP();
    console.log('✅ SFTP channel opened successfully!');
    
    // Close connection
    transport.disconnect();
    console.log('✅ Connection test completed successfully!');
    
  } catch (error) {
    console.log(`❌ Connection failed: ${error.message}`);
    transport.disconnect();
  }
}

// Test with different key types
async function testMultipleKeys() {
  console.log('\n🔑 Testing multiple key types...');
  
  const testKeys = [
    { name: 'user_original_test_key', passphrase: undefined },
    { name: 'rsa_pem_test', passphrase: undefined },
    { name: 'rsa_2048_pkcs1_no_pass', passphrase: undefined }
  ];
  
  for (const testKey of testKeys) {
    console.log(`\n📝 Testing ${testKey.name}:`);
    
    try {
      const keyPath = path.join(__dirname, 'keys', testKey.name);
      const privateKey = fs.readFileSync(keyPath, 'utf8');
      
      const config = {
        host: 'linux.server.cloud',
        port: 2222,
        username: 'testuser',
        privateKey: privateKey,
        passphrase: testKey.passphrase
      };
      
      const transport = new SSH2StreamsTransport(config);
      
      transport.on('debug', (msg) => {
        if (msg.includes('key parsing') || msg.includes('Authentication')) {
          console.log(`  🐛 ${msg}`);
        }
      });
      
      transport.on('error', (err) => {
        console.log(`  ❌ ${err.message}`);
      });
      
      console.log('  ⏳ Testing connection...');
      await transport.connect();
      console.log('  ✅ Connection successful!');
      
      transport.disconnect();
      
    } catch (error) {
      console.log(`  ❌ Failed: ${error.message}`);
    }
  }
}

// Run tests
testConnection()
  .then(() => testMultipleKeys())
  .then(() => {
    console.log('\n🎉 All connection tests completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });