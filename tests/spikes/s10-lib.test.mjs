import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeResult, writeResult } from '../../tools/spike/result.mjs';
import {
  parseAmeReply, normGuid, guidListed, matchesEpr, isProRes4444Alpha, compByDuration, mergeChecks, recordPersist,
} from '../../spikes/s10-ame/lib.mjs';

describe('s10 lib', () => {
  it('parses the reply that the AME script returns', () => {
    expect(parseAmeReply('build=26.5.2|addComp=true|guids={A};{B}|addDL=ok|run=true')).toEqual({
      build: '26.5.2', addComp: 'true', guids: '{A};{B}', addDL: 'ok', run: 'true',
    });
    expect(parseAmeReply(null)).toEqual({});
    expect(parseAmeReply('frontend=null')).toEqual({ frontend: 'null' });
  });

  it('compares GUIDs without braces and case', () => {
    expect(normGuid('{AB-12}')).toBe('ab-12');
    expect(guidListed('AB-12', '{ef-01};{ab-12}')).toBe(true);
    expect(guidListed('AB-13', '{ef-01};{ab-12}')).toBe(false);
    expect(guidListed('', '{ef-01}')).toBe(false);
  });

  it('recognises an H.264 1080p25 render as FullHD.epr output', () => {
    expect(matchesEpr({ video: { codec: 'h264', width: 1920, height: 1080, fps: 25 } })).toBe(true);
    expect(matchesEpr({ video: { codec: 'h264', width: 1920, height: 1080, fps: 24 } })).toBe(false);
    expect(matchesEpr({ video: null })).toBe(false);
  });

  it('recognises ProRes 4444 with alpha', () => {
    expect(isProRes4444Alpha({ video: { codec: 'prores', profile: '4444', pixFmt: 'yuva444p12le' } })).toBe(true);
    expect(isProRes4444Alpha({ video: { codec: 'prores', profile: '4444', pixFmt: 'yuv444p12le' } })).toBe(false);
  });

  it('tells the fixture comps apart by duration', () => {
    expect(compByDuration(10.0)).toBe('CRT_LowerThird_v1');
    expect(compByDuration(60.04)).toBe('CRT_Hatch_v1');
    expect(compByDuration(5)).toBe(null);
    expect(compByDuration(undefined)).toBe(null);
  });

  it('keeps the checks of the part that was not re-run', () => {
    const prev = [{ name: 'om: a', pass: true }, { name: 'ame: b', pass: false }];
    const fresh = [{ name: 'ame: b', pass: true }];
    expect(mergeChecks(prev, fresh, 'ame:')).toEqual([{ name: 'om: a', pass: true }, { name: 'ame: b', pass: true }]);
  });

  it('records the --persist check once, however often it is re-run', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-s10-'));
    writeResult(makeResult({ id: 'S10', title: 'AME', host: 'ae', checks: [{ name: 'ame: b', pass: true }] }), dir);
    const persist = { name: 'om: template T still listed after an AE restart', pass: false, detail: '0 templates' };
    recordPersist(persist, dir);
    const r = recordPersist({ ...persist, pass: true, detail: '14 templates' }, dir);
    expect(r.checks.map((c) => c.name)).toEqual(['ame: b', persist.name]);
    expect(r.checks[1]).toMatchObject({ pass: true, required: false, manual: true, detail: '14 templates' });
    expect(r.verdict).toBe('yes');
  });
});
