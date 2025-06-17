import SftpClient from '../src/index';

describe('SFTP Integration Tests', () => {
  let client: SftpClient;

  beforeEach(() => {
    client = new SftpClient();
  });

  afterEach(async () => {
    if (client) {
      try {
        await client.end();
      } catch (error) {
        // Ignore cleanup errors - this is expected when not connected
      }
    }
  });

  test('should create client instance', () => {
    expect(client).toBeInstanceOf(SftpClient);
  });

  test('should have required methods', () => {
    expect(typeof client.connect).toBe('function');
    expect(typeof client.list).toBe('function');
    expect(typeof client.get).toBe('function');
    expect(typeof client.put).toBe('function');
    expect(typeof client.delete).toBe('function');
    expect(typeof client.mkdir).toBe('function');
    expect(typeof client.rmdir).toBe('function');
    expect(typeof client.end).toBe('function');
  });

  test('should have all ssh2-sftp-client compatible methods', () => {
    const allRequiredMethods = [
      'connect', 'end', 'list', 'get', 'put', 'delete', 'rename',
      'stat', 'exists', 'mkdir', 'rmdir', 'fastGet', 'fastPut',
      'uploadDir', 'downloadDir', 'createReadStream', 'createWriteStream',
      'append', 'chmod', 'posixRename', 'realPath', 'cwd', 'rcopy'
    ];

    allRequiredMethods.forEach(method => {
      expect(typeof client[method as keyof SftpClient]).toBe('function');
    });
  });

  test('should throw "Not connected" for operations without connection', async () => {
    // Test that methods properly validate connection state
    await expect(client.list('/test')).rejects.toThrow('Not connected');
    await expect(client.stat('/test')).rejects.toThrow('Not connected');
    await expect(client.get('/test')).rejects.toThrow('Not connected');
    await expect(client.put('test', '/test')).rejects.toThrow('Not connected');
  });

  test('should handle connection config validation', () => {
    const validConfig = {
      host: 'test.example.com',
      username: 'testuser',
      password: 'testpass'
    };

    // Should accept valid config without throwing
    expect(() => client.connect(validConfig)).not.toThrow();
  });

  test('should support ssh2-sftp-client constructor patterns', () => {
    // Test various constructor patterns
    const client1 = new SftpClient();
    const client2 = new SftpClient('named-client');
    
    expect(client1).toBeInstanceOf(SftpClient);
    expect(client2).toBeInstanceOf(SftpClient);
  });

  // TODO: Add actual connection tests when we have a test server
});