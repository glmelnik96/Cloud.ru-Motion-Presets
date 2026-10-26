// The rules of the sound library (phase 2 «Звуки», decisions of 2026-10-26): how a source sound becomes a library file.
// Pure functions; tools/sounds/build-sounds.mjs runs ffmpeg with them.
// - Groups of the «Звуки» and «Музыка» categories, in the panel order (the panel has the same lists:
//   panel/src/core/library.ts); the group says the category: music has its own (user 2026-10-26).
// - Loudness (EBU R128, not signed): one-shots to a loudest momentary loudness of -18 LUFS, long beds (over 12 s of
//   ambience, nature, city, foley, sci-fi or glitches) to -24 LUFS integrated, music to -18 LUFS integrated; the true
//   peak never over -1 dBTP: a sound that would pass it stays quieter.
// - Silence — what stays below -60 dBFS after the gain — is cut from both ends (5 ms kept before, 50 ms after, short
//   fades); music and the pack's template tracks keep their timing.
// - 48 kHz, 16-bit PCM WAV with dither; mono when the two channels are the same.

export const GROUPS = [
  ['brand', 'Фирменные'],
  ['whoosh', 'Переходы'],
  ['impact', 'Удары'],
  ['riser', 'Подъёмы и спады'],
  ['ui', 'Интерфейс'],
  ['glitch', 'Глитчи'],
  ['texture', 'Бумага и скотч'],
  ['scifi', 'Техно и sci-fi'],
  ['ambience', 'Атмосферы'],
  ['nature', 'Природа'],
  ['city', 'Город и люди'],
  ['foley', 'Бытовые'],
];

export const MUSIC_GROUPS = [
  ['cloud', 'Cloud.ru'],
  ['corporate', 'Корпоративная'],
  ['tech', 'Технологии'],
  ['cinematic', 'Кинематографичная'],
  ['electronic', 'Электроника'],
  ['energetic', 'Энергичная'],
  ['calm', 'Спокойная'],
];

export const isMusic = (group) => MUSIC_GROUPS.some(([g]) => g === group);

export const TARGET = { momentary: -18, bed: -24, music: -18, truePeak: -1 };
export const SILENCE_DB = -60;
export const LONG_SEC = 12;
const BED_GROUPS = ['ambience', 'nature', 'city', 'foley', 'scifi', 'glitch'];

// How a sound is levelled and cut: { mode: 'momentary'|'integrated', target, trim }.
export function rule(sound) {
  if (isMusic(sound.group)) return { mode: 'integrated', target: TARGET.music, trim: false };
  // the podcast pack's template tracks are aligned to their 10 s comps
  if (sound.group === 'brand' && /^SFX_Podcast/.test(sound.id)) return { mode: 'momentary', target: TARGET.momentary, trim: false };
  if (sound.sec > LONG_SEC && BED_GROUPS.includes(sound.group)) return { mode: 'integrated', target: TARGET.bed, trim: true };
  return { mode: 'momentary', target: TARGET.momentary, trim: true };
}

// The loudness of ffmpeg's ebur128 (peak=true, framelog=info): the loudest momentary value of the frames, and the
// integrated loudness and true peak of the summary. -inf is null.
export function parseLoudness(stderr) {
  const text = String(stderr);
  let maxM = null;
  for (const m of text.matchAll(/\bM:\s*(-?[\d.]+|-inf)/g)) {
    if (m[1] === '-inf') continue;
    const v = Number(m[1]);
    if (v > -120 && (maxM === null || v > maxM)) maxM = v;
  }
  const tail = text.slice(text.lastIndexOf('Summary:'));
  const num = (re) => {
    const m = re.exec(tail);
    return m && m[1] !== '-inf' ? Number(m[1]) : null;
  };
  return { maxM, integrated: num(/I:\s+(-?[\d.]+|-inf)\s+LUFS/), truePeak: num(/Peak:\s+(-?[\d.]+|-inf)\s+dBFS/) };
}

// Gain in dB: to the target of the rule, held so the true peak stays at -1 dBTP; rounded to 0.01 dB.
export function gainDb(r, loud) {
  const level = r.mode === 'momentary' ? loud.maxM : loud.integrated;
  if (level === null || loud.truePeak === null) throw new Error('the sound has no measurable loudness');
  const g = Math.min(r.target - level, TARGET.truePeak - loud.truePeak);
  return Math.round(g * 100) / 100;
}

// The sounding part of decoded samples (interleaved, any channel count): from 5 ms before the first sample over the
// silence threshold to 50 ms after the last, in seconds; null when nothing is over it.
export function soundingRange(samples, channels, rate, { db = SILENCE_DB, pre = 0.005, post = 0.05 } = {}) {
  const thr = Math.pow(10, db / 20);
  const frames = Math.floor(samples.length / channels);
  let first = -1;
  let last = -1;
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < channels; c++) {
      if (Math.abs(samples[f * channels + c]) > thr) {
        if (first < 0) first = f;
        last = f;
        break;
      }
    }
  }
  if (first < 0) return null;
  const r6 = (v) => Math.round(v * 1e6) / 1e6;
  return { start: r6(Math.max(0, first / rate - pre)), end: r6(Math.min(frames / rate, (last + 1) / rate + post)), length: r6(frames / rate) };
}

// Two channels that differ by less than -60 dB of the peak are one: the file is written mono.
export function sameChannels(samples) {
  let peak = 0;
  let diff = 0;
  for (let i = 0; i + 1 < samples.length; i += 2) {
    peak = Math.max(peak, Math.abs(samples[i]), Math.abs(samples[i + 1]));
    diff = Math.max(diff, Math.abs(samples[i] - samples[i + 1]));
  }
  return peak === 0 || diff <= peak * 1e-3;
}

// ffmpeg filters from a source to the library file: resample to 48 kHz, cut, mix down, level, fade, 16 bits with
// dither.
export function renderFilters({ range, mono, gain, trim }) {
  const f = ['aresample=48000'];
  if (trim && range) {
    f.push(`atrim=start=${range.start}:end=${range.end}`, 'asetpts=PTS-STARTPTS');
  }
  if (mono) f.push('pan=mono|c0=0.5*c0+0.5*c1');
  f.push(`volume=${gain}dB`);
  if (trim && range) {
    const len = Math.round((range.end - range.start) * 1e6) / 1e6;
    if (range.start > 0) f.push('afade=t=in:d=0.002');
    if (range.end < range.length) f.push(`afade=t=out:st=${Math.max(0, Math.round((len - 0.02) * 1e6) / 1e6)}:d=0.02`);
  }
  f.push('aresample=osf=s16:dither_method=triangular');
  return f.join(',');
}

// The published entry of a sound (library/sounds.src.json): what the catalog needs, nothing of where it came from.
export function sourceEntry(sound, sec) {
  const e = { id: sound.id, title_ru: sound.title_ru, group: sound.group, keywords: sound.keywords, sec: Math.round(sec * 1000) / 1000 };
  if (sound.pack) e.pack = sound.pack;
  return e;
}

// Library order: the sounds' groups as listed, then the music's; inside a group by title with numbers in order
// («Удар 2» before «Удар 10»).
export function libraryOrder(entries) {
  const at = (g) => [...GROUPS, ...MUSIC_GROUPS].findIndex(([k]) => k === g);
  const coll = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });
  return entries.slice().sort((a, b) => at(a.group) - at(b.group) || coll.compare(a.title_ru, b.title_ru));
}

// A library item of a sound entry (tools/library/build-catalog.mjs merges them into the source).
export function soundItem(e) {
  return {
    id: e.id,
    title_ru: e.title_ru,
    category: isMusic(e.group) ? 'music' : 'sounds',
    tier: 'T3',
    hosts: ['ae', 'pr'],
    version: 1,
    group: e.group,
    keywords: e.keywords,
    duration: { introSec: 0, holdSec: e.sec, outroSec: 0 },
    variants: [{ key: 'wav', ...(e.pack ? { pack: e.pack } : {}) }],
  };
}
