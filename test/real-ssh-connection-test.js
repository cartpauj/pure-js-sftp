/**
 * Real SSH Connection Test - All 22 Keys
 * Tests actual SSH connections to localhost with our ssh2-streams transport
 * This is the FINAL verification that our RSA-SHA2 wrapper works!
 */

const fs = require('fs');
const path = require('path');
const { SSH2StreamsTransport } = require('../dist/ssh/ssh2-streams-transport');

// Colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  magenta: '\x1b[35m'
};

function colorLog(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

const keysDir = path.join(__dirname, 'keys');

// All 22 keys that we need to test
const allTestKeys = [
  // Traditional PKCS#1 RSA keys (should work with RSA-SHA2 wrapper)
  { name: 'rsa_pem_test', passphrase: undefined, type: 'RSA', format: 'PKCS#1', encrypted: false, expectWrapper: true },
  { name: 'rsa_2048_pkcs1_no_pass', passphrase: undefined, type: 'RSA', format: 'PKCS#1', encrypted: false, expectWrapper: true },
  { name: 'rsa_2048_pkcs1_with_pass', passphrase: 'testpass123', type: 'RSA', format: 'PKCS#1', encrypted: true, expectWrapper: true },
  { name: 'rsa_3072_pkcs1_no_pass', passphrase: undefined, type: 'RSA', format: 'PKCS#1', encrypted: false, expectWrapper: true },
  { name: 'rsa_3072_pkcs1_with_pass', passphrase: 'testpass123', type: 'RSA', format: 'PKCS#1', encrypted: true, expectWrapper: true },
  { name: 'rsa_4096_pkcs1_no_pass', passphrase: undefined, type: 'RSA', format: 'PKCS#1', encrypted: false, expectWrapper: true },
  { name: 'rsa_4096_pkcs1_with_pass', passphrase: 'testpass123', type: 'RSA', format: 'PKCS#1', encrypted: true, expectWrapper: true },
  
  // Modern OpenSSH format RSA keys (should work with RSA-SHA2 wrapper)
  { name: 'rsa_4096_rfc8332', passphrase: undefined, type: 'RSA', format: 'OpenSSH', encrypted: false, expectWrapper: true },
  { name: 'rsa_2048_no_pass', passphrase: undefined, type: 'RSA', format: 'OpenSSH', encrypted: false, expectWrapper: true },
  { name: 'rsa_2048_with_pass', passphrase: 'test123', type: 'RSA', format: 'OpenSSH', encrypted: true, expectWrapper: true },
  { name: 'rsa_3072_no_pass', passphrase: undefined, type: 'RSA', format: 'OpenSSH', encrypted: false, expectWrapper: true },
  { name: 'rsa_3072_with_pass', passphrase: 'test123', type: 'RSA', format: 'OpenSSH', encrypted: true, expectWrapper: true },
  { name: 'rsa_4096_no_pass', passphrase: undefined, type: 'RSA', format: 'OpenSSH', encrypted: false, expectWrapper: true },
  { name: 'rsa_4096_with_pass', passphrase: 'test123', type: 'RSA', format: 'OpenSSH', encrypted: true, expectWrapper: true },
  
  // Ed25519 keys (should work natively)
  { name: 'ed25519_no_pass', passphrase: undefined, type: 'Ed25519', format: 'OpenSSH', encrypted: false, expectWrapper: false },
  { name: 'ed25519_with_pass', passphrase: 'test123', type: 'Ed25519', format: 'OpenSSH', encrypted: true, expectWrapper: false },
  
  // ECDSA keys (should work natively)
  { name: 'ecdsa_256_no_pass', passphrase: undefined, type: 'ECDSA-P256', format: 'OpenSSH', encrypted: false, expectWrapper: false },
  { name: 'ecdsa_256_with_pass', passphrase: 'test123', type: 'ECDSA-P256', format: 'OpenSSH', encrypted: true, expectWrapper: false },
  { name: 'ecdsa_384_no_pass', passphrase: undefined, type: 'ECDSA-P384', format: 'OpenSSH', encrypted: false, expectWrapper: false },
  { name: 'ecdsa_384_with_pass', passphrase: 'test123', type: 'ECDSA-P384', format: 'OpenSSH', encrypted: true, expectWrapper: false },
  { name: 'ecdsa_521_no_pass', passphrase: undefined, type: 'ECDSA-P521', format: 'OpenSSH', encrypted: false, expectWrapper: false },
  { name: 'ecdsa_521_with_pass', passphrase: 'test123', type: 'ECDSA-P521', format: 'OpenSSH', encrypted: true, expectWrapper: false }
];

function loadKey(keyName) {
  const keyPath = path.join(keysDir, keyName);
  try {
    return fs.readFileSync(keyPath, 'utf8');
  } catch (error) {
    return null;
  }
}

function testKeyConnection(keyInfo) {
  return new Promise((resolve) => {
    const keyData = loadKey(keyInfo.name);
    if (!keyData) {
      resolve({ skipped: true, reason: 'Key file not found' });
      return;
    }

    const result = {
      keyInfo,
      connection: { success: false, error: null, debugMessages: [] },
      authentication: { success: false, error: null },
      wrapperUsed: false,
      details: {}
    };

    const config = {
      host: '127.0.0.1',
      port: 22,
      username: 'cartpauj',  // Current user
      privateKey: keyData,
      passphrase: keyInfo.passphrase
    };

    let transport;
    
    try {
      transport = new SSH2StreamsTransport(config);
      
      // Capture debug messages to see wrapper usage
      transport.on('debug', (message) => {
        result.connection.debugMessages.push(message);
        
        if (message.includes('RSA-SHA2')) {
          result.wrapperUsed = true;
        }
      });

      transport.on('ready', () => {
        result.connection.success = true;
        result.authentication.success = true;
        
        // Clean up and resolve
        setTimeout(() => {
          try {
            transport.disconnect();
          } catch (e) {
            // Ignore cleanup errors
          }
          resolve(result);
        }, 100);
      });

      transport.on('error', (error) => {
        if (!result.connection.success) {
          result.connection.error = error.message;
        } else {
          result.authentication.error = error.message;
        }
        
        try {
          transport.disconnect();
        } catch (e) {
          // Ignore cleanup errors
        }
        resolve(result);
      });

      // Set connection timeout
      const timeout = setTimeout(() => {
        result.connection.error = 'Connection timeout (10s)';
        try {
          transport.disconnect();
        } catch (e) {
          // Ignore cleanup errors
        }
        resolve(result);
      }, 10000);

      // Start the connection
      transport.connect().catch((error) => {
        clearTimeout(timeout);
        result.connection.error = error.message;
        resolve(result);
      });

    } catch (error) {
      result.connection.error = `Transport creation failed: ${error.message}`;
      resolve(result);
    }
  });
}

async function runRealConnectionTests() {
  colorLog(colors.bold + colors.magenta, '🌐 REAL SSH CONNECTION TEST - All 22 Keys');
  colorLog(colors.magenta, '==========================================');
  colorLog(colors.cyan, `Testing against: localhost:22 (OpenSSH server)`);
  colorLog(colors.cyan, `User: cartpauj`);
  colorLog(colors.cyan, `Keys in authorized_keys: 22`);
  
  const stats = {
    total: 0,
    connectionSuccess: 0,
    authSuccess: 0,
    wrapperUsed: 0,
    byType: {
      'RSA': { total: 0, success: 0, wrapper: 0 },
      'Ed25519': { total: 0, success: 0, wrapper: 0 },
      'ECDSA': { total: 0, success: 0, wrapper: 0 }
    }
  };

  const results = [];
  const categories = {
    'PKCS#1 RSA Keys (RSA-SHA2 Wrapper Expected)': allTestKeys.filter(k => k.format === 'PKCS#1'),
    'OpenSSH RSA Keys (RSA-SHA2 Wrapper Expected)': allTestKeys.filter(k => k.format === 'OpenSSH' && k.type === 'RSA'),
    'Ed25519 Keys (Native Expected)': allTestKeys.filter(k => k.type === 'Ed25519'),
    'ECDSA Keys (Native Expected)': allTestKeys.filter(k => k.type.startsWith('ECDSA'))
  };

  for (const [categoryName, keys] of Object.entries(categories)) {
    if (keys.length === 0) continue;

    colorLog(colors.bold + colors.blue, `\n📂 ${categoryName}`);
    colorLog(colors.blue, '='.repeat(80));

    for (const keyInfo of keys) {
      stats.total++;
      const keyType = keyInfo.type.includes('ECDSA') ? 'ECDSA' : keyInfo.type;
      stats.byType[keyType].total++;
      
      colorLog(colors.cyan, `\n🔑 Testing ${keyInfo.name}`);
      colorLog(colors.cyan, `   Type: ${keyInfo.type}, Format: ${keyInfo.format}, Encrypted: ${keyInfo.encrypted}`);
      
      const result = await testKeyConnection(keyInfo);
      results.push(result);
      
      if (result.skipped) {
        colorLog(colors.yellow, `⚠️  SKIPPED (${result.reason})`);
        continue;
      }
      
      // Connection results
      if (result.connection.success) {
        stats.connectionSuccess++;
        colorLog(colors.green, `✅ Connection: SUCCESS`);
      } else {
        colorLog(colors.red, `❌ Connection: FAILED - ${result.connection.error}`);
      }
      
      // Authentication results
      if (result.authentication.success) {
        stats.authSuccess++;
        stats.byType[keyType].success++;
        colorLog(colors.green, `✅ Authentication: SUCCESS`);
      } else {
        colorLog(colors.red, `❌ Authentication: FAILED - ${result.authentication.error}`);
      }
      
      // Wrapper usage
      if (result.wrapperUsed) {
        stats.wrapperUsed++;
        stats.byType[keyType].wrapper++;
        colorLog(colors.blue, `🔧 RSA-SHA2 Wrapper: USED`);
      } else {
        if (keyInfo.expectWrapper) {
          colorLog(colors.yellow, `⚠️  RSA-SHA2 Wrapper: Expected but not detected`);
        } else {
          colorLog(colors.cyan, `ℹ️  Native signing used (Ed25519/ECDSA)`);
        }
      }
      
      // Overall verdict for this key
      if (result.authentication.success) {
        const method = result.wrapperUsed ? 'RSA-SHA2 wrapper' : 'native signing';
        colorLog(colors.bold + colors.green, `🎯 OVERALL: ✅ WORKS PERFECTLY (${method})`);
      } else {
        colorLog(colors.bold + colors.red, `🎯 OVERALL: ❌ FAILED`);
      }
      
      // Show important debug messages
      const importantDebug = result.connection.debugMessages.filter(msg => 
        msg.includes('RSA-SHA2') || 
        msg.includes('Enhanced') || 
        msg.includes('ssh2-streams key parsing') ||
        msg.includes('Authentication')
      );
      
      if (importantDebug.length > 0) {
        colorLog(colors.cyan, `   🐛 Key debug messages:`);
        importantDebug.forEach(msg => {
          colorLog(colors.cyan, `      ${msg}`);
        });
      }
    }
  }

  // Final Results Summary
  colorLog(colors.bold + colors.cyan, '\n📊 FINAL REAL SSH CONNECTION RESULTS');
  colorLog(colors.cyan, '=====================================');
  
  console.log(`Total keys tested: ${stats.total}`);
  console.log('');
  
  const connectionRate = Math.round((stats.connectionSuccess / stats.total) * 100);
  const authRate = Math.round((stats.authSuccess / stats.total) * 100);
  
  colorLog(connectionRate >= 90 ? colors.green : colors.red, 
    `🔗 Connections: ${stats.connectionSuccess}/${stats.total} (${connectionRate}%)`);
  colorLog(authRate >= 90 ? colors.green : colors.red, 
    `🔐 Authentication: ${stats.authSuccess}/${stats.total} (${authRate}%)`);
  colorLog(colors.blue, 
    `🔧 RSA-SHA2 Wrapper Used: ${stats.wrapperUsed} times`);
  
  console.log('');
  colorLog(colors.bold + colors.cyan, 'Results by Key Type:');
  for (const [keyType, typeStats] of Object.entries(stats.byType)) {
    if (typeStats.total > 0) {
      const successRate = Math.round((typeStats.success / typeStats.total) * 100);
      const color = successRate >= 90 ? colors.green : colors.red;
      colorLog(color, `  ${keyType}: ${typeStats.success}/${typeStats.total} (${successRate}%) - Wrapper used: ${typeStats.wrapper}x`);
    }
  }
  
  // Final Assessment
  console.log('');
  colorLog(colors.bold + colors.magenta, '🎯 ULTIMATE VERDICT');
  colorLog(colors.magenta, '===================');
  
  if (stats.authSuccess === stats.total) {
    colorLog(colors.bold + colors.green, '🎉 PERFECT! ALL 22 KEYS WORK WITH SSH2-STREAMS!');
    colorLog(colors.green, '✅ RSA-SHA2 wrapper successfully enables RSA key compatibility');
    colorLog(colors.green, '✅ Ed25519 and ECDSA keys work natively');
    colorLog(colors.green, '✅ Enhanced parser + ssh2-streams = 100% SSH key support');
    
    console.log('');
    colorLog(colors.cyan, '🏆 MISSION ACCOMPLISHED:');
    console.log('   • Original problem: "library not working with modern keys" - SOLVED');
    console.log('   • All 22 test keys now authenticate successfully');
    console.log('   • Pure JavaScript solution maintains VSCode compatibility');
    console.log('   • No modifications to ssh2-streams library required');
    
  } else if (stats.authSuccess >= stats.total * 0.8) {
    colorLog(colors.yellow, `⚠️  MOSTLY WORKING: ${stats.authSuccess}/${stats.total} keys successful`);
    colorLog(colors.yellow, 'Some keys may need additional investigation');
  } else {
    colorLog(colors.red, `❌ SIGNIFICANT ISSUES: Only ${stats.authSuccess}/${stats.total} keys working`);
    colorLog(colors.red, 'Need to investigate connection/authentication failures');
  }

  return { stats, results };
}

// Run the ultimate test
console.log('');
runRealConnectionTests()
  .then(({ stats, results }) => {
    console.log('\n✅ Real SSH connection testing completed!');
    console.log(`📊 Final score: ${stats.authSuccess}/${stats.total} keys working`);
  })
  .catch((error) => {
    console.error('❌ Test suite failed:', error);
  });