import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { hexToRgb, solidPng, makeMedia, MEDIA, ffmpegArgs } from '../../spikes/fixtures/make-media.mjs';
import { hasBinary, probeMedia } from '../../tools/lib/media-probe.mjs';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'bk-media-'));
const pixel = (png, x, y) => {
  const i = (png.width * y + x) * 4;
  return Array.from(png.data.slice(i, i + 4));
};
const withFfmpeg = hasBinary('ffmpeg') && hasBinary('ffprobe');
// ffmpeg encodes take seconds on a slow machine: these two tests get 60 s instead of the default 5 s.

describe('make-media', () => {
  it('parses hex colours', () => {
    expect(hexToRgb('#0063FF')).toEqual([0, 99, 255]);
    expect(hexToRgb('FF4517')).toEqual([255, 69, 23]);
    expect(() => hexToRgb('#12345')).toThrow(/hex/);
  });

  it('draws a solid PNG of the requested size and colour', () => {
    const png = PNG.sync.read(solidPng(400, 400, '#0063FF'));
    expect([png.width, png.height]).toEqual([400, 400]);
    expect(pixel(png, 0, 0)).toEqual([0, 99, 255, 255]);
    expect(pixel(png, 399, 399)).toEqual([0, 99, 255, 255]);
  });

  it('lists every file of the fixture contract', () => {
    expect(MEDIA.map((m) => m.name)).toEqual([
      'slot_a.png', 'slot_b.png', 'bars_1080p25_30s.mp4', 'bars2_1080p25_10s.mp4',
      'alpha_prores4444_1080p25_5s.mov', 'tone_48k_5s.wav',
    ]);
    const bars = MEDIA.find((m) => m.name === 'bars_1080p25_30s.mp4');
    expect(ffmpegArgs(bars, 'o.mp4').join(' ')).toContain('testsrc2=size=1920x1080:rate=25:duration=30');
    expect(ffmpegArgs(bars, 'o.mp4').at(-1)).toBe('o.mp4');
  });

  it('writes both slot PNGs and skips ffmpeg media when ffmpeg is off', () => {
    const dir = tmp();
    const res = makeMedia({ dir, ffmpeg: false });
    const status = Object.fromEntries(res.map((r) => [r.name, r.status]));
    expect(status['slot_a.png']).toBe('created');
    expect(status['slot_b.png']).toBe('created');
    expect(status['bars_1080p25_30s.mp4']).toBe('skipped-no-ffmpeg');
    const b = PNG.sync.read(readFileSync(path.join(dir, 'slot_b.png')));
    expect([b.width, b.height]).toEqual([400, 400]);
    expect(pixel(b, 200, 200)).toEqual([255, 69, 23, 255]);
  });

  it('keeps existing files unless forced', () => {
    const dir = tmp();
    makeMedia({ dir, ffmpeg: false, only: ['slot_a.png'] });
    expect(makeMedia({ dir, ffmpeg: false, only: ['slot_a.png'] })[0].status).toBe('exists');
    expect(makeMedia({ dir, ffmpeg: false, only: ['slot_a.png'], force: true })[0].status).toBe('created');
  });

  it.skipIf(!withFfmpeg)('renders the 48 kHz stereo tone with ffmpeg', () => {
    const [r] = makeMedia({ dir: tmp(), only: ['tone_48k_5s.wav'] });
    expect(r.status).toBe('created');
    const s = probeMedia(r.file);
    expect(s.audio).toEqual({ codec: 'pcm_s16le', sampleRate: 48000, channels: 2 });
    expect(s.duration).toBeCloseTo(5, 1);
  }, 60000);

  it.skipIf(!withFfmpeg)('renders ProRes 4444 with alpha', () => {
    const [r] = makeMedia({ dir: tmp(), only: ['alpha_prores4444_1080p25_5s.mov'] });
    expect(r.status).toBe('created');
    const s = probeMedia(r.file);
    expect(s.video).toMatchObject({ codec: 'prores', profile: '4444', width: 1920, height: 1080, fps: 25 });
    expect(s.video.pixFmt).toMatch(/^yuva/);
  }, 60000);
});
