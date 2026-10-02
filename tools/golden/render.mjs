#!/usr/bin/env node
// Golden renders of every ROOT comp (Plan 2, Task 5; spec §3.2).
//   node tools/golden/render.mjs frames   --all | --slug s [--force] [--wait-ms 1800000]
//   node tools/golden/render.mjs probe-preview
//   node tools/golden/render.mjs previews --all | --slug s
//   node tools/golden/render.mjs review   --slug s --ok true|false --text "<what was checked>"
// PNGs go to <work>/golden/<slug>/<compSlug>/t<ms>.png and stay out of git; the manifest with times
// and sha256 is docs/research/golden/<slug>.json. A pack renders only when its relinked copy is clean
// (relink-report.json: goldenOk) and AE confirms 0 missing footage again right before each comp.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workPath, ensureDir } from '../lib/work.mjs';
import { SLUGS } from '../packs/packs.mjs';
import { packDir } from '../packs/paths.mjs';
import { sha256File } from '../packs/fsutil.mjs';
import { callJsx, REPO } from '../packs/jsx-call.mjs';
import { openProject, closeDiscard } from '../packs/ae-project.mjs';
import { relinkedPath } from '../packs/relink.mjs';
import { rootsFile } from './roots.mjs';
import { keyFrames, RULE } from './keytimes.mjs';
import { pngSize, waitForStableFiles } from './png.mjs';
import { aerenderPath, runWatched, ffprobeVideo, previewOk } from './aerender.mjs';

export const PREVIEW_MAX_S = 60;
export const CAPABILITY = path.join(REPO, 'docs', 'research', 'golden', 'preview-capability.json');
export const manifestFile = (slug) => path.join(REPO, 'docs', 'research', 'golden', slug + '.json');
export const compDir = (slug, compSlug) => workPath('golden', slug, compSlug);
const KEY_ORDER = ['slug', 'status', 'reason', 'project', 'aeVersion', 'date', 'rule', 'comps', 'preview', 'review'];
const today = () => new Date().toISOString().slice(0, 10);
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const writeJson = (f, v) => {
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify(v, null, 2) + '\n', 'utf8');
};
const native = (p) => (process.platform === 'win32' ? p.replace(/\//g, '\\') : p);
const reportOf = (slug) => path.posix.join(packDir(slug), 'relink-report.json');

export function orderManifest(man) {
  const out = {};
  for (const k of KEY_ORDER) if (man[k] !== undefined) out[k] = man[k];
  for (const k of Object.keys(man)) if (!(k in out)) out[k] = man[k];
  return out;
}
const saveManifest = (slug, man) => writeJson(manifestFile(slug), orderManifest(man));
const loadManifest = (slug) => (existsSync(manifestFile(slug)) ? readJson(manifestFile(slug)) : null);

export function framePlan(slug, root) {
  const dir = compDir(slug, root.compSlug);
  return keyFrames(root).map((k) => ({ ...k, file: dir + '/t' + k.ms + '.png' }));
}

// Done = the manifest lists exactly these frames and every PNG is still there with that size.
export function compDone(entry, plan) {
  if (!entry || !Array.isArray(entry.frames) || entry.frames.length !== plan.length) return false;
  return plan.every((p, i) => entry.frames[i].ms === p.ms && existsSync(p.file) && statSync(p.file).size === entry.frames[i].bytes);
}

export function gateReason(acc) {
  if (acc.goldenOk) return null;
  const parts = [];
  if (acc.missing.length) parts.push('missing footage: ' + acc.missing.map((m) => m.name).join(', '));
  if (acc.external.length) parts.push('footage outside the pack: ' + acc.external.length);
  if (acc.usedSubstitutes.length) parts.push('substituted fonts: ' + acc.usedSubstitutes.join(', '));
  if (acc.suspiciousFonts.length) parts.push('fonts from a wrong file: ' + acc.suspiciousFonts.join(', '));
  return parts.join('; ') || 'not accepted';
}

// Every ROOT comp gets a preview (spec §3.2); a longer comp only its first PREVIEW_MAX_S seconds.
export function previewItems(slug, roots) {
  return roots.map((r) => ({
    id: r.id, name: r.name, out: compDir(slug, r.compSlug) + '/preview_half.mp4', span: Math.min(r.duration, PREVIEW_MAX_S),
  }));
}

function eligible(slug) {
  return existsSync(reportOf(slug)) && readJson(reportOf(slug)).acceptance.goldenOk && existsSync(rootsFile(slug));
}

async function framesOne(slug, { force, waitMs }) {
  const man = loadManifest(slug) || { slug, comps: [] };
  if (!existsSync(reportOf(slug))) throw new Error('NO_RELINK_REPORT: ' + reportOf(slug) + ' (Task 3)');
  const reason = gateReason(readJson(reportOf(slug)).acceptance);
  if (reason) {
    saveManifest(slug, { ...man, slug, status: 'skipped', reason, date: today() });
    return { status: 'skipped', reason };
  }
  if (!existsSync(rootsFile(slug))) throw new Error('NO_ROOTS: ' + rootsFile(slug) + ' (Task 4)');
  const roots = readJson(rootsFile(slug)).roots;
  const project = relinkedPath(slug);
  await openProject(project);
  Object.assign(man, { slug, project: path.posix.basename(project), rule: RULE, status: 'partial' });
  delete man.reason;
  man.comps = (man.comps || []).filter((c) => roots.some((r) => r.id === c.id));
  for (const root of roots) {
    const plan = framePlan(slug, root);
    const at = man.comps.findIndex((c) => c.id === root.id);
    if (!force && at !== -1 && compDone(man.comps[at], plan)) {
      console.log(`  ${root.compSlug}: done, skipped`);
      continue;
    }
    const dir = ensureDir(compDir(slug, root.compSlug));
    for (const n of readdirSync(dir)) if (/^t\d+\.png$/.test(n)) rmSync(path.posix.join(dir, n)); // quirk #27: no leftovers
    console.log(`  ${root.compSlug}: queueing ${plan.length} frames`);
    const r = await callJsx('tools/golden/render.jsx', {
      expect: project, compId: root.id, compName: root.name, outDir: dir, frames: plan.map(({ f, ms }) => ({ f, ms })),
    }, { timeoutMs: 900000 });
    let shown = 0;
    await waitForStableFiles(plan.map((p) => p.file), {
      timeoutMs: waitMs,
      onProgress: (n, total) => {
        if (Date.now() - shown > 30000) { shown = Date.now(); console.log(`  ${root.compSlug}: ${n}/${total} PNG ready`); }
      },
    });
    const frames = [];
    for (const p of plan) {
      const s = pngSize(p.file);
      if (s.width !== root.width || s.height !== root.height) {
        throw new Error(`PNG_SIZE: ${p.file} is ${s.width}x${s.height}, the comp is ${root.width}x${root.height}`);
      }
      frames.push({ f: p.f, ms: p.ms, bytes: statSync(p.file).size, sha256: await sha256File(p.file) });
    }
    const entry = {
      id: root.id, name: root.name, compSlug: root.compSlug, width: root.width, height: root.height,
      fps: root.fps, duration: root.duration, resolutionBefore: r.resolutionBefore, frames,
    };
    if (at === -1) man.comps.push(entry); else man.comps[at] = entry;
    Object.assign(man, { aeVersion: r.version, date: today() });
    saveManifest(slug, man); // after every comp, so a stopped run resumes here
    console.log(`  ${root.compSlug}: ${frames.length} frames`);
  }
  man.comps.sort((a, b) => (a.compSlug < b.compSlug ? -1 : 1));
  man.status = 'ok';
  saveManifest(slug, man);
  await closeDiscard(project); // drops only our resolution changes; the relinked file stays as saved
  return man;
}

async function probePreview() {
  const slug = SLUGS.find((s) => eligible(s) && previewItems(s, readJson(rootsFile(s)).roots).length);
  if (!slug) throw new Error('NO_ELIGIBLE_PACK: run relink (Task 3), roots (Task 4) and frames first');
  const project = relinkedPath(slug);
  const items = previewItems(slug, readJson(rootsFile(slug)).roots).slice(0, 1);
  await openProject(project);
  let r;
  try {
    r = await callJsx('tools/golden/preview-rq.jsx', { expect: project, mode: 'probe', items, omPattern: 'H\\.?264', prefer: '15' });
  } catch (e) {
    if (!/CDP_TIMEOUT/.test(e.message)) await closeDiscard(project);
    throw e;
  }
  await closeDiscard(project); // the probe's queue item is gone and nothing of it is saved
  const cap = {
    date: today(), slug, aeVersion: r.version, capable: r.capable,
    reason: r.capable ? null : (r.omTemplate ? 'RESOLUTION_HALF_NOT_SET' : 'NO_H264_TEMPLATE'),
    omTemplate: r.omTemplate || null, templates: r.templates, setup: r.setup || null,
  };
  writeJson(CAPABILITY, cap);
  return cap;
}

async function previewsOne(slug, cap) {
  const man = loadManifest(slug);
  if (!man || man.status !== 'ok') return { status: 'skipped', reason: 'golden frames are not done' };
  const roots = readJson(rootsFile(slug)).roots;
  const items = previewItems(slug, roots);
  if (!items.length) {
    man.preview = { status: 'none', reason: 'no ROOT comp', date: today() };
    saveManifest(slug, man);
    return man.preview;
  }
  const project = relinkedPath(slug);
  const rq = workPath('golden', slug, slug + '_preview_rq.aep');
  for (const f of [rq, ...items.map((it) => it.out)]) if (existsSync(f)) rmSync(f); // our own outputs of a previous run
  await openProject(project);
  try {
    await callJsx('tools/golden/preview-rq.jsx',
      { expect: project, mode: 'queue', items, omTemplate: cap.omTemplate, savePath: rq }, { timeoutMs: 300000 });
  } catch (e) {
    if (!/CDP_TIMEOUT/.test(e.message)) await closeDiscard(project);
    throw e;
  }
  await closeDiscard(rq); // the GUI lets go of the preview project before aerender reads it
  const byId = new Map(roots.map((r) => [r.id, r]));
  const want = (it) => ({ ...byId.get(it.id), duration: it.span }); // a long comp: its first PREVIEW_MAX_S seconds
  const run = await runWatched({
    exe: aerenderPath(), args: ['-project', native(rq), '-close', 'DO_NOT_SAVE_CHANGES'],
    logFile: workPath('golden', slug, 'aerender.log'),
    isDone: async () => items.every((it) => previewOk(ffprobeVideo(it.out), want(it))),
  });
  const files = [];
  const failed = [];
  for (const it of items) {
    const root = byId.get(it.id);
    const info = ffprobeVideo(it.out);
    const file = path.posix.relative(workPath(), it.out);
    if (previewOk(info, want(it))) files.push({ compSlug: root.compSlug, file, span: it.span, ...info, sha256: await sha256File(it.out) });
    else failed.push({ compSlug: root.compSlug, file, span: it.span, info });
  }
  man.preview = { status: failed.length ? 'failed' : 'ok', omTemplate: cap.omTemplate, aerender: run, files, failed, date: today() };
  saveManifest(slug, man);
  return man.preview;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [cmd, ...argv] = process.argv.slice(2);
  const val = (flag) => { const i = argv.indexOf(flag); return i === -1 ? undefined : argv[i + 1]; };
  const all = argv.includes('--all');
  const slugs = all ? SLUGS : [val('--slug')].filter(Boolean);
  try {
    if (cmd === 'frames' && slugs.length) {
      const waitMs = Number(val('--wait-ms') || 1800000);
      for (const slug of slugs) {
        if (all && !existsSync(reportOf(slug))) { console.log(`${slug}: not relinked yet, skipped`); continue; }
        console.log(slug + ':');
        const m = await framesOne(slug, { force: argv.includes('--force'), waitMs });
        console.log(`${slug}: ${m.status}${m.reason ? ' (' + m.reason + ')' : ''}`);
      }
    } else if (cmd === 'probe-preview') {
      const cap = await probePreview();
      console.log(`preview capability: ${cap.capable} (${cap.reason || cap.omTemplate}) -> ${CAPABILITY}`);
    } else if (cmd === 'previews' && slugs.length) {
      const cap = existsSync(CAPABILITY) ? readJson(CAPABILITY) : null;
      if (!cap || !cap.capable) {
        console.log('previews skipped: ' + (cap ? cap.reason : 'run probe-preview first'));
      } else {
        for (const slug of slugs) {
          const p = await previewsOne(slug, cap);
          console.log(`${slug}: preview ${p.status}${p.reason ? ' (' + p.reason + ')' : ''}`);
        }
      }
    } else if (cmd === 'review' && slugs.length === 1 && ['true', 'false'].includes(val('--ok'))) {
      const man = loadManifest(slugs[0]);
      if (!man) throw new Error('NO_MANIFEST: ' + manifestFile(slugs[0]));
      man.review = (man.review || []).concat([{ date: today(), ok: val('--ok') === 'true', text: val('--text') || '' }]);
      saveManifest(slugs[0], man);
      console.log(`${slugs[0]}: review recorded`);
    } else {
      console.error('usage: node tools/golden/render.mjs frames|previews --all|--slug s | probe-preview | review --slug s --ok true|false --text "..."');
      process.exit(2);
    }
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exitCode = 1; // not process.exit(): see tools/packs/relink.mjs
  }
}
