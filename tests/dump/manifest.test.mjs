import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildManifest, listFiles } from '../../tools/dump/manifest.mjs';

function tree() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'bk-man-'));
  const put = (rel, text) => {
    const p = path.join(root, ...rel.split('/'));
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, text);
  };
  put('smm/bg/t0.png', 'b');
  put('logo/shot/t500.png', 'a2');
  put('logo/shot/t0.png', 'a1');
  put('logo/shot/notes.txt', 'x');
  put('logo.tmp/shot/t0.png', 'half-written');
  return root;
}

describe('manifest', () => {
  it('lists matching files with POSIX paths, sorted, without *.tmp folders', () => {
    expect(listFiles(tree(), (n) => n.endsWith('.png'))).toEqual(['logo/shot/t0.png', 'logo/shot/t500.png', 'smm/bg/t0.png']);
    expect(listFiles(path.join(os.tmpdir(), 'bk-no-such-dir'))).toEqual([]);
  });

  it('records size and sha256 per file and totals per slug', () => {
    const m = buildManifest(tree(), { filter: (n) => n.endsWith('.png'), now: () => new Date('2026-10-05T10:00:00Z') });
    expect(m).toMatchObject({ generated: '2026-10-05T10:00:00.000Z', count: 3, bytes: 5, bySlug: { logo: { files: 2, bytes: 4 }, smm: { files: 1, bytes: 1 } } });
    expect(m.files[0]).toEqual({ path: 'logo/shot/t0.png', bytes: 2, sha256: createHash('sha256').update('a1').digest('hex') });
  });
});
