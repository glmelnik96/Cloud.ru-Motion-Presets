import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { framePlan, compDone, gateReason, previewItems, orderManifest } from '../../tools/golden/render.mjs';
import { lastProgress, previewOk, runWatched, aerenderPath } from '../../tools/golden/aerender.mjs';

const root = { id: 691, name: 'Заставка', compSlug: 'zastavka', width: 3840, height: 2160, fps: 25, duration: 7, markers: [] };

describe('golden plan', () => {
  it('names every key frame t<ms>.png in the comp folder', () => {
    const plan = framePlan('podcast', root);
    expect(plan[1]).toMatchObject({ f: 6, ms: 240 });
    expect(plan[1].file).toMatch(/\/golden\/podcast\/zastavka\/t240\.png$/);
    expect(plan[plan.length - 1]).toMatchObject({ f: 174, ms: 6960 });
  });
  it('treats a comp as done only when every listed PNG is there with its size', () => {
    const d = mkdtempSync(path.join(os.tmpdir(), 'bk-done-'));
    const plan = [{ f: 0, ms: 0, file: path.join(d, 't0.png') }, { f: 6, ms: 240, file: path.join(d, 't240.png') }];
    writeFileSync(plan[0].file, 'aaaa');
    writeFileSync(plan[1].file, 'bbbbbb');
    const entry = { frames: [{ ms: 0, bytes: 4 }, { ms: 240, bytes: 6 }] };
    expect(compDone(entry, plan)).toBe(true);
    expect(compDone({ frames: [{ ms: 0, bytes: 4 }, { ms: 240, bytes: 7 }] }, plan)).toBe(false);
    expect(compDone({ frames: [{ ms: 0, bytes: 4 }] }, plan)).toBe(false);
    expect(compDone(undefined, plan)).toBe(false);
  });
  it('explains why a pack is not rendered', () => {
    expect(gateReason({ goldenOk: true })).toBe(null);
    expect(gateReason({
      goldenOk: false, missing: [{ name: '3D.png' }, { name: 'slide_01.png' }], external: [], usedSubstitutes: [], suspiciousFonts: [],
    })).toBe('missing footage: 3D.png, slide_01.png');
  });
  it('writes manifest keys in a fixed, readable order', () => {
    expect(Object.keys(orderManifest({ comps: [], extra: 1, slug: 'logo', status: 'ok', date: 'd' })))
      .toEqual(['slug', 'status', 'date', 'comps', 'extra']);
  });
  it('queues a preview of every ROOT comp, only the first 60 s of a longer one', () => {
    const items = previewItems('courses', [root, { ...root, id: 5, compSlug: 'overley_16_na_9', duration: 3600 }]);
    expect(items.map((it) => [it.id, it.span])).toEqual([[691, 7], [5, 60]]);
    expect(items[0].out).toMatch(/\/golden\/courses\/zastavka\/preview_half\.mp4$/);
    expect(items[1].out).toMatch(/\/golden\/courses\/overley_16_na_9\/preview_half\.mp4$/);
    expect(previewOk({ width: 1920, height: 1080, duration: 60 }, { ...root, duration: items[1].span })).toBe(true);
  });
});

describe('aerender helpers', () => {
  it('reads the last frame number from aerender progress lines', () => {
    expect(lastProgress('PROGRESS:  0:00:00:05 (6): 0 Seconds\nPROGRESS:  0:00:00:06 (7): 1 Seconds\n')).toBe('0:00:00:06#7');
    expect(lastProgress('PROGRESS: Total Time Elapsed: 2 Seconds')).toBe(null);
  });
  it('accepts a preview at half size and full duration only', () => {
    const comp = { width: 3840, height: 2160, fps: 25, duration: 10 };
    expect(previewOk({ width: 1920, height: 1080, duration: 10.0 }, comp)).toBe(true);
    expect(previewOk({ width: 3840, height: 2160, duration: 10.0 }, comp)).toBe(false);
    expect(previewOk({ width: 1920, height: 1080, duration: 9.5 }, comp)).toBe(false);
    expect(previewOk({ width: 406, height: 40, duration: 2 }, { width: 815, height: 80, fps: 25, duration: 2 })).toBe(true);
    expect(previewOk(null, comp)).toBe(false);
  });
  it('defaults to the AE 2026 aerender', () => {
    expect(aerenderPath({}, 'win32')).toBe('C:/Program Files/Adobe/Adobe After Effects 2026/Support Files/aerender.exe');
    expect(aerenderPath({ BRANDKIT_AERENDER: 'X:/ae/aerender.exe' }, 'win32')).toBe('X:/ae/aerender.exe');
  });
});

describe('runWatched', () => {
  const logFile = () => {
    const d = mkdtempSync(path.join(os.tmpdir(), 'bk-ae-'));
    mkdirSync(d, { recursive: true });
    return path.join(d, 'aerender.log');
  };
  const hang = 'console.log("PROGRESS:  0:00:00:01 (1): 0 Seconds"); setInterval(() => {}, 1000);';
  it('kills a render whose frame number stops moving', async () => {
    const r = await runWatched({ exe: process.execPath, args: ['-e', hang], logFile: logFile(), stallMs: 300, pollMs: 50 });
    expect(r.reason).toBe('stall');
  });
  it('accepts finished files from a process that hangs in finalisation', async () => {
    const r = await runWatched({ exe: process.execPath, args: ['-e', hang], logFile: logFile(), isDone: async () => true, pollMs: 50, graceMs: 100 });
    expect(r.reason).toBe('done-but-hanging');
  });
  it('lets a normal render exit on its own', async () => {
    const r = await runWatched({ exe: process.execPath, args: ['-e', 'console.log("PROGRESS:  0:00:00:01 (1): 0 Seconds")'], logFile: logFile(), pollMs: 50 });
    expect(r).toMatchObject({ code: 0, reason: null });
  });
});
