import { describe, it, expect } from 'vitest';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { snapshot, verifySnapshot, MANIFEST } from '../../tools/packs/snapshot.mjs';
import { walkFiles } from '../../tools/packs/fsutil.mjs';

const NFD = 'Подписывайтесь.wav'.normalize('NFD');

function makeSource() {
  const src = mkdtempSync(path.join(os.tmpdir(), 'bk-src-'));
  const put = (rel, body) => {
    mkdirSync(path.dirname(path.join(src, rel)), { recursive: true });
    writeFileSync(path.join(src, rel), body);
  };
  put('1_Logo/Logo.aep', 'aep-bytes');
  put('6_Pod/(Footage)/SFX/' + NFD, 'wav-bytes');
  put('4_SMM/Render/BG/bg.mov', 'mov-1');
  put('6_Pod/Ready mov/OUTRO.mov', 'mov-2');
  return src;
}
const tmpDest = () => path.join(mkdtempSync(path.join(os.tmpdir(), 'bk-arc-')), 'archive');
const snapshotOf = (src) => walkFiles(src).map((rel) => rel + '=' + readFileSync(path.join(src, rel), 'utf8'));

describe('snapshot', () => {
  it('copies every file, hashes it, keeps NFD names and leaves the source untouched', async () => {
    const src = makeSource();
    const before = snapshotOf(src);
    const dest = tmpDest();
    const m = await snapshot({ src, dest });
    expect(m.totals.files).toBe(4);
    expect(m.excluded).toEqual([]);
    const wav = m.files.find((f) => f.path.endsWith('.wav'));
    expect(wav.path).toBe('6_Pod/(Footage)/SFX/' + NFD);
    expect(wav.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(readFileSync(path.join(dest, '1_Logo/Logo.aep'), 'utf8')).toBe('aep-bytes');
    expect(statSync(path.join(dest, '1_Logo/Logo.aep')).mode & 0o222).toBe(0);
    expect(snapshotOf(src)).toEqual(before);
  });

  it('skips the render folders with --exclude-renders and lists them', async () => {
    const m = await snapshot({ src: makeSource(), dest: tmpDest(), excludeRenders: true });
    expect(m.totals.files).toBe(2);
    expect(m.excluded.map((f) => f.path)).toEqual(['4_SMM/Render/BG/bg.mov', '6_Pod/Ready mov/OUTRO.mov']);
  });

  it('verifies a good archive and catches a changed, a missing and an extra file', async () => {
    const dest = tmpDest();
    await snapshot({ src: makeSource(), dest });
    expect((await verifySnapshot({ dest })).ok).toBe(true);
    const aep = path.join(dest, '1_Logo/Logo.aep');
    chmodSync(aep, 0o644);
    writeFileSync(aep, 'tampered!');
    const wav = path.join(dest, '6_Pod/(Footage)/SFX/' + NFD);
    chmodSync(wav, 0o644);
    rmSync(wav);
    writeFileSync(path.join(dest, 'stray.txt'), 'x');
    const r = await verifySnapshot({ dest });
    expect(r.ok).toBe(false);
    expect(r.problems.map((p) => p.path + ': ' + p.problem).sort()).toEqual([
      '1_Logo/Logo.aep: sha256 mismatch',
      '6_Pod/(Footage)/SFX/' + NFD + ': missing',
      'stray.txt: not in manifest',
    ]);
  });

  it('refuses to overwrite a finished archive', async () => {
    const src = makeSource();
    const dest = tmpDest();
    await snapshot({ src, dest });
    expect(readFileSync(path.join(dest, MANIFEST), 'utf8')).toContain('"excludeRenders": false');
    await expect(snapshot({ src, dest })).rejects.toThrow(/ARCHIVE_EXISTS/);
  });
});
