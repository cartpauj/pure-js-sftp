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