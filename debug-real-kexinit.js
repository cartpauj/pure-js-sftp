const { KexManager } = require('./dist/kex/kex-manager');
const { SSHTransport } = require('./dist/ssh/transport');
const { PacketBuilder } = require('./dist/ssh/packet');
const { SSH_MSG } = require('./dist/ssh/constants');

// Create a real KEXINIT payload like our code would
const kexInit = {
  cookie: Buffer.alloc(16, 0xAB), // Use a fixed cookie for testing
  kex_algorithms: [
    'ecdh-sha2-nistp256',
    'ecdh-sha2-nistp384', 
    'ecdh-sha2-nistp521',
    'diffie-hellman-group16-sha512',
    'diffie-hellman-group14-sha256',
    'diffie-hellman-group14-sha1'
  ],
  server_host_key_algorithms: [
    'rsa-sha2-512',
    'rsa-sha2-256', 
    'ssh-rsa',
    'ecdsa-sha2-nistp256',
    'ecdsa-sha2-nistp384',
    'ecdsa-sha2-nistp521',
    'ssh-ed25519'
  ],
  encryption_algorithms_client_to_server: [
    'aes256-gcm@openssh.com',
    'aes128-gcm@openssh.com',
    'aes256-ctr',
    'aes192-ctr',
    'aes128-ctr'
  ],
  encryption_algorithms_server_to_client: [
    'aes256-gcm@openssh.com',
    'aes128-gcm@openssh.com', 
    'aes256-ctr',
    'aes192-ctr',
    'aes128-ctr'
  ],
  mac_algorithms_client_to_server: [
    'hmac-sha2-256-etm@openssh.com',
    'hmac-sha2-512-etm@openssh.com',
    'hmac-sha2-256',
    'hmac-sha2-512',
    'hmac-sha1'
  ],
  mac_algorithms_server_to_client: [
    'hmac-sha2-256-etm@openssh.com',
    'hmac-sha2-512-etm@openssh.com',
    'hmac-sha2-256',
    'hmac-sha2-512',
    'hmac-sha1'
  ],
  compression_algorithms_client_to_server: ['none'],
  compression_algorithms_server_to_client: ['none'],
  languages_client_to_server: [],
  languages_server_to_client: [],
  first_kex_packet_follows: false,
  reserved: 0
};

console.log('Building real KEXINIT payload...');

const parts = [
  kexInit.cookie,
  PacketBuilder.buildString(kexInit.kex_algorithms.join(',')),
  PacketBuilder.buildString(kexInit.server_host_key_algorithms.join(',')),
  PacketBuilder.buildString(kexInit.encryption_algorithms_client_to_server.join(',')),
  PacketBuilder.buildString(kexInit.encryption_algorithms_server_to_client.join(',')),
  PacketBuilder.buildString(kexInit.mac_algorithms_client_to_server.join(',')),
  PacketBuilder.buildString(kexInit.mac_algorithms_server_to_client.join(',')),
  PacketBuilder.buildString(kexInit.compression_algorithms_client_to_server.join(',')),
  PacketBuilder.buildString(kexInit.compression_algorithms_server_to_client.join(',')),
  PacketBuilder.buildString(kexInit.languages_client_to_server.join(',')),
  PacketBuilder.buildString(kexInit.languages_server_to_client.join(',')),
  PacketBuilder.buildBoolean(kexInit.first_kex_packet_follows),
  PacketBuilder.buildUInt32(kexInit.reserved)
];

const payload = Buffer.concat(parts);
console.log('KEXINIT payload size:', payload.length);

const packet = PacketBuilder.buildSSHPacket(SSH_MSG.KEXINIT, payload);

console.log('\nBuilt KEXINIT packet:');
console.log('- Total packet length:', packet.length);
console.log('- Packet length field:', packet.readUInt32BE(0));
console.log('- Padding length:', packet.readUInt8(4));
console.log('- Message type:', packet.readUInt8(5));
console.log('- Payload length:', payload.length);

const packetLengthField = packet.readUInt32BE(0);
console.log('\nPadding validation:');
console.log('- Content size (after length field):', packetLengthField);
console.log('- Content size % 8:', packetLengthField % 8);

if (packetLengthField % 8 !== 0) {
    console.log('❌ PADDING ERROR! This could cause server rejection');
} else {
    console.log('✅ Padding is correct');
}

// Check if this produces a 1004-byte content size
if (packetLengthField === 1004) {
    console.log('\n🎯 FOUND THE 1004-BYTE ISSUE!');
    console.log('This packet would trigger the server error.');
}