// Video references (tools/refs/refs.mjs): the list, the parsing of what ffmpeg prints, the spans of motion, and
// a whole analysis of a synthetic clip — a green box that moves from 1.0 to 1.6 s, then a cut to white at 2 s.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { addRef, analyze, motionSpans, parseShowinfo, parseYavg, slugOk, videoOf } from '../../tools/refs/refs.mjs';

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

describe('references: the list', () => {
  it('a link or a file under a slug, once', () => {
    const list = { refs: [] };
    addRef(list, { source: 'https://www.youtube.com/watch?v=abc', slug: 'kinetic-titles', note: '0:12 — подъём текста' });
    addRef(list, { source: 'C:\\refs\\glitch.mp4', slug: 'glitch' });
    expect(list.refs.map((r) => [r.slug, r.url, r.file])).toEqual([['kinetic-titles', 'https://www.youtube.com/watch?v=abc', null], ['glitch', null, 'C:/refs/glitch.mp4']]);
    expect(() => addRef(list, { source: 'x.mp4', slug: 'glitch' })).toThrow(/уже есть/);
    expect(slugOk('Кириллица')).toBe(false);
    expect(slugOk('a')).toBe(false);
  });

  it('the video of a link is what fetch left under its slug', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-refs-'));
    expect(videoOf({ slug: 'x', url: 'https://a' }, dir)).toBeNull();
  });
});

describe('references: ffmpeg output', () => {
  it('scene changes and the energy per frame', () => {
    expect(parseShowinfo('[Parsed_showinfo_1 @ 0x] n:   0 pts:  50 pts_time:2       duration:1\n[Parsed_showinfo_1 @ 0x] n:   1 pts: 90 pts_time:3.6 ')).toEqual([2, 3.6]);
    expect(parseYavg('frame:0    pts:0       pts_time:0\nlavfi.signalstats.YAVG=0\nframe:1    pts:1       pts_time:0.04\nlavfi.signalstats.YAVG=2.5\n')).toEqual([{ t: 0, e: 0 }, { t: 0.04, e: 2.5 }]);
  });

  it('spans of motion above a quarter of the peak, a cut left out', () => {
    const curve = [0, 0, 4, 8, 8, 4, 0, 0, 0, 200, 0].map((e, i) => ({ t: i * 0.04, e }));
    expect(motionSpans(curve, { cuts: [0.36] })).toEqual([{ start: 0.08, end: 0.2, peak: 8, peakAt: 0.12, dur: 0.12 }]);
    expect(motionSpans(curve)[0]).toMatchObject({ start: 0.36, peak: 200 });
    expect(motionSpans([{ t: 0, e: 0 }])).toEqual([]);
  });
});

describe.skipIf(!hasFfmpeg)('references: analysis of a clip', () => {
  it('probe, sheet, the cut, the move and a strip', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-refs-'));
    const clip = path.join(dir, 'ref.mp4');
    spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x222222:s=320x180:d=4,format=yuv420p', '-f', 'lavfi', '-i', 'color=c=0x26D07C:s=60x60:d=4',
      '-filter_complex', "[0][1]overlay=x='if(lt(t,1),20,if(lt(t,1.6),20+(t-1)/0.6*200,220))':y=60,trim=0:2[a];color=c=white:s=320x180:d=2,format=yuv420p[b];[a][b]concat=n=2:v=1[v]",
      '-map', '[v]', '-r', '25', clip]);
    const out = path.join(dir, 'out');
    const r = analyze(clip, out, { strips: [[0.8, 1.2]] });
    expect(r.info).toMatchObject({ w: 320, h: 180, fps: 25, duration: 4, audio: false });
    expect(r.cuts).toEqual([2]);
    expect(r.spans).toHaveLength(1);
    expect(r.spans[0].start).toBeGreaterThanOrEqual(0.96);
    expect(r.spans[0].end).toBeLessThanOrEqual(1.64);
    for (const f of ['probe.json', 'sheet.jpg', 'cuts.json', 'cuts.jpg', 'motion.json', 'strip-0_8.jpg', 'notes.md']) expect(existsSync(path.join(out, f)), f).toBe(true);
    expect(readFileSync(path.join(out, 'notes.md'), 'utf8')).toContain('Склейки: 00:02.00.');
  });
});
