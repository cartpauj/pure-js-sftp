/**
 * Revolutionary Proxy Fix for ssh2-streams RSA Authentication
 * 
 * This module uses JavaScript Proxy to intercept ssh2-streams method calls
 * and modify RSA key algorithm names from "ssh-rsa" to "rsa-sha2-256" at runtime.
 * This enables RSA key authentication with modern SSH servers without modifying
 * the ssh2-streams library.
 */

export function applyRevolutionaryProxyFix(ssh2Stream: any, debugFn?: (msg: string) => void): any {
  const debug = debugFn || (() => {});
  
  debug('Applying RSA-SHA2 proxy fix to ssh2-streams');
  
  // Create a Proxy that intercepts method calls
  return new Proxy(ssh2Stream, {
    get(target: any, prop: string | symbol, receiver: any) {
      const originalValue = Reflect.get(target, prop, receiver);
      
      // Intercept the authPK method which handles public key authentication
      if (prop === 'authPK' && typeof originalValue === 'function') {
        debug('Intercepting authPK method for RSA-SHA2 fix');
        
        return function(username: string, pubKey: any, cbSign: Function) {
          let modifiedPubKey = pubKey;
          
          if (pubKey && pubKey.type === 'ssh-rsa') {
            // Case 1: Key object with .type property - modify the type
            debug('Modifying RSA key object: ssh-rsa -> rsa-sha2-256');
            modifiedPubKey = {
              ...pubKey,
              type: 'rsa-sha2-256',
              getPublicSSH: pubKey.getPublicSSH?.bind(pubKey) || function() { return pubKey; },
              sign: pubKey.sign?.bind(pubKey) || function() { throw new Error('Sign method not available'); }
            };
            
          } else if (Buffer.isBuffer(pubKey)) {
            // Case 2: Buffer containing SSH public key - check if it's RSA
            const keyTypeStart = 4; // Skip length prefix
            const keyTypeLen = pubKey.readUInt32BE(0);
            const keyType = pubKey.toString('ascii', keyTypeStart, keyTypeStart + keyTypeLen);
            
            if (keyType === 'ssh-rsa') {
              debug('Modifying RSA key buffer: ssh-rsa -> rsa-sha2-256');
              
              // Create a new buffer with rsa-sha2-256 instead of ssh-rsa
              const newKeyType = 'rsa-sha2-256';
              const newKeyTypeBuffer = Buffer.from(newKeyType, 'ascii');
              const newKeyTypeLen = Buffer.alloc(4);
              newKeyTypeLen.writeUInt32BE(newKeyTypeBuffer.length, 0);
              
              // Reconstruct the buffer: [new_length][new_type][rest_of_key]
              const restOfKey = pubKey.slice(keyTypeStart + keyTypeLen);
              modifiedPubKey = Buffer.concat([newKeyTypeLen, newKeyTypeBuffer, restOfKey]);
            }
          }
          
          // Create signature callback that passes through to the original
          const signatureCallback = (buf: Buffer, cb: (signature: Buffer) => void) => {
            cbSign(buf, (signature: Buffer) => {
              debug('RSA-SHA2 authentication complete');
              cb(signature);
            });
          };
          
          // Call the original authPK method with our modified key
          return originalValue.call(target, username, modifiedPubKey, signatureCallback);
        };
      }
      
      // For all other properties, return as-is
      if (typeof originalValue === 'function') {
        return originalValue.bind(target);
      }
      
      return originalValue;
    },
    
    set(target: any, prop: string | symbol, value: any, receiver: any) {
      return Reflect.set(target, prop, value, receiver);
    }
  });
}

