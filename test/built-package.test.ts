/**
 * Built Package Tests
 * Tests the compiled JavaScript output to ensure exports work correctly
 */

describe('Built Package Tests', () => {
  // These tests use require() to test the actual built package
  
  test('should export SftpClient as default from built package', () => {
    const builtModule = require('../dist/index.js');
    
    expect(builtModule.default).toBeDefined();
    expect(typeof builtModule.default).toBe('function');
    expect(builtModule.default.name).toBe('SftpClient');
  });

  test('should export SftpClient as named export from built package', () => {
    const builtModule = require('../dist/index.js');
    
    expect(builtModule.SftpClient).toBeDefined();
    expect(builtModule.SftpClient).toBe(builtModule.default);
  });

  test('should create working instance from built package', () => {
    const builtModule = require('../dist/index.js');
    const Client = builtModule.default;
    
    const instance = new Client();
    expect(instance).toBeDefined();
    expect(instance.constructor.name).toBe('SftpClient');
  });

  test('should have all methods available from built package', () => {
    const builtModule = require('../dist/index.js');
    const Client = builtModule.default;
    const instance = new Client();
    
    const requiredMethods = [
      'connect', 'end', 'list', 'get', 'put', 'delete', 'rename',
      'stat', 'exists', 'mkdir', 'rmdir', 'fastGet', 'fastPut',
      'uploadDir', 'downloadDir', 'createReadStream', 'createWriteStream'
    ];

    requiredMethods.forEach(method => {
      expect(typeof instance[method]).toBe('function');
    });
  });

  test('should support ssh2-sftp-client replacement pattern', () => {
    // Test the exact CommonJS require pattern users would use
    const { default: Client } = require('../dist/index.js');
    
    const sftp = new Client();
    expect(sftp).toBeDefined();
    expect(typeof sftp.connect).toBe('function');
    expect(typeof sftp.list).toBe('function');
    expect(typeof sftp.get).toBe('function');
    expect(typeof sftp.put).toBe('function');
    expect(typeof sftp.end).toBe('function');
  });

  test('should have correct module structure', () => {
    const builtModule = require('../dist/index.js');
    
    // Should have key exports
    expect(builtModule.default).toBeDefined();
    expect(builtModule.SftpClient).toBeDefined();
    expect(builtModule.SSHClient).toBeDefined();
    expect(builtModule.SFTPClient).toBeDefined();
    
    // Should have type exports
    expect(builtModule.ConnectionState).toBeDefined();
    expect(builtModule.ChannelState).toBeDefined();
    expect(builtModule.SSHError).toBeDefined();
    expect(builtModule.SFTPError).toBeDefined();
  });

  test('should not have undefined or null exports', () => {
    const builtModule = require('../dist/index.js');
    
    // Critical test: default export should never be undefined/null
    expect(builtModule.default).not.toBeUndefined();
    expect(builtModule.default).not.toBeNull();
    
    // Instance creation should work
    const instance = new builtModule.default();
    expect(instance).not.toBeUndefined();
    expect(instance).not.toBeNull();
  });
});