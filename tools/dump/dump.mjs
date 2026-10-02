#!/usr/bin/env node
// JSX dumps of AE projects (spec 3.2): <work>/dumps/<slug>/<compSlug>.json per comp, plus
// index.json (comp list) and project.json (items, footage, fonts, project settings).
//   node tools/dump/dump.mjs --slug logo        # <packs>/logo/logo_relinked.aep
//   node tools/dump/dump.mjs --all              # every pack, one after another
//   node tools/dump/dump.mjs --slug fixture --project C:/CRBK/work/fixtures/CRT_fixture.aep
//   --no-eval: do not evaluate expressions (if an evaluation ever raises a modal dialog in AE)
// AE is only read: open, read, close without saving. A host call is never retried (spec 6):
// on a CDP timeout the run stops; check AE for a modal dialog first (ae-quirks #25).
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../host-run.mjs';
import { assertAscii, workPath } from '../lib/work.mjs';
import { packDir } from '../packs/paths.mjs';
import { compSlugs } from '../packs/slug.mjs';
import { readJson } from './model.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const JSX_FILE = path.join(here, 'dump-project.jsx');
export const PACK_SLUGS = ['logo', 'logo_conv', 'titles', 'titles_conv', 'webinars', 'courses', 'courses_conv', 'smm', 'podcast'];
export const DEFAULT_CAPS = { maxKeys: 1000, maxVertices: 5000, maxText: 20000, maxExpr: 50000, evalExpressions: 1 };
export const TIMEOUTS = { open: 300000, comp: 1200000, close: 120000 };

// The relinked working copy of a pack (Task 3): <packs>/<slug>/<slug>_relinked.aep, C:/CRBK/packs on Windows.
export function packProject(slug, env = process.env, platform = process.platform) {
  return path.posix.join(packDir(slug, env, platform), slug + '_relinked.aep');
}

export function composeDumpJsx(params) {
  return 'var PARAMS = ' + JSON.stringify(params) + ';\n' + readFileSync(JSX_FILE, 'utf8');
}

// Dump file of every comp: compSlug from compSlugs() (Task 2) over all comps of the project, so the
// file is named like the comp's golden folder (Task 4). index and project are the folder's own files:
// only a comp slugged that way gets the file <compSlug>__<id>.json (compSlugs never make "__").
const RESERVED = new Set(['index', 'project']);
export function compFiles(comps) {
  const out = new Map();
  for (const [id, compSlug] of compSlugs(comps)) {
    out.set(id, { compSlug, file: (RESERVED.has(compSlug) ? compSlug + '__' + id : compSlug) + '.json' });
  }
  return out;
}

// The real host. Every path the JSX sees must be ASCII (spec 4.4; AE 26.1+ mangles non-ASCII paths).
export function aeHost(params, timeoutMs) {
  for (const k of ['project', 'out']) if (params[k]) assertAscii(params[k]);
  return run('ae', composeDumpJsx(params), { timeoutMs });
}

export async function dumpProject({
  slug, project, outRoot, host = aeHost, caps = DEFAULT_CAPS, log = console.log, now = () => new Date(),
}) {
  const finalDir = path.posix.join(outRoot, slug);
  const tmpDir = finalDir + '.tmp';
  const rawDir = path.posix.join(tmpDir, '_raw');
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(rawDir, { recursive: true });

  const opened = await host({ op: 'open', project, out: rawDir + '/project.json' }, TIMEOUTS.open);
  if (!opened.ok) throw new Error(slug + ': ' + opened.error.code + ': ' + opened.error.message);
  const info = opened.data;
  log(`${slug}: ${info.file} | AE ${info.aeVersion} | engine ${info.expressionEngine} | ${info.comps.length} comps | missing footage ${info.missingFootage}`);

  const files = compFiles(info.comps);
  const index = {
    schema: 'crbk-dump-index/1', slug, project, file: info.file, aeVersion: info.aeVersion,
    expressionEngine: info.expressionEngine, missingFootage: info.missingFootage,
    dumpedAt: now().toISOString(), comps: [], errors: [],
  };
  let n = 0;
  for (const c of info.comps) {
    n += 1;
    const raw = `${rawDir}/c${c.id}.json`;
    const r = await host({ op: 'comp', project, compId: c.id, out: raw, caps }, TIMEOUTS.comp);
    if (!r.ok) {
      index.errors.push({ id: c.id, name: c.name, error: r.error });
      log(`  [${n}/${info.comps.length}] ${c.name}: ERROR ${r.error.code}: ${r.error.message}`);
      continue;
    }
    const dump = readJson(raw);
    const { compSlug, file } = files.get(c.id);
    dump.slug = slug;
    dump.compSlug = compSlug;
    writeFileSync(path.posix.join(tmpDir, file), JSON.stringify(dump, null, 1) + '\n', 'utf8');
    index.comps.push({
      id: c.id, name: c.name, folder: c.folder, compSlug, file, layers: dump.layers.length,
      bytes: r.data.bytes, ms: r.data.stats.ms, truncated: r.data.truncated,
      expressions: r.data.stats.expressions, expressionErrors: r.data.stats.expressionErrors,
    });
    log(`  [${n}/${info.comps.length}] ${c.name} -> ${file} (${dump.layers.length} layers, ${r.data.stats.ms} ms` +
      (r.data.truncated ? `, ${r.data.truncated} truncated` : '') + ')');
  }

  const closed = await host({ op: 'close', project }, TIMEOUTS.close);
  if (!closed.ok) log(`${slug}: close failed: ${closed.error.code}: ${closed.error.message}`);

  writeFileSync(path.posix.join(tmpDir, 'project.json'), JSON.stringify(readJson(rawDir + '/project.json'), null, 1) + '\n', 'utf8');
  writeFileSync(path.posix.join(tmpDir, 'index.json'), JSON.stringify(index, null, 1) + '\n', 'utf8');
  rmSync(rawDir, { recursive: true, force: true });
  rmSync(finalDir, { recursive: true, force: true });
  renameSync(tmpDir, finalDir);
  return index;
}

export function parseArgs(argv) {
  const o = { slug: null, all: false, project: null, out: null, noEval: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--slug') { o.slug = argv[i + 1]; i += 1; }
    else if (a === '--project') { o.project = argv[i + 1]; i += 1; }
    else if (a === '--out') { o.out = argv[i + 1]; i += 1; }
    else if (a === '--all') o.all = true;
    else if (a === '--no-eval') o.noEval = true;
    else throw new Error('unknown argument: ' + a);
  }
  if (o.all ? (o.slug || o.project) : !o.slug) {
    throw new Error('usage: node tools/dump/dump.mjs --slug <slug> [--project <file.aep>] | --all; options: --out <dir>, --no-eval');
  }
  return o;
}

const STOP = /CDP_TIMEOUT|CDP_UNREACHABLE|CDP_NO_PAGE|CDP_CLOSED|HOST_EMPTY|HOST_EVAL_ERROR|PROJECT_DIRTY/;

// Exit code of a run: 0 all dumped, 1 a pack failed, 2 stopped (look at AE before anything else).
async function main(o) {
  const outRoot = o.out ? o.out.replace(/\\/g, '/') : workPath('dumps');
  const caps = { ...DEFAULT_CAPS, evalExpressions: o.noEval ? 0 : 1 };
  const jobs = o.all
    ? PACK_SLUGS.map((slug) => ({ slug, project: packProject(slug) }))
    : [{ slug: o.slug, project: (o.project || packProject(o.slug)).replace(/\\/g, '/') }];
  let failed = 0;
  for (const job of jobs) {
    if (!existsSync(job.project)) { console.error(`${job.slug}: no project ${job.project}`); failed += 1; continue; }
    try {
      const index = await dumpProject({ ...job, outRoot, caps });
      console.log(`${job.slug}: ${index.comps.length} comps -> ${outRoot}/${job.slug} (${index.errors.length} errors)`);
      if (index.errors.length) failed += 1;
    } catch (e) {
      console.error(`${job.slug}: ${e.message}`);
      if (STOP.test(e.message)) {
        console.error('Stopped: look at After Effects first (a modal dialog, an unsaved project); do not re-run blindly (ae-quirks #25).');
        return 2;
      }
      failed += 1;
    }
  }
  return failed ? 1 : 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let o = null;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); }
  // exitCode, not process.exit(): exiting while the CDP socket closes crashes libuv on Windows (plan 2 conventions)
  process.exitCode = o ? await main(o) : 2;
}
