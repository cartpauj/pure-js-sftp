/**
 * TypeScript usage example for pure-js-sftp
 */

import SftpClient, { SSHConfig, FileInfo } from '../src/index';

async function typescriptExample(): Promise<void> {
  const sftp = new SftpClient('my-sftp-client');
  
  const config: SSHConfig = {
    host: 'example.com',
    port: 22,
    username: 'user',
    password: 'password',
    timeout: 30000,
    debug: true
  };
  
  try {
    // Connect with type safety
    await sftp.connect(config);
    console.log('Connected to SFTP server');
    
    // List with type safety
    const files: FileInfo[] = await sftp.list('/home/user');
    files.forEach(file => {
      console.log(`${file.type} ${file.name} (${file.size} bytes)`);
      console.log(`  Modified: ${file.modifyTime}`);
      console.log(`  Permissions: ${file.rights.user}${file.rights.group}${file.rights.other}`);
    });
    
    // File operations with proper typing
    const exists = await sftp.exists('/some/file.txt');
    if (exists) {
      const stats = await sftp.stat('/some/file.txt');
      console.log(`File size: ${stats.size} bytes`);
      console.log(`Is directory: ${stats.isDirectory()}`);
    }
    
    // Fast transfers
    await sftp.fastPut('./large-file.zip', '/remote/large-file.zip');
    await sftp.fastGet('/remote/large-file.zip', './downloaded-large-file.zip');
    
    // Recursive directory operations
    await sftp.mkdir('/remote/nested/directory/structure', true);
    await sftp.rmdir('/remote/nested', true);
    
  } catch (error) {
    console.error('SFTP Error:', error);
  } finally {
    await sftp.end();
  }
}

export default typescriptExample;