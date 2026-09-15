/**
 * Cross-platform helpers for running short-lived crypto scripts in a child process.
 *
 * These exist because the key parsing/signing paths delegate some crypto work to a
 * separate Node process. Doing that portably means: never assume `/tmp` exists,
 * never assume a `node` binary is on PATH, and never let a shell see the arguments.
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { execFileSync } from 'child_process';

/**
 * Write a throwaway script into the OS temp directory and return its path.
 */
export function writeTempScript(prefix: string, source: string): string {
  const tempFilename = path.join(
    os.tmpdir(),
    `${prefix}_${process.pid}_${Math.random().toString(36).substring(7)}.js`
  );
  fs.writeFileSync(tempFilename, source);
  return tempFilename;
}

/**
 * Run a temp script with the currently running Node binary, passing `input` as a
 * single JSON argument. Uses execFileSync so no shell quoting is involved.
 */
export function runTempScript(
  tempFilename: string,
  input: unknown,
  options: { timeout?: number; maxBuffer?: number } = {}
): string {
  return execFileSync(process.execPath, [tempFilename, JSON.stringify(input)], {
    encoding: 'utf8',
    stdio: 'pipe',
    // Stops a console window flashing when the host app is a GUI process (e.g. VS Code)
    windowsHide: true,
    timeout: options.timeout,
    maxBuffer: options.maxBuffer
  });
}

/**
 * Delete a temp script, ignoring failures.
 */
export function removeTempScript(tempFilename: string): void {
  try { fs.unlinkSync(tempFilename); } catch { /* ignore */ }
}
