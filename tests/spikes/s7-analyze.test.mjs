import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import {
  alphaChecks, parseMeanVolume, exportChecks, baseOfStill, fitChecks, blurChecks,
} from '../../spikes/s7-media-export/analyze.mjs';

const W = 1920;
const H = 1080;
function frame(paint) {
  const img = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const [r, g, b] = paint(x, y);
      const i = (y * W + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  return img;
}
const inside = (x, y, x0, y0, w, h) => x >= x0 && x < x0 + w && y >= y0 && y < y0 + h;
const stripes = (x) => (Math.floor(x / 30) % 2 ? [230, 230, 230] : [20, 20, 20]);
const BLACK = [0, 0, 0];
const ORANGE = [255, 69, 23];
const GREEN = [38, 208, 124];
const GOOD = { duration: 5.0, video: { codec: 'h264', width: 1920, height: 1080, fps: 25 }, audio: { codec: 'aac', sampleRate: 48000, channels: 2 } };

describe('S7 analysis', () => {
  it('sees an alpha clip over the picture, and a clip whose alpha was ignored', () => {
    const before = frame((x) => stripes(x));
    const after = frame((x, y) => (inside(x, y, 700, 440, 200, 200) ? GREEN : stripes(x)));
    expect(alphaChecks(before, after).map((c) => c.pass)).toEqual([true, true]);
    const opaque = frame((x, y) => (inside(x, y, 700, 440, 200, 200) ? GREEN : BLACK));
    expect(alphaChecks(before, opaque).map((c) => c.pass)).toEqual([true, false]);
  });

  it('reads the mean volume printed by ffmpeg volumedetect', () => {
    expect(parseMeanVolume('[Parsed_volumedetect_0 @ 0x1] mean_volume: -21.1 dB\n[...] max_volume: -18.1 dB')).toBe(-21.1);
    expect(parseMeanVolume('mean_volume: -inf dB')).toBe(-Infinity);
    expect(parseMeanVolume('no audio')).toBe(null);
  });

  it('checks an export of 5 s against the brand preset', () => {
    expect(exportChecks('direct', GOOD, -21).map((c) => [c.pass, c.required])).toEqual([[true, true], [true, false]]);
    expect(exportChecks('ame', { ...GOOD, video: { ...GOOD.video, fps: 24 } }, -91, false).map((c) => [c.pass, c.required]))
      .toEqual([[false, false], [false, false]]);
    expect(exportChecks('direct', null, null)[0].pass).toBe(false);
  });

  it('measures the base size of the still at Scale 100', () => {
    const img = frame((x, y) => (inside(x, y, 760, 340, 400, 400) ? ORANGE : BLACK));
    const r = baseOfStill(img);
    expect(r.check.pass).toBe(true);
    expect(r.baseW).toBe(400);
    expect(baseOfStill(img, 50).baseW).toBe(800);
  });

  it('checks fit to window and the crop', () => {
    const fit = frame((x, y) => (inside(x, y, 100, 100, 600, 600) ? ORANGE : BLACK));
    const crop = frame((x, y) => (inside(x, y, 400, 100, 300, 600) ? ORANGE : BLACK));
    expect(fitChecks(fit, crop).map((c) => c.pass)).toEqual([true, true]);
    const off = frame((x, y) => (inside(x, y, 660, 240, 600, 600) ? ORANGE : BLACK));
    expect(fitChecks(off, null).map((c) => c.pass)).toEqual([false, false]);
  });

  it('maps a blur that spares the centre', () => {
    const before = frame((x) => stripes(x));
    const after = frame((x, y) => (inside(x, y, 480, 270, 960, 540) ? stripes(x) : [128, 128, 128]));
    expect(blurChecks(before, after).map((c) => c.pass)).toEqual([true, true]);
    expect(blurChecks(before, before).map((c) => c.pass)).toEqual([false, true]);
  });
});
