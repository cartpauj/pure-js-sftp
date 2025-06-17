import { SftpClient } from '../src/index';

describe('SftpClient', () => {
  test('should create an instance', () => {
    const client = new SftpClient();
    expect(client).toBeInstanceOf(SftpClient);
  });
});