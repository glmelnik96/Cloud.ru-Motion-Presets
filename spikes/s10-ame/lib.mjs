// Helpers for spikes/s10-ame/run.mjs (unit-tested in tests/spikes/s10-lib.test.mjs). All are pure except
// recordPersist, which updates spikes/results/S10.json.
import { appendManualCheck } from '../../tools/spike/result.mjs';
import { COMP_LT, COMP_HATCH, fixtureParams } from '../fixtures/contract.mjs';

// "build=26.5.2|addComp=true|guids=a;b|addDL=ok|run=true" -> { build: '26.5.2', addComp: 'true', ... }
export function parseAmeReply(reply) {
  const out = {};
  if (typeof reply !== 'string' || !reply) return out;
  for (const part of reply.split('|')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
}

export function normGuid(g) {
  return String(g || '').toLowerCase().replace(/[{}\s]/g, '');
}

// Is the AE comp GUID among the ';'-separated GUIDs that AME's getDLItemsAtRoot returned?
export function guidListed(guid, list) {
  const want = normGuid(guid);
  if (!want) return false;
  return String(list || '').split(';').some((g) => normGuid(g) === want);
}

// FullHD.epr: H.264, 1920x1080, 25 fps (docs/research/2026-10-02/audit_reuse_ame.json).
export function matchesEpr(summary, { codec = 'h264', width = 1920, height = 1080, fps = 25 } = {}) {
  const v = summary && summary.video;
  return Boolean(v && v.codec === codec && v.width === width && v.height === height && Math.abs(v.fps - fps) < 0.01);
}

export function isProRes4444Alpha(summary) {
  const v = summary && summary.video;
  return Boolean(v && v.codec === 'prores' && /4444/.test(String(v.profile)) && /^yuva/.test(String(v.pixFmt)));
}

// Which fixture comp a render is, by duration (contract: the lower third is 10 s, the hatch 60 s).
export function compByDuration(seconds) {
  if (typeof seconds !== 'number') return null;
  const { ltDuration, hatchDuration } = fixtureParams();
  if (Math.abs(seconds - ltDuration) < 0.2) return COMP_LT;
  if (Math.abs(seconds - hatchDuration) < 0.2) return COMP_HATCH;
  return null;
}

// Re-running one part (--only om|ame) keeps the other part's checks from the previous S10.json.
export function mergeChecks(previous, fresh, rerunPrefix) {
  return (previous || []).filter((c) => !c.name.startsWith(rerunPrefix)).concat(fresh);
}

// --persist: the restart check goes into S10.json as an optional manual check. appendManualCheck replaces
// a manual check with the same name, so a re-run of --persist keeps one entry. dir: tests only.
export function recordPersist(check, dir) {
  return appendManualCheck('S10', { name: check.name, pass: check.pass, detail: check.detail, required: false }, dir);
}
