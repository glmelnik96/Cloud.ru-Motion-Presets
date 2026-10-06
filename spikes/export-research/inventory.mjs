// Inventory of the nine brand Media Encoder presets. Reads the PremiereData XML only;
// the .epr files stay in the archive and are not copied into the repo.
//   node spikes/export-research/inventory.mjs
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TICKS = 254016000000;
const ARCHIVE = process.env.BRANDKIT_EPR_DIR
  || 'C:/CRBK/archive/2026-10-02/7_Пресеты_Media_Encoder';

const PURPOSE = {
  'FullHD.epr': 'Full HD, 1920×1080, основной мастер',
  '4K.epr': '4K, 3840×2160',
  'SMM_16x9.epr': 'соцсети, 16:9',
  'SMM_1440x1080.epr': 'соцсети, 1440×1080 (4:3)',
  'SMM_1x1.epr': 'соцсети, квадрат 1:1',
  'SMM_9x16.epr': 'соцсети, вертикаль 9:16',
  'Webinar_Zastavka.epr': 'вебинар, заставка',
  'Webinar_Final render.epr': 'вебинар, финальный рендер',
  'Webinar_Timer.epr': 'вебинар, таймер',
};

// The .epr stores a profile code, not a name. pr-epr.json names it from ffprobe.

function fourcc(n) {
  const x = Number(n) >>> 0;
  if (!x) return null;
  return String.fromCharCode((x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255).replace(/\0/g, '').trim();
}

function num(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fpsOf(ticks) {
  const n = num(ticks);
  if (!n) return null;
  const fps = TICKS / n;
  return Math.round(fps * 1000) / 1000;
}

function tag(block, name) {
  const m = new RegExp('<' + name + '>([^<]*)</' + name + '>').exec(block);
  return m ? m[1] : null;
}

function paramsOf(xml) {
  const out = {};
  const re = /<ExporterParam\b[\s\S]*?<\/ExporterParam>/g;
  for (const block of xml.match(re) || []) {
    const id = tag(block, 'ParamIdentifier');
    if (!id) continue;
    out[id] = {
      value: tag(block, 'ParamValue'),
      aux: tag(block, 'ParamAuxValue'),
      arb: tag(block, 'ParamArbData'),
      hidden: /<ParamIsHidden>true<\/ParamIsHidden>/.test(block),
      disabled: /<ParamIsDisabled>true<\/ParamIsDisabled>/.test(block),
      max: tag(block, 'ParamMaxValue'),
    };
  }
  return out;
}

function levelLabel(code) {
  const n = num(code);
  if (n === null) return null;
  // Adobe stores 4.2 as 42.
  if (n >= 10 && n < 100 && n % 10 <= 2) return (Math.floor(n / 10)) + '.' + (n % 10);
  return String(n);
}

function one(file, xml) {
  const p = paramsOf(xml);
  const v = (id) => (p[id] ? p[id].value : null);
  const profileCode = num(v('ADBEVideoMPEGProfile'));
  const levelCode = num(v('ADBEVideoMPEGProfileLevel'));
  const encoding = num(v('ADBEVideoBitrateEncoding'));
  const field = p.ADBEVideoFieldType || null;
  const aspect = v('ADBEVideoAspect');
  return {
    file,
    sha256: createHash('sha256').update(xml).digest('hex'),
    presetName: tag(xml, 'PresetName'),
    purpose: PURPOSE[file] || file,
    format: fourcc(tag(xml, 'ExporterFileType')) === 'H264' ? 'H.264' : fourcc(tag(xml, 'ExporterFileType')),
    formatFourcc: fourcc(tag(xml, 'ExporterFileType')),
    exporterClassId: num(tag(xml, 'ExporterClassID')),
    doVideo: tag(xml, 'DoVideo') === 'true',
    doAudio: tag(xml, 'DoAudio') === 'true',
    video: {
      codec: fourcc(v('ADBEVideoCodec')) === 'avc1' ? 'H.264' : fourcc(v('ADBEVideoCodec')),
      codecFourcc: fourcc(v('ADBEVideoCodec')),
      width: num(v('ADBEVideoWidth')),
      height: num(v('ADBEVideoHeight')),
      fps: fpsOf(v('ADBEVideoFPS')),
      fpsTicks: num(v('ADBEVideoFPS')),
      bitrateMode: {
        code: encoding,
        scaleMax: num(p.ADBEVideoBitrateEncoding && p.ADBEVideoBitrateEncoding.max),
        // Target and maximum are both present, so the mode is VBR. The file does not name 1-pass vs 2-pass.
        label: encoding === null ? null : 'VBR',
      },
      targetBitrateMbps: num(v('ADBEVideoTargetBitrate')),
      maxBitrateMbps: num(v('ADBEVideoMaxBitrate')),
      minBitrateMbps: num(v('ADBEVideoMinBitrate')),
      profile: {
        code: profileCode,
        name: profileCode === null ? null : 'High',
      },
      level: { code: levelCode, label: levelLabel(levelCode) },
      fields: {
        value: field ? field.value : null,
        disabled: field ? field.disabled : null,
        label: field && field.disabled && field.value === null
          ? 'progressive (field control disabled, no value)'
          : (field && field.value),
      },
      pixelAspect: aspect === '1,1' ? '1:1' : aspect,
      matchSourceArb: p.ADBEVideoMatchSource ? p.ADBEVideoMatchSource.arb : null,
    },
    audio: {
      codec: (p.ADBEAudioCodec && p.ADBEAudioCodec.aux) || fourcc(v('ADBEAudioCodec')),
      codecFourcc: fourcc(v('ADBEAudioCodec')),
      sampleRate: num(v('ADBEAudioRatePerSecond')),
      bitrateKbps: num(v('ADBEAudioBitrate')),
      channels: num(v('ADBEAudioNumChannels')),
    },
  };
}

function divergences(presets) {
  const not25 = presets.filter((p) => p.video.fps !== 25).map((p) => ({
    file: p.file, fps: p.video.fps, size: p.video.width + 'x' + p.video.height,
  }));
  const keys = ['width', 'height', 'fps', 'profile', 'level', 'target', 'max'];
  const groups = {};
  for (const p of presets) {
    const sig = [
      p.video.width, p.video.height, p.video.fps,
      p.video.profile.code, p.video.level.code,
      p.video.targetBitrateMbps, p.video.maxBitrateMbps,
    ].join('|');
    (groups[sig] ||= []).push(p.file);
  }
  return {
    canon: 'D2: every template and export is 25 fps',
    not25fps: not25,
    distinctSettings: Object.entries(groups).map(([sig, files]) => {
      const [width, height, fps, profile, level, target, max] = sig.split('|');
      return {
        width: Number(width), height: Number(height), fps: Number(fps),
        profileCode: Number(profile), levelCode: Number(level),
        targetBitrateMbps: Number(target), maxBitrateMbps: Number(max),
        files,
      };
    }),
    comparedKeys: keys,
  };
}

const files = readdirSync(ARCHIVE).filter((f) => f.toLowerCase().endsWith('.epr')).sort();
const presets = files.map((f) => one(f, readFileSync(path.join(ARCHIVE, f), 'utf8')));
const doc = {
  source: ARCHIVE.replace(/\\/g, '/'),
  counted: presets.length,
  ticksPerSecond: TICKS,
  notes: [
    'fps = 254016000000 / ADBEVideoFPS (Adobe ticks).',
    'Bitrate values are Mbps for video and kbps for audio, matching the exporter sliders.',
    'Profile code 3 is High: ffprobe of every Premiere export in pr-epr.json says High.',
    'Bitrate mode code 3 has both a target and a maximum, so it is VBR. The file does not say 1-pass or 2-pass.',
  ],
  presets,
  divergences: divergences(presets),
};

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/research/export');
mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'epr-inventory.json');
writeFileSync(out, JSON.stringify(doc, null, 2) + '\n');
console.log('wrote ' + out + ' (' + presets.length + ' presets)');
for (const p of presets) {
  const v = p.video;
  console.log([p.file, v.width + 'x' + v.height, v.fps + 'fps', 'p' + v.profile.code, 'L' + v.level.label,
    v.targetBitrateMbps + '-' + v.maxBitrateMbps, 'enc' + v.bitrateMode.code].join('  '));
}
