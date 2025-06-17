/**
 * SSH Transport Layer tests
 */

import { SSHTransport } from '../src/ssh/transport';
import { ConnectionState } from '../src/ssh/types';
import { EventEmitter } from 'events';

// Mock the net module
let mockSocket: any;

jest.mock('net', () => ({
  Socket: jest.fn().mockImplementation(() => mockSocket)
}));

describe('SSHTransport', () => {
  let transport: SSHTransport;

  beforeEach(() => {
    // Create fresh mock socket for each test
    mockSocket = new EventEmitter();
    Object.assign(mockSocket, {
      connect: jest.fn(),
      write: jest.fn(),
      destroy: jest.fn(),
      setTimeout: jest.fn()
    });
    
    jest.clearAllMocks();
    
    const config = {
      host: 'test.example.com',
      port: 22,
      username: 'testuser',
      password: 'testpass'
    };
    
    transport = new SSHTransport(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('should create transport with config', () => {
      expect(transport).toBeInstanceOf(SSHTransport);
      expect(transport.getState()).toBe(ConnectionState.DISCONNECTED);
    });
  });

  describe('connection management', () => {
    test('should initiate connection', async () => {
      const connectPromise = transport.connect();
      
      expect(transport.getState()).toBe(ConnectionState.CONNECTING);
      expect((mockSocket as any).connect).toHaveBeenCalledWith(22, 'test.example.com');
      
      // Simulate successful socket connection
      mockSocket.emit('connect');
      
      expect(transport.getState()).toBe(ConnectionState.VERSION_EXCHANGE);
      expect((mockSocket as any).write).toHaveBeenCalled();
      
      // Simulate version exchange
      const versionData = Buffer.from('SSH-2.0-TestServer\r\n');
      mockSocket.emit('data', versionData);
      
      await connectPromise;
      expect(transport.getState()).toBe(ConnectionState.KEY_EXCHANGE);
    });

    test('should handle connection timeout', async () => {
      const config = {
        host: 'test.example.com',
        username: 'testuser',
        password: 'testpass',
        timeout: 5000
      };
      
      const timeoutTransport = new SSHTransport(config);
      const connectPromise = timeoutTransport.connect();
      
      expect((mockSocket as any).setTimeout).toHaveBeenCalledWith(5000);
      
      // Simulate timeout
      mockSocket.emit('timeout');
      
      await expect(connectPromise).rejects.toThrow('Connection timeout');
    });

    test('should handle connection errors', async () => {
      const connectPromise = transport.connect();
      
      // Simulate connection error
      const error = new Error('Connection refused');
      mockSocket.emit('error', error);
      
      await expect(connectPromise).rejects.toThrow('Socket error: Connection refused');
    });

    test('should handle invalid server version', async () => {
      const connectPromise = transport.connect();
      
      // Simulate socket connection
      mockSocket.emit('connect');
      
      // Send invalid SSH version
      const invalidVersion = Buffer.from('SSH-1.0-OldServer\r\n');
      mockSocket.emit('data', invalidVersion);
      
      await expect(connectPromise).rejects.toThrow(/Unsupported SSH version/);
    });
  });

  describe('version exchange', () => {
    test('should send client version on connect', () => {
      transport.connect();
      mockSocket.emit('connect');
      
      expect((mockSocket as any).write).toHaveBeenCalledWith(
        expect.stringContaining('SSH-2.0-PureJS_SFTP_1.0\r\n')
      );
    });

    test('should accept valid server version', async () => {
      const connectPromise = transport.connect();
      
      mockSocket.emit('connect');
      
      // Test with one valid version
      const versionData = Buffer.from('SSH-2.0-OpenSSH_8.0\r\n');
      mockSocket.emit('data', versionData);
      
      await connectPromise;
      expect(transport.getState()).toBe(ConnectionState.KEY_EXCHANGE);
    });

    test('should extract server version correctly', async () => {
      const connectPromise = transport.connect();
      
      mockSocket.emit('connect');
      
      const serverVersion = 'SSH-2.0-TestServer_1.0';
      const versionData = Buffer.from(serverVersion + '\r\n');
      mockSocket.emit('data', versionData);
      
      await connectPromise;
      expect(transport.getServerVersion()).toBe(serverVersion);
    });
  });

  describe('packet sending', () => {
    beforeEach(async () => {
      // Set transport to connected state with proper socket
      const connectPromise = transport.connect();
      mockSocket.emit('connect');
      const versionData = Buffer.from('SSH-2.0-TestServer\r\n');
      mockSocket.emit('data', versionData);
      await connectPromise;
      transport.setState(ConnectionState.AUTHENTICATED);
    });

    test('should send SSH packets', () => {
      // Clear previous write calls (from version exchange)
      (mockSocket as any).write.mockClear();
      
      const payload = Buffer.from('test payload');
      transport.sendPacket(4, payload); // SSH_MSG_DEBUG
      
      expect((mockSocket as any).write).toHaveBeenCalled();
      const sentData = (mockSocket as any).write.mock.calls[0][0];
      expect(sentData).toBeInstanceOf(Buffer);
      expect(sentData.length).toBeGreaterThan(payload.length);
    });

    test('should send raw data', () => {
      const data = Buffer.from('raw test data');
      transport.sendRawData(data);
      
      expect((mockSocket as any).write).toHaveBeenCalledWith(data);
    });

    test('should throw error when not connected', () => {
      // Disconnect to clear socket
      transport.disconnect();
      
      expect(() => {
        transport.sendPacket(4, Buffer.from('test'));
      }).toThrow('Not connected');
      
      expect(() => {
        transport.sendRawData(Buffer.from('test'));
      }).toThrow('Not connected');
    });
  });

  describe('disconnection', () => {
    beforeEach(async () => {
      // Connect first so we have a socket
      const connectPromise = transport.connect();
      mockSocket.emit('connect');
      const versionData = Buffer.from('SSH-2.0-TestServer\r\n');
      mockSocket.emit('data', versionData);
      await connectPromise;
      transport.setState(ConnectionState.AUTHENTICATED);
    });

    test('should disconnect cleanly', () => {
      transport.disconnect();
      
      expect((mockSocket as any).destroy).toHaveBeenCalled();
      expect(transport.getState()).toBe(ConnectionState.DISCONNECTED);
    });

    test('should handle socket close event', () => {
      const closeSpy = jest.fn();
      transport.on('close', closeSpy);
      
      mockSocket.emit('close');
      
      expect(transport.getState()).toBe(ConnectionState.DISCONNECTED);
      expect(closeSpy).toHaveBeenCalled();
    });
  });

  describe('state management', () => {
    test('should track connection state', () => {
      expect(transport.getState()).toBe(ConnectionState.DISCONNECTED);
      
      transport.setState(ConnectionState.CONNECTING);
      expect(transport.getState()).toBe(ConnectionState.CONNECTING);
      
      transport.setState(ConnectionState.AUTHENTICATED);
      expect(transport.getState()).toBe(ConnectionState.AUTHENTICATED);
    });

    test('should report connection status', async () => {
      expect(transport.isConnected()).toBe(false);
      
      // Connect to set up socket properly
      const connectPromise = transport.connect();
      mockSocket.emit('connect');
      const versionData = Buffer.from('SSH-2.0-TestServer\r\n');
      mockSocket.emit('data', versionData);
      await connectPromise;
      
      transport.setState(ConnectionState.AUTHENTICATED);
      expect(transport.isConnected()).toBe(true);
      
      transport.setState(ConnectionState.DISCONNECTED);
      expect(transport.isConnected()).toBe(false);
    });
  });

  describe('client version', () => {
    test('should return client version', () => {
      const clientVersion = transport.getClientVersion();
      expect(clientVersion).toContain('SSH-2.0');
      expect(clientVersion).toContain('PureJS_SFTP');
    });
  });

  describe('event handling', () => {
    test('should emit version exchange event', async () => {
      const versionSpy = jest.fn();
      transport.on('versionExchange', versionSpy);
      
      const connectPromise = transport.connect();
      mockSocket.emit('connect');
      
      const serverVersion = 'SSH-2.0-TestServer';
      mockSocket.emit('data', Buffer.from(serverVersion + '\r\n'));
      
      await connectPromise;
      expect(versionSpy).toHaveBeenCalledWith(serverVersion);
    });

    test('should handle multiple data chunks in version exchange', async () => {
      const connectPromise = transport.connect();
      mockSocket.emit('connect');
      
      // Send version in multiple chunks
      mockSocket.emit('data', Buffer.from('SSH-2.0-'));
      mockSocket.emit('data', Buffer.from('TestServer'));
      mockSocket.emit('data', Buffer.from('\r\n'));
      
      await connectPromise;
      expect(transport.getServerVersion()).toBe('SSH-2.0-TestServer');
    });
  });
});