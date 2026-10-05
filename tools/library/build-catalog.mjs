#!/usr/bin/env node
// Builds the library the panel reads (spec 4.4; plan 2026-10-05 task 2): library/library.src.json plus the packaged
// masters in <work>/build/<id>/ become <root>/library.json and <root>/items/<id>/ with <id>_v<N>.aep, one
// <id>_<key>_v<N>.mogrt per variant, preview.mp4 and poster.jpg. No host is involved: the previews come from the
// thumb.mp4 that AE writes into every MOGRT (P7). Nothing in <root> changes until every check has passed: the files
// are staged inside <root>, each MOGRT is checked against its catalog entry and the whole catalog against the
// schema and the cross-field rules; then the files move into place and library.json is replaced by a rename. If a
// move fails, every file moved so far goes back, so <root> holds either the new library or the previous one.
//   node tools/library/build-catalog.mjs --root <dir> [--date YYYY.MM.DD] [--work <dir>]
import { spawnSync } from 'node:child_process';
import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import AdmZip from 'adm-zip';
import { workDir } from '../lib/work.mjs';
import { sha256File } from '../packs/fsutil.mjs';
import { controlNames, readMogrt } from '../spike/mogrt.mjs';
import { validateLibrary } from './validate.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const WIN_FFMPEG = 'C:/ffmpeg/bin/ffmpeg.exe';
// One preview of a few seconds takes ffmpeg about a second; two minutes means it hangs.
export const FFMPEG_TIMEOUT_MS = 120000;
const DAY = /^20[0-9]{2}\.(0[1-9]|1[0-2])\.(0[1-9]|[12][0-9]|3[01])$/;
const SCALE = 'scale=480:-2:flags=lanczos';
// An input seek past the start of the last frame decodes nothing, so the poster seek stays this far from the end.
const POSTER_TAIL_SEC = 0.1;
// The stage folder that holds the files a build replaces until library.json is in place. Item ids start with an
// upper-case family, so it never meets one.
const PREVIOUS = 'previous';
const USAGE = 'usage: node tools/library/build-catalog.mjs --root <dir> [--date YYYY.MM.DD] [--work <dir>]';

// Files written by PowerShell 5.1 may start with a BOM, which JSON.parse rejects.
const stripBom = (t) => (t.charCodeAt(0) === 0xfeff ? t.slice(1) : t);
const readJson = (p) => JSON.parse(stripBom(readFileSync(p, 'utf8')));
const posix = (p) => String(p).replace(/\\/g, '/');
const isFile = (p) => existsSync(p) && statSync(p).isFile();
const round3 = (x) => Math.round(x * 1000) / 1000;

// A refusal lists every problem found in one pass, one per line; <root> is as it was.
class Refused extends Error {
  constructor(problems) {
    super(problems.join('\n'));
    this.problems = problems;
  }
}

// A move into <root> failed after every check had passed. The files moved so far went back (kept is null), or
// some could not and kept names the stage that still holds them.
class MoveFailed extends Error {
  constructor(message, kept) {
    super(message);
    this.kept = kept;
  }
}

const dateProblem = (day) => (DAY.test(day) ? null : `date must be YYYY.MM.DD, got ${day}`);

export function calverDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

// The calver of the build day; another build that day becomes <day>.1, <day>.2, so the panel can tell them apart.
export function nextLibraryVersion(day, previous) {
  const m = /^(\d{4}\.\d{2}\.\d{2})(?:\.(\d+))?$/.exec(previous || '');
  if (!m || m[1] !== day) return day;
  return `${day}.${m[2] === undefined ? 1 : Number(m[2]) + 1}`;
}

// package.mjs keeps the previous release as *.prev.* and the working project as <id>_work.aep next to the release;
// neither may reach the library.
export function assertRelease(file) {
  const base = path.basename(file);
  if (/\.prev\./i.test(base) || /_work\.aep$/i.test(base)) throw new Error(`${base} is not a release file`);
  return file;
}

// The catalog pins the reference build of each font (brand/tokens.json, A1); the panel compares it with the
// installed font before inserting.
export function pinFonts(fonts, tokens) {
  const builds = new Map(Object.values(tokens.type.fonts).map((f) => [f.postScriptName, f.build]));
  const problems = [];
  const pinned = fonts.map(({ postScriptName, build }) => {
    const ref = builds.get(postScriptName);
    if (!ref) problems.push(`font ${postScriptName} is not in brand/tokens.json type.fonts`);
    else if (build !== undefined && build !== ref) problems.push(`font ${postScriptName}: the source pins build ${build}, brand/tokens.json has ${ref}`);
    return { postScriptName, build: ref };
  });
  return { fonts: pinned, problems };
}

const firstStr = (db) => {
  for (const s of (db && db.strDB) || []) if (s && typeof s.str === 'string' && s.str) return s.str;
  return '';
};
const sortedSet = (xs) => [...new Set(xs)].sort();

// The catalog entry against the MOGRT the panel will insert (checkMogrt in tools/masters/package.mjs, made strict):
// the Essential Graphics controls are the fields in egpIndex order, named by egpName and of the field's type; the
// dropdown items are the option labels; the template uses exactly requiredFonts and no footage (spec 4.4 step 6);
// the capsule is <id>_<key>_v<N>, the name Premiere gives the clip.
export function mogrtProblems(m, item, variant) {
  if (!m.hasDefinition) return ['no definition.json'];
  const problems = [];
  if (!m.hasAegraphic) problems.push('no project.aegraphic');
  const def = m.definition;
  const name = `${item.id}_${variant.key}_v${item.version}`;
  if (def.capsuleName !== name) problems.push(`capsuleName "${def.capsuleName}", expected "${name}"`);

  const fields = [...(item.fields || [])].sort((a, b) => a.egpIndex - b.egpIndex);
  const controls = m.controls.filter((c) => c.kind !== 'group');
  const got = controls.map((c) => c.names[0] || '');
  const want = fields.map((f) => f.egpName);
  if (got.join('\n') !== want.join('\n')) {
    problems.push(`controls [${got.join(', ')}], expected [${want.join(', ')}]`);
  } else {
    fields.forEach((f, i) => {
      if (controls[i].kind !== f.type) problems.push(`control "${f.egpName}" is a ${controls[i].kind}, the field is a ${f.type}`);
    });
  }
  for (const f of fields.filter((x) => x.type === 'dropdown')) {
    const c = (def.clientControls || []).find((x) => x.type === 13 && controlNames(x).includes(f.egpName));
    if (!c) { problems.push(`dropdown "${f.egpName}" not found`); continue; }
    const items = (c.menucontent || []).map(firstStr);
    const labels = f.options.map((o) => o.label_ru);
    if (items.join('\n') !== labels.join('\n')) problems.push(`dropdown "${f.egpName}" items [${items.join(', ')}], expected [${labels.join(', ')}]`);
  }

  const fonts = sortedSet((item.requiredFonts || []).map((f) => f.postScriptName));
  const used = def.usedFontsLocalized;
  const byLocale = Array.isArray(used) ? { all: used } : used && typeof used === 'object' ? used : {};
  if (!Object.keys(byLocale).length) problems.push('no usedFontsLocalized');
  for (const [locale, list] of Object.entries(byLocale)) {
    const have = sortedSet(Array.isArray(list) ? list : []);
    if (have.join('\n') !== fonts.join('\n')) problems.push(`fonts ${locale} [${have.join(', ')}], expected [${fonts.join(', ')}]`);
  }
  if (!Array.isArray(def.usedFileTypes) || def.usedFileTypes.length) {
    problems.push(`usedFileTypes ${JSON.stringify(def.usedFileTypes)}, expected []`);
  }
  return problems;
}

export function findFfmpeg(env = process.env, exists = existsSync) {
  if (env.FFMPEG) return env.FFMPEG;
  return exists(WIN_FFMPEG) ? WIN_FFMPEG : 'ffmpeg';
}

// A hung ffmpeg is killed after the timeout instead of blocking the build.
export function runFfmpeg(bin, args, cwd, timeout = FFMPEG_TIMEOUT_MS) {
  const r = spawnSync(bin, args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 1 << 24, timeout });
  if (r.error && r.error.code === 'ETIMEDOUT') throw new Error(`ffmpeg (${bin}) timed out after ${timeout / 1000} s`);
  if (r.error) throw new Error(`ffmpeg (${bin}) did not run: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`ffmpeg exited with ${r.status}: ${String(r.stderr || '').trim().slice(0, 1500)}`);
}

export function extractThumb(mogrt, dir) {
  const entry = new AdmZip(mogrt).getEntry('thumb.mp4');
  if (!entry) throw new Error(`${path.basename(mogrt)} has no thumb.mp4`);
  const file = path.join(dir, 'thumb.mp4');
  writeFileSync(file, entry.getData());
  return file;
}

// The length in seconds of the first video track of an MP4 (moov/trak/mdia: hdlr "vide", then mdhd), or null.
// The movie header would not do: in AE's thumb.mp4 the audio track runs about 30 ms past the video.
export function mp4VideoSeconds(buf) {
  const boxes = (start, end) => {
    const out = [];
    for (let i = start; i + 8 <= end;) {
      let size = buf.readUInt32BE(i);
      let head = 8;
      if (size === 1 && i + 16 <= end) {
        size = Number(buf.readBigUInt64BE(i + 8));
        head = 16;
      } else if (size === 0) {
        size = end - i;
      }
      if (size < head || i + size > end) break;
      out.push({ type: buf.toString('latin1', i + 4, i + 8), at: i + head, end: i + size });
      i += size;
    }
    return out;
  };
  const kids = (parent, type) => (parent ? boxes(parent.at, parent.end).filter((b) => b.type === type) : []);
  for (const trak of kids(boxes(0, buf.length).find((b) => b.type === 'moov'), 'trak')) {
    const mdia = kids(trak, 'mdia')[0];
    const hdlr = kids(mdia, 'hdlr')[0];
    const mdhd = kids(mdia, 'mdhd')[0];
    if (!hdlr || !mdhd || hdlr.end - hdlr.at < 12 || buf.toString('latin1', hdlr.at + 8, hdlr.at + 12) !== 'vide') continue;
    const v1 = buf[mdhd.at] === 1;
    if (mdhd.end - mdhd.at < (v1 ? 32 : 20)) return null;
    const scale = buf.readUInt32BE(mdhd.at + (v1 ? 20 : 12));
    const units = v1 ? Number(buf.readBigUInt64BE(mdhd.at + 24)) : buf.readUInt32BE(mdhd.at + 16);
    return scale > 0 && units > 0 ? units / scale : null;
  }
  return null;
}

// P7: AE renders thumb.mp4 into the MOGRT at export, the template with its defaults over black, 640x360, full
// length. The card grid gets it 480 px wide as H.264 that plays while it loads (+faststart), without audio; the
// poster is the frame in the middle of the hold, where the template is fully built. A thumb that ends before that
// gives its frame just before the end instead. -> { posterSec }: the time the poster was cut at.
export function ffmpegPreview({ ffmpeg = findFfmpeg(), run = runFfmpeg } = {}) {
  return async ({ mogrt, posterSec, dir }) => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'crbk-thumb-'));
    try {
      const thumb = extractThumb(mogrt, tmp);
      const seconds = mp4VideoSeconds(readFileSync(thumb));
      const at = seconds === null ? posterSec : Math.min(posterSec, round3(Math.max(0, seconds - POSTER_TAIL_SEC)));
      const preview = path.join(dir, 'preview.mp4');
      const poster = path.join(dir, 'poster.jpg');
      // -nostdin: ffmpeg never waits for a key press.
      const quiet = ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y'];
      run(ffmpeg, [...quiet, '-i', thumb, '-an', '-map_metadata', '-1', '-vf', SCALE, '-c:v', 'libx264', '-preset', 'slow',
        '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', preview], tmp);
      run(ffmpeg, [...quiet, '-ss', at.toFixed(3), '-i', thumb, '-frames:v', '1', '-vf', SCALE, '-q:v', '3',
        '-update', '1', poster], tmp);
      for (const f of [preview, poster]) {
        if (!isFile(f) || statSync(f).size === 0) throw new Error(`ffmpeg wrote no ${path.basename(f)} from ${path.basename(mogrt)}`);
      }
      return { posterSec: at };
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  };
}

// Source files of one item, by the names tools/masters/package.mjs gives them (packagePaths, variantPlan).
function planItem(item, work, tokens, bad) {
  if (item.tier !== 'T1') {
    bad(`tier ${item.tier}: build-catalog builds T1 items only`);
    return null;
  }
  const { id, version } = item;
  const dir = path.posix.join(work, 'build', id);
  const files = [];
  if (item.hosts.includes('ae')) files.push({ kind: 'aep', from: `${dir}/${id}_v${version}.aep`, name: `${id}_v${version}.aep` });
  if (item.hosts.includes('pr')) {
    for (const v of item.variants) {
      const name = `${id}_${v.key}_v${version}.mogrt`;
      files.push({ kind: 'mogrt', variant: v, from: `${dir}/mogrt/${name}`, name });
    }
  }
  for (const f of files) {
    try {
      assertRelease(f.from);
    } catch (e) {
      bad(e.message);
      continue;
    }
    if (!isFile(f.from)) bad(`missing ${f.from}`);
  }
  let fonts;
  if (item.requiredFonts) {
    const pinned = pinFonts(item.requiredFonts, tokens);
    pinned.problems.forEach(bad);
    fonts = pinned.fonts;
  }
  return { item, files, fonts };
}

// The 16:9 MOGRT (the smallest frame if there are several) shows the template as most editors will use it.
function previewSource(p) {
  const mogrts = p.files.filter((f) => f.kind === 'mogrt');
  const wide = mogrts.filter((f) => f.variant.aspect === '16x9').sort((a, b) => a.variant.w * a.variant.h - b.variant.w * b.variant.h);
  return wide[0] || mogrts[0] || null;
}

// Every source key as is; the pipeline pins the font builds, versions aeComp and adds the stored files.
function catalogItem(p) {
  const out = structuredClone(p.item);
  if (p.fonts) out.requiredFonts = p.fonts;
  const mogrt = new Map(p.files.filter((f) => f.kind === 'mogrt').map((f) => [f.variant.key, f.stored]));
  out.variants = out.variants.map((v) => ({ ...v, ...(v.aeComp && { aeComp: `${v.aeComp}_v${p.item.version}` }), ...mogrt.get(v.key) }));
  for (const kind of ['aep', 'preview', 'poster']) {
    const f = p.files.find((x) => x.kind === kind);
    if (f) out[kind] = f.stored;
  }
  return out;
}

function previousVersion(file, log) {
  if (!existsSync(file)) return null;
  try {
    return readJson(file).libraryVersion || null;
  } catch (e) {
    log(`warn ${posix(file)} is unreadable (${e.message}); the build number starts over`);
    return null;
  }
}

// A folder where the build puts a file, or a file where it needs a folder, would stop the moves halfway; it is
// refused before anything moves.
function blockers(root, plans, libraryFile) {
  const kind = (p) => (existsSync(p) ? (statSync(p).isDirectory() ? 'folder' : 'file') : null);
  const items = path.join(root, 'items');
  if (kind(items) === 'file') return ['items is a file, not a folder'];
  const problems = [];
  for (const p of plans) {
    const dir = path.join(items, p.item.id);
    if (kind(dir) === 'file') {
      problems.push(`items/${p.item.id} is a file, not a folder`);
      continue;
    }
    for (const f of p.files) if (kind(path.join(dir, f.name)) === 'folder') problems.push(`items/${p.item.id}/${f.name} is a folder, not a file`);
  }
  if (kind(libraryFile) === 'folder') problems.push('library.json is a folder, not a file');
  return problems;
}

// Moves the staged files into items/<id>/ and replaces library.json last, all or nothing. A file already in place
// first moves aside into <stage>/previous/; on any error each destination gets back what it had, latest move
// first, and the folders made here go if empty. The file names carry no build number, so a half-done move would
// leave the previous catalog naming files whose bytes changed (Windows refuses a rename while a player or a
// preview pane holds the file).
function install({ root, stage, plans, libraryFile, text, rename }) {
  const moves = [];
  const made = [];
  const mkdir = (dir) => {
    if (existsSync(dir)) return;
    mkdirSync(dir);
    made.push(dir);
  };
  try {
    mkdir(path.join(root, 'items'));
    for (const p of plans) {
      const dir = path.join(root, 'items', p.item.id);
      mkdir(dir);
      for (const f of p.files) {
        const m = { dest: path.join(dir, f.name), staged: path.join(p.stageDir, f.name), aside: null, placed: false };
        if (existsSync(m.dest)) {
          const aside = path.join(stage, PREVIOUS, p.item.id, f.name);
          mkdirSync(path.dirname(aside), { recursive: true });
          rename(m.dest, aside);
          m.aside = aside;
        }
        moves.push(m);
        rename(m.staged, m.dest);
        m.placed = true;
      }
    }
    // A rename over library.json replaces it in one step: a reader sees the previous catalog or the new one.
    const tmp = path.join(stage, 'library.json');
    writeFileSync(tmp, text, 'utf8');
    rename(tmp, libraryFile);
  } catch (e) {
    const stuck = [];
    for (const m of moves.reverse()) {
      try {
        // The previous file goes back over the new one; a file that is new leaves for the stage.
        if (m.aside) rename(m.aside, m.dest);
        else if (m.placed) rename(m.dest, m.staged);
      } catch (u) {
        const at = `${posix(path.relative(root, m.dest))} (${u.code || u.message})`;
        stuck.push(m.aside ? `not put back: ${at}; the previous file is ${posix(m.aside)}` : `not taken out: ${at}; it was not there before`);
      }
    }
    for (const dir of made.reverse()) {
      try {
        rmdirSync(dir);
      } catch {
        // Not empty: a file that could not leave is still in it.
      }
    }
    const head = `could not move the new files into ${posix(root)}: ${e.message}`;
    if (!stuck.length) throw new MoveFailed(`${head}\nevery file is back as it was; library.json is unchanged`, null);
    throw new MoveFailed([head, ...stuck, `library.json is unchanged; ${posix(stage)} is kept`].join('\n'), stage);
  }
}

// The stage is scratch space: failing to remove it must not turn a finished build, or a refusal, into another error.
function removeStage(stage, log) {
  try {
    rmSync(stage, { recursive: true, force: true, maxRetries: 3 });
  } catch (e) {
    log(`warn ${posix(stage)} was not removed (${e.code || e.message}); delete it by hand`);
  }
}

// The builder never deletes: what the new catalog no longer names stays for a person to remove.
function staleFiles(root, plans) {
  const itemsDir = path.join(root, 'items');
  if (!existsSync(itemsDir)) return [];
  const keep = new Map(plans.map((p) => [p.item.id, new Set(p.files.map((f) => f.name))]));
  const stale = [];
  for (const e of readdirSync(itemsDir, { withFileTypes: true })) {
    const names = keep.get(e.name);
    if (!names || !e.isDirectory()) {
      stale.push(`items/${e.name}`);
      continue;
    }
    for (const f of readdirSync(path.join(itemsDir, e.name))) if (!names.has(f)) stale.push(`items/${e.name}/${f}`);
  }
  return stale.sort();
}

/**
 * -> { file, doc, files: [{ id, kind: 'aep'|'mogrt'|'preview'|'poster', file, bytes }], stale }. A refusal throws
 * with e.problems listing every reason and leaves the library in <root> as it was. A move that fails after the
 * checks throws once the files moved so far are back (e.kept null), or names in e.kept the stage that holds what
 * could not go back. makePreview may return { posterSec } when it cut the poster elsewhere than asked; rename moves
 * every file into <root> (tests pass one that fails).
 */
export async function buildCatalog({
  root, source, tokens, pluginVersion, work = workDir(), date, now = new Date(), makePreview = ffmpegPreview(), log = () => {},
  rename = renameSync,
}) {
  const day = date === undefined ? calverDate(now) : date;
  const badDate = dateProblem(day);
  if (badDate) throw new Refused([badDate]);
  const src = validateLibrary(source, 'source');
  if (!src.ok) throw new Refused(src.errors.map((e) => 'source: ' + e));
  const problems = [];
  const plans = [];
  for (const item of source.items) {
    const p = planItem(item, posix(work), tokens, (msg) => problems.push(`${item.id}: ${msg}`));
    if (p) plans.push(p);
  }
  if (problems.length) throw new Refused(problems);

  const libraryFile = path.join(root, 'library.json');
  const previous = previousVersion(libraryFile, log);
  mkdirSync(root, { recursive: true });
  const stage = mkdtempSync(path.join(root, '.staging-'));
  let keepStage = false;
  try {
    // Copy first and check the copies, so the library gets exactly the bytes that passed.
    for (const p of plans) {
      p.stageDir = path.join(stage, p.item.id);
      mkdirSync(p.stageDir);
      for (const f of p.files) {
        copyFileSync(f.from, path.join(p.stageDir, f.name));
        if (f.kind !== 'mogrt') continue;
        const bad = (msg) => problems.push(`${p.item.id} ${f.variant.key}: ${f.name}: ${msg}`);
        let m;
        try {
          m = readMogrt(path.join(p.stageDir, f.name));
        } catch (e) {
          bad(`unreadable (${e.message})`);
          continue;
        }
        mogrtProblems(m, p.item, f.variant).forEach(bad);
      }
    }
    if (problems.length) throw new Refused(problems);
    for (const p of plans) {
      const from = previewSource(p);
      if (!from) {
        log(`warn ${p.item.id}: no MOGRT to cut a preview from`);
        continue;
      }
      const d = p.item.duration;
      const hold = round3(d.introSec + d.holdSec / 2);
      const made = await makePreview({ mogrt: path.join(p.stageDir, from.name), posterSec: hold, dir: p.stageDir, id: p.item.id });
      if (made && made.posterSec !== undefined && made.posterSec !== hold) {
        log(`warn ${p.item.id}: thumb.mp4 of ${from.name} ends before ${hold} s, the middle of the hold; the poster is its frame at ${made.posterSec} s`);
      }
      p.files.push({ kind: 'preview', name: 'preview.mp4' }, { kind: 'poster', name: 'poster.jpg' });
    }
    // sha256 and bytes come from the staged files, never from package-report.json (AE saves the .aep again
    // after the report is written).
    for (const p of plans) {
      for (const f of p.files) {
        const file = path.join(p.stageDir, f.name);
        f.stored = { file: `items/${p.item.id}/${f.name}`, sha256: await sha256File(file), bytes: statSync(file).size };
      }
    }
    const doc = {
      schemaVersion: 1,
      libraryVersion: nextLibraryVersion(day, previous),
      minPluginVersion: pluginVersion,
      generatedAt: now.toISOString().replace(/\.\d+Z$/, 'Z'),
      items: plans.map(catalogItem),
    };
    const check = validateLibrary(doc, 'catalog');
    if (!check.ok) throw new Refused(check.errors.map((e) => 'catalog: ' + e));
    const blocked = blockers(root, plans, libraryFile);
    if (blocked.length) throw new Refused(blocked);
    // The moves replace only files the catalog names, so the stale list is the same before and after them.
    const stale = staleFiles(root, plans);

    // The files go into place first and library.json last, so the catalog never names a file that is not there.
    try {
      install({ root, stage, plans, libraryFile, text: JSON.stringify(doc, null, 2) + '\n', rename });
    } catch (e) {
      keepStage = e instanceof MoveFailed && e.kept !== null;
      throw e;
    }
    return {
      file: posix(libraryFile),
      doc,
      files: plans.flatMap((p) => p.files.map((f) => ({ id: p.item.id, kind: f.kind, file: f.stored.file, bytes: f.stored.bytes }))),
      stale,
    };
  } finally {
    if (!keepStage) removeStage(stage, log);
  }
}

const size = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function summary(r) {
  const lines = [];
  const ofKind = (files, kind) => files.filter((f) => f.kind === kind);
  const total = (files) => files.reduce((s, f) => s + f.bytes, 0);
  for (const it of r.doc.items) {
    const files = r.files.filter((f) => f.id === it.id);
    const parts = [];
    for (const kind of ['aep', 'mogrt', 'preview', 'poster']) {
      const xs = ofKind(files, kind);
      if (xs.length) parts.push(`${xs.length > 1 ? xs.length + ' ' : ''}${kind} ${size(total(xs))}`);
    }
    lines.push(`${it.id} v${it.version}: ${parts.join(', ')}`);
  }
  for (const s of r.stale) lines.push(`stale, kept: ${s}`);
  const counts = ['aep', 'mogrt', 'preview', 'poster'].map((k) => `${ofKind(r.files, k).length} ${k}`).join(', ');
  const n = r.doc.items.length;
  lines.push(`OK ${r.file}: ${n} item${n === 1 ? '' : 's'}, libraryVersion ${r.doc.libraryVersion}, ${r.files.length} files (${counts}), ${size(total(r.files))}`);
  return lines;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let args = null;
  try {
    args = parseArgs({ options: { root: { type: 'string' }, date: { type: 'string' }, work: { type: 'string' } } }).values;
  } catch (e) {
    console.error(e.message);
  }
  if (args && args.date !== undefined && dateProblem(args.date)) {
    console.error(dateProblem(args.date));
    args = null;
  }
  if (!args || !args.root) {
    console.error(USAGE);
    process.exit(2);
  }
  try {
    const r = await buildCatalog({
      root: args.root,
      work: args.work,
      date: args.date,
      source: readJson(path.join(REPO, 'library', 'library.src.json')),
      tokens: readJson(path.join(REPO, 'brand', 'tokens.json')),
      pluginVersion: readJson(path.join(REPO, 'panel', 'version.json')).version,
      log: console.log,
    });
    for (const line of summary(r)) console.log(line);
  } catch (e) {
    // Refusals and failed moves explain themselves in full; other errors keep their stack.
    console.error(e instanceof Refused || e instanceof MoveFailed ? e.message : e.stack || e.message);
    console.error(`FAIL ${posix(path.join(args.root, 'library.json'))} was not written`);
    process.exitCode = 1;
  }
}
