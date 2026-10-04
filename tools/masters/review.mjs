#!/usr/bin/env node
// Designer review video: the pack's originals (golden previews) next to the new templates, one scene per
// question to decide, labelled. masters/review/<name>.mjs defines the renders and the scenes.
//   node tools/masters/review.mjs --review pack1 [--only render|compose]
// render:  per master, the packaged project gets REVIEW_ comps with the case values (AE, one call), is saved
//          as <work>/review/<id>_review.aep and rendered by aerender to H.264 (out of process).
// compose: ffmpeg lays the scenes out (1920x1080, 25 fps) and joins them into <work>/review/<name>_review.mp4.
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { run } from '../host-run.mjs';
import { composeProbe, REPO } from '../spike/runner.mjs';
import { aerenderPath, ffprobeVideo, runWatched } from '../golden/aerender.mjs';
import { workPath } from '../lib/work.mjs';
import { loadMaster, printChecks } from './build-master.mjs';
import { packagePaths } from './package.mjs';

const W = 1920;
const H = 1080;
const FPS = 25;
const BG = '0x161616';
const FONT = 'Windows/Fonts/SBSansDisplay-Regular.otf';   // relative to C:/, so the filter needs no drive colon
const native = (p) => (process.platform === 'win32' ? p.replace(/\//g, '\\') : p);
const fromC = (p) => p.replace(/^[A-Za-z]:\//, '');

export function renderFile(name) {
  return workPath('review', 'renders', name + '.mp4');
}

async function renderMaster(id, cases) {
  const { params } = await loadMaster(id);
  const outAep = workPath('review', id + '_review.aep');
  const list = cases.map((c) => ({ name: c.name, comp: c.comp, ctrl: c.ctrl || {}, text: c.text || {}, out: renderFile(c.name) }));
  for (const f of [outAep, ...list.map((c) => c.out)]) rmSync(f, { force: true });
  const body = composeProbe(['spikes/lib/ae-project.jsx', 'tools/masters/jsx/review-queue.jsx'], {
    workDir: params.workDir, aep: packagePaths(params).aep, outAep, omPattern: 'H\\.?264', prefer: '15', cases: list,
  });
  const r = await run('ae', body, { timeoutMs: 300000 });
  if (printChecks(r.checks)) throw new Error(`${id}: review queue failed`);
  const comps = r.data.comps;
  const ok = (c) => {
    const info = ffprobeVideo(renderFile(c.name.replace(/^REVIEW_/, '')));
    return info && Math.abs(info.duration - c.duration) <= 2 / FPS;
  };
  const res = await runWatched({
    exe: aerenderPath(), args: ['-project', native(outAep), '-close', 'DO_NOT_SAVE_CHANGES'],
    logFile: workPath('review', id + '_aerender.log'), isDone: async () => comps.every(ok), pollMs: 5000, graceMs: 20000,
  });
  const bad = comps.filter((c) => !ok(c)).map((c) => c.name);
  console.log(`${id}: aerender ${res.code} ${res.reason || ''} ${Math.round(res.ms / 1000)} s; ${comps.length - bad.length}/${comps.length} files` + (bad.length ? ' — missing ' + bad.join(', ') : ''));
  if (bad.length) throw new Error(`${id}: renders missing`);
}

function sourceOf(src) {
  if (src.golden) return workPath('golden', ...src.golden.split('/'), 'preview_half.mp4');
  return renderFile(src.render);
}

function textFile(dir, key, text) {
  const f = path.posix.join(dir, key + '.txt');
  writeFileSync(f, text, 'utf8');
  return fromC(f);
}

const draw = (file, x, y, size, color = 'white') =>
  `drawtext=fontfile=${FONT}:textfile=${file}:expansion=none:x=${x}:y=${y}:fontsize=${size}:fontcolor=${color}:line_spacing=10`;

// One scene: inputs, the filter graph (written to a file for ffmpeg -/filter_complex) and the output.
export function sceneGraph(scene, labelsDir) {
  const D = scene.duration;
  const inputs = [];
  const chains = [`color=c=${BG}:s=${W}x${H}:r=${FPS}:d=${D}[b0]`];
  let cur = 'b0';
  scene.panels.forEach((p, i) => {
    const start = (p.src.start || 0) + (scene.start || 0);
    inputs.push('-ss', String(start), '-t', String(D + 1), '-i', sourceOf(p.src));
    const f = [`[${i}:v]fps=${FPS}`, 'setpts=PTS-STARTPTS'];
    if (p.src.place) {
      const pl = p.src.place;
      f.push(`scale=${pl.scale[0]}:${pl.scale[1]}`);
      // pad centres a source that does not fit at x, y: crop it first so it does
      if (pl.crop) f.push(`crop=${pl.crop[0]}:${pl.crop[1]}:${pl.crop[2]}:${pl.crop[3]}`);
      f.push(`pad=${pl.pad[0]}:${pl.pad[1]}:${pl.pad[2]}:${pl.pad[3]}:color=black`);
    } else {
      f.push(`scale=${p.frame.w}:${p.frame.h}`);
    }
    if (p.crop) f.push(`crop=${p.crop.w}:${p.crop.h}:${p.crop.x}:${p.crop.y}`);
    f.push(`scale=${p.size[0]}:${p.size[1]}:flags=lanczos`, 'setsar=1', `tpad=stop_mode=clone:stop_duration=${D}`);
    chains.push(f.join(',') + `[p${i}]`);
    let base = cur;
    if (p.border) {
      chains.push(`[${cur}]drawbox=x=${p.at[0] - 2}:y=${p.at[1] - 2}:w=${p.size[0] + 4}:h=${p.size[1] + 4}:color=0x555555:t=2[d${i}]`);
      base = `d${i}`;
    }
    chains.push(`[${base}][p${i}]overlay=${p.at[0]}:${p.at[1]}:shortest=0:eof_action=repeat[b${i + 1}]`);
    cur = `b${i + 1}`;
  });
  const texts = [draw(textFile(labelsDir, scene.name + '_title', scene.title), 60, 36, 40)];
  if (scene.note) {
    const [x, y] = scene.noteAt || [60, 930];
    texts.push(draw(textFile(labelsDir, scene.name + '_note', scene.note), x, y, 26, '0xE8E8E8'));
  }
  scene.panels.forEach((p, i) => {
    if (p.label) texts.push(draw(textFile(labelsDir, `${scene.name}_l${i}`, p.label), p.labelAt[0], p.labelAt[1], 28, '0xB8F5D5'));
  });
  chains.push(`[${cur}]` + texts.join(',') + '[vout]');
  return { inputs, graph: chains.join(';\n') };
}

function ffmpeg(args, label) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { cwd: 'C:/', encoding: 'utf8', windowsHide: true, maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`${label}: ffmpeg ${r.status}: ${(r.stderr || '').slice(0, 1500)}`);
}

export function compose(name, scenes) {
  const dir = workPath('review');
  const labels = workPath('review', 'labels');
  const sceneDir = workPath('review', 'scenes');
  mkdirSync(labels, { recursive: true });
  mkdirSync(sceneDir, { recursive: true });
  const files = [];
  const chapters = [];
  let t = 0;
  scenes.forEach((s, i) => {
    const { inputs, graph } = sceneGraph(s, labels);
    const graphFile = path.posix.join(sceneDir, `${String(i + 1).padStart(2, '0')}_${s.name}.ffgraph`);
    writeFileSync(graphFile, graph, 'utf8');
    const out = path.posix.join(sceneDir, `${String(i + 1).padStart(2, '0')}_${s.name}.mp4`);
    ffmpeg([...inputs, '-/filter_complex', graphFile, '-map', '[vout]', '-t', String(s.duration), '-r', String(FPS),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-an', out], s.name);
    files.push(out);
    chapters.push({ at: t, title: s.title, file: out });
    t += s.duration;
  });
  const list = path.posix.join(sceneDir, 'concat.txt');
  writeFileSync(list, files.map((f) => `file '${f}'`).join('\n') + '\n', 'utf8');
  const out = path.posix.join(dir, `${name}_review.mp4`);
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out], 'concat');
  const info = ffprobeVideo(out);
  writeFileSync(path.posix.join(dir, `${name}_review.chapters.json`), JSON.stringify({ file: out, info, chapters }, null, 2) + '\n', 'utf8');
  return { out, info, chapters };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const name = argv.includes('--review') ? argv[argv.indexOf('--review') + 1] : null;
  const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
  const def = await import(pathToFileURL(path.join(REPO, 'masters', 'review', name + '.mjs')).href);
  mkdirSync(workPath('review', 'renders'), { recursive: true });
  if (!only || only === 'render') {
    for (const [id, cases] of Object.entries(def.renders)) await renderMaster(id, cases);
  }
  if (!only || only === 'compose') {
    const missing = def.scenes.flatMap((s) => s.panels.map((p) => sourceOf(p.src))).filter((f) => !existsSync(f));
    if (missing.length) throw new Error('missing sources: ' + [...new Set(missing)].join(', '));
    const r = compose(name, def.scenes);
    const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    console.log(`${r.out}: ${r.info ? r.info.width + 'x' + r.info.height + ', ' + r.info.duration.toFixed(1) + ' s' : 'not readable'}`);
    for (const c of r.chapters) console.log(`  ${mmss(c.at)}  ${c.title}`);
  }
}
