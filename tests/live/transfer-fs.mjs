// The disk side of the transfer check (tests/live/transfer.mjs) on the build PC: Node file operations, who holds
// a busy folder (Sysinternals handle.exe), a fresh folder for each staged copy and the note a media run leaves
// for the deferred check of Premiere (node tools/panel/live.mjs --host pr --transfer).
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { copyTree } from '../../tools/lib/copy-tree.mjs';
import { workPath } from '../../tools/lib/work.mjs';

// fs.cpSync is avoided: Node 24 on Windows crashed in it (0xC0000409).
export const nodeTransferFs = {
  exists: (p) => existsSync(p),
  files: (d) => readdirSync(d).filter((f) => statSync(path.join(d, f)).isFile()),
  reset: (d) => {
    rmSync(d, { recursive: true, force: true });
    mkdirSync(d, { recursive: true });
  },
  copy: (from, to) => (statSync(from).isDirectory() ? copyTree(from, to) : copyFileSync(from, to)),
  rename: (from, to) => renameSync(from, to),
};

export function handleHolders(p) {
  const r = spawnSync('handle', ['-accepteula', '-nobanner', p.replace(/\//g, '\\')], { encoding: 'utf8' });
  return r.status === null || r.error ? 'handle.exe not on PATH' : (r.stdout || '').trim().split(/\r?\n/).slice(0, 10).join(' | ') || 'no handle found';
}

// A new folder for each copy: Premiere keeps the media of a copy it opened until it quits, so the folder of the
// previous copy may not go. Older copies are removed when they can be.
export function freshMovedDir(host, now = new Date()) {
  const root = workPath('panel-live');
  mkdirSync(root, { recursive: true });
  for (const name of readdirSync(root).filter((n) => n === `${host}-moved` || n.startsWith(`${host}-moved-`))) {
    try {
      rmSync(path.join(root, name), { recursive: true, force: true });
    } catch {
      // still held: left for a later run
    }
  }
  return path.join(root, `${host}-moved-${now.toISOString().replace(/[-:]/g, '').slice(0, 15)}`).replace(/\\/g, '/');
}

export const stagedFile = (host) => workPath('panel-live', `${host}-transfer-staged.json`);

export function writeStaged(host, staged) {
  writeFileSync(stagedFile(host), JSON.stringify(staged, null, 2) + '\n', 'utf8');
}

export function readStaged(host) {
  const f = stagedFile(host);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
}
