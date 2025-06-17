import SftpClient from '../src/index';

describe('SFTP Integration Tests', () => {
  let client: SftpClient;

  beforeEach(() => {
    client = new SftpClient();
  });

  afterEach(async () => {
    if (client) {
      await client.end();
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

  // TODO: Add actual connection tests when we have a test server
});