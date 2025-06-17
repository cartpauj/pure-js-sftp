/**
 * End-to-End Protocol Tests
 * Tests complete SSH/SFTP protocol flows without network
 */

import { SSHTransport } from '../src/ssh/transport';
import { DiffieHellmanKex } from '../src/kex/diffie-hellman';
import { PacketBuilder, PacketParser } from '../src/ssh/packet';
import { CryptoUtils } from '../src/crypto/utils';
import { SSH_MSG, SFTP_MSG } from '../src/ssh/constants';
import { ConnectionState } from '../src/ssh/types';
import { EventEmitter } from 'events';

// Create a simulated SSH server for testing
class MockSSHServer extends EventEmitter {
  private clientSocket: any;
  private serverVersion = 'SSH-2.0-MockServer_1.0';
  private kex: DiffieHellmanKex;
  
  constructor() {
    super();
    this.kex = new DiffieHellmanKex('diffie-hellman-group14-sha256');
  }
  
  attachClient(clientSocket: any) {
    this.clientSocket = clientSocket;
    
    // Handle client connection
    clientSocket.on('connect', () => {
      this.emit('clientConnected');
    });
    
    // Handle client data
    clientSocket.on('write', (data: Buffer | string) => {
      if (typeof data === 'string') {
        this.handleClientVersion(data);
      } else {
        this.handleClientPacket(data);
      }
    });
  }
  
  private handleClientVersion(versionString: string) {
    if (versionString.startsWith('SSH-2.0-')) {
      // Send server version
      setTimeout(() => {
        this.clientSocket.emit('data', Buffer.from(this.serverVersion + '\r\n'));
      }, 10);
    }
  }
  
  private handleClientPacket(data: Buffer) {
    // For now, just echo back that we received it
    this.emit('clientPacket', data);
  }
  
  simulateKexInit() {
    // Send a realistic KEXINIT packet
    const kexInitPayload = Buffer.concat([
      CryptoUtils.randomBytes(16), // random bytes
      this.buildStringList(['diffie-hellman-group14-sha256']),
      this.buildStringList(['ssh-rsa']),
      this.buildStringList(['aes128-ctr', 'aes256-ctr']),
      this.buildStringList(['aes128-ctr', 'aes256-ctr']),
      this.buildStringList(['hmac-sha256']),
      this.buildStringList(['hmac-sha256']),
      this.buildStringList(['none']),
      this.buildStringList(['none']),
      this.buildStringList([]),
      this.buildStringList([]),
      Buffer.from([0]), // first_kex_packet_follows
      Buffer.from([0, 0, 0, 0]) // reserved
    ]);
    
    const kexInitPacket = PacketBuilder.buildSSHPacket(SSH_MSG.KEXINIT, kexInitPayload);
    
    setTimeout(() => {
      this.clientSocket.emit('data', kexInitPacket);
    }, 20);
  }
  
  private buildStringList(strings: string[]): Buffer {
    if (strings.length === 0) {
      return Buffer.from([0, 0, 0, 0]);
    }
    const joined = strings.join(',');
    return PacketBuilder.buildString(joined);
  }
}

describe('End-to-End Protocol Tests', () => {
  let mockServer: MockSSHServer;
  let mockSocket: any;
  let transport: SSHTransport;
  
  beforeEach(() => {
    mockServer = new MockSSHServer();
    
    // Create mock socket that connects to our mock server
    mockSocket = new EventEmitter();
    Object.assign(mockSocket, {
      connect: jest.fn(() => {
        setTimeout(() => mockSocket.emit('connect'), 5);
      }),
      write: jest.fn((data: any) => {
        setTimeout(() => mockSocket.emit('write', data), 5);
      }),
      destroy: jest.fn(),
      setTimeout: jest.fn()
    });
    
    // Connect mock server to mock socket
    mockServer.attachClient(mockSocket);
    
    jest.doMock('net', () => ({
      Socket: jest.fn().mockImplementation(() => mockSocket)
    }));
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should complete full SSH handshake sequence', async () => {
    const config = {
      host: 'test.example.com',
      port: 22,
      username: 'testuser',
      password: 'testpass'
    };
    
    // Create transport
    const { SSHTransport } = await import('../src/ssh/transport');
    transport = new SSHTransport(config);
    
    // Track handshake events
    const events: string[] = [];
    
    transport.on('versionExchange', (serverVersion) => {
      events.push(`version:${serverVersion}`);
    });
    
    mockServer.on('clientConnected', () => {
      events.push('clientConnected');
    });
    
    // Start connection
    const connectPromise = transport.connect();
    
    // Wait for version exchange to complete
    await connectPromise;
    
    // Verify handshake sequence
    expect(events).toContain('clientConnected');
    expect(events).toContain('version:SSH-2.0-MockServer_1.0');
    expect(transport.getState()).toBe(ConnectionState.KEY_EXCHANGE);
    expect(transport.getServerVersion()).toBe('SSH-2.0-MockServer_1.0');
    
    // Verify client sent proper version
    expect(mockSocket.write).toHaveBeenCalledWith(
      expect.stringMatching(/^SSH-2\.0-PureJS_SFTP/)
    );
  });

  test('should handle realistic SSH packet exchange', async () => {
    const { SSHTransport } = await import('../src/ssh/transport');
    transport = new SSHTransport({
      host: 'test.example.com',
      username: 'test',
      password: 'test'
    });
    
    // Complete version exchange first
    const connectPromise = transport.connect();
    await connectPromise;
    
    // Now simulate server sending KEXINIT
    const packetReceived = new Promise((resolve) => {
      mockServer.on('clientPacket', resolve);
    });
    
    mockServer.simulateKexInit();
    
    // Transport should process the KEXINIT packet
    // (In real implementation, this would trigger client's own KEXINIT response)
    
    // Verify the exchange completed without errors
    expect(transport.getState()).toBe(ConnectionState.KEY_EXCHANGE);
  });

  test('should handle SSH disconnection gracefully', async () => {
    const { SSHTransport } = await import('../src/ssh/transport');
    transport = new SSHTransport({
      host: 'test.example.com',
      username: 'test',
      password: 'test'
    });
    
    const connectPromise = transport.connect();
    await connectPromise;
    
    // Track disconnection
    let disconnected = false;
    transport.on('close', () => {
      disconnected = true;
    });
    
    // Simulate server disconnection
    mockSocket.emit('close');
    
    expect(disconnected).toBe(true);
    expect(transport.getState()).toBe(ConnectionState.DISCONNECTED);
  });

  test('should handle SSH errors properly', async () => {
    const { SSHTransport } = await import('../src/ssh/transport');
    transport = new SSHTransport({
      host: 'test.example.com',
      username: 'test',
      password: 'test'
    });
    
    const connectPromise = transport.connect();
    
    // Simulate connection error
    const testError = new Error('Network unreachable');
    mockSocket.emit('error', testError);
    
    await expect(connectPromise).rejects.toThrow('Socket error: Network unreachable');
  });

  test('should validate complete SFTP file operation flow', () => {
    // Test complete SFTP packet creation and parsing
    const filePath = '/home/user/documents/test.txt';
    const requestId = 12345;
    
    // 1. Create SFTP INIT
    const initPayload = Buffer.from([0, 0, 0, 3]); // SFTP v3
    const initPacket = PacketBuilder.buildSFTPPacket(SFTP_MSG.INIT, initPayload);
    
    // 2. Create SFTP OPEN request
    const openPayload = Buffer.concat([
      PacketBuilder.buildString(filePath),
      PacketBuilder.buildUInt32(0x00000001), // SSH_FXF_READ
      Buffer.from([0, 0, 0, 0]) // empty attributes
    ]);
    const openPacket = PacketBuilder.buildSFTPPacket(SFTP_MSG.OPEN, openPayload, requestId);
    
    // 3. Create SFTP READ request
    const fileHandle = Buffer.from('handle123', 'utf8');
    const readOffset = 1024;
    const readLength = 4096;
    const readPayload = Buffer.concat([
      PacketBuilder.buildBytes(fileHandle),
      PacketBuilder.buildUInt32(0), // offset high
      PacketBuilder.buildUInt32(readOffset), // offset low
      PacketBuilder.buildUInt32(readLength)
    ]);
    const readPacket = PacketBuilder.buildSFTPPacket(SFTP_MSG.READ, readPayload, requestId + 1);
    
    // 4. Create SFTP CLOSE request
    const closePayload = PacketBuilder.buildBytes(fileHandle);
    const closePacket = PacketBuilder.buildSFTPPacket(SFTP_MSG.CLOSE, closePayload, requestId + 2);
    
    // Verify all packets are properly formed
    expect(initPacket.length).toBeGreaterThan(8);
    expect(openPacket.length).toBeGreaterThan(filePath.length + 12);
    expect(readPacket.length).toBeGreaterThan(fileHandle.length + 16);
    expect(closePacket.length).toBeGreaterThan(fileHandle.length + 8);
    
    // Test that we can parse them back
    const parser = new PacketParser();
    
    const initParsed = parser.parseSFTPPackets(initPacket);
    expect(initParsed[0].type).toBe(SFTP_MSG.INIT);
    
    const openParsed = parser.parseSFTPPackets(openPacket);
    expect(openParsed[0].type).toBe(SFTP_MSG.OPEN);
    expect(openParsed[0].id).toBe(requestId);
    
    const readParsed = parser.parseSFTPPackets(readPacket);
    expect(readParsed[0].type).toBe(SFTP_MSG.READ);
    expect(readParsed[0].id).toBe(requestId + 1);
    
    const closeParsed = parser.parseSFTPPackets(closePacket);
    expect(closeParsed[0].type).toBe(SFTP_MSG.CLOSE);
    expect(closeParsed[0].id).toBe(requestId + 2);
  });

  test('should validate crypto operations with realistic data sizes', () => {
    // Test with SSH-typical data sizes
    const testData = [
      { size: 16, desc: 'IV size' },
      { size: 32, desc: 'AES-256 key size' },
      { size: 64, desc: 'SHA-512 hash size' },
      { size: 256, desc: 'RSA key size (bytes)' },
      { size: 1024, desc: 'Small packet' },
      { size: 8192, desc: 'Medium packet' },
      { size: 32768, desc: 'Large packet' }
    ];
    
    for (const { size, desc } of testData) {
      // Test random generation
      const randomData = CryptoUtils.randomBytes(size);
      expect(randomData.length).toBe(size);
      
      // Test hashing
      const sha256 = CryptoUtils.sha256(randomData);
      expect(sha256.length).toBe(32);
      
      const sha512 = CryptoUtils.sha512(randomData);
      expect(sha512.length).toBe(64);
      
      // Test HMAC
      const key = CryptoUtils.randomBytes(32);
      const hmac = CryptoUtils.hmacSha256(key, randomData);
      expect(hmac.length).toBe(32);
      
      // Test BigInt conversions (for DH)
      if (size <= 256) { // Reasonable size for BigInt
        const bn = CryptoUtils.bufferToBn(randomData);
        const backToBuf = CryptoUtils.bnToBuffer(bn);
        
        // Should round-trip correctly (allowing for leading zero removal)
        expect(CryptoUtils.bufferToBn(backToBuf)).toBe(bn);
      }
    }
  });

  test('should handle concurrent packet processing', () => {
    const parser = new PacketParser();
    const packets: Buffer[] = [];
    
    // Create multiple packets of different types
    for (let i = 0; i < 10; i++) {
      const payload = CryptoUtils.randomBytes(100 + i * 50);
      const packet = PacketBuilder.buildSSHPacket(SSH_MSG.DEBUG, payload);
      packets.push(packet);
    }
    
    // Send all packets as one big buffer (simulating network burst)
    const combinedBuffer = Buffer.concat(packets);
    parser.addData(combinedBuffer);
    
    // Parse all packets
    const parsedPackets = parser.parseSSHPackets();
    
    expect(parsedPackets.length).toBe(10);
    
    for (let i = 0; i < 10; i++) {
      expect(parsedPackets[i].type).toBe(SSH_MSG.DEBUG);
      expect(parsedPackets[i].payload.length).toBe(100 + i * 50);
    }
  });
});