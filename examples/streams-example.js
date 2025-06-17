/**
 * Streaming operations example
 */

const SftpClient = require('../dist/index').default;
const fs = require('fs');

async function streamExample() {
  const sftp = new SftpClient();
  
  try {
    await sftp.connect({
      host: 'example.com',
      username: 'user', 
      password: 'password'
    });

    console.log('=== Streaming Download Example ===');
    
    // Create a read stream for a large remote file
    const readStream = sftp.createReadStream('/remote/large-file.zip', {
      chunkSize: 64 * 1024 // 64KB chunks
    });
    
    const writeStream = fs.createWriteStream('./downloaded-large-file.zip');
    
    // Pipe remote file to local file
    readStream.pipe(writeStream);
    
    // Track progress
    let downloaded = 0;
    readStream.on('data', (chunk) => {
      downloaded += chunk.length;
      console.log(`Downloaded: ${(downloaded / 1024 / 1024).toFixed(2)} MB`);
    });
    
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      readStream.on('error', reject);
    });

    console.log('Download completed!');

    console.log('\n=== Streaming Upload Example ===');
    
    // Create a write stream for uploading
    const uploadStream = sftp.createWriteStream('/remote/uploaded-file.zip', {
      mode: 0o644
    });
    
    const localReadStream = fs.createReadStream('./local-large-file.zip');
    
    // Pipe local file to remote file
    localReadStream.pipe(uploadStream);
    
    // Track upload progress
    let uploaded = 0;
    localReadStream.on('data', (chunk) => {
      uploaded += chunk.length;
      console.log(`Uploaded: ${(uploaded / 1024 / 1024).toFixed(2)} MB`);
    });
    
    await new Promise((resolve, reject) => {
      uploadStream.on('finish', resolve);
      uploadStream.on('error', reject);
      localReadStream.on('error', reject);
    });

    console.log('Upload completed!');

  } catch (error) {
    console.error('Streaming Error:', error);
  } finally {
    await sftp.end();
  }
}

if (require.main === module) {
  streamExample().catch(console.error);
}

module.exports = streamExample;