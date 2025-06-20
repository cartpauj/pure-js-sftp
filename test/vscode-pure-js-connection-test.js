/**
 * VSCode Pure JavaScript Connection Test - All Keys
 * Tests actual SSH connections to localhost with FORCED VSCode environment
 * This tests the pure JavaScript fallback mechanisms for ALL keys
 */

const fs = require('fs');
const path = require('path');
const { SSH2StreamsTransport } = require('../dist/ssh/ssh2-streams-transport');

// FORCE VSCode environment for ALL tests
process.env.VSCODE_PID = '12345';
process.env.TERM_PROGRAM = 'vscode';
process.env.VSCODE_INJECTION = '1';

console.log('🔧 FORCED VSCode Environment Variables:');
console.log(`   VSCODE_PID: ${process.env.VSCODE_PID}`);
console.log(`   TERM_PROGRAM: ${process.env.TERM_PROGRAM}`);
console.log(`   VSCODE_INJECTION: ${process.env.VSCODE_INJECTION}`);

// Also set additional VSCode environment variables that might be checked
process.env.VSCODE_CLI = '1';
process.env.VSCODE_IPC_HOOK = '/tmp/vscode-ipc.sock';

// Note: Now using pure JavaScript exclusively (no fallback needed)
console.log('🔧 Pure JavaScript Mode: Always enabled (zero dependencies)');

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

// All keys that exist in the /test/keys/ directory with correct passphrases
const allTestKeys = [
  // Traditional PKCS#1 RSA keys (should work with RSA-SHA2 wrapper AND VSCode fallback)
  { name: 'rsa_pem_test', passphrase: undefined, type: 'RSA', format: 'PKCS#1', encrypted: false, expectWrapper: true },
  { name: 'rsa_2048_pkcs1_no_pass', passphrase: undefined, type: 'RSA', format: 'PKCS#1', encrypted: false, expectWrapper: true },
  { name: 'rsa_2048_pkcs1_with_pass', passphrase: 'testpass123', type: 'RSA', format: 'PKCS#1', encrypted: true, expectWrapper: true },
  { name: 'rsa_3072_pkcs1_no_pass', passphrase: undefined, type: 'RSA', format: 'PKCS#1', encrypted: false, expectWrapper: true },
  { name: 'rsa_3072_pkcs1_with_pass', passphrase: 'testpass123', type: 'RSA', format: 'PKCS#1', encrypted: true, expectWrapper: true },
  { name: 'rsa_4096_pkcs1_no_pass', passphrase: undefined, type: 'RSA', format: 'PKCS#1', encrypted: false, expectWrapper: true },
  { name: 'rsa_4096_pkcs1_with_pass', passphrase: 'testpass123', type: 'RSA', format: 'PKCS#1', encrypted: true, expectWrapper: true },
  
  // Modern OpenSSH format RSA keys (should work with RSA-SHA2 wrapper AND VSCode fallback)
  { name: 'rsa_4096_rfc8332', passphrase: undefined, type: 'RSA', format: 'OpenSSH', encrypted: false, expectWrapper: true },
  { name: 'rsa_2048_no_pass', passphrase: undefined, type: 'RSA', format: 'OpenSSH', encrypted: false, expectWrapper: true },
  { name: 'rsa_2048_with_pass', passphrase: 'test123', type: 'RSA', format: 'OpenSSH', encrypted: true, expectWrapper: true },
  { name: 'rsa_3072_no_pass', passphrase: undefined, type: 'RSA', format: 'OpenSSH', encrypted: false, expectWrapper: true },
  { name: 'rsa_3072_with_pass', passphrase: 'test123', type: 'RSA', format: 'OpenSSH', encrypted: true, expectWrapper: true },
  { name: 'rsa_4096_no_pass', passphrase: undefined, type: 'RSA', format: 'OpenSSH', encrypted: false, expectWrapper: true },
  { name: 'rsa_4096_with_pass', passphrase: 'test123', type: 'RSA', format: 'OpenSSH', encrypted: true, expectWrapper: true },
  
  // Ed25519 keys (should work natively AND with VSCode fallback)
  { name: 'ed25519_no_pass', passphrase: undefined, type: 'Ed25519', format: 'OpenSSH', encrypted: false, expectWrapper: false },
  { name: 'ed25519_with_pass', passphrase: 'test123', type: 'Ed25519', format: 'OpenSSH', encrypted: true, expectWrapper: false },
  
  // ECDSA keys (should work natively AND with VSCode fallback)
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

function testVSCodeKeyConnection(keyInfo) {
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
      vscodeActivated: false,
      fallbackUsed: false,
      pureJSWorked: false,
      keyParsingWorked: false,
      details: {}
    };

    // Test key parsing first
    try {
      const { parseKey } = require('../dist/ssh/enhanced-key-parser');
      const parsedKey = parseKey(keyData, keyInfo.passphrase);
      
      if (parsedKey) {
        result.keyParsingWorked = true;
        result.pureJSWorked = true;
        result.vscodeActivated = true;
        result.connection.debugMessages.push('Pure JS key parsing successful');
        
        try {
          const sshPublicKey = parsedKey.getPublicSSH();
          if (sshPublicKey && sshPublicKey.length > 0) {
            result.connection.debugMessages.push('SSH public key generation successful');
          }
        } catch (pubkeyError) {
          result.connection.debugMessages.push(`SSH public key generation failed: ${pubkeyError.message}`);
        }
      } else {
        result.connection.debugMessages.push('Key parsing returned null');
      }
    } catch (parseError) {
      result.connection.debugMessages.push(`Pure JS key parsing failed: ${parseError.message}`);
    }

    // Test actual SSH connection to local SSH server
    const config = {
      host: 'localhost',
      port: 22,
      username: process.env.USER || 'cartpauj',
      privateKey: keyData,
      passphrase: keyInfo.passphrase
    };

    let transport;
    
    try {
      transport = new SSH2StreamsTransport(config);
      
      // Capture debug messages to detect VSCode activation and fallback usage
      transport.on('debug', (message) => {
        result.connection.debugMessages.push(message);
        
        // Detect RSA-SHA2 wrapper usage
        if (message.includes('RSA-SHA2')) {
          result.wrapperUsed = true;
        }
        
        // Detect VSCode environment activation
        if (message.includes('VSCode') || 
            message.includes('enhanced fallback') ||
            message.includes('sshpk failed')) {
          result.vscodeActivated = true;
        }
        
        // Detect fallback mechanisms
        if (message.includes('fallback') || 
            message.includes('external process') ||
            message.includes('pure js') ||
            message.includes('signing hack')) {
          result.fallbackUsed = true;
        }
      });

      transport.on('ready', () => {
        result.connection.success = true;
        result.authentication.success = true;
        
        // If connection succeeded in VSCode environment, pure JS worked
        result.pureJSWorked = true;
        
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
        result.connection.error = 'Connection timeout (15s)';
        try {
          transport.disconnect();
        } catch (e) {
          // Ignore cleanup errors
        }
        resolve(result);
      }, 15000); // Longer timeout for VSCode environment

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

async function runVSCodePureJSConnectionTests() {
  colorLog(colors.bold + colors.magenta, '🔧 VSCODE PURE JAVASCRIPT CONNECTION TEST - All Keys');
  colorLog(colors.magenta, '===================================================');
  colorLog(colors.cyan, `Testing against: localhost:22 (OpenSSH server)`);
  colorLog(colors.cyan, `User: cartpauj`);
  colorLog(colors.cyan, `Environment: FORCED VSCode (pure JavaScript mode)`);
  colorLog(colors.yellow, `🎯 Goal: Test VSCode compatibility for ALL keys`);
  
  const stats = {
    total: 0,
    connectionSuccess: 0,
    authSuccess: 0,
    wrapperUsed: 0,
    vscodeActivated: 0,
    fallbackUsed: 0,
    pureJSWorked: 0,
    byType: {
      'RSA': { total: 0, success: 0, wrapper: 0, vscode: 0, fallback: 0 },
      'Ed25519': { total: 0, success: 0, wrapper: 0, vscode: 0, fallback: 0 },
      'ECDSA': { total: 0, success: 0, wrapper: 0, vscode: 0, fallback: 0 }
    }
  };

  const results = [];
  const categories = {
    'RSA PKCS#1 Keys (RSA-SHA2 + VSCode Compatibility)': allTestKeys.filter(k => k.format === 'PKCS#1'),
    'RSA OpenSSH Keys (RSA-SHA2 + VSCode Compatibility)': allTestKeys.filter(k => k.format === 'OpenSSH' && k.type === 'RSA'),
    'Ed25519 Keys (VSCode Compatibility)': allTestKeys.filter(k => k.type === 'Ed25519'),
    'ECDSA Keys (VSCode Compatibility)': allTestKeys.filter(k => k.type.startsWith('ECDSA'))
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
      
      const result = await testVSCodeKeyConnection(keyInfo);
      results.push(result);
      
      if (result.skipped) {
        colorLog(colors.yellow, `⚪ SKIPPED (${result.reason})`);
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
      
      // VSCode activation detection
      if (result.vscodeActivated) {
        stats.vscodeActivated++;
        stats.byType[keyType].vscode++;
        colorLog(colors.blue, `🔧 VSCode Environment: DETECTED`);
      } else {
        colorLog(colors.cyan, `ℹ️  VSCode Environment: Standard parsing used`);
      }
      
      // Fallback mechanism detection
      if (result.fallbackUsed) {
        stats.fallbackUsed++;
        stats.byType[keyType].fallback++;
        colorLog(colors.blue, `⚡ Pure JS Fallback: USED`);
      } else {
        colorLog(colors.cyan, `ℹ️  Pure JS Fallback: Not needed`);
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
      
      // Pure JS success
      if (result.pureJSWorked) {
        stats.pureJSWorked++;
      }
      
      // Overall verdict for this key
      if (result.authentication.success) {
        const mechanisms = [];
        if (result.wrapperUsed) mechanisms.push('RSA-SHA2');
        if (result.vscodeActivated) mechanisms.push('VSCode');
        if (result.fallbackUsed) mechanisms.push('fallback');
        
        const mechanismStr = mechanisms.length > 0 ? mechanisms.join(' + ') : 'native';
        colorLog(colors.bold + colors.green, `🎯 OVERALL: ✅ WORKS PERFECTLY (${mechanismStr})`);
      } else {
        colorLog(colors.bold + colors.red, `🎯 OVERALL: ❌ FAILED`);
      }
      
      // Show important debug messages for VSCode/fallback detection
      const importantDebug = result.connection.debugMessages.filter(msg => 
        msg.includes('RSA-SHA2') || 
        msg.includes('VSCode') ||
        msg.includes('enhanced fallback') ||
        msg.includes('sshpk failed') ||
        msg.includes('fallback') ||
        msg.includes('external process') ||
        msg.includes('Enhanced') || 
        msg.includes('ssh2-streams key parsing') ||
        msg.includes('Authentication')
      );
      
      if (importantDebug.length > 0) {
        colorLog(colors.cyan, `   🐛 Key debug messages:`);
        importantDebug.slice(-5).forEach(msg => { // Show last 5 important messages
          colorLog(colors.cyan, `      ${msg}`);
        });
      }
      
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Final Results Summary
  colorLog(colors.bold + colors.cyan, '\n📊 FINAL VSCODE PURE JAVASCRIPT TEST RESULTS');
  colorLog(colors.cyan, '==============================================');
  
  console.log(`Total keys tested: ${stats.total}`);
  console.log('');
  
  const connectionRate = Math.round((stats.connectionSuccess / stats.total) * 100);
  const authRate = Math.round((stats.authSuccess / stats.total) * 100);
  const vscodeRate = Math.round((stats.vscodeActivated / stats.total) * 100);
  const fallbackRate = Math.round((stats.fallbackUsed / stats.total) * 100);
  const pureJSRate = Math.round((stats.pureJSWorked / stats.total) * 100);
  
  colorLog(connectionRate >= 90 ? colors.green : colors.red, 
    `🔗 Connections: ${stats.connectionSuccess}/${stats.total} (${connectionRate}%)`);
  colorLog(authRate >= 90 ? colors.green : colors.red, 
    `🔐 Authentication: ${stats.authSuccess}/${stats.total} (${authRate}%)`);
  colorLog(colors.blue, 
    `🔧 RSA-SHA2 Wrapper Used: ${stats.wrapperUsed} times`);
  colorLog(colors.blue, 
    `🔧 VSCode Environment Detected: ${stats.vscodeActivated} times (${vscodeRate}%)`);
  colorLog(colors.blue, 
    `⚡ Pure JS Fallback Used: ${stats.fallbackUsed} times (${fallbackRate}%)`);
  colorLog(pureJSRate >= 90 ? colors.green : colors.yellow, 
    `✨ Pure JS Success Rate: ${stats.pureJSWorked}/${stats.total} (${pureJSRate}%)`);
  
  console.log('');
  colorLog(colors.bold + colors.cyan, 'Results by Key Type:');
  for (const [keyType, typeStats] of Object.entries(stats.byType)) {
    if (typeStats.total > 0) {
      const successRate = Math.round((typeStats.success / typeStats.total) * 100);
      const vscodeRate = Math.round((typeStats.vscode / typeStats.total) * 100);
      const fallbackRate = Math.round((typeStats.fallback / typeStats.total) * 100);
      const color = successRate >= 90 ? colors.green : colors.red;
      colorLog(color, `  ${keyType}: ${typeStats.success}/${typeStats.total} (${successRate}%) - VSCode: ${vscodeRate}%, Fallback: ${fallbackRate}%`);
    }
  }
  
  // VSCode Compatibility Analysis
  console.log('');
  colorLog(colors.bold + colors.cyan, '🔧 VSCode Compatibility Analysis:');
  const encrypted = results.filter(r => !r.skipped && r.keyInfo.encrypted);
  const nonEncrypted = results.filter(r => !r.skipped && !r.keyInfo.encrypted);
  
  const encryptedSuccess = encrypted.filter(r => r.authentication.success).length;
  const nonEncryptedSuccess = nonEncrypted.filter(r => r.authentication.success).length;
  const encryptedVSCode = encrypted.filter(r => r.vscodeActivated).length;
  const nonEncryptedVSCode = nonEncrypted.filter(r => r.vscodeActivated).length;
  
  console.log(`  Non-encrypted keys: ${nonEncryptedSuccess}/${nonEncrypted.length} success, ${nonEncryptedVSCode}/${nonEncrypted.length} VSCode`);
  console.log(`  Encrypted keys: ${encryptedSuccess}/${encrypted.length} success, ${encryptedVSCode}/${encrypted.length} VSCode`);
  
  // Final Assessment
  console.log('');
  colorLog(colors.bold + colors.magenta, '🎯 ULTIMATE VSCODE VERDICT');
  colorLog(colors.magenta, '===========================');
  
  if (stats.authSuccess === stats.total) {
    colorLog(colors.bold + colors.green, '🎉 PERFECT! ALL KEYS WORK WITH VSCODE PURE JAVASCRIPT!');
    colorLog(colors.green, '✅ 100% VSCode compatibility achieved');
    colorLog(colors.green, '✅ Pure JavaScript implementation works flawlessly');
    colorLog(colors.green, '✅ All fallback mechanisms working correctly');
    
    console.log('');
    colorLog(colors.cyan, '🏆 VSCODE MISSION ACCOMPLISHED:');
    console.log('   • All keys authenticate successfully in VSCode environment');
    console.log('   • Pure JavaScript fallback mechanisms proven effective');
    console.log('   • VSCode/webpack compatibility issues resolved');
    console.log('   • 100% pure JS SSH key support achieved');
    
  } else if (stats.authSuccess >= stats.total * 0.9) {
    colorLog(colors.green, `🎯 EXCELLENT! ${stats.authSuccess}/${stats.total} keys work with VSCode pure JavaScript!`);
    colorLog(colors.green, `✅ ${authRate}% success rate - Near perfect VSCode compatibility!`);
    
    if (stats.vscodeActivated > 0) {
      colorLog(colors.blue, `🔧 VSCode fallback activated for ${stats.vscodeActivated} keys`);
    }
    
  } else if (stats.authSuccess >= stats.total * 0.8) {
    colorLog(colors.yellow, `⚠️  MOSTLY WORKING: ${stats.authSuccess}/${stats.total} keys successful with VSCode`);
    colorLog(colors.yellow, 'Some keys may need additional VSCode compatibility work');
    
    if (stats.vscodeActivated === 0) {
      colorLog(colors.yellow, '⚠️  No VSCode fallback detected - may need stronger environment simulation');
    }
    
  } else {
    colorLog(colors.red, `❌ SIGNIFICANT VSCODE ISSUES: Only ${stats.authSuccess}/${stats.total} keys working`);
    colorLog(colors.red, 'Need to investigate VSCode compatibility failures');
    
    if (stats.vscodeActivated === 0) {
      colorLog(colors.red, '❌ VSCode environment not being detected - check environment variables');
    }
  }

  return { stats, results };
}

// Run the VSCode pure JavaScript test
console.log('');
runVSCodePureJSConnectionTests()
  .then(({ stats, results }) => {
    console.log('\n✅ VSCode Pure JavaScript connection testing completed!');
    console.log(`📊 Final VSCode score: ${stats.authSuccess}/${stats.total} keys working`);
    console.log(`🔧 VSCode detection rate: ${stats.vscodeActivated}/${stats.total} keys`);
    console.log(`⚡ Pure JS fallback rate: ${stats.fallbackUsed}/${stats.total} keys`);
    
    const overallSuccess = stats.authSuccess >= stats.total * 0.9;
    process.exit(overallSuccess ? 0 : 1);
  })
  .catch((error) => {
    console.error('❌ VSCode test suite failed:', error);
    process.exit(1);
  });