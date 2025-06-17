/**
 * Bulk operations example (uploadDir, downloadDir)
 */

const SftpClient = require('../dist/index').default;

async function bulkExample() {
  const sftp = new SftpClient();
  
  try {
    await sftp.connect({
      host: 'example.com',
      username: 'user',
      password: 'password'
    });

    console.log('=== Upload Directory Example ===');
    
    // Upload entire directory recursively
    await sftp.uploadDir('./local-project', '/remote/backup/project', {
      // Filter function to exclude certain files
      filter: (path) => {
        return !path.includes('node_modules') && 
               !path.includes('.git') &&
               !path.endsWith('.log');
      },
      
      // Progress callback
      progress: (transferred, total) => {
        const percent = ((transferred / total) * 100).toFixed(1);
        console.log(`Upload Progress: ${transferred}/${total} files (${percent}%)`);
      }
    });

    console.log('Directory upload completed!');

    console.log('\n=== Download Directory Example ===');
    
    // Download entire directory recursively  
    await sftp.downloadDir('/remote/backup/project', './downloaded-project', {
      // Only download .js and .ts files
      filter: (path) => {
        return path.endsWith('.js') || path.endsWith('.ts') || path.endsWith('.json');
      },
      
      // Progress tracking
      progress: (transferred, total) => {
        const percent = ((transferred / total) * 100).toFixed(1);
        console.log(`Download Progress: ${transferred}/${total} files (${percent}%)`);
      }
    });

    console.log('Directory download completed!');

    console.log('\n=== Recursive Directory Creation ===');
    
    // Create nested directory structure
    await sftp.mkdir('/remote/deep/nested/directory/structure', true);
    console.log('Nested directories created!');

    // Upload files to the new structure
    await sftp.put('./package.json', '/remote/deep/nested/directory/structure/package.json');
    console.log('File uploaded to nested directory!');

    console.log('\n=== Recursive Directory Cleanup ===');
    
    // Remove entire directory tree
    await sftp.rmdir('/remote/deep', true);
    console.log('Directory tree removed!');

  } catch (error) {
    console.error('Bulk Operations Error:', error);
  } finally {
    await sftp.end();
  }
}

if (require.main === module) {
  bulkExample().catch(console.error);
}

module.exports = bulkExample;