import SftpClient, { SftpClient as NamedSftpClient } from '../src/index';

describe('SftpClient Export Tests', () => {
  test('should export SftpClient as default', () => {
    expect(SftpClient).toBeDefined();
    expect(typeof SftpClient).toBe('function');
    expect(SftpClient.name).toBe('SftpClient');
  });

  test('should export SftpClient as named export', () => {
    expect(NamedSftpClient).toBeDefined();
    expect(NamedSftpClient).toBe(SftpClient);
  });

  test('should create an instance', () => {
    const client = new SftpClient();
    expect(client).toBeInstanceOf(SftpClient);
  });

  test('should have key methods available', () => {
    const client = new SftpClient();
    const requiredMethods = ['connect', 'list', 'get', 'put', 'delete', 'end'];
    
    requiredMethods.forEach(method => {
      expect(typeof client[method as keyof SftpClient]).toBe('function');
    });
  });

  test('should work with ssh2-sftp-client import pattern', () => {
    // Test the exact pattern users would use to replace ssh2-sftp-client
    const Client = SftpClient;
    const sftp = new Client();
    
    expect(sftp).toBeInstanceOf(SftpClient);
    expect(typeof sftp.connect).toBe('function');
    expect(typeof sftp.list).toBe('function');
  });
});