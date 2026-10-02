// S6 analysis (pure, unit-tested in tests/spikes/s6-analyze.test.mjs): which version of the LowerThird each
// instance renders, judged by the QA_PATCH colour, and what that means for the versioning policy
// (spec 4.4, "Версии MOGRT").
import { REGIONS, round } from '../s3-instance/analyze.mjs';
import { meanColor } from '../../tools/png/read-png.mjs';
import { deltaE2000Rgb, hexToRgb, rgbToHex } from '../../tools/color/deltae.mjs';
import { nodeCheck } from '../../tools/spike/multistage.mjs';

export const OLD_HEX = '#26D07C'; // QA_PATCH of the fixture (part B)
export const NEW_HEX = '#A068FF'; // QA_PATCH after stage ae-changed (brand accent, D1)
export const MAX_DE = 10; // two far-apart colours: a classification, not the QA threshold
// Instances on V1 of CRT_S6, 10 s each by default: A the S2 template, B the AE re-export as is,
// C the re-export with the old capsuleID forced, D the re-export with a fresh capsuleID.
export const SLOTS = { A: 0, B: 12, C: 24, D: 36 };
export const LOOK_KEYS = ['A0', 'A1', 'B1', 'A2', 'B2', 'C2', 'A3', 'B3', 'C3', 'D3'];

export const shotFrame = (slot) => Math.round((SLOTS[slot] + 5) * 25);

// After import number `step` (0 = A ... 3 = D): a frame of every instance so far, keys like "B2".
export function shotsAfter(step) {
  return ['A', 'B', 'C', 'D'].slice(0, step + 1).map((k) => ({ key: k + step, frame: shotFrame(k) }));
}

export function qaLook(src) {
  const c = meanColor(src, REGIONS.patch);
  const dOld = deltaE2000Rgb(c, hexToRgb(OLD_HEX));
  const dNew = deltaE2000Rgb(c, hexToRgb(NEW_HEX));
  let look = 'other';
  if (dOld <= MAX_DE && dOld <= dNew) look = 'old';
  else if (dNew <= MAX_DE) look = 'new';
  return { look, mean: rgbToHex(c), dOld: round(dOld, 2), dNew: round(dNew, 2) };
}

// looks: { A0, A1, B1, ... D3 } -> 'old' | 'new' | 'other' | 'missing'; facts: data of stage "ids".
export function capsuleChecks(looks, facts = {}) {
  const same = facts.changedKeepsId === true ? 'the same' : 'a new';
  return [
    nodeCheck('A (the S2 template) renders the old QA colour before any re-import', looks.A0 === 'old', looks),
    nodeCheck('AE re-export (' + same + ' capsuleID): B renders the new version', looks.B1 === 'new', looks, false),
    nodeCheck('AE re-export: A still renders the old version', looks.A1 === 'old', looks, false),
    nodeCheck('forced old capsuleID: C renders the new version', looks.C2 === 'new', looks, false),
    nodeCheck('forced old capsuleID: A and B render as before', looks.A2 === 'old' && looks.B2 === looks.B1, looks, false),
    nodeCheck('fresh capsuleID: D renders the new version', looks.D3 === 'new', looks),
    nodeCheck('fresh capsuleID: A still renders the old version (versions coexist)', looks.A3 === 'old', looks),
  ];
}

const yesNo = (v) => (v === true ? 'yes' : v === false ? 'no' : '?');

// One line for the notes of S6.json: the facts and the policy they support.
export function policyNote(looks, facts = {}) {
  const parts = [
    'AE re-export of the unchanged comp keeps capsuleID: ' + yesNo(facts.unchangedKeepsId),
    'after a change: ' + yesNo(facts.changedKeepsId),
    'duplicated comp gets a new one: ' + yesNo(facts.dupNewId),
  ];
  if (looks.D3 === 'new' && looks.A3 === 'old') parts.push('a fresh capsuleID per version works, inserted instances stay as they were');
  if (looks.C2 === 'old') parts.push('with the old capsuleID Premiere keeps rendering the template it already holds');
  if (looks.C2 === 'new' && looks.A2 === 'new') parts.push('with the old capsuleID the new version also replaces inserted instances');
  if (looks.C2 === 'new' && looks.A2 === 'old') parts.push('with the old capsuleID both versions still coexist');
  return parts.join('; ');
}
