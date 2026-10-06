#!/usr/bin/env node
// The sounds of the packs, for the «Звуки» of phase 2 (SFX, music beds) and their loudness target: every audio
// file of the working copies of the packs with its format (ffprobe), its loudness by EBU R128 (ffmpeg ebur128:
// integrated LUFS, range, true peak) and the comps that use it (by file name in the project.json of the dumps).
//   node tools/packs/sounds.mjs [--packs <crbk>/packs] [--dumps <work>/dumps] [--out docs/research/sounds]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDumpRoot } from '../dump/model.mjs';
import { workPath } from '../lib/work.mjs';
import { packsDir } from './paths.mjs';

export const AUDIO = /\.(wav|aif|aiff|mp3|m4a|aac|flac|ogg)$/i;

export function findAudio(root) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.') || name === '__MACOSX') continue;
      const p = path.join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (AUDIO.test(name)) out.push({ file: p.replace(/\\/g, '/'), bytes: st.size });
    }
  };
  if (existsSync(root)) walk(root);
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

// The summary block ffmpeg prints for -af ebur128=peak=true.
export function parseEbur128(stderr) {
  const tail = String(stderr).slice(String(stderr).lastIndexOf('Summary:'));
  const num = (re) => {
    const m = re.exec(tail);
    return m ? Number(m[1]) : null;
  };
  return { lufs: num(/I:\s+(-?[\d.]+|-inf)\s+LUFS/), lra: num(/LRA:\s+(-?[\d.]+)\s+LU/), truePeak: num(/Peak:\s+(-?[\d.]+|-inf)\s+dBFS/) };
}

export function probeAudio(file, { ffprobe = 'ffprobe', ffmpeg = 'ffmpeg', run = spawnSync } = {}) {
  const p = run(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  let info = null;
  try {
    const j = JSON.parse(p.stdout);
    const a = (j.streams ?? []).find((s) => s.codec_type === 'audio');
    info = a ? { codec: a.codec_name, sampleRate: Number(a.sample_rate), channels: a.channels, bits: a.bits_per_sample || a.bits_per_raw_sample || null, duration: Number(j.format?.duration ?? a.duration) } : null;
  } catch {
    info = null;
  }
  if (!info) return { error: String(p.stderr || 'ffprobe failed').trim().slice(0, 200) };
  const l = run(ffmpeg, ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ...info, duration: Math.round(info.duration * 1000) / 1000, ...parseEbur128(l.stderr) };
}

// Comps of the dumps that use a footage file, by its file name (paths differ between the archive and the copies).
export function usageByName(dumps) {
  const out = new Map();
  for (const d of dumps) {
    const pack = path.basename(d.dir);
    for (const it of d.project?.items ?? []) {
      const f = it.source?.file;
      if (!f || !it.source?.hasAudio) continue;
      const name = String(f).replace(/\\/g, '/').split('/').pop().normalize('NFC').toLowerCase();
      const u = out.get(name) ?? [];
      u.push({ pack, item: it.name, usedIn: it.usedInCount ?? null });
      out.set(name, u);
    }
  }
  return out;
}

export function soundsInventory({ packs, dumps, probe = probeAudio }) {
  const usage = usageByName(dumps ?? []);
  const files = findAudio(packs).map((f) => {
    const rel = path.relative(packs, f.file).replace(/\\/g, '/');
    return { pack: rel.split('/')[0], file: rel, bytes: f.bytes, ...probe(f.file), usedBy: usage.get(path.basename(f.file).normalize('NFC').toLowerCase()) ?? [] };
  });
  return files;
}

export function soundsMarkdown(files) {
  const lines = ['# Звуки пакетов', '', `Файлов: ${files.length}. Громкость — EBU R128: интегральная LUFS, LRA, true peak.`, '', '| Пакет | Файл | Длит., с | Формат | LUFS | LRA | TP, dBFS | Где |', '|---|---|---|---|---|---|---|---|'];
  for (const f of files) {
    lines.push(`| ${f.pack} | ${f.file.split('/').slice(1).join('/')} | ${f.duration ?? '—'} | ${f.codec ? `${f.codec} ${f.sampleRate / 1000} кГц ${f.channels} к.${f.bits ? ` ${f.bits} бит` : ''}` : f.error ?? '—'} | ${f.lufs ?? '—'} | ${f.lra ?? '—'} | ${f.truePeak ?? '—'} | ${f.usedBy.map((u) => `${u.pack}: ${u.item}`).join('; ') || '—'} |`);
  }
  return lines.join('\n') + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
  const packs = opt('--packs', packsDir());
  const dumpsRoot = opt('--dumps', workPath('dumps'));
  const out = opt('--out', path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/research/sounds'));
  const files = soundsInventory({ packs, dumps: existsSync(dumpsRoot) ? loadDumpRoot(dumpsRoot) : [] });
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, 'inventory.json'), JSON.stringify({ generated: new Date().toISOString(), packs, files }, null, 1) + '\n', 'utf8');
  writeFileSync(path.join(out, 'summary.md'), soundsMarkdown(files), 'utf8');
  console.log(`OK ${files.length} audio files -> ${out}`);
}
