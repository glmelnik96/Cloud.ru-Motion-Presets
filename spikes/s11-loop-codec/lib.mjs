// Helpers for spike S11 (T2 loop codec: ProRes 4444 against PNG in MOV). Pure except resolveNfc's default readdir.
import { readdirSync } from 'node:fs';
import path from 'node:path';

export const S11_ID = 'S11';
export const S11_TITLE = 'Кодек петель T2';
export const S11_FALLBACK = 'ProRes 4444 и сокращённая матрица T2 (D24)';
export const FPS = 25;
export const MB = 1e6;            // MB = 10^6 bytes everywhere in S11 and in bitrates.json
export const MIN_GAIN = 2;        // PNG must be at least 2x lighter than the AE ProRes render (package estimate: 3-9x)
export const REALTIME_FPS = 25;
export const VARIANTS = ['prores_ae', 'prores_ks', 'png'];

// Three renders of the package (read only). startSec picks a typical stretch, not the intro.
export const S11_SOURCES = [
  { key: 'bg_1x1', rel: '4_SMM_Pack/Render/BG/BG_pattern_1x1_1.mov', startSec: 10, label: 'SMM фон 1440×1440' },
  { key: 'overlay_16x9', rel: '3_Обучающие_курсы/3_Обучающие курсы/Render Overlays/FullHD/Оверлей 16 на 9.mov', startSec: 60, label: 'оверлей курсов 1920×1080' },
  { key: 'intro_4k', rel: '6_Podcast_Cloud.ru_Pack/Ready mov/Заставка_ПОДКАСТ_CLOUD.RU.mov', startSec: 0, label: 'интро подкаста 3840×2160 (весь файл, 7 с)' },
];

// Walk the path segment by segment, comparing NFC forms: some package names are NFD (saved on a Mac).
export function resolveNfc(root, rel, readdir = readdirSync) {
  let cur = root;
  for (const seg of rel.split('/')) {
    const want = seg.normalize('NFC');
    const hit = readdir(cur).find((e) => String(e).normalize('NFC') === want);
    if (hit === undefined) throw new Error(`not found: "${seg}" in ${cur}`);
    cur = path.join(cur, hit);
  }
  return cur;
}

// variant: prores_ae = stream copy of the AE render (its real bitrate), prores_ks = ffmpeg ProRes 4444
// with alpha, png = PNG in MOV with alpha.
export function encodeArgs(variant, src, startSec, seconds, out) {
  const head = ['-y', '-hide_banner', '-nostdin', '-loglevel', 'error', '-ss', String(startSec), '-i', src,
    '-t', String(seconds), '-map', '0:v:0', '-an'];
  if (variant === 'prores_ae') return head.concat(['-c', 'copy', out]);
  if (variant === 'prores_ks') return head.concat(['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', out]);
  if (variant === 'png') return head.concat(['-c:v', 'png', '-pix_fmt', 'rgba', out]);
  throw new Error('unknown variant: ' + variant);
}

// threads: 1 for a single decoder thread, 0 for the ffmpeg default.
export function decodeArgs(file, threads) {
  return ['-hide_banner', '-nostdin', '-benchmark']
    .concat(threads ? ['-threads', String(threads)] : [])
    .concat(['-i', file, '-map', '0:v:0', '-f', 'null', '-']);
}

export function parseProbe(json) {
  const j = typeof json === 'string' ? JSON.parse(json) : json;
  const s = (j.streams || [])[0] || {};
  const [num, den] = String(s.r_frame_rate || '0/1').split('/').map(Number);
  const fps = den ? num / den : 0;
  const duration = Number((j.format || {}).duration);
  const frames = Number(s.nb_frames) > 0 ? Number(s.nb_frames) : Math.round(duration * fps);
  return { w: Number(s.width), h: Number(s.height), fps, frames, duration };
}

export function parseBench(stderr) {
  const s = String(stderr);
  const b = /bench:\s*utime=([\d.]+)s\s+stime=([\d.]+)s\s+rtime=([\d.]+)s/.exec(s);
  const frames = [...s.matchAll(/frame=\s*(\d+)/g)].map((m) => Number(m[1]));
  return {
    utime: b ? Number(b[1]) : null,
    stime: b ? Number(b[2]) : null,
    rtime: b ? Number(b[3]) : null,
    frames: frames.length ? frames[frames.length - 1] : null,
  };
}

export function decodeFps(frames, rtime) {
  return frames > 0 && rtime > 0 ? frames / rtime : null;
}

export function mbPerSec(bytes, frames, fps = FPS) {
  return frames > 0 ? bytes / MB / (frames / fps) : null;
}

export function perMegapixel(value, w, h) {
  return value === null || !(w > 0 && h > 0) ? null : value / (w * h / 1e6);
}

export function round(x, digits = 2) {
  if (x === null || x === undefined || Number.isNaN(x)) return null;
  const k = 10 ** digits;
  return Math.round(x * k) / k;
}

// rows: [{ key, w, h, variants: { prores_ae: { bytes, mbps, dec1Fps, decNFps }, prores_ks: {...}, png: {...} } }]
export function buildChecks(rows, tag) {
  const checks = [];
  for (const r of rows) {
    const at = `${r.key} ${r.w}x${r.h}`;
    const { prores_ae: ae, prores_ks: ks, png } = r.variants;
    const gainAe = ae && png && png.bytes > 0 ? ae.bytes / png.bytes : null;
    const gainKs = ks && png && png.bytes > 0 ? ks.bytes / png.bytes : null;
    checks.push({
      name: `${tag}: png at least ${MIN_GAIN}x lighter than the AE ProRes 4444 render, ${at}`,
      pass: gainAe !== null && gainAe >= MIN_GAIN, required: true,
      detail: `png ${round(png && png.mbps)} MB/s, AE ProRes ${round(ae && ae.mbps)} MB/s, gain ${round(gainAe)}x`,
    });
    checks.push({
      name: `${tag}: png lighter than prores_ks 4444, ${at}`,
      pass: gainKs !== null && gainKs > 1, required: false,
      detail: `prores_ks ${round(ks && ks.mbps)} MB/s, gain ${round(gainKs)}x`,
    });
    checks.push({
      name: `${tag}: png decodes at >= ${REALTIME_FPS} fps (ffmpeg, default threads), ${at}`,
      pass: Boolean(png && png.decNFps >= REALTIME_FPS), required: true,
      detail: `${round(png && png.decNFps, 1)} fps`,
    });
    checks.push({
      name: `${tag}: png decodes at >= ${REALTIME_FPS} fps (ffmpeg, 1 thread), ${at}`,
      pass: Boolean(png && png.dec1Fps >= REALTIME_FPS), required: false,
      detail: `${round(png && png.dec1Fps, 1)} fps`,
    });
    checks.push({
      name: `${tag}: prores_ks decodes at >= ${REALTIME_FPS} fps (ffmpeg, 1 thread), ${at}`,
      pass: Boolean(ks && ks.dec1Fps >= REALTIME_FPS), required: false,
      detail: `${round(ks && ks.dec1Fps, 1)} fps`,
    });
  }
  return checks;
}

// The weight estimator (part F, task 23) reads this: MB/s per megapixel at 25 fps, per codec.
export function bitratesTable(rows, { date, platform } = {}) {
  const codecs = {};
  for (const v of VARIANTS) {
    const samples = rows.filter((r) => r.variants[v]).map((r) => ({
      key: r.key, w: r.w, h: r.h,
      mbPerSec: round(r.variants[v].mbps, 3),
      mbPerSecPerMp: round(perMegapixel(r.variants[v].mbps, r.w, r.h), 3),
    }));
    const vals = samples.map((s) => s.mbPerSecPerMp).filter((x) => x !== null);
    codecs[v] = {
      mean: vals.length ? round(vals.reduce((a, b) => a + b, 0) / vals.length, 3) : null,
      max: vals.length ? Math.max(...vals) : null,
      samples,
    };
  }
  return {
    spike: 'S11', date: date || null, platform: platform || null, fps: FPS,
    unit: 'MB/s per megapixel at 25 fps (MB = 10^6 bytes)',
    note: 'prores_ae = stream copy of the AE render: use it for ProRes 4444 weight; prores_ks = the same frames '
      + 'encoded by ffmpeg, for a like-for-like size comparison with png',
    codecs,
  };
}

// One manual observation. Premiere: dropped frames over the whole clip (Full resolution); required for png,
// the codec under test. AE: the frame rate of the first preview pass from the Info panel; informative.
export function playbackCheck({ tag, app, variant, key, value }) {
  if (!S11_SOURCES.some((s) => s.key === key)) throw new Error('unknown source: ' + key);
  if (app !== 'pr' && app !== 'ae') throw new Error('app must be pr or ae: ' + app);
  if (variant !== 'png' && variant !== 'prores_ks') throw new Error('variant must be png or prores_ks: ' + variant);
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error('value must be a number: ' + value);
  if (app === 'pr') {
    return {
      name: `${tag} pr: real-time playback without dropped frames, ${variant}, ${key}`,
      pass: n === 0, required: variant === 'png', detail: `dropped ${n} frames`,
    };
  }
  return {
    name: `${tag} ae: first preview pass in real time, ${variant}, ${key}`,
    pass: n >= REALTIME_FPS * 0.98, required: false, detail: `first pass ${n} fps`,
  };
}

export function formatTable(rows) {
  const lines = ['source           variant    MB/s    MB/s/MP  1 thread  default'];
  for (const r of rows) {
    for (const v of VARIANTS) {
      const x = r.variants[v];
      if (!x) continue;
      lines.push([
        r.key.padEnd(16), v.padEnd(10), String(round(x.mbps)).padStart(6),
        String(round(perMegapixel(x.mbps, r.w, r.h))).padStart(8),
        String(round(x.dec1Fps, 1)).padStart(8), String(round(x.decNFps, 1)).padStart(8),
      ].join(' '));
    }
  }
  return lines;
}
