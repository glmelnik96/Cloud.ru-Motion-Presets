// Working folder with an ASCII path for everything ExtendScript touches (projects, renders,
// MOGRTs, PNGs). The repo path contains Cyrillic, and AE 26.1+ mangles non-ASCII output paths.
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export function assertAscii(p) {
  if (/[^\x00-\x7f]/.test(String(p))) throw new Error('path must be ASCII: ' + p);
  return p;
}

export function workDir(env = process.env, platform = process.platform) {
  const raw = env.BRANDKIT_WORK || (platform === 'win32' ? 'C:/CRBK/work' : '/Users/Shared/CRBK/work');
  return assertAscii(String(raw).replace(/\\/g, '/'));
}

export function workPath(...parts) {
  return assertAscii(path.posix.join(workDir(), ...parts));
}

export function ensureDir(p) {
  mkdirSync(p, { recursive: true });
  return p;
}
