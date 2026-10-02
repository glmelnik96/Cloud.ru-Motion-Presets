import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, appendFileSync, utimesSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { waitStableFile, findNewFiles, waitNewStableFiles } from '../../tools/spike/wait-file.mjs';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'bk-wait-'));

describe('wait-file', () => {
  it('waits until a growing file stops changing', async () => {
    const f = path.join(tmp(), 'a.mogrt');
    setTimeout(() => writeFileSync(f, 'x'), 50);
    setTimeout(() => appendFileSync(f, 'yy'), 150);
    const r = await waitStableFile(f, { stableMs: 300, timeoutMs: 3000, intervalMs: 20 });
    expect(r.ok).toBe(true);
    expect(r.size).toBe(3);
    expect(r.waitedMs).toBeGreaterThanOrEqual(400);
  });

  it('reports a missing file after the timeout', async () => {
    const r = await waitStableFile(path.join(tmp(), 'none.mogrt'), { stableMs: 50, timeoutMs: 200, intervalMs: 20 });
    expect(r).toMatchObject({ ok: false, reason: 'missing' });
  });

  it('ignores a stale file until it is rewritten', async () => {
    const f = path.join(tmp(), 'old.mogrt');
    writeFileSync(f, 'old');
    const past = new Date(Date.now() - 60000);
    utimesSync(f, past, past);
    const since = Date.now() - 1000;
    const stale = await waitStableFile(f, { stableMs: 50, timeoutMs: 200, intervalMs: 20, sinceMs: since });
    expect(stale).toMatchObject({ ok: false, reason: 'not updated' });
    setTimeout(() => writeFileSync(f, 'new!'), 50);
    const fresh = await waitStableFile(f, { stableMs: 100, timeoutMs: 3000, intervalMs: 20, sinceMs: since });
    expect(fresh).toMatchObject({ ok: true, size: 4 });
  });

  it('finds new files by extension, recursively', () => {
    const d = tmp();
    mkdirSync(path.join(d, 'sub'));
    writeFileSync(path.join(d, 'sub', 'out.MP4'), 'v');
    writeFileSync(path.join(d, 'log.txt'), 't');
    expect(findNewFiles(d, { exts: ['.mp4'] }).map((p) => path.basename(p))).toEqual(['out.MP4']);
    expect(findNewFiles(d, { exts: ['.mp4'], sinceMs: Date.now() + 60000 })).toEqual([]);
  });

  it('waits for a new file to appear and settle', async () => {
    const d = tmp();
    const since = Date.now() - 1000;
    setTimeout(() => writeFileSync(path.join(d, 'job.mp4'), 'abc'), 100);
    const r = await waitNewStableFiles(d, { exts: ['.mp4'], sinceMs: since, stableMs: 100, timeoutMs: 3000, intervalMs: 20 });
    expect(r.ok).toBe(true);
    expect(r.files).toHaveLength(1);
    expect(r.files[0].size).toBe(3);
  });

  it('gives up when nothing appears', async () => {
    const r = await waitNewStableFiles(tmp(), { exts: ['.mp4'], stableMs: 50, timeoutMs: 200, intervalMs: 20 });
    expect(r).toMatchObject({ ok: false, reason: 'no new file' });
  });
});
