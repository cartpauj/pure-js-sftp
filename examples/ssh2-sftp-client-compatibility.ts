/**
 * SSH2-SFTP-Client API Compatibility Examples (TypeScript)
 * 
 * This file demonstrates TypeScript compatibility with ssh2-sftp-client API,
 * including proper type checking for passphrase handling.
 */

import SftpClient, { SSHConfig } from '../src/index';
import * as fs from 'fs';

// Example 1: Basic TypeScript connection with proper typing
async function example1_basicTypescriptConnection(): Promise<void> {
  console.log('Example 1: Basic TypeScript connection');
  
  const sftp = new SftpClient();
  
  const config: SSHConfig = {
    host: 'example.com',
    username: 'user',
    privateKey: fs.readFileSync('/path/to/private/key')
  };
  
  try {
    await sftp.connect(config);
    console.log('Connected successfully');
    await sftp.end();
  } catch (error) {
    console.error('Connection failed:', error);
  }
}

// Example 2: TypeScript with passphrase (fully typed)
async function example2_typescriptWithPassphrase(): Promise<void> {
  console.log('Example 2: TypeScript with passphrase');
  
  const sftp = new SftpClient();
  
  // Full type checking ensures API compatibility
  const config: SSHConfig = {
    host: 'example.com',
    username: 'your_username',
    privateKey: fs.readFileSync('/path/to/encrypted/key'),
    passphrase: 'a pass phrase' // Type-checked optional parameter
  };
  
  try {
    await sftp.connect(config);
    console.log('Connected with encrypted key');
    await sftp.end();
  } catch (error) {
    console.error('Connection failed:', error);
  }
}

// Example 3: Comprehensive TypeScript configuration
async function example3_comprehensiveTypescriptConfig(): Promise<void> {
  console.log('Example 3: Comprehensive TypeScript configuration');
  
  const sftp = new SftpClient();
  
  // All configuration options with proper TypeScript types
  const config: SSHConfig = {
    host: 'example.com',
    port: 2222,
    username: 'user',
    privateKey: fs.readFileSync('/path/to/key'),
    passphrase: 'optional-passphrase',
    timeout: 30000,
    keepaliveInterval: 5000,
    algorithms: {
      kex: ['diffie-hellman-group14-sha256'],
      hostKey: ['ssh-rsa', 'ecdsa-sha2-nistp256'],
      cipher: ['aes128-ctr', 'aes256-ctr'],
      mac: ['hmac-sha2-256'],
      compress: ['none']
    },
    debug: false
  };
  
  try {
    await sftp.connect(config);
    console.log('Connected with full TypeScript configuration');
    await sftp.end();
  } catch (error) {
    console.error('Connection failed:', error);
  }
}

// Example 4: Type safety for different key formats
async function example4_typeSafeKeyFormats(): Promise<void> {
  console.log('Example 4: Type-safe key formats');
  
  const sftp = new SftpClient();
  
  // String key format
  const keyString: string = fs.readFileSync('/path/to/key', 'utf8');
  const configString: SSHConfig = {
    host: 'example.com',
    username: 'user',
    privateKey: keyString // TypeScript validates string is acceptable
  };
  
  // Buffer key format  
  const keyBuffer: Buffer = fs.readFileSync('/path/to/key');
  const configBuffer: SSHConfig = {
    host: 'example.com',
    username: 'user',
    privateKey: keyBuffer // TypeScript validates Buffer is acceptable
  };
  
  // Both configurations are type-safe
  console.log('String config valid:', typeof configString.privateKey);
  console.log('Buffer config valid:', configBuffer.privateKey instanceof Buffer);
}

// Example 5: Optional parameter type checking
async function example5_optionalParameterTypes(): Promise<void> {
  console.log('Example 5: Optional parameter type checking');
  
  const sftp = new SftpClient();
  
  // Configuration without passphrase (TypeScript allows this)
  const configWithoutPassphrase: SSHConfig = {
    host: 'example.com',
    username: 'user',
    privateKey: 'unencrypted-key-content'
    // passphrase is optional in TypeScript
  };
  
  // Configuration with passphrase (TypeScript validates string type)
  const configWithPassphrase: SSHConfig = {
    host: 'example.com',
    username: 'user',
    privateKey: 'encrypted-key-content',
    passphrase: 'my-secret-passphrase' // Must be string if provided
  };
  
  // TypeScript ensures type safety
  console.log('Config without passphrase is valid');
  console.log('Config with passphrase is valid');
  
  // This would cause TypeScript error (uncomment to test):
  // const invalidConfig: SSHConfig = {
  //   host: 'example.com',
  //   username: 'user',
  //   privateKey: 'key-content',
  //   passphrase: 123 // ❌ TypeScript error: number not assignable to string
  // };
}

// Example 6: Generic function demonstrating API compatibility
async function connectWithConfig<T extends SSHConfig>(config: T): Promise<SftpClient> {
  const sftp = new SftpClient();
  await sftp.connect(config);
  return sftp;
}

async function example6_genericCompatibility(): Promise<void> {
  console.log('Example 6: Generic API compatibility');
  
  // Works with any valid SSHConfig
  const basicConfig: SSHConfig = {
    host: 'example.com',
    username: 'user',
    privateKey: 'key-content'
  };
  
  const encryptedConfig: SSHConfig = {
    host: 'example.com',
    username: 'user',
    privateKey: 'encrypted-key-content',
    passphrase: 'secret'
  };
  
  try {
    const sftp1 = await connectWithConfig(basicConfig);
    const sftp2 = await connectWithConfig(encryptedConfig);
    
    await sftp1.end();
    await sftp2.end();
    
    console.log('Both configurations work with generic function');
  } catch (error) {
    console.error('Generic connection failed:', error);
  }
}

// Example 7: Environment-based configuration with TypeScript
interface EnvironmentConfig {
  host: string;
  username: string;
  keyPath: string;
  passphrase?: string;
}

function createSSHConfigFromEnv(env: EnvironmentConfig): SSHConfig {
  const config: SSHConfig = {
    host: env.host,
    username: env.username,
    privateKey: fs.readFileSync(env.keyPath)
  };
  
  // Conditionally add passphrase if provided
  if (env.passphrase) {
    config.passphrase = env.passphrase;
  }
  
  return config;
}

async function example7_environmentConfig(): Promise<void> {
  console.log('Example 7: Environment-based configuration');
  
  const envConfig: EnvironmentConfig = {
    host: process.env.SSH_HOST || 'example.com',
    username: process.env.SSH_USER || 'user',
    keyPath: process.env.SSH_KEY_PATH || '~/.ssh/id_rsa',
    passphrase: process.env.SSH_PASSPHRASE // Optional from environment
  };
  
  const sshConfig = createSSHConfigFromEnv(envConfig);
  
  const sftp = new SftpClient();
  
  try {
    await sftp.connect(sshConfig);
    console.log('Connected using environment configuration');
    await sftp.end();
  } catch (error) {
    console.error('Environment-based connection failed:', error);
  }
}

// Export all examples
export {
  example1_basicTypescriptConnection,
  example2_typescriptWithPassphrase,
  example3_comprehensiveTypescriptConfig,
  example4_typeSafeKeyFormats,
  example5_optionalParameterTypes,
  example6_genericCompatibility,
  example7_environmentConfig,
  connectWithConfig,
  createSSHConfigFromEnv
};

// Type-only exports for library users
export type { SSHConfig };

// Uncomment to run examples (requires actual SSH server and keys)
// async function runTypescriptExamples(): Promise<void> {
//   await example1_basicTypescriptConnection();
//   await example2_typescriptWithPassphrase();
//   await example3_comprehensiveTypescriptConfig();
//   await example4_typeSafeKeyFormats();
//   await example5_optionalParameterTypes();
//   await example6_genericCompatibility();
//   await example7_environmentConfig();
// }
// 
// runTypescriptExamples().catch(console.error);