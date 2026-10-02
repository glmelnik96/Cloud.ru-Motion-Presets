#!/usr/bin/env node
// Relink the pack copies in the live AE (Plan 2, Task 3).
//   node tools/packs/relink.mjs --all | --slug webinars [--note "<what you saw in AE>"]
//   node tools/packs/relink.mjs --slug webinars --report-only   (re-read an existing <slug>_relinked.aep)
// Per pack: open <slug>.aep (refused while another project has unsaved changes) -> scan footage ->
// resolve in Node -> replace + Save As <slug>_relinked.aep -> relink-report.json in the pack folder
// and a line in docs/research/packs/relink-summary.json. The archive and the package are never opened.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { walkFiles } from './fsutil.mjs';
import { SLUGS, KNOWN_MISSING } from './packs.mjs';
import { packDir } from './paths.mjs';
import { callJsx, REPO } from './jsx-call.mjs';
import { openProject, sameProjectFile } from './ae-project.mjs';
import { resolveFootage, acceptance } from './relink-resolve.mjs';

export const REPORT = 'relink-report.json';
export const SUMMARY = path.join(REPO, 'docs', 'research', 'packs', 'relink-summary.json');
const JSX = 'tools/packs/relink.jsx';

export const relinkedPath = (slug) => path.posix.join(packDir(slug), slug + '_relinked.aep');

export function summarize(report) {
  const a = report.acceptance;
  return {
    date: report.date,
    aeVersion: report.after.version,
    replaced: report.replaced ? report.replaced.filter((r) => r.ok).length : null,
    unresolvedBefore: report.plan ? report.plan.unresolved.map((u) => u.name + ' (' + u.reason + ')') : null,
    missingAfter: a.missing.map((m) => m.name),
    external: a.external.length,
    relinkOk: a.relinkOk,
    goldenOk: a.goldenOk,
    usedFonts: report.after.fonts.used.map((f) => f.postScriptName + ' ' + f.version + (f.isSubstitute ? ' SUBSTITUTE' : '')),
    missingOrSubstitutedFonts: report.after.fonts.missingOrSubstituted.map((f) => f.postScriptName),
    suspiciousFonts: a.suspiciousFonts,
    expressionEngine: report.after.engine,
    notes: report.notes,
  };
}

async function relinkOne(slug, { reportOnly, note }) {
  const dir = packDir(slug);
  const mapDoc = JSON.parse(readFileSync(path.posix.join(dir, 'relink-map.json'), 'utf8'));
  const target = relinkedPath(slug);
  const reportFile = path.posix.join(dir, REPORT);
  const old = existsSync(reportFile) ? JSON.parse(readFileSync(reportFile, 'utf8')) : null;
  let scan = null;
  let plan = null;
  let after;
  if (reportOnly) {
    if (!existsSync(target)) throw new Error('NO_RELINKED: ' + target);
    await openProject(target);
    after = await callJsx(JSX, { mode: 'report', expect: target });
  } else {
    if (existsSync(target)) {
      throw new Error('RELINKED_EXISTS: ' + target + ' (use --report-only, or delete it by hand to relink again)');
    }
    const opened = await openProject(mapDoc.aep);
    const converted = opened.converted ? opened.fingerprint : null;
    scan = await callJsx(JSX, { mode: 'scan', expect: mapDoc.aep, converted });
    const foot = path.posix.join(dir, '(Footage)');
    const files = existsSync(foot) ? walkFiles(foot).map((r) => path.posix.join(foot, r)) : [];
    plan = resolveFootage(scan.footage, { packDir: dir, map: mapDoc.map, files });
    try {
      after = await callJsx(JSX, { mode: 'apply', expect: mapDoc.aep, converted, replace: plan.replace, saveAs: target },
        { timeoutMs: 600000 });
    } catch (e) {
      if (/CDP_TIMEOUT/.test(e.message)) {
        e.message += '\nDo not run the relink again. Close any dialog in AE; if ' + target +
          ' exists, run: node tools/packs/relink.mjs --slug ' + slug + ' --report-only';
      }
      throw e;
    }
    if (!sameProjectFile(after.saved, target)) throw new Error('SAVE_FAILED: AE reports "' + after.saved + '"');
  }
  const report = {
    slug,
    date: new Date().toISOString().slice(0, 10),
    copy: mapDoc.aep,
    relinked: target,
    before: scan ? scan.footage : (old && old.before) || null,
    plan: plan || (old && old.plan) || null,
    replaced: after.replaced || (old && old.replaced) || null,
    after,
    acceptance: acceptance(after, { packDir: dir, knownMissing: KNOWN_MISSING[slug] || [] }),
    notes: ((old && old.notes) || []).concat(note ? [note] : []),
  };
  writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n', 'utf8');
  return report;
}

export function mergeSummary(file, slug, line) {
  const all = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  all[slug] = line;
  const sorted = Object.fromEntries(Object.keys(all).sort().map((k) => [k, all[k]]));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
  return sorted;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const val = (flag) => { const i = argv.indexOf(flag); return i === -1 ? undefined : argv[i + 1]; };
  const slugs = argv.includes('--all') ? SLUGS : [val('--slug')];
  if (!slugs[0]) {
    console.error('usage: node tools/packs/relink.mjs --all | --slug <' + SLUGS.join('|') + '> [--report-only] [--note "<text>"]');
    process.exit(2);
  }
  // exitCode, not process.exit(): exiting while the CDP socket closes crashes libuv on Windows
  process.exitCode = 0;
  for (const slug of slugs) {
    if (argv.includes('--all') && !existsSync(path.posix.join(packDir(slug), 'relink-map.json'))) {
      console.log(`${slug}: no pack copy yet, skipped (Task 2)`);
      continue;
    }
    if (argv.includes('--all') && !argv.includes('--report-only') && existsSync(relinkedPath(slug))) {
      console.log(`${slug}: already relinked, skipped (use --slug ${slug} --report-only to re-read it)`);
      continue;
    }
    try {
      const r = await relinkOne(slug, { reportOnly: argv.includes('--report-only'), note: val('--note') });
      const line = summarize(r);
      mergeSummary(SUMMARY, slug, line);
      console.log(`${slug}: replaced ${line.replaced ?? '-'}, missing after ${line.missingAfter.length}, ` +
        `external ${line.external}, relinkOk ${line.relinkOk}, goldenOk ${line.goldenOk}, fonts ${line.usedFonts.join('; ') || '-'}`);
      if (!line.relinkOk) process.exitCode = 1;
    } catch (e) {
      console.error(`${slug}: ERROR ${e.message}`);
      process.exitCode = 1;
      break; // stop the batch: the next pack must not open on top of a problem
    }
  }
}
