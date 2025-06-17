/**
 * SSH2-SFTP-Client API Compatibility Examples
 * 
 * This file demonstrates that pure-js-sftp maintains exact API compatibility
 * with ssh2-sftp-client, especially for passphrase handling.
 */

const SftpClient = require('../dist/index.js').default;
const fs = require('fs');

// Example 1: Basic connection with unencrypted key (matches ssh2-sftp-client)
async function example1_basicConnection() {
  console.log('Example 1: Basic connection (unencrypted key)');
  
  const sftp = new SftpClient();
  
  try {
    await sftp.connect({
      host: 'example.com',
      username: 'user',
      privateKey: fs.readFileSync('/path/to/private/key') // Exact ssh2-sftp-client API
    });
    
    console.log('Connected successfully');
    
    // Use SFTP operations...
    await sftp.end();
    
  } catch (error) {
    console.error('Connection failed:', error.message);
  }
}

// Example 2: Connection with passphrase-protected key (matches ssh2-sftp-client)
async function example2_passphraseConnection() {
  console.log('Example 2: Connection with passphrase-protected key');
  
  const sftp = new SftpClient();
  
  try {
    // This is the EXACT format from ssh2-sftp-client documentation
    await sftp.connect({
      host: 'example.com',
      username: 'your_username',
      privateKey: fs.readFileSync('/path/to/encrypted/key'),
      passphrase: 'a pass phrase'
    });
    
    console.log('Connected with encrypted key');
    
    // Use SFTP operations...
    await sftp.end();
    
  } catch (error) {
    console.error('Connection failed:', error.message);
  }
}

// Example 3: All configuration options (matches ssh2-sftp-client)
async function example3_fullConfiguration() {
  console.log('Example 3: Full configuration options');
  
  const sftp = new SftpClient();
  
  try {
    await sftp.connect({
      host: 'example.com',
      port: 2222,
      username: 'user',
      privateKey: fs.readFileSync('/path/to/key'),
      passphrase: 'key-passphrase',
      timeout: 30000,
      keepaliveInterval: 5000,
      algorithms: {
        kex: ['diffie-hellman-group14-sha256'],
        hostKey: ['ssh-rsa', 'ecdsa-sha2-nistp256'],
        cipher: ['aes128-ctr', 'aes256-ctr'],
        mac: ['hmac-sha2-256'],
        compress: ['none']
      },
      debug: false
    });
    
    console.log('Connected with full configuration');
    await sftp.end();
    
  } catch (error) {
    console.error('Connection failed:', error.message);
  }
}

// Example 4: Different key formats (all supported like ssh2-sftp-client)
async function example4_differentKeyFormats() {
  console.log('Example 4: Different key formats');
  
  const sftp = new SftpClient();
  
  // String format
  const keyAsString = fs.readFileSync('/path/to/key', 'utf8');
  
  // Buffer format (default from fs.readFileSync)
  const keyAsBuffer = fs.readFileSync('/path/to/key');
  
  // Both work exactly like ssh2-sftp-client
  const configs = [
    {
      host: 'example.com',
      username: 'user',
      privateKey: keyAsString // String
    },
    {
      host: 'example.com',
      username: 'user',
      privateKey: keyAsBuffer // Buffer
    }
  ];
  
  for (const config of configs) {
    try {
      await sftp.connect(config);
      console.log(`Connected with ${typeof config.privateKey} key format`);
      await sftp.end();
    } catch (error) {
      console.error(`Failed with ${typeof config.privateKey} format:`, error.message);
    }
  }
}

// Example 5: Error handling (compatible with ssh2-sftp-client)
async function example5_errorHandling() {
  console.log('Example 5: Error handling');
  
  const sftp = new SftpClient();
  
  // Missing passphrase error
  try {
    await sftp.connect({
      host: 'example.com',
      username: 'user',
      privateKey: fs.readFileSync('/path/to/encrypted/key')
      // Missing passphrase
    });
  } catch (error) {
    console.log('Expected error for missing passphrase:', error.message);
  }
  
  // Wrong passphrase error
  try {
    await sftp.connect({
      host: 'example.com',
      username: 'user',
      privateKey: fs.readFileSync('/path/to/encrypted/key'),
      passphrase: 'wrong-passphrase'
    });
  } catch (error) {
    console.log('Expected error for wrong passphrase:', error.message);
  }
}

// Example 6: Common usage patterns (ssh2-sftp-client style)
async function example6_commonPatterns() {
  console.log('Example 6: Common usage patterns');
  
  const sftp = new SftpClient();
  
  try {
    // GitHub/GitLab style connection
    await sftp.connect({
      host: 'github.com',
      port: 22,
      username: 'git',
      privateKey: fs.readFileSync(`${process.env.HOME}/.ssh/id_rsa`),
      passphrase: process.env.SSH_PASSPHRASE // From environment
    });
    
    console.log('Connected to Git server');
    
    // AWS EC2 style connection
    await sftp.connect({
      host: 'ec2-instance.amazonaws.com',
      username: 'ec2-user',
      privateKey: fs.readFileSync('./aws-key.pem')
      // No passphrase for AWS keys
    });
    
    console.log('Connected to AWS EC2');
    
    await sftp.end();
    
  } catch (error) {
    console.error('Connection failed:', error.message);
  }
}

// Example 7: Drop-in replacement demonstration
async function example7_dropInReplacement() {
  console.log('Example 7: Drop-in replacement for ssh2-sftp-client');
  
  // This code would work identically with ssh2-sftp-client
  // Just change: require('ssh2-sftp-client') to require('pure-js-sftp')
  
  const sftp = new SftpClient();
  
  try {
    const config = {
      host: 'your-server.com',
      username: 'your-username',
      privateKey: fs.readFileSync('/path/to/your/key'),
      passphrase: 'your-passphrase-if-needed'
    };
    
    await sftp.connect(config);
    
    // All these methods work exactly like ssh2-sftp-client
    const files = await sftp.list('/remote/path');
    const exists = await sftp.exists('/remote/file.txt');
    await sftp.get('/remote/file.txt', '/local/file.txt');
    await sftp.put('/local/file.txt', '/remote/file.txt');
    await sftp.mkdir('/remote/new/directory', true);
    
    await sftp.end();
    
    console.log('All operations completed successfully');
    
  } catch (error) {
    console.error('Operation failed:', error.message);
  }
}

// Export examples for demonstration
module.exports = {
  example1_basicConnection,
  example2_passphraseConnection,
  example3_fullConfiguration,
  example4_differentKeyFormats,
  example5_errorHandling,
  example6_commonPatterns,
  example7_dropInReplacement
};

// Uncomment to run examples (requires actual SSH server and keys)
// async function runExamples() {
//   await example1_basicConnection();
//   await example2_passphraseConnection();
//   await example3_fullConfiguration();
//   await example4_differentKeyFormats();
//   await example5_errorHandling();
//   await example6_commonPatterns();
//   await example7_dropInReplacement();
// }
// 
// runExamples().catch(console.error);