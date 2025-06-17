/**
 * Basic usage example for pure-js-sftp
 */

const SftpClient = require('../dist/index').default;

async function example() {
  const sftp = new SftpClient();
  
  try {
    // Connect to SFTP server
    await sftp.connect({
      host: 'example.com',
      port: 22,
      username: 'user',
      password: 'password'
    });
    
    console.log('Connected to SFTP server');
    
    // List directory contents
    const files = await sftp.list('/home/user');
    console.log('Files:', files);
    
    // Upload a file
    await sftp.put('./local-file.txt', '/remote/path/file.txt');
    console.log('File uploaded');
    
    // Download a file
    await sftp.get('/remote/path/file.txt', './downloaded-file.txt');
    console.log('File downloaded');
    
    // Create directory
    await sftp.mkdir('/remote/new-directory');
    console.log('Directory created');
    
    // Delete file
    await sftp.delete('/remote/path/file.txt');
    console.log('File deleted');
    
  } catch (error) {
    console.error('SFTP Error:', error);
  } finally {
    // Always close the connection
    await sftp.end();
    console.log('Connection closed');
  }
}

// Run example
if (require.main === module) {
  example().catch(console.error);
}

module.exports = example;