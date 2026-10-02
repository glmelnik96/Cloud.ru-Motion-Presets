import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import { shotsAfter, qaLook, capsuleChecks, policyNote } from '../../spikes/s6-capsule/analyze.mjs';

function frameWithPatch(hex) {
  const img = new PNG({ width: 1920, height: 1080 });
  const n = parseInt(hex.slice(1), 16);
  for (let y = 0; y < 1080; y += 1) {
    for (let x = 0; x < 1920; x += 1) {
      const i = (y * 1920 + x) * 4;
      const inPatch = x >= 1770 && x < 1870 && y >= 50 && y < 150; // QA_PATCH 100x100 at (1820, 100)
      img.data[i] = inPatch ? (n >> 16) & 255 : 0;
      img.data[i + 1] = inPatch ? (n >> 8) & 255 : 0;
      img.data[i + 2] = inPatch ? n & 255 : 0;
      img.data[i + 3] = 255;
    }
  }
  return img;
}

const coexist = { A0: 'old', A1: 'old', B1: 'new', A2: 'old', B2: 'new', C2: 'new', A3: 'old', B3: 'new', C3: 'new', D3: 'new' };

describe('S6 analysis', () => {
  it('plans a frame of every instance after each import', () => {
    expect(shotsAfter(0)).toEqual([{ key: 'A0', frame: 125 }]);
    expect(shotsAfter(3).map((s) => s.key + ':' + s.frame)).toEqual(['A3:125', 'B3:425', 'C3:725', 'D3:1025']);
  });

  it('tells the old and the new QA patch apart', () => {
    expect(qaLook(frameWithPatch('#26D07C')).look).toBe('old');
    expect(qaLook(frameWithPatch('#A068FF')).look).toBe('new');
    expect(qaLook(frameWithPatch('#2AD480')).look).toBe('old');
    expect(qaLook(frameWithPatch('#FFFFFF'))).toMatchObject({ look: 'other', mean: '#FFFFFF' });
  });

  it('passes the default policy when a fresh capsuleID coexists with the old instance', () => {
    const checks = capsuleChecks(coexist, { changedKeepsId: true });
    expect(checks.filter((c) => !c.pass)).toEqual([]);
    expect(checks[1].name).toBe('AE re-export (the same capsuleID): B renders the new version');
  });

  it('fails it when the fresh capsuleID still renders the cached version', () => {
    const cached = { ...coexist, B1: 'old', B2: 'old', C2: 'old', B3: 'old', C3: 'old', D3: 'old' };
    const checks = capsuleChecks(cached, { changedKeepsId: true });
    expect(checks.filter((c) => c.required && !c.pass).map((c) => c.name)).toEqual(['fresh capsuleID: D renders the new version']);
    expect(policyNote(cached, { changedKeepsId: true })).toContain('Premiere keeps rendering the template it already holds');
  });

  it('writes the facts and the policy into one note', () => {
    expect(policyNote(coexist, { unchangedKeepsId: true, changedKeepsId: true, dupNewId: true })).toBe(
      'AE re-export of the unchanged comp keeps capsuleID: yes; after a change: yes; duplicated comp gets a new one: yes; '
      + 'a fresh capsuleID per version works, inserted instances stay as they were; with the old capsuleID both versions still coexist',
    );
  });
});
