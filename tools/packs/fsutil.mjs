// File helpers shared by the pack tools: walk a tree, hash a file, classify package paths.
import { createReadStream, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

// Folders that hold finished renders of the package (spec §2: 18 .mov files, 12.9 GB).
export const RENDER_DIRS = ['render', 'render overlays', 'ready mov'];

// Relative POSIX paths of every regular file under root, sorted. Names are kept exactly as on
// disk (Mac NFD names stay NFD). Symlinks and junctions are skipped.
export function walkFiles(root) {
  const out = [];
  const visit = (rel) => {
    for (const e of readdirSync(rel ? path.join(root, rel) : root, { withFileTypes: true })) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) visit(r);
      else if (e.isFile()) out.push(r);
    }
  };
  visit('');
  return out.sort();
}

export function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(file)
      .on('error', reject)
      .on('data', (chunk) => h.update(chunk))
      .on('end', () => resolve(h.digest('hex')));
  });
}

export function isRenderPath(rel) {
  return rel.split('/').slice(0, -1)
    .some((seg) => RENDER_DIRS.includes(seg.normalize('NFC').toLowerCase()));
}

// macOS metadata: no project references it.
export function isMacJunk(rel) {
  const parts = rel.split('/');
  const name = parts[parts.length - 1];
  return name.startsWith('._') || name === '.DS_Store' || parts.includes('__MACOSX');
}
