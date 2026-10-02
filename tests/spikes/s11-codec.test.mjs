import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  resolveNfc, encodeArgs, decodeArgs, parseProbe, parseBench, decodeFps, mbPerSec, perMegapixel,
  buildChecks, bitratesTable, formatTable, playbackCheck, S11_SOURCES,
} from '../../spikes/s11-loop-codec/lib.mjs';
import { decideVerdict } from '../../tools/spike/result.mjs';

const row = (key, w, h, ae, ks, png) => ({
  key, w, h,
  variants: {
    prores_ae: { bytes: ae.bytes, mbps: ae.bytes / 1e6 / 10, dec1Fps: 60, decNFps: 300 },
    prores_ks: { bytes: ks.bytes, mbps: ks.bytes / 1e6 / 10, dec1Fps: 40, decNFps: 250 },
    png: { bytes: png.bytes, mbps: png.bytes / 1e6 / 10, dec1Fps: png.dec1, decNFps: png.decN },
  },
});

describe('S11 helpers', () => {
  it('resolves package paths whose stored names are NFD', () => {
    const nfd = 'Оверлей 16 на 9.mov'.normalize('NFD');
    const tree = { R: ['3_Обучающие_курсы'], [path.join('R', '3_Обучающие_курсы')]: [nfd, 'x.mov'] };
    const readdir = (p) => tree[p] || [];
    expect(resolveNfc('R', '3_Обучающие_курсы/Оверлей 16 на 9.mov', readdir)).toBe(path.join('R', '3_Обучающие_курсы', nfd));
    expect(() => resolveNfc('R', 'nope/a.mov', readdir)).toThrow(/not found/);
  });
  it('lists three sources with distinct keys', () => {
    expect(S11_SOURCES.map((s) => s.key)).toEqual(['bg_1x1', 'overlay_16x9', 'intro_4k']);
  });
  it('builds ffmpeg arguments per variant', () => {
    expect(encodeArgs('png', 'in.mov', 10, 10, 'out.mov').slice(-5)).toEqual(['-c:v', 'png', '-pix_fmt', 'rgba', 'out.mov']);
    expect(encodeArgs('prores_ks', 'in.mov', 0, 10, 'o.mov')).toEqual(expect.arrayContaining(['prores_ks', '4444', 'yuva444p10le']));
    expect(encodeArgs('prores_ae', 'in.mov', 60, 10, 'o.mov').slice(-3)).toEqual(['-c', 'copy', 'o.mov']);
    expect(() => encodeArgs('h264', 'a', 0, 1, 'b')).toThrow(/unknown variant/);
    expect(decodeArgs('f.mov', 1)).toEqual(['-hide_banner', '-nostdin', '-benchmark', '-threads', '1', '-i', 'f.mov', '-map', '0:v:0', '-f', 'null', '-']);
    expect(decodeArgs('f.mov', 0)).not.toContain('-threads');
  });
  it('parses ffprobe output and ffmpeg benchmark lines', () => {
    expect(parseProbe('{"streams":[{"width":1440,"height":1440,"r_frame_rate":"25/1","nb_frames":"250"}],"format":{"duration":"10.0"}}'))
      .toEqual({ w: 1440, h: 1440, fps: 25, frames: 250, duration: 10 });
    expect(parseProbe({ streams: [{ width: 8, height: 8, r_frame_rate: '25/1' }], format: { duration: '7.000000' } }).frames).toBe(175);
    const err = 'frame=  120 fps=0.0 q=-0.0 size=N/A\rframe=  250 fps=240 q=-0.0 Lsize=N/A speed=9.6x\nbench: utime=3.210s stime=0.120s rtime=1.042s\nbench: maxrss=123456KiB\n';
    expect(parseBench(err)).toEqual({ utime: 3.21, stime: 0.12, rtime: 1.042, frames: 250 });
    expect(parseBench('nothing')).toEqual({ utime: null, stime: null, rtime: null, frames: null });
    expect(decodeFps(250, 2)).toBe(125);
    expect(decodeFps(250, 0)).toBe(null);
  });
  it('computes MB/s and MB/s per megapixel', () => {
    expect(mbPerSec(158_000_000, 250)).toBeCloseTo(15.8);
    expect(perMegapixel(15.8, 1440, 1440)).toBeCloseTo(7.62, 2);
    expect(mbPerSec(1, 0)).toBe(null);
  });
  it('passes when png is light and decodes in real time', () => {
    const rows = [row('bg_1x1', 1440, 1440, { bytes: 158e6 }, { bytes: 200e6 }, { bytes: 30e6, dec1: 30, decN: 200 })];
    expect(decideVerdict(buildChecks(rows, 'win32'))).toBe('yes');
  });
  it('is partial when png only misses real time on one thread', () => {
    const rows = [row('intro_4k', 3840, 2160, { bytes: 250e6 }, { bytes: 300e6 }, { bytes: 60e6, dec1: 12, decN: 90 })];
    expect(decideVerdict(buildChecks(rows, 'win32'))).toBe('partial');
  });
  it('fails when png is not at least 2x lighter than the AE render', () => {
    const rows = [row('intro_4k', 3840, 2160, { bytes: 100e6 }, { bytes: 300e6 }, { bytes: 80e6, dec1: 30, decN: 90 })];
    const checks = buildChecks(rows, 'win32');
    expect(decideVerdict(checks)).toBe('no');
    expect(checks[0].detail).toContain('gain 1.25x');
  });
  it('turns playback observations into checks', () => {
    expect(playbackCheck({ tag: 'win32', app: 'pr', variant: 'png', key: 'intro_4k', value: '0' }))
      .toEqual({ name: 'win32 pr: real-time playback without dropped frames, png, intro_4k', pass: true, required: true, detail: 'dropped 0 frames' });
    expect(playbackCheck({ tag: 'win32', app: 'pr', variant: 'prores_ks', key: 'bg_1x1', value: '4' })).toMatchObject({ pass: false, required: false });
    expect(playbackCheck({ tag: 'darwin', app: 'ae', variant: 'png', key: 'bg_1x1', value: '24.6' })).toMatchObject({ pass: true, required: false, detail: 'first pass 24.6 fps' });
    expect(playbackCheck({ tag: 'win32', app: 'ae', variant: 'png', key: 'bg_1x1', value: '17' }).pass).toBe(false);
    expect(() => playbackCheck({ tag: 'win32', app: 'ps', variant: 'png', key: 'bg_1x1', value: '0' })).toThrow(/pr or ae/);
    expect(() => playbackCheck({ tag: 'win32', app: 'pr', variant: 'h264', key: 'bg_1x1', value: '0' })).toThrow(/png or prores_ks/);
    expect(() => playbackCheck({ tag: 'win32', app: 'pr', variant: 'png', key: 'nope', value: '0' })).toThrow(/unknown source/);
  });
  it('writes the bitrate table for the weight estimate', () => {
    const rows = [
      row('bg_1x1', 1440, 1440, { bytes: 158e6 }, { bytes: 200e6 }, { bytes: 30e6, dec1: 30, decN: 200 }),
      row('overlay_16x9', 1920, 1080, { bytes: 26e6 }, { bytes: 90e6 }, { bytes: 5e6, dec1: 90, decN: 400 }),
    ];
    const t = bitratesTable(rows, { date: '2026-10-05', platform: 'win32' });
    expect(t.unit).toMatch(/per megapixel/);
    expect(t.codecs.prores_ae.samples[0]).toEqual({ key: 'bg_1x1', w: 1440, h: 1440, mbPerSec: 15.8, mbPerSecPerMp: 7.62 });
    expect(t.codecs.prores_ae.max).toBe(7.62);
    expect(t.codecs.png.mean).toBeCloseTo((30 / 10 / 2.0736 + 5 / 10 / 2.0736) / 2, 2);
    expect(formatTable(rows)).toHaveLength(7);
  });
});
