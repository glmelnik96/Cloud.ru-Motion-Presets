#!/usr/bin/env node
// The files of the sound library (phase 2 «Звуки»): every sound of the local manifest cut, levelled and written as
// <work>/build/<id>/<id>_wav_v1.wav by the rules of tools/sounds/process.mjs, then library/sounds.src.json — the
// published list the catalog build merges into library.src.json.
// The manifest (<work>/sounds/manifest.json) stays on the build PC: it maps the library ids to the source folders and
// packs. { roots: { <name>: <folder> }, sounds: [{ src: '<root>:<path>', id, title_ru, group, keywords, sec, pack? }] }
//   node tools/sounds/build-sounds.mjs [--manifest <file>] [--only id,id] [--force] [--jobs 4]
// A file is rendered again only when its source, its rule or its recipe changed (<work>/sounds/build-report.json).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workPath } from '../lib/work.mjs';
import { gainDb, isMusic, libraryOrder, parseLoudness, renderFilters, rule, sameChannels, SILENCE_DB, soundingRange, sourceEntry } from './process.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const RECIPE = 'v2: 48k s16 tpdf, trim under -60 dBFS after the gain 5/50 ms, M -18 / I -24 beds / I -18 music, TP -1';

const run = (args) => spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], { encoding: 'utf8', maxBuffer: 1 << 26, windowsHide: true, cwd: process.platform === 'win32' ? 'C:/' : os.tmpdir() });

function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels:format=duration', '-of', 'json', file], { encoding: 'utf8' });
  const j = JSON.parse(r.stdout || '{}');
  return { channels: j.streams?.[0]?.channels ?? 0, duration: Number(j.format?.duration) || 0 };
}

function decode(file, channels) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-v', 'error', '-i', file, '-ac', String(channels), '-ar', '48000', '-f', 'f32le', '-'], { windowsHide: true });
    const chunks = [];
    p.stdout.on('data', (d) => chunks.push(d));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg decode ${code}: ${file}`));
      const b = Buffer.concat(chunks);
      resolve(new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4)));
    });
  });
}

function loudness(file, chain, channels) {
  const r = run(['-i', file, '-ac', String(channels), '-af', `${chain},apad=pad_dur=0.5,ebur128=peak=true:framelog=info`, '-f', 'null', '-']);
  if (r.status !== 0) throw new Error(`ffmpeg loudness ${r.status}: ${(r.stderr || '').slice(-400)}`);
  return parseLoudness(r.stderr);
}

export async function buildSound(sound, roots, { force = false, previous = null } = {}) {
  const [root, ...rest] = sound.src.split(':');
  const file = path.join(roots[root], rest.join(':'));
  const st = statSync(file);
  const out = workPath('build', sound.id, `${sound.id}_wav_v1.wav`);
  // music's groups level and cut alike: a track moved between them is not rendered again
  const recipe = `${RECIPE} | ${isMusic(sound.group) ? 'music' : sound.group} | ${st.size}`;
  if (!force && previous && previous.recipe === recipe && previous.src === sound.src && existsSync(out)) return previous;
  const p = probe(file);
  const ch = Math.min(2, Math.max(1, p.channels));
  const x = await decode(file, ch);
  // the rule by the decoded length: an MP3 header can claim four times its real length (a footage rain: 251 s, 63 s)
  const r = rule({ ...sound, sec: x.length / ch / 48000 });
  p.duration = x.length / ch / 48000;
  const mono = ch === 1 || sameChannels(x);
  const down = ch === 2 && mono ? ['pan=mono|c0=0.5*c0+0.5*c1'] : [];
  // silence is what stays under -60 dBFS after the gain: a quiet bed raised 22 dB keeps its tail (a city night lost
  // 4.5 s at -38 dBFS when the threshold was the source's)
  const whole = r.trim ? gainDb(r, loudness(file, ['aresample=48000', ...down].join(','), ch)) : 0;
  const range = r.trim ? soundingRange(x, ch, 48000, { db: SILENCE_DB - whole }) : null;
  const pre = ['aresample=48000'];
  if (range) pre.push(`atrim=start=${range.start}:end=${range.end}`, 'asetpts=PTS-STARTPTS');
  pre.push(...down);
  const before = loudness(file, pre.join(','), ch);
  const gain = gainDb(r, before);
  mkdirSync(path.dirname(out), { recursive: true });
  const w = run(['-y', '-i', file, '-ac', String(ch), '-af', renderFilters({ range: range && { ...range, length: p.duration }, mono: ch === 2 && mono, gain, trim: Boolean(range) }), '-c:a', 'pcm_s16le', '-ar', '48000', '-map_metadata', '-1', out]);
  if (w.status !== 0) throw new Error(`ffmpeg render ${w.status}: ${(w.stderr || '').slice(-400)}`);
  const after = loudness(out, 'anull', mono ? 1 : 2);
  const o = probe(out);
  return {
    id: sound.id, src: sound.src, recipe, rule: r, channels: mono ? 1 : 2, gain, range,
    before, after, sec: Math.round(o.duration * 1000) / 1000, bytes: statSync(out).size,
  };
}

export async function buildSounds({ manifest = workPath('sounds', 'manifest.json'), only = null, force = false, jobs = 4, log = console.log } = {}) {
  const m = JSON.parse(readFileSync(manifest, 'utf8'));
  const reportFile = path.join(path.dirname(manifest), 'build-report.json');
  const report = existsSync(reportFile) ? JSON.parse(readFileSync(reportFile, 'utf8')) : {};
  const todo = m.sounds.filter((s) => !only || only.includes(s.id));
  const queue = todo.slice();
  const failed = [];
  let done = 0;
  const worker = async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      try {
        report[s.id] = await buildSound(s, m.roots, { force, previous: report[s.id] ?? null });
      } catch (e) {
        failed.push({ id: s.id, error: e.message });
        log(`FAIL ${s.id}: ${e.message}`);
      }
      done += 1;
      if (done % 50 === 0 || done === todo.length) {
        log(`${done}/${todo.length}`);
        writeFileSync(reportFile, JSON.stringify(report, null, 1));
      }
    }
  };
  await Promise.all(Array.from({ length: jobs }, worker));
  writeFileSync(reportFile, JSON.stringify(report, null, 1));
  // the published list: every sound of the manifest that has its file
  const entries = libraryOrder(m.sounds.filter((s) => report[s.id] && existsSync(workPath('build', s.id, `${s.id}_wav_v1.wav`))).map((s) => sourceEntry(s, report[s.id].sec)));
  const comment = 'Sounds of the library, written by tools/sounds/build-sounds.mjs from the manifest of the build PC; tools/library/build-catalog.mjs merges them into library.src.json as items of the «Звуки» category.';
  // one sound a line: the file is long, its diffs stay readable
  writeFileSync(path.join(REPO, 'library', 'sounds.src.json'), `{\n "$comment": ${JSON.stringify(comment)},\n "version": 1,\n "sounds": [\n${entries.map((e) => '  ' + JSON.stringify(e)).join(',\n')}\n ]\n}\n`);
  return { built: todo.length - failed.length, failed, entries: entries.length, bytes: entries.reduce((a, e) => a + (report[e.id]?.bytes ?? 0), 0) };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const get = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
  const r = await buildSounds({
    manifest: get('--manifest') ?? workPath('sounds', 'manifest.json'),
    only: get('--only') ? get('--only').split(',') : null,
    force: argv.includes('--force'),
    jobs: Number(get('--jobs') ?? 4),
  });
  console.log(`built ${r.built}, failed ${r.failed.length}; library/sounds.src.json: ${r.entries} sounds, ${(r.bytes / 1048576).toFixed(1)} MB`);
  if (r.failed.length) process.exitCode = 1;
}
