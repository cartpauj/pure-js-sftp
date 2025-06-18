// Type definitions for ssh2-streams
declare module 'ssh2-streams' {
  import { EventEmitter } from 'events';
  import { Duplex } from 'stream';

  export interface SSH2StreamOptions {
    server?: boolean;
    algorithms?: {
      kex?: string[];
      cipher?: string[];
      hmac?: string[];
      compress?: string[];
    };
  }

  export interface ParsedKey {
    type: string;
    comment: string;
    sign(data: Buffer): Buffer;
    getPublicSSH(): Buffer;
  }

  export class SSH2Stream extends Duplex {
    constructor(options?: SSH2StreamOptions);
    
    service(serviceName: string): void;
    authPassword(username: string, password: string): void;
    authPK(username: string, pubKey: Buffer, callback?: (buf: Buffer, cb: (signature: Buffer) => void) => void): void;
    session(channel?: number, initWindow?: number, maxPacket?: number): void;
    subsystem(channelId: number, name: string, wantReply: boolean): void;
    channelData(channelId: number, data: Buffer): void;
    channelClose(channelId: number): void;
    channelWindowAdjust(channelId: number, amount: number): boolean;
  }

  export namespace utils {
    export function parseKey(keyData: Buffer | string, passphrase?: string): ParsedKey[];
  }
}