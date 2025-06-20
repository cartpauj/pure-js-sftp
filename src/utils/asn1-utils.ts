/**
 * ASN.1 Encoding Utilities
 * Shared utilities for ASN.1 DER encoding operations
 */

/**
 * Encode ASN.1 length field according to DER rules
 * @param length The length value to encode
 * @returns Buffer containing the encoded length
 */
export function encodeLength(length: number): Buffer {
  if (length <= 127) {
    return Buffer.from([length]);
  } else {
    const lengthBytes = [];
    let len = length;
    while (len > 0) {
      lengthBytes.unshift(len & 0xff);
      len = len >> 8;
    }
    return Buffer.from([0x80 | lengthBytes.length, ...lengthBytes]);
  }
}

/**
 * Create ASN.1 SEQUENCE with proper length encoding
 * @param content The content to wrap in a SEQUENCE
 * @returns Buffer containing the ASN.1 SEQUENCE
 */
export function encodeSequence(content: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from([0x30]), // SEQUENCE tag
    encodeLength(content.length),
    content
  ]);
}

/**
 * Create ASN.1 BIT STRING with proper length encoding
 * @param data The bit string data
 * @param unusedBits Number of unused bits in the last byte (default 0)
 * @returns Buffer containing the ASN.1 BIT STRING
 */
export function encodeBitString(data: Buffer, unusedBits: number = 0): Buffer {
  const content = Buffer.concat([Buffer.from([unusedBits]), data]);
  return Buffer.concat([
    Buffer.from([0x03]), // BIT STRING tag
    encodeLength(content.length),
    content
  ]);
}