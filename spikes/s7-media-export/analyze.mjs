// S7 analysis (pure, unit-tested in tests/spikes/s7-analyze.test.mjs): alpha, the brand exports,
// "fit to window", Crop through QE and the blur of the template adjustment layer.
import { findColorCentroid } from '../../tools/png/read-png.mjs';
import { diffFraction, diffBox, tileMap } from '../../tools/png/frame-diff.mjs';
import { nodeCheck } from '../../tools/spike/multistage.mjs';

export const STILL_HEX = '#FF4517'; // slot_b.png, 400x400 (fixture contract, part B)
export const WINDOW = { x: 100, y: 100, w: 600, h: 600 }; // where the still has to land
export const WIDE_WINDOW = { x: 1100, y: 150, w: 720, h: 405 }; // a 16:9 window for bars2 (read back only)
export const CROP_LEFT = 50; // percent, through the first Crop parameter
export const EXPORT_RANGE = { inSec: 0, outSec: 5 }; // In/Out of the exports: the alpha clip and the tone

// The alpha clip at its second second against the same frame before it was placed. Whatever the box
// looks like, an honoured alpha changes a small part of the picture; an ignored one paints most of it.
export function alphaChecks(before, after) {
  const fraction = diffFraction(before, after, null, 12);
  const box = diffBox(before, after, 12).box;
  return [
    nodeCheck('media: the ProRes 4444 clip shows over the bars', fraction > 0.001, { fraction, box }),
    nodeCheck('media: alpha honoured, the clip covers only its box', fraction > 0.001 && fraction < 0.25, { fraction, box }),
  ];
}

// "mean_volume: -21.0 dB" from ffmpeg -af volumedetect; null when the line is missing.
export function parseMeanVolume(stderr) {
  const m = /mean_volume:\s*(-?(?:\d+(?:\.\d+)?|inf))\s*dB/.exec(String(stderr));
  if (!m) return null;
  return m[1] === '-inf' ? -Infinity : Number(m[1]);
}

// probe: probeMedia() of tools/lib/media-probe.mjs (part B) for an export of EXPORT_RANGE with FullHD.epr.
export function exportChecks(key, probe, meanVolume, required = true) {
  const v = (probe && probe.video) || {};
  const a = (probe && probe.audio) || {};
  const want = EXPORT_RANGE.outSec - EXPORT_RANGE.inSec;
  const ok = Boolean(probe) && v.codec === 'h264' && v.width === 1920 && v.height === 1080 && Math.abs(v.fps - 25) < 0.01
    && Math.abs(probe.duration - want) <= 0.1 && a.codec === 'aac' && a.sampleRate === 48000 && a.channels === 2;
  return [
    nodeCheck(key + ': H.264 1920x1080, 25 fps, ' + want + ' s, AAC 48 kHz stereo', ok, probe, required),
    nodeCheck(key + ': the 1 kHz tone is in the export (mean volume above -40 dB)',
      typeof meanVolume === 'number' && meanVolume > -40, { meanVolume }, false),
  ];
}

// The still as it arrives: centred, drawn at the Scale it got (100, or more with "Set to frame size").
// baseW is its width at Scale 100, the base of the Scale in the recipe.
export function baseOfStill(img, currentScale = 100) {
  const c = findColorCentroid(img, STILL_HEX, 16);
  const centred = c.box !== null && Math.abs(c.x - 960) <= 2 && Math.abs(c.y - 540) <= 2 && c.box.w === c.box.h;
  const baseW = c.box && currentScale > 0 ? (c.box.w * 100) / currentScale : null;
  return {
    check: nodeCheck('fit: the still arrives as a centred square, its size measured', centred, { ...c, currentScale, baseW }),
    baseW,
  };
}

export function fitChecks(fitWindow, fitCrop) {
  const checks = [];
  const name1 = 'fit: the still lands on the window ' + WINDOW.x + ',' + WINDOW.y + ' ' + WINDOW.w + 'x' + WINDOW.h;
  const name2 = 'crop: Crop left ' + CROP_LEFT + ' % added through QE cuts the left half of the window';
  if (fitWindow) {
    const c = findColorCentroid(fitWindow, STILL_HEX, 16);
    checks.push(nodeCheck(name1, c.box !== null && Math.abs(c.x - (WINDOW.x + WINDOW.w / 2)) <= 3
      && Math.abs(c.y - (WINDOW.y + WINDOW.h / 2)) <= 3 && Math.abs(c.box.w - WINDOW.w) <= 4 && Math.abs(c.box.h - WINDOW.h) <= 4, c));
  } else {
    checks.push(nodeCheck(name1, false, 'frame fitWindow missing'));
  }
  if (fitCrop) {
    const c = findColorCentroid(fitCrop, STILL_HEX, 16);
    const cut = WINDOW.x + (WINDOW.w * CROP_LEFT) / 100;
    checks.push(nodeCheck(name2, c.box !== null && Math.abs(c.box.x0 - cut) <= 4
      && Math.abs(c.box.x1 - (WINDOW.x + WINDOW.w - 1)) <= 4 && Math.abs(c.box.h - WINDOW.h) <= 4, c));
  } else {
    checks.push(nodeCheck(name2, false, 'frame fitCrop missing (Crop through QE did not happen?)'));
  }
  return checks;
}

// Before and after the template adjustment layer over SMPTE bars (vertical edges across the top two thirds).
export function blurChecks(before, after) {
  const t = tileMap(before, after);
  return [
    nodeCheck('template: the adjustment layer blurs the picture below it', t.blurred >= 2, t),
    nodeCheck('template: its inverted mask keeps part of the picture sharp', t.sharp >= 1, t, false),
  ];
}
