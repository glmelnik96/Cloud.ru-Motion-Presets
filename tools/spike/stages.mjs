// Spike results written in several stages that run as separate commands, on different hosts or machines,
// and add up in one result: AE then Premiere, Windows then Mac, automatic then manual (S8, S9, S11).
// An automatic stage replaces only its own checks; checks of other stages and manual checks
// (tools/spike/manual.mjs) are kept, so a stage can be re-run without losing observations.
// When one invocation runs the stages of a spike in order and --only continues that run (S5-S7),
// use runStages from tools/spike/multistage.mjs (task 15) instead.
// verdict, verdictLocked: as in makeResult; S8 writes 'measured', locked. Without a verdict, a locked
// verdict of the previous result is kept, so a re-run cannot unlock it by accident; keepLocked: false
// computes the verdict from the checks instead (S9: a real run replaces the 'not-run' of branch A).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { RESULTS_DIR, makeResult, writeResult } from './result.mjs';

export function upsertStageChecks(prev, stage, checks) {
  if (!stage) throw new Error('stage is required');
  const kept = (prev || []).filter((c) => c.stage !== stage);
  return kept.concat(checks.map((c) => ({ ...c, stage })));
}

export function mergeHostVersion(prev, next) {
  if (!prev) return next || null;
  if (!next || prev.includes(next)) return prev;
  return prev + '; ' + next;
}

export function readResult(id, dir = RESULTS_DIR) {
  const file = path.join(dir, id + '.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

export function writeStageResult({
  id, title, host, hostVersion = null, stage, checks, verdict, verdictLocked = false, keepLocked = true,
  fallback = '', notes = '', evidence = [], dir = RESULTS_DIR,
}) {
  const prev = readResult(id, dir);
  const keep = Boolean(!verdict && keepLocked && prev && prev.verdictLocked);
  const result = makeResult({
    id, title, host,
    hostVersion: mergeHostVersion(prev ? prev.hostVersion : null, hostVersion),
    checks: upsertStageChecks(prev ? prev.checks : [], stage, checks),
    verdict: keep ? prev.verdict : verdict,
    verdictLocked: keep || verdictLocked,
    fallback, notes,
    evidence: [...new Set([...((prev && prev.evidence) || []), ...evidence])],
  });
  writeResult(result, dir);
  return result;
}
