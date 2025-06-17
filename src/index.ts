/**
 * Pure JS SFTP Client
 * A pure JavaScript SFTP client with no native dependencies
 */

import { HighLevelAPI } from './api/high-level-api';

export class SftpClient extends HighLevelAPI {
  constructor(_name?: string) {
    super();
    // name parameter for ssh2-sftp-client compatibility
  }

}

export default SftpClient;

// Export types for TypeScript users
export * from './ssh/types';
export { SSHClient } from './client/ssh-client';
export { SFTPClient } from './sftp/sftp-client';