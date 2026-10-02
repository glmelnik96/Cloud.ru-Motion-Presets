// Multi-stage spikes (part D): a spike is a list of named stages - host probes and Node analyses - that run
// one after another in one invocation. Each stage's checks, data and evidence are stored in
// spikes/results/<id>.data.json; after every invocation spikes/results/<id>.json is rebuilt from the
// stages in their declared order (makeResult/writeResult).
// Which stage helper to use:
//   - this module: several stages of one spike in one invocation (S5-S7). --only <stages> continues the same
//     run: the same run folder, the other stages and the manual checks (tools/spike/manual.mjs) are kept.
//     A full run starts fresh: a new run folder, no manual checks, as a fresh spike would;
//   - tools/spike/stages.mjs (Task 19): stages that run as separate commands, on different hosts or machines,
//     and accumulate in one result (S8, S9, S11: AE then Premiere, Windows then Mac).
//   await runStages({ id, title, host, fallback, notes, stages, argv: process.argv.slice(2) })
//   stages: [{ name, host: 'ae' | 'pr' | 'node', onDemand?: true, run: async (ctx) => entry }]
//   entry:  { checks, data, evidence, notes, hostVersion }
//   ctx:    { runDir, stages: the entries saved so far, by stage name }
// No stage is retried. A stage that throws becomes a failed check and stops the run; after a cheap read
// of the host, continue with --only <stage>,<stage> (same run folder, the other stages are kept).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { run } from '../host-run.mjs';
import { composeProbe } from './runner.mjs';
import { RESULTS_DIR, makeResult, writeResult } from './result.mjs';
import { workPath } from '../lib/work.mjs';

const HOST_LABEL = { ae: 'AE', pr: 'Pr' };

export function nodeCheck(name, pass, detail = '', required = true) {
  return { name, pass: pass === true, required: required !== false, detail };
}

// One host probe: PARAMS + spikes/lib/check.jsx + files, ending with finish({...}).
export async function runStage({ host, files, params = {}, timeoutMs = 300000 }) {
  const r = await run(host, composeProbe(files, params), { timeoutMs });
  if (!r || !Array.isArray(r.checks)) {
    throw new Error('the probe must end with finish({...}); got ' + JSON.stringify(r).slice(0, 300));
  }
  const data = r.data || {};
  return { checks: r.checks, data, hostVersion: data.hostVersion || null };
}

export function dataFile(id, dir = RESULTS_DIR) {
  return path.join(dir, id + '.data.json');
}

export function loadStages(id, dir = RESULTS_DIR) {
  const f = dataFile(id, dir);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : { meta: {}, stages: {} };
}

function writeStore(id, store, dir) {
  const f = dataFile(id, dir);
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify(store, null, 2) + '\n', 'utf8');
  return f;
}

export function resetStages(id, meta, dir = RESULTS_DIR) {
  return writeStore(id, { meta, stages: {} }, dir);
}

export function saveStage(id, name, entry, dir = RESULTS_DIR) {
  const store = loadStages(id, dir);
  store.stages[name] = {
    at: new Date().toISOString(),
    host: entry.host || 'node',
    hostVersion: entry.hostVersion || null,
    checks: entry.checks || [],
    data: entry.data || {},
    evidence: entry.evidence || [],
    notes: entry.notes || '',
  };
  writeStore(id, store, dir);
  return store;
}

// '26.5.2' when one host answered, 'AE 26.5; Pr 26.5.2' when both did.
export function hostVersionOf(stages, order) {
  const seen = {};
  for (const name of order) {
    const st = stages[name];
    if (st && st.host !== 'node' && st.hostVersion && !seen[st.host]) seen[st.host] = st.hostVersion;
  }
  const hosts = Object.keys(seen);
  if (!hosts.length) return null;
  if (hosts.length === 1) return seen[hosts[0]];
  return hosts.map((h) => (HOST_LABEL[h] || h) + ' ' + seen[h]).join('; ');
}

export function rebuildResult({ id, title, host, stageOrder, fallback = '', notes = '' },
  { dir = RESULTS_DIR, keepManual = true } = {}) {
  const store = loadStages(id, dir);
  let checks = [];
  let evidence = [];
  const noteParts = notes ? [notes] : [];
  for (const name of stageOrder) {
    const st = store.stages[name];
    if (!st) continue;
    checks = checks.concat(st.checks.map((c) => ({ ...c, stage: name })));
    evidence = evidence.concat(st.evidence);
    if (st.notes) noteParts.push(name + ': ' + st.notes);
  }
  const prevFile = path.join(dir, id + '.json');
  if (keepManual && existsSync(prevFile)) {
    const prev = JSON.parse(readFileSync(prevFile, 'utf8'));
    checks = checks.concat((prev.checks || []).filter((c) => c.manual === true));
  }
  const result = makeResult({
    id, title, host, hostVersion: hostVersionOf(store.stages, stageOrder), checks, fallback,
    notes: noteParts.join('\n'), evidence: [...new Set(evidence)],
  });
  return { result, file: writeResult(result, dir) };
}

export function parseOnly(argv) {
  const i = argv.indexOf('--only');
  if (i === -1) return null;
  return String(argv[i + 1] || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-');
}

export async function runStages({ id, title, host, fallback = '', notes = '', stages, argv = [], dir = RESULTS_DIR, runRoot }) {
  const only = parseOnly(argv);
  const names = stages.map((s) => s.name);
  for (const n of only || []) {
    if (!names.includes(n)) throw new Error('unknown stage: ' + n + ' (known: ' + names.join(', ') + ')');
  }
  if (!only) {
    const runDir = path.posix.join(runRoot || workPath(id.toLowerCase()), 'run-' + stamp());
    resetStages(id, { runDir, startedAt: new Date().toISOString() }, dir);
  }
  const meta = loadStages(id, dir).meta || {};
  if (!meta.runDir) throw new Error('no earlier run of ' + id + ' to continue: run it once without --only');
  mkdirSync(meta.runDir, { recursive: true });
  const todo = stages.filter((s) => (only ? only.includes(s.name) : !s.onDemand));
  let failed = null;
  for (const st of todo) {
    let entry;
    try {
      entry = await st.run({ runDir: meta.runDir, stages: loadStages(id, dir).stages });
    } catch (e) {
      failed = st.name;
      entry = { checks: [nodeCheck('stage ' + st.name + ' completed', false, String((e && e.message) || e))] };
    }
    saveStage(id, st.name, { host: st.host || 'node', ...entry }, dir);
    const cs = entry.checks || [];
    console.log(id + ' ' + st.name + ': ' + cs.filter((c) => c.pass).length + '/' + cs.length + ' checks passed');
    if (failed) break;
  }
  const { result, file } = rebuildResult({ id, title, host, stageOrder: names, fallback, notes }, { dir, keepManual: !!only });
  console.log(id + ': ' + result.verdict + ' (' + result.checks.length + ' checks) -> ' + file);
  if (failed) {
    console.log(id + ': stage "' + failed + '" failed. Check the host with a cheap read first '
      + '(node tools/host-run.mjs --host pr "JSON.stringify({ v: app.version })"), '
      + 'then continue with --only <stages>. A mutating stage is never re-run blindly.');
  }
  return { result, file, failed, runDir: meta.runDir };
}
