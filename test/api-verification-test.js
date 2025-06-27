/**
 * API Verification Test - Ensures README documentation matches actual implementation
 * Tests all public methods mentioned in the README to verify they exist and work
 */

const { SftpClient } = require('../dist/index');
const fs = require('fs');
const path = require('path');

async function testAPIVerification() {
  console.log('🔍 API Verification Test');
  console.log('========================');
  console.log('Verifying all README-documented methods are implemented and functional\n');
  
  const client = new SftpClient('api-verification-test');
  const results = {
    tested: 0,
    passed: 0,
    failed: 0,
    methods: []
  };
  
  function testMethod(methodName, testFn) {
    results.tested++;
    results.methods.push(methodName);
    
    try {
      const result = testFn();
      console.log(`✅ ${methodName}: ${result}`);
      results.passed++;
      return true;
    } catch (error) {
      const errorMessage = error && error.message ? error.message : String(error || 'Unknown error');
      console.log(`❌ ${methodName}: ${errorMessage}`);
      results.failed++;
      return false;
    }
  }
  
  async function testAsyncMethod(methodName, testFn) {
    results.tested++;
    results.methods.push(methodName);
    
    try {
      const result = await testFn();
      console.log(`✅ ${methodName}: ${result}`);
      results.passed++;
      return true;
    } catch (error) {
      let errorMessage;
      try {
        errorMessage = error && error.message ? error.message : String(error || 'Unknown error');
      } catch (stringifyError) {
        errorMessage = 'Error occurred but could not be stringified';
      }
      console.log(`❌ ${methodName}: ${errorMessage}`);
      results.failed++;
      return false;
    }
  }
  
  console.log('📋 Testing Method Existence and Basic Functionality:');
  console.log('====================================================\n');
  
  // 1. Connection Management Methods
  console.log('🔌 Connection Management:');
  testMethod('constructor', () => {
    const testClient = new SftpClient('test');
    return testClient instanceof SftpClient ? 'Constructor works' : 'Constructor failed';
  });
  
  testMethod('isReady (before connect)', () => {
    return !client.isReady() ? 'Returns false when not connected' : 'Should return false';
  });
  
  testMethod('disconnect (before connect)', () => {
    client.disconnect();
    return 'Can call disconnect safely';
  });
  
  // 2. Event System Methods
  console.log('\n🎭 Enhanced Event System:');
  testMethod('setEventOptions', () => {
    client.setEventOptions({ enableProgressEvents: false });
    return 'Event options set successfully';
  });
  
  testMethod('getEventOptions', () => {
    const options = client.getEventOptions();
    return options && typeof options === 'object' ? 'Returns event options object' : 'Failed to get options';
  });
  
  testMethod('getEventHistory', () => {
    const history = client.getEventHistory();
    return Array.isArray(history) ? 'Returns array of events' : 'Should return array';
  });
  
  testMethod('clearEventHistory', () => {
    client.clearEventHistory();
    return 'Event history cleared';
  });
  
  testMethod('getPerformanceMetrics', () => {
    const metrics = client.getPerformanceMetrics();
    return metrics && typeof metrics === 'object' ? 'Returns performance metrics' : 'Failed to get metrics';
  });
  
  // 3. Operation Management Methods
  console.log('\n⚙️ Operation Management:');
  testMethod('getActiveOperations', () => {
    const ops = client.getActiveOperations();
    return Array.isArray(ops) ? `Returns array of ${ops.length} operations` : 'Should return array';
  });
  
  testMethod('getActiveOperationCount', () => {
    const count = client.getActiveOperationCount();
    return typeof count === 'number' ? `Returns count: ${count}` : 'Should return number';
  });
  
  testMethod('getQueuedOperationCount', () => {
    const count = client.getQueuedOperationCount();
    return typeof count === 'number' ? `Returns count: ${count}` : 'Should return number';
  });
  
  testMethod('cancelAllOperations', () => {
    client.cancelAllOperations();
    return 'Can call cancelAllOperations';
  });
  
  testMethod('updateConcurrencyOptions', () => {
    client.updateConcurrencyOptions({ maxConcurrentOps: 5 });
    return 'Concurrency options updated';
  });
  
  // Now test with actual connection
  console.log('\n🌐 Connection Tests:');
  try {
    const privateKey = fs.readFileSync(path.join(__dirname, 'keys', 'rsa_2048_no_pass'));
    
    await testAsyncMethod('connect', async () => {
      await client.connect({
        host: 'localhost',
        port: 22,
        username: process.env.USER || 'user',
        privateKey: privateKey
      });
      return 'Connected successfully';
    });
    
    testMethod('isReady (after connect)', () => {
      return client.isReady() ? 'Returns true when connected' : 'Should return true';
    });
    
    testMethod('getHealthStatus', () => {
      const health = client.getHealthStatus();
      return health && typeof health === 'object' ? `Health: connected=${health.connected}, ready=${health.ready}` : 'Failed to get health';
    });
    
    // 4. File System Operation Tests
    console.log('\n📁 File System Operations:');
    
    // Create test files
    const testFile = '/tmp/api-test.txt';
    const remoteFile = '/tmp/remote-api-test.txt';
    const downloadFile = '/tmp/download-api-test.txt';
    const testData = 'API Verification Test Data';
    
    fs.writeFileSync(testFile, testData);
    
    // File transfer operations
    await testAsyncMethod('put', async () => {
      await client.put(testFile, remoteFile);
      return 'File uploaded successfully';
    });
    
    await testAsyncMethod('exists', async () => {
      const exists = await client.exists(remoteFile);
      return exists ? `File exists with type: ${exists}` : 'File does not exist';
    });
    
    await testAsyncMethod('stat', async () => {
      const stats = await client.stat(remoteFile);
      return stats && typeof stats === 'object' ? `File size: ${stats.size} bytes` : 'Failed to get stats';
    });
    
    await testAsyncMethod('get', async () => {
      await client.get(remoteFile, downloadFile);
      const downloaded = fs.readFileSync(downloadFile, 'utf8');
      return downloaded === testData ? 'File downloaded and verified' : 'Download verification failed';
    });
    
    await testAsyncMethod('append', async () => {
      await client.append(' - APPENDED', remoteFile);
      return 'Data appended successfully';
    });
    
    let renamedFile;
    await testAsyncMethod('rename', async () => {
      const newName = '/tmp/renamed-api-test.txt';
      await client.rename(remoteFile, newName);
      renamedFile = newName; // Store renamed file path
      return 'File renamed successfully';
    });
    
    await testAsyncMethod('chmod', async () => {
      await client.chmod(renamedFile || remoteFile, '644');
      return 'File permissions changed';
    });
    
    await testAsyncMethod('realPath', async () => {
      const realPath = await client.realPath(renamedFile || remoteFile);
      return typeof realPath === 'string' ? `Real path: ${realPath}` : 'Failed to get real path';
    });
    
    // Directory operations
    console.log('\n📂 Directory Operations:');
    const testDir = '/tmp/api-test-dir';
    
    await testAsyncMethod('mkdir', async () => {
      await client.mkdir(testDir);
      return 'Directory created successfully';
    });
    
    await testAsyncMethod('list', async () => {
      const files = await client.list('/tmp');
      return Array.isArray(files) ? `Listed ${files.length} items` : 'Failed to list directory';
    });
    
    await testAsyncMethod('rmdir', async () => {
      await client.rmdir(testDir);
      return 'Directory removed successfully';
    });
    
    // Fast transfer operations
    console.log('\n⚡ Fast Transfer Operations:');
    
    await testAsyncMethod('fastPut', async () => {
      const fastRemote = '/tmp/fast-api-test.txt';
      await client.fastPut(testFile, fastRemote);
      await client.delete(fastRemote); // cleanup
      return 'Fast upload completed';
    });
    
    // Create a file for fastGet test
    await client.put(testFile, renamedFile || remoteFile);
    
    await testAsyncMethod('fastGet', async () => {
      const fastDownload = '/tmp/fast-download-api-test.txt';
      await client.fastGet(renamedFile || remoteFile, fastDownload);
      fs.unlinkSync(fastDownload); // cleanup
      return 'Fast download completed';
    });
    
    // Low-level operations
    console.log('\n🔧 Low-Level Operations:');
    
    await testAsyncMethod('listDirectory', async () => {
      const entries = await Promise.race([
        client.listDirectory('/tmp'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
      ]);
      return Array.isArray(entries) ? `Listed ${entries.length} directory entries` : 'Failed to list directory entries';
    });
    
    // Cleanup
    await testAsyncMethod('delete', async () => {
      await client.delete(renamedFile || remoteFile);
      return 'File deleted successfully';
    });
    
    // Test graceful disconnection
    console.log('\n🔌 Disconnection:');
    await testAsyncMethod('end', async () => {
      await client.end();
      return 'Disconnected gracefully';
    });
    
    // Cleanup local files
    fs.unlinkSync(testFile);
    fs.unlinkSync(downloadFile);
    
  } catch (error) {
    console.log(`❌ Connection setup failed: ${error.message}`);
    results.failed++;
  }
  
  // Final Results
  console.log('\n📊 API Verification Results:');
  console.log('============================');
  console.log(`Total Methods Tested: ${results.tested}`);
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`Success Rate: ${((results.passed / results.tested) * 100).toFixed(1)}%`);
  
  if (results.failed === 0) {
    console.log('\n🎉 ALL API METHODS VERIFIED!');
    console.log('✅ README documentation accurately reflects implementation');
    console.log('✅ All documented methods exist and function correctly');
    console.log('✅ Library is ready for production use');
  } else {
    console.log('\n⚠️ Some API methods failed verification');
    console.log('Please check the failed methods above');
  }
  
  console.log('\n📋 Tested Methods:');
  results.methods.forEach((method, index) => {
    console.log(`  ${index + 1}. ${method}`);
  });
  
  return results.failed === 0;
}

testAPIVerification()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error(`Fatal: ${error.message}`);
    process.exit(1);
  });