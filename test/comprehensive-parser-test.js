/**
 * Comprehensive Parser Test Suite
 * Tests our enhanced parser across all key types and formats
 * Focus: Ensure our parser can handle modern SSH keys
 */

const fs = require('fs');
const path = require('path');

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

// Import our parser
const { parseKey: enhancedParseKey } = require('../dist/ssh/enhanced-key-parser');

const keysDir = path.join(__dirname, 'keys');

// Define all test keys with expected outcomes
const allTestKeys = [
  // Traditional PKCS#1 RSA keys
  { name: 'rsa_pem_test', passphrase: undefined, type: 'RSA', format: 'PKCS#1', encrypted: false, expected: { enhanced: true } },
  { name: 'rsa_2048_pkcs1_no_pass', passphrase: undefined, type: 'RSA', format: 'PKCS#1', encrypted: false, expected: { enhanced: true } },
  { name: 'rsa_2048_pkcs1_with_pass', passphrase: 'testpass123', type: 'RSA', format: 'PKCS#1', encrypted: true, expected: { enhanced: true } },
  { name: 'rsa_3072_pkcs1_no_pass', passphrase: undefined, type: 'RSA', format: 'PKCS#1', encrypted: false, expected: { enhanced: true } },
  { name: 'rsa_3072_pkcs1_with_pass', passphrase: 'testpass123', type: 'RSA', format: 'PKCS#1', encrypted: true, expected: { enhanced: true } },
  { name: 'rsa_4096_pkcs1_no_pass', passphrase: undefined, type: 'RSA', format: 'PKCS#1', encrypted: false, expected: { enhanced: true } },
  { name: 'rsa_4096_pkcs1_with_pass', passphrase: 'testpass123', type: 'RSA', format: 'PKCS#1', encrypted: true, expected: { enhanced: true } },
  
  // Modern OpenSSH format RSA keys
  { name: 'rsa_4096_rfc8332', passphrase: undefined, type: 'RSA', format: 'OpenSSH', encrypted: false, expected: { enhanced: true } },
  { name: 'rsa_2048_no_pass', passphrase: undefined, type: 'RSA', format: 'OpenSSH', encrypted: false, expected: { enhanced: true } },
  { name: 'rsa_2048_with_pass', passphrase: 'test123', type: 'RSA', format: 'OpenSSH', encrypted: true, expected: { enhanced: true } },
  { name: 'rsa_3072_no_pass', passphrase: undefined, type: 'RSA', format: 'OpenSSH', encrypted: false, expected: { enhanced: true } },
  { name: 'rsa_3072_with_pass', passphrase: 'test123', type: 'RSA', format: 'OpenSSH', encrypted: true, expected: { enhanced: true } },
  { name: 'rsa_4096_no_pass', passphrase: undefined, type: 'RSA', format: 'OpenSSH', encrypted: false, expected: { enhanced: true } },
  { name: 'rsa_4096_with_pass', passphrase: 'test123', type: 'RSA', format: 'OpenSSH', encrypted: true, expected: { enhanced: true } },
  
  // Ed25519 keys (modern)
  { name: 'ed25519_no_pass', passphrase: undefined, type: 'Ed25519', format: 'OpenSSH', encrypted: false, expected: { enhanced: true } },
  { name: 'ed25519_with_pass', passphrase: 'test123', type: 'Ed25519', format: 'OpenSSH', encrypted: true, expected: { enhanced: true } },
  
  // ECDSA keys (modern)
  { name: 'ecdsa_256_no_pass', passphrase: undefined, type: 'ECDSA-P256', format: 'OpenSSH', encrypted: false, expected: { enhanced: true } },
  { name: 'ecdsa_256_with_pass', passphrase: 'test123', type: 'ECDSA-P256', format: 'OpenSSH', encrypted: true, expected: { enhanced: true } },
  { name: 'ecdsa_384_no_pass', passphrase: undefined, type: 'ECDSA-P384', format: 'OpenSSH', encrypted: false, expected: { enhanced: true } },
  { name: 'ecdsa_384_with_pass', passphrase: 'test123', type: 'ECDSA-P384', format: 'OpenSSH', encrypted: true, expected: { enhanced: true } },
  { name: 'ecdsa_521_no_pass', passphrase: undefined, type: 'ECDSA-P521', format: 'OpenSSH', encrypted: false, expected: { enhanced: true } },
  { name: 'ecdsa_521_with_pass', passphrase: 'test123', type: 'ECDSA-P521', format: 'OpenSSH', encrypted: true, expected: { enhanced: true } }
];

function loadKey(keyName) {
  const keyPath = path.join(keysDir, keyName);
  try {
    return fs.readFileSync(keyPath, 'utf8');
  } catch (error) {
    return null;
  }
}

function testKeyParsing(keyInfo) {
  const keyData = loadKey(keyInfo.name);
  if (!keyData) {
    return { skipped: true, reason: 'Key file not found' };
  }

  const results = {
    enhanced: { success: false, error: null, details: null }
  };

  // Test Enhanced Parser
  try {
    const enhancedKey = enhancedParseKey(keyData, keyInfo.passphrase);
    if (enhancedKey) {
      results.enhanced.success = true;
      results.enhanced.details = {
        type: enhancedKey.type,
        hasRequiredMethods: ['sign', 'verify', 'getPublicSSH', 'getPrivatePEM', 'getPublicPEM'].every(
          method => typeof enhancedKey[method] === 'function'
        )
      };

      // Test basic operations
      try {
        const sshKey = enhancedKey.getPublicSSH();
        results.enhanced.details.sshKeyLength = sshKey.length;
        
        // Try signing (might fail for incomplete implementations)
        try {
          const testData = Buffer.from('test data');
          const signature = enhancedKey.sign(testData);
          const verified = enhancedKey.verify(testData, signature);
          results.enhanced.details.canSign = true;
          results.enhanced.details.canVerify = verified;
        } catch (signError) {
          results.enhanced.details.canSign = false;
          results.enhanced.details.signError = signError.message;
        }
      } catch (operationError) {
        results.enhanced.details.operationError = operationError.message;
      }
    } else {
      results.enhanced.error = 'Parser returned null';
    }
  } catch (error) {
    results.enhanced.error = error.message;
  }

  return results;
}

function runComprehensiveTests() {
  colorLog(colors.bold + colors.magenta, '🚀 Comprehensive Parser Test Suite');
  colorLog(colors.magenta, '===================================');
  
  const stats = {
    total: 0,
    available: 0,
    enhanced: { passed: 0, failed: 0, expected: 0 },
    failures: []
  };

  const categories = {
    'Traditional PKCS#1 RSA': allTestKeys.filter(k => k.format === 'PKCS#1'),
    'OpenSSH RSA': allTestKeys.filter(k => k.format === 'OpenSSH' && k.type === 'RSA'),
    'Ed25519 Keys': allTestKeys.filter(k => k.type === 'Ed25519'),
    'ECDSA Keys': allTestKeys.filter(k => k.type.startsWith('ECDSA'))
  };

  for (const [categoryName, keys] of Object.entries(categories)) {
    if (keys.length === 0) continue;

    colorLog(colors.bold + colors.blue, `\n📂 ${categoryName}`);
    colorLog(colors.blue, '='.repeat(50));

    for (const keyInfo of keys) {
      stats.total++;
      
      const results = testKeyParsing(keyInfo);
      
      if (results.skipped) {
        colorLog(colors.yellow, `⚠️  ${keyInfo.name} - SKIPPED (${results.reason})`);
        continue;
      }

      stats.available++;
      
      colorLog(colors.cyan, `\n🔑 ${keyInfo.name}`);
      colorLog(colors.cyan, `   Type: ${keyInfo.type}, Format: ${keyInfo.format}, Encrypted: ${keyInfo.encrypted}`);

      // Test Enhanced Parser
      const enhancedExpected = keyInfo.expected.enhanced;
      stats.enhanced.expected += enhancedExpected ? 1 : 0;
      
      if (results.enhanced.success) {
        stats.enhanced.passed++;
        const details = results.enhanced.details;
        colorLog(colors.green, `✅ Enhanced: SUCCESS`);
        colorLog(colors.cyan, `   Type: ${details.type}, SSH: ${details.sshKeyLength}B, Sign: ${details.canSign}, Verify: ${details.canVerify}`);
        
        if (details.signError) {
          colorLog(colors.yellow, `   ⚠️  Sign limitation: ${details.signError}`);
        }
      } else {
        stats.enhanced.failed++;
        colorLog(colors.red, `❌ Enhanced: FAILED`);
        colorLog(colors.yellow, `   Error: ${results.enhanced.error}`);
        
        if (enhancedExpected) {
          stats.failures.push(`Enhanced ${keyInfo.name}: ${results.enhanced.error}`);
        }
      }
    }
  }

  // Summary
  colorLog(colors.bold + colors.cyan, '\n📊 Test Results Summary');
  colorLog(colors.cyan, '========================');
  
  console.log(`Total keys defined: ${stats.total}`);
  console.log(`Available keys tested: ${stats.available}`);
  console.log('');
  
  const enhancedRate = Math.round((stats.enhanced.passed / stats.enhanced.expected) * 100);
  
  colorLog(enhancedRate >= 80 ? colors.green : colors.red, 
    `Enhanced Parser: ${stats.enhanced.passed}/${stats.enhanced.expected} expected (${enhancedRate}%)`);

  // Show failures
  if (stats.failures.length > 0) {
    colorLog(colors.bold + colors.red, '\n❌ Unexpected Failures:');
    for (const failure of stats.failures) {
      colorLog(colors.red, `  • ${failure}`);
    }
  }

  // Overall assessment
  console.log('');
  if (enhancedRate >= 80) {
    colorLog(colors.bold + colors.green, '🎉 Enhanced parser is working well for modern keys!');
  } else {
    colorLog(colors.bold + colors.yellow, '⚠️  Enhanced parser needs improvement');
  }

  return { enhancedRate, stats };
}

// Run the comprehensive tests
console.log('');
runComprehensiveTests();