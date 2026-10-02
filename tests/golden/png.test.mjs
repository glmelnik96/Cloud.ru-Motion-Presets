import { describe, it, expect } from 'vitest';
import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { pngSize, pngComplete, waitForStableFiles } from '../../tools/golden/png.mjs';

const dir = () => mkdtempSync(path.join(os.tmpdir(), 'bk-png-'));
const pngBytes = (w, h) => PNG.sync.write(new PNG({ width: w, height: h }));

describe('png checks', () => {
  it('reads the size from the IHDR chunk', () => {
    const f = path.join(dir(), 'a.png');
    writeFileSync(f, pngBytes(1920, 1080));
    expect(pngSize(f)).toEqual({ width: 1920, height: 1080 });
  });
  it('rejects a file that is not a PNG', () => {
    const f = path.join(dir(), 'b.png');
    writeFileSync(f, 'not a png at all, just text here');
    expect(() => pngSize(f)).toThrow(/NOT_PNG/);
  });
  it('sees a PNG as complete only with its IEND chunk', () => {
    const d = dir();
    const full = pngBytes(4, 4);
    writeFileSync(path.join(d, 'full.png'), full);
    writeFileSync(path.join(d, 'cut.png'), full.subarray(0, full.length - 6));
    expect(pngComplete(path.join(d, 'full.png'))).toBe(true);
    expect(pngComplete(path.join(d, 'cut.png'))).toBe(false);
    expect(pngComplete(path.join(d, 'none.png'))).toBe(false);
  });
});

describe('waitForStableFiles', () => {
  it('waits until a file that is still being written is complete', async () => {
    const f = path.join(dir(), 'slow.png');
    const bytes = pngBytes(8, 8);
    setTimeout(() => writeFileSync(f, bytes.subarray(0, 20)), 30);
    setTimeout(() => appendFileSync(f, bytes.subarray(20)), 150);
    const sizes = await waitForStableFiles([f], { timeoutMs: 3000, intervalMs: 40 });
    expect(sizes).toEqual([bytes.length]);
  });
  it('times out with the name of a file that never arrives', async () => {
    const f = path.join(dir(), 'never.png');
    await expect(waitForStableFiles([f], { timeoutMs: 200, intervalMs: 40 })).rejects.toThrow(/WAIT_TIMEOUT: 1 of 1 .*never\.png/);
  });
});
