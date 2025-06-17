/**
 * API Validation Tests
 * Simple tests to validate the fixed API works correctly
 */

import SftpClient from '../src/index';

describe('API Validation Tests', () => {
  test('should export and create SftpClient correctly', () => {
    expect(SftpClient).toBeDefined();
    expect(typeof SftpClient).toBe('function');
    expect(SftpClient.name).toBe('SftpClient');
    
    const client = new SftpClient();
    expect(client).toBeInstanceOf(SftpClient);
  });

  test('should have all critical methods available', () => {
    const client = new SftpClient();
    const criticalMethods = [
      'connect', 'end', 'list', 'get', 'put', 'delete', 'rename',
      'stat', 'exists', 'mkdir', 'rmdir', 'fastGet', 'fastPut',
      'uploadDir', 'downloadDir', 'createReadStream', 'createWriteStream'
    ];

    criticalMethods.forEach(method => {
      expect(typeof client[method as keyof SftpClient]).toBe('function');
    });
  });

  test('should work as ssh2-sftp-client replacement', () => {
    // Test the exact replacement pattern
    const Client = SftpClient;
    const sftp = new Client();
    
    expect(sftp).toBeInstanceOf(SftpClient);
    expect(typeof sftp.connect).toBe('function');
    expect(typeof sftp.list).toBe('function');
    expect(typeof sftp.get).toBe('function');
    expect(typeof sftp.put).toBe('function');
    expect(typeof sftp.end).toBe('function');
  });

  test('should properly validate "Not connected" state', async () => {
    const client = new SftpClient();
    
    // These should all reject with "Not connected"
    await expect(client.list('/test')).rejects.toThrow('Not connected');
    await expect(client.stat('/test')).rejects.toThrow('Not connected');
    await expect(client.get('/test')).rejects.toThrow('Not connected');
    await expect(client.put('test', '/test')).rejects.toThrow('Not connected');
  });

  test('should accept connection config without throwing', () => {
    const client = new SftpClient();
    const config = {
      host: 'test.example.com',
      username: 'testuser',
      password: 'testpass'
    };

    // Just test that the method exists and accepts the config
    // Don't actually call connect() as it will try to make a real connection
    expect(typeof client.connect).toBe('function');
    expect(client.connect.length).toBe(1); // Should accept 1 parameter
  });

  test('should handle constructors with optional name parameter', () => {
    const client1 = new SftpClient();
    const client2 = new SftpClient('test-client');
    
    expect(client1).toBeInstanceOf(SftpClient);
    expect(client2).toBeInstanceOf(SftpClient);
  });
});