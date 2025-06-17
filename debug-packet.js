const { PacketBuilder } = require('./dist/ssh/packet');
const { SSH_MSG } = require('./dist/ssh/constants');

// Test the exact packet that would be sent for KEXINIT
// KEXINIT typically has a large payload (around 1000 bytes)
const mockKexinitPayload = Buffer.alloc(996); // This should result in 1004 total packet length

console.log('Testing packet with payload size:', mockKexinitPayload.length);

const packet = PacketBuilder.buildSSHPacket(SSH_MSG.KEXINIT, mockKexinitPayload);

console.log('Built packet length:', packet.length);
console.log('Packet structure:');
console.log('- Total packet length:', packet.length);
console.log('- Packet length field:', packet.readUInt32BE(0));
console.log('- Padding length:', packet.readUInt8(4));
console.log('- Message type:', packet.readUInt8(5));
console.log('- Payload length:', mockKexinitPayload.length);

const packetLengthField = packet.readUInt32BE(0);
const contentSize = packetLengthField; // Everything after the 4-byte length field

console.log('\nPadding validation:');
console.log('- Content size (after length field):', contentSize);
console.log('- Content size % 8:', contentSize % 8);
console.log('- Should be 0 for proper alignment');

if (contentSize % 8 !== 0) {
    console.log('❌ PADDING ERROR FOUND!');
} else {
    console.log('✅ Padding is correct');
}