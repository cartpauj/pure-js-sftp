const { PacketBuilder } = require('./dist/ssh/packet');
const { SSH_MSG } = require('./dist/ssh/constants');

// The server error mentions "need 1004 block 8 mod 4"
// This suggests a packet where the server expects 1004 bytes but gets misaligned content

console.log('🔍 Debugging the 1004-byte packet issue...\n');

// Test different payload sizes around the 1004 mark
const testSizes = [996, 997, 998, 999, 1000, 1001, 1002, 1003, 1004];

for (const payloadSize of testSizes) {
    const payload = Buffer.alloc(payloadSize);
    const packet = PacketBuilder.buildSSHPacket(SSH_MSG.KEXINIT, payload);
    
    const totalSize = packet.length;
    const contentSize = packet.readUInt32BE(0); // packet_length field
    const paddingLength = packet.readUInt8(4);
    
    console.log(`Payload ${payloadSize}: total=${totalSize}, content=${contentSize}, pad=${paddingLength}, content%8=${contentSize % 8}`);
    
    // Check if this produces the problematic 1004-byte scenario
    if (contentSize === 1004 || totalSize === 1004) {
        console.log(`  ⚠️  FOUND 1004-BYTE CASE!`);
        if (contentSize % 8 !== 0) {
            console.log(`  ❌ PADDING ERROR: content size ${contentSize} % 8 = ${contentSize % 8} (should be 0)`);
        }
    }
}

console.log('\n📊 Summary:');
console.log('The server error "need 1004 block 8 mod 4" suggests:');
console.log('- Server received a packet with content size 1004');
console.log('- Expected: 1004 % 8 = 0 (properly padded)');
console.log('- Actual: 1004 % 8 = 4 (improperly padded)');
console.log('');
console.log('This could mean:');
console.log('1. Our packet length calculation is wrong');
console.log('2. Our padding calculation is wrong');
console.log('3. We\'re sending the wrong total packet size');
console.log('4. There\'s a framing/alignment issue');