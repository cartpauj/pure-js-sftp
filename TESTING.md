# Testing Guide

This document provides comprehensive information about the testing infrastructure and validation procedures for the Pure JS SFTP client.

## 📊 Test Overview

The project includes **107 tests** across **9 test suites** that validate every aspect of the SSH/SFTP implementation:

```
Test Suites: 9 passed, 9 total
Tests:       107 passed, 107 total
```

## 🧪 Test Categories

### 1. Cryptographic Function Tests (`test/crypto.test.ts`)
Validates core cryptographic operations with known test vectors:

- **Hash Functions**: SHA-1, SHA-256, SHA-512
- **HMAC Functions**: HMAC-SHA1, HMAC-SHA256, HMAC-SHA512  
- **BigInt Utilities**: Buffer conversion and modular arithmetic
- **Random Generation**: Cryptographically secure random bytes

### 2. Cryptographic Interoperability (`test/crypto-interop.test.ts`)
Ensures compatibility with industry standards:

- **Node.js Compatibility**: Direct comparison with Node's built-in crypto module
- **NIST Test Vectors**: SHA-256 validation against official NIST test cases
- **RFC 4231 Compliance**: HMAC-SHA256 validation against RFC test vectors
- **Performance Testing**: Validates efficiency with realistic workloads
- **Security Validation**: Entropy testing for random number generation

### 3. Diffie-Hellman Key Exchange (`test/diffie-hellman.test.ts`)
Tests cryptographic key exchange implementation:

- **Algorithm Support**: Groups 14 (SHA-256) and 16 (SHA-512)
- **Key Generation**: Public/private key pair creation
- **Exchange Simulation**: Complete client-server key exchange
- **Hash Generation**: Exchange hash creation and validation
- **Key Derivation**: Encryption key derivation from shared secrets

### 4. SSH Transport Layer (`test/ssh-transport.test.ts`)  
Validates SSH protocol transport implementation:

- **Connection Management**: Socket handling and state tracking
- **Version Exchange**: SSH version negotiation
- **Packet Handling**: SSH packet construction and parsing
- **Error Handling**: Connection failures and invalid data
- **Event Management**: Proper event emission and handling

### 5. Packet Processing (`test/packet.test.ts`)
Tests SSH/SFTP packet construction and parsing:

- **SSH Packets**: Proper packet structure and padding
- **SFTP Packets**: SFTP-specific packet formats
- **Data Types**: SSH string, bytes, boolean, uint32 handling
- **Fragmentation**: Incomplete packet reassembly
- **Validation**: Packet integrity and error detection

### 6. Protocol Integration (`test/protocol-integration.test.ts`)
Real-world protocol validation:

- **Version Validation**: SSH version string compliance
- **Real Packet Data**: Tests with actual SSH packet structures
- **Fragmentation Handling**: Network packet fragmentation simulation
- **Error Resilience**: Malformed packet handling
- **Large Packets**: Performance with various packet sizes

### 7. End-to-End Testing (`test/end-to-end.test.ts`)
Complete workflow validation:

- **Mock SSH Server**: Simulated server responses
- **Full Handshake**: Complete SSH connection sequence
- **SFTP Operations**: File operation workflow testing
- **Error Scenarios**: Network failures and disconnections
- **Concurrent Processing**: Multiple packet handling

### 8. Integration Tests (`test/integration.test.ts`)
High-level API validation:

- **Client Creation**: SFTP client instantiation
- **API Compatibility**: Method signature validation
- **Configuration**: Connection parameter handling

### 9. Main Entry Point (`test/index.test.ts`)
Module export validation:

- **Export Structure**: Proper module exports
- **TypeScript Types**: Type definition availability
- **API Surface**: Public interface validation

## 🔬 Test Validation Standards

### Cryptographic Standards
- **NIST SP 800-38A**: Advanced Encryption Standard (AES) modes
- **FIPS 180-4**: Secure Hash Standard (SHA-1, SHA-256, SHA-512)
- **RFC 2104**: HMAC: Keyed-Hashing for Message Authentication
- **RFC 4231**: Identifiers and Test Vectors for HMAC-SHA-224, HMAC-SHA-256, HMAC-SHA-384, and HMAC-SHA-512

### SSH/SFTP Standards
- **RFC 4253**: SSH Transport Layer Protocol
- **RFC 4254**: SSH Connection Protocol  
- **RFC 4251**: SSH Protocol Architecture
- **draft-ietf-secsh-filexfer-02**: SSH File Transfer Protocol v3

### Performance Benchmarks
- **Small Files**: < 1MB transfer validation
- **Large Files**: > 100MB streaming capability
- **Concurrent Operations**: Multiple simultaneous connections
- **Memory Efficiency**: Streaming without memory leaks

## 🚀 Running Tests

### Basic Test Execution
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with verbose output
npm test -- --verbose

# Run specific test file
npm test crypto.test.ts
```

### Test Categories
```bash
# Run only crypto tests
npm test -- --testPathPattern=crypto

# Run only protocol tests  
npm test -- --testPathPattern=protocol

# Run only integration tests
npm test -- --testPathPattern=integration
```

### Coverage and Performance
```bash
# Run with coverage report
npm test -- --coverage

# Run performance tests
npm test -- --testNamePattern="Performance"

# Run with timing information
npm test -- --verbose --testTimeout=30000
```

## 📈 Test Results Interpretation

### Success Criteria
- **All 107 tests passing**: Complete functionality validation
- **Zero test failures**: No regressions or breaking changes
- **Performance within bounds**: Reasonable execution times
- **Memory stability**: No memory leaks in long-running tests

### Common Test Patterns
```javascript
// Crypto validation pattern
test('should match Node.js implementation', () => {
  const input = Buffer.from('test data');
  const ourResult = CryptoUtils.sha256(input);
  const nodeResult = createHash('sha256').update(input).digest();
  expect(ourResult.equals(nodeResult)).toBe(true);
});

// Protocol compliance pattern  
test('should handle real SSH packets', () => {
  const packet = PacketBuilder.buildSSHPacket(SSH_MSG.DEBUG, payload);
  const parsed = parser.parseSSHPackets(packet);
  expect(parsed[0].type).toBe(SSH_MSG.DEBUG);
  expect(parsed[0].payload.equals(payload)).toBe(true);
});

// Error resilience pattern
test('should handle malformed data gracefully', () => {
  const malformedData = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]);
  expect(() => parser.addData(malformedData)).not.toThrow();
  expect(parser.parseSSHPackets()).toHaveLength(0);
});
```

## 🛠️ Test Development

### Adding New Tests
1. **Follow existing patterns**: Use established test structures
2. **Include edge cases**: Test boundary conditions and error scenarios  
3. **Validate standards**: Compare against official specifications
4. **Test real data**: Use realistic SSH/SFTP packet structures
5. **Performance awareness**: Ensure tests complete in reasonable time

### Test File Organization
```
test/
├── crypto.test.ts              # Core crypto functions
├── crypto-interop.test.ts      # Standards compliance  
├── diffie-hellman.test.ts      # Key exchange
├── ssh-transport.test.ts       # SSH transport layer
├── packet.test.ts              # Packet processing
├── protocol-integration.test.ts # Real protocol testing
├── end-to-end.test.ts          # Complete workflows
├── integration.test.ts         # High-level integration
└── index.test.ts               # Module exports
```

### Mock and Test Data
- **Realistic Data**: Use production-like SSH packet structures
- **Standard Vectors**: Include official test vectors from RFCs
- **Edge Cases**: Test with empty, large, and malformed data
- **Error Conditions**: Simulate network failures and invalid inputs

## 🔍 Debugging Test Failures

### Common Issues
```bash
# Crypto test failures - usually due to incorrect test vectors
npm test crypto.test.ts -- --verbose

# Protocol test failures - often mock configuration issues  
npm test ssh-transport.test.ts -- --verbose

# Performance test failures - may need timeout adjustments
npm test -- --testTimeout=10000
```

### Test Environment
- **Node.js Version**: Ensure compatibility with target versions
- **Platform Dependencies**: Some tests may behave differently on different OS
- **Timing Sensitivity**: Some async tests may need timing adjustments

## 📋 Continuous Integration

### CI Pipeline Validation
- **Multiple Node.js versions**: 14.x, 16.x, 18.x
- **Multiple platforms**: Linux, macOS, Windows
- **Different architectures**: x64, ARM64
- **Performance regression**: Baseline timing comparisons

### Quality Gates
- **100% test pass rate**: All tests must pass
- **Code coverage**: Maintain high coverage percentage
- **Performance bounds**: Tests complete within time limits
- **Memory stability**: No memory leaks detected

## 🎯 Production Readiness

The comprehensive test suite validates that the Pure JS SFTP client is ready for production use by ensuring:

1. **Cryptographic Correctness**: All crypto functions match industry standards
2. **Protocol Compliance**: SSH/SFTP implementation follows specifications
3. **Error Resilience**: Graceful handling of network issues and malformed data
4. **Performance Adequacy**: Suitable for real-world file transfer workloads
5. **Interoperability**: Compatible with existing SSH servers and clients

This testing infrastructure provides confidence that the library will work correctly in production environments where native dependencies fail.