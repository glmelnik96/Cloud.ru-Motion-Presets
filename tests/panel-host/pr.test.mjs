import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildArgs, planInsert, runInsert } from '../../panel/src/core/insert.ts';
import { chooseVariant } from '../../panel/src/core/variant.ts';
import { defaults, toWrites } from '../../panel/src/core/fields.ts';
import { fontsFor, item } from '../panel/core/fixture.ts';
import { assembleAdapter, callSource, loadAdapter } from './vm-host.mjs';
import { TPF_25, TPF_2997, TPS, TTL_PARAMS, createPremiere, textJson } from './pr-mock.mjs';

// The Premiere adapter (panel/host/pr.jsx) against the Premiere stand-in of pr-mock.mjs. Frames are 25 fps unless
// a test says otherwise: the playhead is at frame 100 (4 s), a template is 150 frames (6 s) long.
const MOGRT = 'C:/CRBK/work/library/items/TTL_LowerThird/TTL_LowerThird_16x9_v1.mogrt';
const NAME = 'TTL_LowerThird_16x9_v1';
const START_F = 100;
const T = (frames, tpf = TPF_25) => String(frames * tpf);
const ASCII = /^[\x00-\x7f]*$/;

// CRBK_PR_SOURCE=<file.jsx> runs the suite against another adapter source: a mutation check of the tests themselves
// (a mutated copy of pr.jsx must fail some test).
const PARTS = process.env.CRBK_PR_SOURCE ? { pr: readFileSync(process.env.CRBK_PR_SOURCE, 'utf8') } : undefined;

// A host with one active sequence 'SEQ-A' and the template registered. over: host (mock options), seq (sequence spec),
// template (template spec), load (loadAdapter options).
function rig(over = {}) {
  const host = createPremiere(over.host);
  const seq = host.addSequence({ id: 'SEQ-A', name: 'Секвенция 1', playheadF: START_F, ...over.seq });
  host.addTemplate(MOGRT, { name: NAME, lenF: 150, params: TTL_PARAMS(), ...over.template });
  const h = loadAdapter('pr', host.globals, { parts: PARTS, ...over.load });
  host.bind(h.context);
  return { host, seq, h };
}

const insertArgs = (over = {}) => ({
  seqId: 'SEQ-A',
  mogrtPath: MOGRT,
  startTicks: T(START_F),
  lenFrames: 150,
  defaultLenFrames: 150,
  expectName: NAME,
  fields: [],
  label: 'Cloud.ru BrandKit: Титр',
  ...over,
});

const ok = (reply) => {
  expect(reply, JSON.stringify(reply)).toMatchObject({ ok: true });
  return reply.data;
};
const refused = (reply, code) => {
  expect(reply, JSON.stringify(reply)).toMatchObject({ ok: false, error: { code } });
  return reply.error;
};
const frames = (clip, tpf = TPF_25) => [Math.round(clip._start / tpf), Math.round(clip._end / tpf)];
const param = (clip, name) => clip._params.find((p) => p.name === name);
// What the adapter did to a clip's length / to its parameters, in order.
const trims = (host) => host.ops.filter((o) => o[0] === 'outPoint' || o[0] === 'end');
const writes = (host) => host.ops.filter((o) => o[0] === 'setValue');
const mine = (seq, v = 0) => seq.video[v].clips.find((c) => c.name === NAME);
// A clip on a track before the panel came, over [from, to) frames.
const busy = (from, to, name = 'bars') => ({ name, startF: from, endF: to });

describe('pr adapter: getContext', () => {
  it('describes the active sequence: size, fps, playhead in ticks and seconds', () => {
    const { h } = rig({ seq: { w: 3840, h: 2160, playheadF: 300 } });
    expect(h.call('getContext')).toEqual({
      ok: true,
      data: {
        host: 'pr',
        hostVersion: '26.5.2',
        project: { path: 'C:\\CRBK\\work\\pr\\CRT_panel_pr.prproj', saved: true },
        target: { kind: 'sequence', id: 'SEQ-A', name: 'Секвенция 1', w: 3840, h: 2160, fps: 25, ticks: T(300), timeSec: 12 },
      },
    });
  });

  it('rounds fps to 3 decimals: 30000/1001 is 29.97', () => {
    const { h } = rig({ seq: { tpf: TPF_2997, playheadF: 30 } });
    const { target } = ok(h.call('getContext'));
    expect(target.fps).toBe(29.97);
    expect(target.ticks).toBe(T(30, TPF_2997));
    expect(target.timeSec).toBeCloseTo((30 * 1001) / 30000, 9);
  });

  it('reports the playhead of the active sequence, not of another one', () => {
    const { host, h } = rig();
    host.addSequence({ id: 'SEQ-B', name: 'Вторая', playheadF: 7, active: true });
    expect(ok(h.call('getContext')).target).toMatchObject({ id: 'SEQ-B', name: 'Вторая', ticks: T(7) });
  });

  it('has no path for a project that was never saved', () => {
    const { h } = rig({ host: { projectPath: '' } });
    expect(ok(h.call('getContext')).project).toEqual({ path: null, saved: false });
  });

  it('has no target when no sequence is active', () => {
    const { host, h } = rig();
    host.active = null;
    expect(ok(h.call('getContext'))).toMatchObject({ host: 'pr', project: { saved: true }, target: null });
  });

  it('has neither a path nor a target when no project is open', () => {
    const { h } = rig({ host: { noProject: true } });
    expect(ok(h.call('getContext'))).toMatchObject({ hostVersion: '26.5.2', project: { path: null, saved: false }, target: null });
  });

  it('has a plain read: it neither selects, opens nor writes anything', () => {
    const { host, h } = rig();
    h.call('getContext');
    expect(host.ops).toEqual([]);
    expect(host.opened).toEqual([]);
    expect(host.forbidden).toEqual([]);
  });
});

describe('pr adapter: insertItem, the target (P9: one call; step 1)', () => {
  it('refuses with TARGET_CHANGED when another sequence became active, and touches nothing', () => {
    const { host, seq, h } = rig();
    host.addSequence({ id: 'SEQ-B', active: true });
    refused(h.call('insertItem', insertArgs()), 'TARGET_CHANGED');
    expect(host.imports).toEqual([]);
    expect(host.opened).toEqual([]); // it does not switch sequences back
    expect(host.ops).toEqual([]);
    expect(seq.video[0].clips).toEqual([]);
  });

  it('refuses with TARGET_CHANGED when no sequence is active', () => {
    const { host, h } = rig();
    host.active = null;
    refused(h.call('insertItem', insertArgs()), 'TARGET_CHANGED');
    expect(host.imports).toEqual([]);
  });

  it('refuses arguments it cannot work with, before it does anything', () => {
    const { host, h } = rig();
    const bad = [
      { seqId: '' }, { seqId: 5 }, { mogrtPath: '' }, { startTicks: 'x' }, { startTicks: '-5' }, { startTicks: '1.5' },
      { lenFrames: 0 }, { lenFrames: 1.5 }, { lenFrames: '150' }, { defaultLenFrames: -1 }, { defaultLenFrames: 'x' },
      { expectName: 5 }, { fields: 'x' }, { fields: [5] }, { fields: [{ type: 'text', value: 'a' }] },
      { fields: [{ egpName: 'Имя', type: 'text' }] },
    ];
    for (const over of bad) refused(h.call('insertItem', insertArgs(over)), 'BAD_ARGS');
    refused(h.call('insertItem', {}), 'BAD_ARGS');
    expect(host.imports).toEqual([]);
    expect(host.enabledQE).toBe(0);
  });

  it('refuses with FILE_MISSING when the template file is not there, and adds no track for it', () => {
    const { host, seq, h } = rig({ seq: { video: [{ clips: [busy(0, 500)] }] } });
    const error = refused(h.call('insertItem', insertArgs({ mogrtPath: 'C:/CRBK/work/library/items/none.mogrt' })), 'FILE_MISSING');
    expect(error.message).toContain('none.mogrt');
    expect(host.imports).toEqual([]);
    expect(host.qeCalls).toEqual([]);
    expect(seq.video).toHaveLength(1);
  });
});

describe('pr adapter: insertItem, the video track (P10; step 2)', () => {
  const trackOf = (reply) => ok(reply).placed.track;

  it('puts the clip on V1 when nothing covers the interval', () => {
    const { seq, h } = rig({ seq: { video: [{ clips: [busy(0, 60), busy(400, 500)] }, {}, {}] } });
    expect(trackOf(h.call('insertItem', insertArgs()))).toBe(0);
    expect(frames(mine(seq, 0))).toEqual([100, 250]);
  });

  it('goes above the clip it would otherwise cut', () => {
    const { host, seq, h } = rig({ seq: { video: [{ clips: [busy(50, 300)] }, {}, {}] } });
    expect(trackOf(h.call('insertItem', insertArgs()))).toBe(1);
    expect(frames(mine(seq, 1))).toEqual([100, 250]);
    expect(frames(seq.video[0].clips[0])).toEqual([50, 300]);
    expect(host.overwrites).toEqual([]);
  });

  it('goes above the topmost busy track, not into a free track below it', () => {
    const { seq, h } = rig({ seq: { video: [{}, { clips: [busy(120, 200)] }, {}] } });
    expect(trackOf(h.call('insertItem', insertArgs()))).toBe(2);
    expect(mine(seq, 0)).toBeUndefined();
  });

  it('looks at every track: a busy V3 sends the clip to V4', () => {
    const { h } = rig({ seq: { video: [{ clips: [busy(0, 400)] }, {}, { clips: [busy(100, 101)] }, {}] } });
    expect(trackOf(h.call('insertItem', insertArgs()))).toBe(3);
  });

  it('skips a locked track', () => {
    const { h } = rig({ seq: { video: [{ clips: [busy(50, 300)] }, { locked: true }, {}] } });
    expect(trackOf(h.call('insertItem', insertArgs()))).toBe(2);
  });

  it('skips a locked V1 even when nothing is on the timeline', () => {
    const { h } = rig({ seq: { video: [{ locked: true }, {}] } });
    expect(trackOf(h.call('insertItem', insertArgs()))).toBe(1);
  });

  it('counts a clip that only touches the interval as no clip: the edges are free', () => {
    const { host, seq, h } = rig({ seq: { video: [{ clips: [busy(50, 100), busy(250, 300)] }, {}] } });
    expect(trackOf(h.call('insertItem', insertArgs()))).toBe(0);
    expect(frames(seq.video[0].clips.find((c) => c.name === NAME))).toEqual([100, 250]);
    expect(host.overwrites).toEqual([]);
  });

  it('counts one frame of overlap on either side as busy', () => {
    const before = rig({ seq: { video: [{ clips: [busy(50, 101)] }, {}] } });
    expect(trackOf(before.h.call('insertItem', insertArgs()))).toBe(1);
    const after = rig({ seq: { video: [{ clips: [busy(249, 300)] }, {}] } });
    expect(trackOf(after.h.call('insertItem', insertArgs()))).toBe(1);
  });

  it('looks over the longer of the requested and the default length: the template is imported at its default', () => {
    // 50 frames wanted, the template imports 150 long: a clip at 200..260 would be cut before the trim.
    const shorter = rig({ seq: { video: [{ clips: [busy(200, 260)] }, {}] } });
    expect(trackOf(shorter.h.call('insertItem', insertArgs({ lenFrames: 50 })))).toBe(1);
    expect(shorter.host.overwrites).toEqual([]);
    // 300 wanted: the stretch covers 100..400.
    const longer = rig({ seq: { video: [{ clips: [busy(300, 380)] }, {}] } });
    expect(trackOf(longer.h.call('insertItem', insertArgs({ lenFrames: 300 })))).toBe(1);
    // a clip after both lengths is no obstacle
    const clear = rig({ seq: { video: [{ clips: [busy(250, 400)] }, {}] } });
    expect(trackOf(clear.h.call('insertItem', insertArgs({ lenFrames: 100 })))).toBe(0);
  });

  it('treats a build without Track.isLocked as unlocked', () => {
    const { h } = rig({ seq: { video: [{ noLockApi: true }] } });
    expect(trackOf(h.call('insertItem', insertArgs()))).toBe(0);
  });

  it('snaps an off-grid playhead to the frame grid before it measures the interval', () => {
    // 100 frames + 7 ticks: frame 100; the clip at 250..300 touches the end of 100..250 and stays out of it
    const { h } = rig({ seq: { video: [{ clips: [busy(250, 300)] }] } });
    expect(trackOf(h.call('insertItem', insertArgs({ startTicks: String(100 * TPF_25 + 7) })))).toBe(0);
  });

  it('rounds an off-grid playhead to the nearest frame: imports there, and measures from there', () => {
    // 100.69 frames is frame 101, so the clip that ends at 101 only touches the interval 101..251
    const { host, h } = rig({ seq: { video: [{ clips: [busy(100, 101)] }, {}] } });
    const data = ok(h.call('insertItem', insertArgs({ startTicks: String(100 * TPF_25 + 7000000000) })));
    expect(data.placed).toMatchObject({ track: 0, startSec: 101 / 25 });
    expect(host.imports[0].ticks).toBe(T(101));
  });

  describe('when every track is busy (QE addTracks)', () => {
    const FULL = { video: [{ clips: [busy(50, 300)] }, { clips: [busy(120, 200)] }] };

    it('adds one track through QE, uses it and reports it', () => {
      const { host, seq, h } = rig({ seq: FULL });
      const data = ok(h.call('insertItem', insertArgs()));
      expect(data.placed.track).toBe(2);
      expect(data.tracksAdded).toBe(1);
      expect(host.enabledQE).toBeGreaterThan(0);
      expect(host.qeCalls).toEqual([[1, 2, 0]]);
      expect(seq.video).toHaveLength(3);
      expect(frames(mine(seq, 2))).toEqual([100, 250]);
      expect(host.overwrites).toEqual([]);
      expect(host.opened).toEqual([]); // the sequence was active already
    });

    it('waits for a track that QE adds a little later', () => {
      const { host, seq, h } = rig({ seq: FULL, host: { qeDelay: 4 } });
      const data = ok(h.call('insertItem', insertArgs()));
      expect(data).toMatchObject({ tracksAdded: 1, placed: { track: 2 } });
      expect(host.sleeps).toBeGreaterThanOrEqual(4);
      expect(seq.video).toHaveLength(3);
    });

    it('waits for QE to follow the active sequence', () => {
      const { host, h } = rig({ seq: FULL, host: { qeStale: 2 } });
      expect(ok(h.call('insertItem', insertArgs()))).toMatchObject({ tracksAdded: 1, placed: { track: 2 } });
      expect(host.qeCalls).toEqual([[1, 2, 0]]); // never on the sequence it was not asked about
    });

    it('does not call addTracks on another sequence: NO_FREE_TRACK', () => {
      const { host, seq, h } = rig({ seq: FULL, host: { qeStale: 1000 } });
      refused(h.call('insertItem', insertArgs()), 'NO_FREE_TRACK');
      expect(host.qeCalls).toEqual([]);
      expect(host.imports).toEqual([]);
      expect(seq.video).toHaveLength(2);
    });

    it('adds a track above the locked ones', () => {
      const { host, h } = rig({ seq: { video: [{ clips: [busy(50, 300)] }, { locked: true }, { locked: true }] } });
      expect(ok(h.call('insertItem', insertArgs()))).toMatchObject({ tracksAdded: 1, placed: { track: 3 } });
      expect(host.qeCalls).toEqual([[1, 3, 0]]);
    });

    it('adds a track to a sequence with no video track at all', () => {
      const { host, h } = rig({ seq: { video: 0 } });
      expect(ok(h.call('insertItem', insertArgs()))).toMatchObject({ tracksAdded: 1, placed: { track: 0 } });
      expect(host.qeCalls).toEqual([[1, 0, 0]]);
    });

    it.each(['noop', 'throws', 'enableThrows', 'unavailable'])('refuses with NO_FREE_TRACK when QE is %s, and imports nothing', (qe) => {
      const { host, seq, h } = rig({ seq: FULL, host: { qe } });
      refused(h.call('insertItem', insertArgs()), 'NO_FREE_TRACK');
      expect(host.imports).toEqual([]);
      expect(host.overwrites).toEqual([]);
      expect(seq.video).toHaveLength(2);
    });

    it('refuses with NO_FREE_TRACK when the added track never shows up', () => {
      const { host, h } = rig({ seq: FULL, host: { qe: 'noop' } });
      refused(h.call('insertItem', insertArgs()), 'NO_FREE_TRACK');
      expect(host.qeCalls).toEqual([[1, 2, 0]]);
      expect(host.sleeps).toBeGreaterThan(0); // it waited for it
    });

    it('does not use QE when a track is free', () => {
      const { host, h } = rig({ seq: { video: [{ clips: [busy(50, 300)] }, {}] } });
      expect(ok(h.call('insertItem', insertArgs())).tracksAdded).toBeUndefined();
      expect(host.enabledQE).toBe(0);
      expect(host.qeCalls).toEqual([]);
    });
  });
});

describe('pr adapter: insertItem, the import (step 3)', () => {
  it('imports the template by its native path, on the frame grid, on the chosen track', () => {
    const { host, seq, h } = rig({ seq: { video: [{ clips: [busy(0, 500)] }, {}] } });
    ok(h.call('insertItem', insertArgs({ startTicks: String(100 * TPF_25 + 12345) })));
    expect(host.imports).toEqual([
      { path: 'C:\\CRBK\\work\\library\\items\\TTL_LowerThird\\TTL_LowerThird_16x9_v1.mogrt', ticks: T(100), vIdx: 1, aIdx: 0, n: 1 },
    ]);
    expect(frames(mine(seq, 1))).toEqual([100, 250]);
  });

  it('polls for a clip that lands after importMGT returned, and imports once', () => {
    const { host, h } = rig({ host: { importPlan: [5] } });
    ok(h.call('insertItem', insertArgs()));
    expect(host.imports).toHaveLength(1);
    expect(host.sleeps).toBe(5);
  });

  it('imports exactly once more when the first call left nothing', () => {
    const { host, seq, h } = rig({ host: { importPlan: ['never', 'now'] } });
    const data = ok(h.call('insertItem', insertArgs()));
    expect(host.imports).toHaveLength(2);
    expect(host.imports[1]).toEqual({ ...host.imports[0], n: 2 });
    expect(seq.video[0].clips.filter((c) => c.name === NAME)).toHaveLength(1);
    expect(data.warnings).toEqual([]);
  });

  it('retries after an importMGT that throws', () => {
    const { host, h } = rig({ host: { importPlan: ['throw', 'now'] } });
    ok(h.call('insertItem', insertArgs()));
    expect(host.imports).toHaveLength(2);
  });

  it('does not import a third time: INSERT_FAILED after two calls that left nothing', () => {
    const { host, seq, h } = rig({ host: { importPlan: ['never'] } });
    refused(h.call('insertItem', insertArgs()), 'INSERT_FAILED');
    expect(host.imports).toHaveLength(2);
    expect(host.sleeps).toBeGreaterThan(0);
    expect(seq.video[0].clips).toEqual([]);
    expect(host.ops).toEqual([]); // no trim, no write, no selection
  });

  it('says why when both importMGT calls throw', () => {
    const { host, h } = rig({ host: { importPlan: ['throw'] } });
    const error = refused(h.call('insertItem', insertArgs()), 'INSERT_FAILED');
    expect(error.message).toContain('importMGT failed');
    expect(host.imports).toHaveLength(2);
  });

  it('keeps a clip that is named otherwise, as ours, and warns NAME_MISMATCH', () => {
    const { seq, h } = rig({ template: { name: 'TTL_LowerThird_16x9_v2' } });
    const data = ok(h.call('insertItem', insertArgs()));
    expect(data.placed.name).toBe('TTL_LowerThird_16x9_v2');
    expect(data.warnings).toEqual(['NAME_MISMATCH']);
    expect(seq.video[0].clips).toHaveLength(1);
  });

  it('does not compare names when none is expected', () => {
    const { h } = rig({ template: { name: 'anything' } });
    expect(ok(h.call('insertItem', insertArgs({ expectName: '' }))).warnings).toEqual([]);
  });

  it('has no warnings for a template as it should be', () => {
    const { h } = rig();
    expect(ok(h.call('insertItem', insertArgs())).warnings).toEqual([]);
  });
});

describe('pr adapter: insertItem, the length (P3; step 4)', () => {
  it('leaves the clip alone at the default length', () => {
    const { host, seq, h } = rig();
    const data = ok(h.call('insertItem', insertArgs()));
    expect(trims(host)).toEqual([]);
    expect(frames(mine(seq))).toEqual([100, 250]);
    expect(data.placed).toMatchObject({ startSec: 4, endSec: 10 });
  });

  it('stretches to a longer length: outPoint first, then end, whole Time objects from ticks, from the real inPoint', () => {
    const { host, seq, h } = rig();
    const data = ok(h.call('insertItem', insertArgs({ lenFrames: 200 })));
    const inT = 90000 * TPF_25; // an inserted MOGRT clip does not start at 0
    expect(trims(host)).toEqual([['outPoint', inT + 200 * TPF_25], ['end', (100 + 200) * TPF_25]]);
    expect(frames(mine(seq))).toEqual([100, 300]);
    expect(data.warnings).toEqual([]);
    expect(data.placed).toMatchObject({ startSec: 4, endSec: 12 });
  });

  it('cuts to a shorter length the same way', () => {
    const { host, seq, h } = rig();
    ok(h.call('insertItem', insertArgs({ lenFrames: 100 })));
    expect(trims(host)).toEqual([['outPoint', 90000 * TPF_25 + 100 * TPF_25], ['end', (100 + 100) * TPF_25]]);
    expect(frames(mine(seq))).toEqual([100, 200]);
  });

  it('trims from inPoint 0 as well', () => {
    const { host, h } = rig({ template: { inF: 0 } });
    ok(h.call('insertItem', insertArgs({ lenFrames: 60 })));
    expect(trims(host)).toEqual([['outPoint', 60 * TPF_25], ['end', 160 * TPF_25]]);
  });

  it('measures the length on the sequence frame grid at 29.97 fps', () => {
    const { host, seq, h } = rig({ seq: { tpf: TPF_2997 }, template: { lenF: 180 } });
    ok(h.call('insertItem', insertArgs({ startTicks: T(100, TPF_2997), lenFrames: 240, defaultLenFrames: 180 })));
    expect(trims(host)).toEqual([['outPoint', (90000 + 240) * TPF_2997], ['end', 340 * TPF_2997]]);
    expect(frames(mine(seq), TPF_2997)).toEqual([100, 340]);
  });

  it('looks the clip up again after the trim, before it checks the new end', () => {
    const { host, h } = rig();
    ok(h.call('insertItem', insertArgs({ lenFrames: 200 })));
    const trim = host.events.lastIndexOf('trim');
    const check = host.events.indexOf('readEnd', trim);
    expect(trim).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(trim);
    expect(host.events.slice(trim, check)).toContain('lookup');
  });

  it('keeps the clip and warns LENGTH_MISMATCH when the host does not take the new end', () => {
    const { seq, h } = rig({ host: { endIgnored: true } });
    const data = ok(h.call('insertItem', insertArgs({ lenFrames: 200 })));
    expect(data.warnings).toEqual(['LENGTH_MISMATCH']);
    expect(data.placed.endSec).toBe(10); // what the clip really has now
    expect(mine(seq)).toBeDefined();
  });
});

describe('pr adapter: insertItem, the fields (step 5)', () => {
  const text = (egpName, value) => ({ egpName, type: 'text', value });
  const num = (egpName, type, value) => ({ egpName, type, value });
  const GOOD = [text('Имя', 'Анна-Мария Ёлкина'), text('Должность', 'Директор'), num('Стиль', 'dropdown', 2), num('Размер текста', 'dropdown', 4)];

  it('writes text as JSON with one style run and the dropdowns 0-based, and reads every value back', () => {
    const { host, seq, h } = rig();
    const data = ok(h.call('insertItem', insertArgs({ fields: GOOD })));
    expect(data.fields).toEqual([
      { egpName: 'Имя', written: 'Анна-Мария Ёлкина', back: 'Анна-Мария Ёлкина', ok: true },
      { egpName: 'Должность', written: 'Директор', back: 'Директор', ok: true },
      { egpName: 'Стиль', written: 2, back: 2, ok: true },
      { egpName: 'Размер текста', written: 4, back: 4, ok: true },
    ]);
    const clip = mine(seq);
    expect(JSON.parse(param(clip, 'Имя').raw)).toEqual({
      ...JSON.parse(textJson('x')), textEditValue: 'Анна-Мария Ёлкина', fontTextRunLength: [17],
    });
    expect(param(clip, 'Стиль').raw).toBe(2);
    // updateUI is 1 on every write
    expect(writes(host).map((o) => o[3])).toEqual([1, 1, 1, 1]);
  });

  it('writes in the order it was given', () => {
    const { host, h } = rig();
    const fields = [num('Размер текста', 'dropdown', 3), text('Имя', 'А'), num('Стиль', 'dropdown', 1), text('Должность', 'Б')];
    ok(h.call('insertItem', insertArgs({ fields })));
    expect(writes(host).map((o) => o[1])).toEqual(['Размер текста', 'Имя', 'Стиль', 'Должность']);
  });

  it('writes an empty text with a run length of 0, and reads the empty text back', () => {
    const { seq, h } = rig({ template: { params: [{ name: 'Должность', kind: 'text', value: 'Директор' }] } });
    const data = ok(h.call('insertItem', insertArgs({ fields: [text('Должность', '')] })));
    expect(data.fields).toEqual([{ egpName: 'Должность', written: '', back: '', ok: true }]);
    expect(JSON.parse(param(mine(seq), 'Должность').raw)).toMatchObject({ textEditValue: '', fontTextRunLength: [0] });
  });

  it('reads a checkbox back as a boolean and reports it as 1 or 0', () => {
    const params = [{ name: 'Подложка', kind: 'checkbox', value: true }];
    const off = rig({ template: { params } });
    expect(ok(off.h.call('insertItem', insertArgs({ fields: [num('Подложка', 'checkbox', 0)] }))).fields)
      .toEqual([{ egpName: 'Подложка', written: 0, back: 0, ok: true }]);
    expect(param(mine(off.seq), 'Подложка').raw).toBe(false);
    expect(writes(off.host)).toEqual([['setValue', 'Подложка', 0, 1]]); // 1 or 0, as the panel sends it, not a boolean
    const on = rig({ template: { params: [{ name: 'Подложка', kind: 'checkbox', value: false }] } });
    expect(ok(on.h.call('insertItem', insertArgs({ fields: [num('Подложка', 'checkbox', 1)] }))).fields)
      .toEqual([{ egpName: 'Подложка', written: 1, back: 1, ok: true }]);
    expect(param(mine(on.seq), 'Подложка').raw).toBe(true);
    expect(writes(on.host)).toEqual([['setValue', 'Подложка', 1, 1]]);
  });

  it('writes the text of a text field that came as a number, and reads it back as text', () => {
    const { seq, h } = rig();
    const data = ok(h.call('insertItem', insertArgs({ fields: [text('Имя', 2026)] })));
    expect(data.fields).toEqual([{ egpName: 'Имя', written: 2026, back: '2026', ok: true }]);
    expect(JSON.parse(param(mine(seq), 'Имя').raw)).toMatchObject({ textEditValue: '2026', fontTextRunLength: [4] });
  });

  it('writes a boolean checkbox value as 1 or 0 too', () => {
    const { host, h } = rig({ template: { params: [{ name: 'Подложка', kind: 'checkbox', value: false }] } });
    const data = ok(h.call('insertItem', insertArgs({ fields: [num('Подложка', 'checkbox', true)] })));
    expect(data.fields).toEqual([{ egpName: 'Подложка', written: true, back: 1, ok: true }]);
    expect(writes(host)).toEqual([['setValue', 'Подложка', 1, 1]]);
  });

  it('writes a slider as a number and reads it back as one', () => {
    const { seq, h } = rig({ template: { params: [{ name: 'Длительность', kind: 'slider', value: 6 }] } });
    const data = ok(h.call('insertItem', insertArgs({ fields: [num('Длительность', 'slider', 4.5)] })));
    expect(data.fields).toEqual([{ egpName: 'Длительность', written: 4.5, back: 4.5, ok: true }]);
    expect(param(mine(seq), 'Длительность').raw).toBe(4.5);
  });

  it('accepts a slider the host keeps in single precision', () => {
    const { h } = rig({ template: { params: [{ name: 'Длительность', kind: 'slider', value: 6, float32: true }] } });
    const data = ok(h.call('insertItem', insertArgs({ fields: [num('Длительность', 'slider', 12.36)] })));
    expect(data.fields[0]).toMatchObject({ written: 12.36, ok: true });
    expect(data.fields[0].back).not.toBe(12.36); // 12.359999656677246
    expect(data.fields[0].back).toBeCloseTo(12.36, 5);
  });

  it('does not accept a dropdown that is off by one, nor a slider that is off by more than a thousandth', () => {
    const params = [{ name: 'Стиль', kind: 'dropdown', value: 0, readOnly: true }, { name: 'Длительность', kind: 'slider', value: 6, readOnly: true }];
    const { h } = rig({ template: { params } });
    const fields = [num('Стиль', 'dropdown', 1), num('Длительность', 'slider', 6.002)];
    expect(ok(h.call('insertItem', insertArgs({ fields }))).fields.map((f) => f.ok)).toEqual([false, false]);
    const near = rig({ template: { params: [{ name: 'Длительность', kind: 'slider', value: 6, readOnly: true }] } });
    expect(ok(near.h.call('insertItem', insertArgs({ fields: [num('Длительность', 'slider', 6.0005)] }))).fields[0].ok).toBe(true);
  });

  it('gives a field whose parameter is missing back null and ok false, and goes on', () => {
    const { host, h } = rig();
    const fields = [text('Имя', 'А'), text('Нет такого', 'x'), num('Стиль', 'dropdown', 1)];
    const data = ok(h.call('insertItem', insertArgs({ fields })));
    expect(data.fields).toEqual([
      { egpName: 'Имя', written: 'А', back: 'А', ok: true },
      { egpName: 'Нет такого', written: 'x', back: null, ok: false },
      { egpName: 'Стиль', written: 1, back: 1, ok: true },
    ]);
    expect(writes(host)).toHaveLength(2);
  });

  it('finds a parameter by looking through the list when getParamForDisplayName is absent, null or throws', () => {
    for (const getParam of ['absent', 'null', 'throws']) {
      const { h } = rig({ host: { getParam } });
      const data = ok(h.call('insertItem', insertArgs({ fields: [text('Имя', 'А'), num('Стиль', 'dropdown', 2)] })));
      expect(data.fields.map((f) => f.ok), getParam).toEqual([true, true]);
    }
  });

  it('reports a value the host did not take as not ok, with what the host holds', () => {
    const params = [{ name: 'Имя', kind: 'text', value: 'Старое', readOnly: true }, { name: 'Стиль', kind: 'dropdown', value: 1, readOnly: true }];
    const { h } = rig({ template: { params } });
    const data = ok(h.call('insertItem', insertArgs({ fields: [text('Имя', 'Новое'), num('Стиль', 'dropdown', 2)] })));
    expect(data.fields).toEqual([
      { egpName: 'Имя', written: 'Новое', back: 'Старое', ok: false },
      { egpName: 'Стиль', written: 2, back: 1, ok: false },
    ]);
  });

  it('catches a write that throws, and goes on with the other fields', () => {
    const params = [{ name: 'Имя', kind: 'text', value: 'Старое', throwsOnSet: true }, { name: 'Стиль', kind: 'dropdown', value: 0 }];
    const { seq, h } = rig({ template: { params } });
    const data = ok(h.call('insertItem', insertArgs({ fields: [text('Имя', 'Новое'), num('Стиль', 'dropdown', 2)] })));
    expect(data.fields).toEqual([
      { egpName: 'Имя', written: 'Новое', back: 'Старое', ok: false },
      { egpName: 'Стиль', written: 2, back: 2, ok: true },
    ]);
    expect(mine(seq)).toBeDefined();
  });

  it('does not write text into a parameter that is not an AE text', () => {
    const { host, h } = rig();
    const data = ok(h.call('insertItem', insertArgs({ fields: [text('Стиль', 'Подкаст')] })));
    expect(data.fields).toEqual([{ egpName: 'Стиль', written: 'Подкаст', back: null, ok: false }]);
    expect(writes(host)).toEqual([]);
  });

  it('does not write a field of a type it cannot write', () => {
    const { host, h } = rig();
    const data = ok(h.call('insertItem', insertArgs({ fields: [{ egpName: 'Имя', type: 'media', value: 'a.png' }] })));
    expect(data.fields).toEqual([{ egpName: 'Имя', written: 'a.png', back: null, ok: false }]);
    expect(writes(host)).toEqual([]);
  });

  it('reads back through a fresh look-up of the clip, not through the parameter it wrote', () => {
    const { h } = rig({ host: { staleParams: true } });
    const data = ok(h.call('insertItem', insertArgs({ fields: GOOD })));
    expect(data.fields.every((f) => f.ok)).toBe(true);
  });

  it('looks the clip up again after the last write, before it reads anything back', () => {
    const { host, h } = rig();
    ok(h.call('insertItem', insertArgs({ fields: GOOD })));
    const lastWrite = host.events.lastIndexOf('write');
    const firstRead = host.events.indexOf('read', lastWrite);
    expect(lastWrite).toBeGreaterThan(-1);
    expect(firstRead).toBeGreaterThan(lastWrite);
    expect(host.events.slice(lastWrite, firstRead)).toContain('lookup');
  });

  it('reads back after a trim, from the clip as it is then', () => {
    const { seq, h } = rig();
    const data = ok(h.call('insertItem', insertArgs({ lenFrames: 200, fields: GOOD })));
    expect(data.fields.every((f) => f.ok)).toBe(true);
    expect(frames(mine(seq))).toEqual([100, 300]);
  });

  it('writes nothing and returns no field results when there are no fields', () => {
    const { host, h } = rig();
    expect(ok(h.call('insertItem', insertArgs({ fields: [] }))).fields).toEqual([]);
    expect(writes(host)).toEqual([]);
  });

  it('writes the 0-based values the core sends, for the TTL defaults and for changed ones', () => {
    const ttl = item('TTL_LowerThird');
    const values = { ...defaults(ttl), name: 'Анна-Мария Ёлкина', role2: 'Директор по развитию', style: 3, side: 2, speed: 5, size: 1 };
    const fields = toWrites(ttl, values, 'pr');
    expect(fields.map((f) => f.value)).toEqual(['Анна-Мария Ёлкина', 'Должность', 'Директор по развитию', 2, 1, 4, 0]);
    const { seq, h } = rig();
    const data = ok(h.call('insertItem', insertArgs({ fields })));
    expect(data.fields.map((f) => f.ok)).toEqual(Array(7).fill(true));
    const clip = mine(seq);
    expect(['Стиль', 'Сторона', 'Скорость', 'Размер текста'].map((n) => param(clip, n).raw)).toEqual([2, 1, 4, 0]);
    expect(JSON.parse(param(clip, 'Должность, 2-я строка').raw).textEditValue).toBe('Директор по развитию');
  });
});

describe('pr adapter: insertItem, the selection (step 6)', () => {
  it('deselects every selected clip of the sequence, video and audio, and selects only the new clip', () => {
    const { seq, h } = rig({
      seq: {
        video: [{ clips: [{ ...busy(0, 90), selected: true }, busy(300, 400)] }, { clips: [{ ...busy(0, 90, 'b-roll'), selected: true }] }],
        audio: [{ clips: [{ ...busy(0, 400, 'music'), selected: true }] }, {}],
      },
    });
    const data = ok(h.call('insertItem', insertArgs()));
    const all = [...seq.video, ...seq.audio].flatMap((t) => t.clips);
    expect(all.filter((c) => c._selected).map((c) => c.name)).toEqual([NAME]);
    expect(data.placed.track).toBe(0);
  });

  it('selects the new clip last', () => {
    const { host, h } = rig({ seq: { video: [{ clips: [{ ...busy(0, 90), selected: true }] }, {}] } });
    ok(h.call('insertItem', insertArgs({ fields: [{ egpName: 'Имя', type: 'text', value: 'А' }] })));
    // setSelected(state, updateUI): the others are deselected quietly, the new clip is selected with the UI updated
    expect(host.ops.filter((o) => o[0] === 'select')).toEqual([['select', 'bars', false, 0], ['select', NAME, true, 1]]);
    expect(host.ops[host.ops.length - 1]).toEqual(['select', NAME, true, 1]);
  });

  it('still selects the new clip when the selection of another clip cannot be read', () => {
    const { seq, h } = rig({ host: { selectionThrows: true }, seq: { video: [{ clips: [busy(0, 90)] }, {}] } });
    ok(h.call('insertItem', insertArgs()));
    expect(mine(seq)._selected).toBe(true);
  });
});

describe('pr adapter: insertItem, the answer (step 7)', () => {
  it('describes the placed clip', () => {
    const { seq, h } = rig({ seq: { video: [{ clips: [busy(50, 300)] }, {}] } });
    const data = ok(h.call('insertItem', insertArgs()));
    expect(data).toEqual({
      placed: { kind: 'clip', id: mine(seq, 1).nodeId, name: NAME, track: 1, startSec: 4, endSec: 10 },
      fields: [],
      warnings: [],
    });
    expect(Object.prototype.hasOwnProperty.call(data, 'tracksAdded')).toBe(false);
  });

  it('names the clip by name and start when it has no nodeId', () => {
    const { h } = rig({ template: { nodeId: null } });
    expect(ok(h.call('insertItem', insertArgs())).placed.id).toBe(NAME + '@' + T(100));
  });

  it('answers in ASCII JSON, Cyrillic escaped, and the panel reads it back as it was written', () => {
    const { h } = rig();
    const args = insertArgs({ fields: [{ egpName: 'Имя', type: 'text', value: 'Анна-Мария Ёлкина' }], label: 'Cloud.ru BrandKit: Титр' });
    const raw = h.run(callSource('insertItem', args));
    expect(raw).toMatch(ASCII);
    expect(raw).toContain('\\u0410\\u043d\\u043d\\u0430');
    expect(JSON.parse(raw).data.fields).toEqual([{ egpName: 'Имя', written: 'Анна-Мария Ёлкина', back: 'Анна-Мария Ёлкина', ok: true }]);
  });

  it.each([true, false])('does the whole insert through the native JSON or the polyfill (native: %s)', (nativeJson) => {
    const { seq, h } = rig({ load: { nativeJson }, seq: { video: [{ clips: [busy(50, 300)] }, {}] } });
    const tricky = 'Анна-Мария Ёлкина "Ё"\\';
    const fields = [
      { egpName: 'Имя', type: 'text', value: tricky },
      { egpName: 'Должность, 2-я строка', type: 'text', value: '' },
      { egpName: 'Стиль', type: 'dropdown', value: 2 },
    ];
    const raw = h.run(callSource('insertItem', insertArgs({ lenFrames: 200, fields })));
    expect(raw).toMatch(ASCII);
    const data = ok(JSON.parse(raw));
    expect(data.fields.map((f) => f.ok)).toEqual([true, true, true]);
    expect(data.placed).toMatchObject({ track: 1, startSec: 4, endSec: 12 });
    expect(JSON.parse(param(mine(seq, 1), 'Имя').raw)).toMatchObject({ textEditValue: tricky, fontTextRunLength: [tricky.length] });
    expect(h.call('ping').data.json).toBe(nativeJson ? 'native' : 'polyfill');
  });

  it('keeps working with the inherited operator members AE 26.5 gives every object, and names made of operators', () => {
    const params = [{ name: '+*', kind: 'text', value: 'x' }, { name: 'a/b-c', kind: 'slider', value: 1 }, { name: 'toString', kind: 'dropdown', value: 0 }];
    for (const nativeJson of [true, false]) {
      const { h } = rig({ load: { aeOperators: true, nativeJson }, template: { params } });
      const fields = [
        { egpName: '+*', type: 'text', value: '2*3+1' },
        { egpName: 'a/b-c', type: 'slider', value: 2.5 },
        { egpName: 'toString', type: 'dropdown', value: 1 },
        { egpName: 'constructor', type: 'text', value: 'x' },
      ];
      const data = ok(h.call('insertItem', insertArgs({ fields })));
      expect(data.fields.map((f) => f.ok), String(nativeJson)).toEqual([true, true, true, false]);
    }
  });

  it('never opens, saves or closes a project, creates or clones a sequence, or imports a file', () => {
    const { host, seq, h } = rig({ seq: { video: [{ clips: [busy(50, 300)] }, { clips: [busy(100, 200)] }] }, host: { qeDelay: 2 } });
    host.addSequence({ id: 'SEQ-B' });
    ok(h.call('insertItem', insertArgs({ lenFrames: 90, fields: [{ egpName: 'Имя', type: 'text', value: 'А' }] })));
    h.call('findPlaced', { kind: 'clip', targetId: 'SEQ-B', startSec: 4, name: NAME });
    h.call('getContext');
    h.call('diag');
    expect(host.forbidden).toEqual([]);
    expect(host.opened).toEqual([]);
    expect(host.nodes).toHaveLength(2);
    expect(host.active).toBe(seq.node);
  });
});

describe('pr adapter: insertItem with the core (planInsert, buildArgs, runInsert)', () => {
  const ROOT = 'C:/CRBK/work/library';
  const log = { info() {}, warn() {}, error() {} };

  // The panel's path: the context from the adapter, the plan and the arguments from the core, the call through the
  // adapter. The host calls answer at once, as the bridge would after the evalScript round trip.
  function run(it, ctxOver, over, mogrt) {
    const rigged = rig({ template: { name: mogrt.name, lenF: mogrt.lenF, params: mogrt.params }, ...ctxOver });
    const ctx = ok(rigged.h.call('getContext'));
    const choice = chooseVariant(it, ctx.target);
    const plan = planInsert({ item: it, choice, values: over.values, lenSec: over.lenSec, ctx, fonts: fontsFor(it), pluginVersion: '0.1.0' });
    const args = buildArgs(plan, ctx, ROOT);
    rigged.host.templates.clear();
    rigged.host.addTemplate(args.mogrtPath, { name: mogrt.name, lenF: mogrt.lenF, params: mogrt.params });
    const api = {
      insertItem: async (a) => rigged.h.call('insertItem', a),
      findPlaced: async (p) => rigged.h.call('findPlaced', p),
    };
    return { ...rigged, ctx, plan, args, outcome: () => runInsert(api, plan, ctx, args, log) };
  }

  it('inserts TTL_LowerThird at the playhead with changed values: all fields read back', async () => {
    const ttl = item('TTL_LowerThird');
    const values = { ...defaults(ttl), name: 'Анна-Мария Ёлкина', role1: 'Директор', style: 3, size: 4 };
    const r = run(ttl, {}, { values, lenSec: 6 }, { name: NAME, lenF: 150, params: TTL_PARAMS() });
    expect(r.args).toMatchObject({ seqId: 'SEQ-A', startTicks: T(100), lenFrames: 150, defaultLenFrames: 150, expectName: NAME });
    const out = await r.outcome();
    expect(out).toMatchObject({ ok: true, issues: [] });
    expect(out.result.placed).toMatchObject({ kind: 'clip', name: NAME, track: 0, startSec: 4, endSec: 10 });
    expect(out.result.fields.map((f) => f.ok)).toEqual(Array(7).fill(true));
    expect(trims(r.host)).toEqual([]);
  });

  it('stretches TTL_LowerThird to 8 s (RDT): the core asks for 200 frames over the default 150', async () => {
    const ttl = item('TTL_LowerThird');
    const r = run(ttl, {}, { values: defaults(ttl), lenSec: 8 }, { name: NAME, lenF: 150, params: TTL_PARAMS() });
    expect(r.args).toMatchObject({ lenFrames: 200, defaultLenFrames: 150 });
    const out = await r.outcome();
    expect(out).toMatchObject({ ok: true });
    expect(out.result.placed).toMatchObject({ startSec: 4, endSec: 12 });
    expect(trims(r.host).map((o) => o[0])).toEqual(['outPoint', 'end']);
  });

  it('inserts LOGO_Mark with its checkbox as the panel sends it (1) and gets a boolean back', async () => {
    const mark = item('LOGO_Mark');
    const params = [
      { name: 'Подложка', kind: 'checkbox', value: false },
      { name: 'Тема', kind: 'dropdown', value: 1 },
      { name: 'Фон', kind: 'dropdown', value: 0 },
      { name: 'Скорость', kind: 'dropdown', value: 1 },
    ];
    const values = { ...defaults(mark), plate: true, theme: 1, background: 3 };
    const r = run(mark, {}, { values, lenSec: 4 }, { name: 'LOGO_Mark_16x9_v1', lenF: 100, params });
    expect(r.args.fields).toEqual([
      { egpName: 'Подложка', type: 'checkbox', value: 1 },
      { egpName: 'Тема', type: 'dropdown', value: 0 },
      { egpName: 'Фон', type: 'dropdown', value: 2 },
      { egpName: 'Скорость', type: 'dropdown', value: 1 },
    ]);
    const out = await r.outcome();
    expect(out).toMatchObject({ ok: true, issues: [] });
    expect(out.result.fields).toEqual([
      { egpName: 'Подложка', written: 1, back: 1, ok: true },
      { egpName: 'Тема', written: 0, back: 0, ok: true },
      { egpName: 'Фон', written: 2, back: 2, ok: true },
      { egpName: 'Скорость', written: 1, back: 1, ok: true },
    ]);
  });

  it('lets the core find a clip after a lost answer: findPlaced says where the insert went', async () => {
    const ttl = item('TTL_LowerThird');
    const r = run(ttl, { seq: { video: [{ clips: [busy(0, 400)] }] } }, { values: defaults(ttl), lenSec: 6 }, { name: NAME, lenF: 150, params: TTL_PARAMS() });
    ok(r.h.call('insertItem', r.args));
    const probe = { kind: 'clip', targetId: r.ctx.target.id, startSec: r.ctx.target.timeSec, name: r.args.expectName };
    expect(ok(r.h.call('findPlaced', probe))).toMatchObject({ kind: 'clip', name: NAME, track: 1, startSec: 4, endSec: 10 });
  });
});

describe('pr adapter: findPlaced', () => {
  const probe = (over = {}) => ({ kind: 'clip', targetId: 'SEQ-B', startSec: 4, name: NAME, ...over });
  // SEQ-A is active and empty; SEQ-B is not active and holds the template at frame 100 on V2.
  function twoSequences(extra = {}) {
    const r = rig({ host: { importPlan: ['now'] }, ...extra });
    const b = r.host.addSequence({ id: 'SEQ-B', name: 'Вторая', video: [{ clips: [busy(0, 60)] }, {}, {}] });
    b.video[1].addClip({ name: NAME, startF: 100, endF: 250, nodeId: '0000beef' });
    return { ...r, b };
  }

  it('finds the clip in a sequence that is not the active one', () => {
    const { host, h } = twoSequences();
    expect(ok(h.call('findPlaced', probe()))).toEqual({ kind: 'clip', id: '0000beef', name: NAME, track: 1, startSec: 4, endSec: 10 });
    expect(host.active.sequenceID).toBe('SEQ-A');
    expect(host.opened).toEqual([]);
  });

  it('matches the start on the frame grid: float noise in the seconds is no obstacle, another frame is', () => {
    const { h } = twoSequences();
    expect(ok(h.call('findPlaced', probe({ startSec: 4.0000000001 })))).not.toBeNull();
    expect(ok(h.call('findPlaced', probe({ startSec: (100 * TPF_25 + 3) / TPS })))).not.toBeNull();
    expect(ok(h.call('findPlaced', probe({ startSec: 4.04 })))).toBeNull(); // frame 101
    expect(ok(h.call('findPlaced', probe({ startSec: 3.96 })))).toBeNull(); // frame 99
  });

  it('finds a clip at any frame from the seconds the context gave, float noise below the frame included', () => {
    // ticks / 254016000000 * 254016000000 / ticksPerFrame is 200.99999999999997 at frame 201: it has to be rounded
    for (const [tpf, list] of [[TPF_25, [201, 203, 402, 1013, 54321]], [TPF_2997, [15, 30, 60, 122]]]) {
      const host = createPremiere();
      host.addSequence({ id: 'S', tpf, video: [{ clips: list.map((f) => ({ name: 'c' + f, startF: f, endF: f + 1 })) }] });
      const h = loadAdapter('pr', host.globals, { parts: PARTS });
      host.bind(h.context);
      for (const f of list) {
        const startSec = Number(f * tpf) / TPS;
        expect(ok(h.call('findPlaced', { kind: 'clip', targetId: 'S', startSec, name: 'c' + f })), `frame ${f} at ${tpf}`).not.toBeNull();
      }
    }
  });

  it('answers null for another name, another sequence or no such sequence', () => {
    const { h } = twoSequences();
    expect(ok(h.call('findPlaced', probe({ name: 'TTL_LowerThird_16x9_v2' })))).toBeNull();
    expect(ok(h.call('findPlaced', probe({ targetId: 'SEQ-A' })))).toBeNull();
    expect(ok(h.call('findPlaced', probe({ targetId: 'SEQ-Z' })))).toBeNull();
  });

  it('answers the topmost clip when the same template starts on two tracks', () => {
    const { b, h } = twoSequences();
    b.video[2].addClip({ name: NAME, startF: 100, endF: 250, nodeId: '0000cafe' });
    expect(ok(h.call('findPlaced', probe())).track).toBe(2);
  });

  it('answers null when no project is open', () => {
    const { h } = rig({ host: { noProject: true } });
    expect(ok(h.call('findPlaced', probe()))).toBeNull();
  });

  it('finds what insertItem placed, by the playhead seconds the context gave', () => {
    const { h } = rig({ seq: { video: [{ clips: [busy(0, 400)] }, {}] } });
    ok(h.call('insertItem', insertArgs()));
    const { target } = ok(h.call('getContext'));
    expect(ok(h.call('findPlaced', { kind: 'clip', targetId: target.id, startSec: target.timeSec, name: NAME })))
      .toMatchObject({ name: NAME, track: 1, startSec: 4, endSec: 10 });
  });

  it('only reads: no write, no selection, no sequence switch', () => {
    const { host, h } = twoSequences();
    h.call('findPlaced', probe());
    expect(host.ops).toEqual([]);
    expect(host.opened).toEqual([]);
  });

  it('refuses a probe it cannot read', () => {
    const { h } = twoSequences();
    for (const over of [{ targetId: '' }, { targetId: 5 }, { startSec: 'x' }, { startSec: null }, { name: 5 }]) {
      refused(h.call('findPlaced', probe(over)), 'BAD_ARGS');
    }
    refused(h.call('findPlaced', {}), 'BAD_ARGS');
  });
});

describe('pr adapter: diag', () => {
  it('reports the app, the build, QE, the JSON engine, the sequence and the project', () => {
    const { host, h } = rig({ seq: { video: [{ clips: [busy(0, 60)] }, {}], audio: 3 } });
    expect(ok(h.call('diag'))).toMatchObject({
      app: '26.5.2',
      build: h.build,
      qe: true,
      json: 'native',
      sequence: { id: 'SEQ-A', name: 'Секвенция 1', videoTracks: 2, audioTracks: 3 },
      project: 'C:\\CRBK\\work\\pr\\CRT_panel_pr.prproj',
      last: null,
    });
    expect(host.enabledQE).toBeGreaterThan(0);
    expect(host.ops).toEqual([]);
  });

  it('says polyfill when the host has no JSON of its own', () => {
    const { h } = rig({ load: { nativeJson: false } });
    expect(ok(h.call('diag')).json).toBe('polyfill');
  });

  it.each(['enableThrows', 'unavailable'])('says qe false when QE is %s', (qe) => {
    const { h } = rig({ host: { qe } });
    expect(ok(h.call('diag')).qe).toBe(false);
  });

  it('has no sequence and no project path when there are none', () => {
    const { host, h } = rig({ host: { projectPath: '' } });
    host.active = null;
    expect(ok(h.call('diag'))).toMatchObject({ sequence: null, project: null });
    const bare = rig({ host: { noProject: true } });
    expect(ok(bare.h.call('diag'))).toMatchObject({ sequence: null, project: null });
  });

  it('says which of the optional host calls exist: Track.isLocked, TrackItem.isSelected and nodeId', () => {
    const empty = rig({ seq: { video: [{ noLockApi: true }] } });
    expect(ok(empty.h.call('diag')).api).toEqual({ isLocked: 'undefined', isSelected: null, nodeId: null });
    const full = rig({ seq: { video: [{ clips: [busy(0, 60)] }] } });
    expect(ok(full.h.call('diag')).api).toEqual({ isLocked: 'function', isSelected: 'function', nodeId: 'undefined' });
    const withId = rig({ seq: { video: [{ clips: [{ ...busy(0, 60), nodeId: '0000beef' }] }] } });
    expect(ok(withId.h.call('diag')).api.nodeId).toBe('string');
  });

  it('keeps the last insert: the clip, the parameter names the template exposes, the attempts and what went wrong', () => {
    const params = [...TTL_PARAMS(), { name: 'Сломано', kind: 'text', value: 'a', throwsOnSet: true }];
    const { h } = rig({ template: { params }, host: { importPlan: ['never', 'now'] } });
    const fields = [{ egpName: 'Сломано', type: 'text', value: 'b' }, { egpName: 'Нет такого', type: 'text', value: 'c' }];
    ok(h.call('insertItem', insertArgs({ fields })));
    const { last } = ok(h.call('diag'));
    expect(last).toMatchObject({ seq: 'SEQ-A', placed: { name: NAME, track: 0 }, attempts: 2 });
    expect(last.params).toEqual(['Имя', 'Должность', 'Должность, 2-я строка', 'Стиль', 'Сторона', 'Скорость', 'Размер текста', 'Сломано']);
    expect(last.notes.join('|')).toContain('Сломано');
    expect(last.notes.join('|')).toContain('Нет такого');
  });

  it('keeps the last insert across a reload of the same build', () => {
    const { h } = rig();
    ok(h.call('insertItem', insertArgs()));
    h.load();
    expect(ok(h.call('diag')).last).toMatchObject({ placed: { name: NAME } });
  });

  it('answers in ASCII', () => {
    const { h } = rig();
    expect(h.run(callSource('diag'))).toMatch(ASCII);
  });
});

describe('pr adapter: the ported helpers (CRBK.pr)', () => {
  const { h } = rig();
  const run = (src) => h.run(src);

  it('converts ticks, frames and seconds at 25 fps, as spikes/lib/pr-helpers.jsx does', () => {
    expect(run('CRBK.pr.TICKS_PER_SECOND')).toBe(TPS);
    expect(run(`CRBK.pr.ticksToFrames("3048192000000", ${TPF_25})`)).toBe(300);
    expect(run(`CRBK.pr.ticksToFrames(${TPF_25 * 7 + 1}, ${TPF_25})`)).toBe(7);
    expect(run(`CRBK.pr.framesToTicks(7, ${TPF_25})`)).toBe(7 * TPF_25);
    expect(run(`CRBK.pr.framesToTicks(2.4, ${TPF_25})`)).toBe(2 * TPF_25); // whole frames
  });

  it('builds a whole Time object from ticks', () => {
    const t = run(`CRBK.pr.makeTime(${TPF_25 * 25})`);
    expect(t.ticks).toBe(String(TPS));
    expect(t.seconds).toBe(1);
  });

  it('writes MOGRT text as JSON with one style run, keeps the other keys, and reads it back', () => {
    h.context.q = {
      v: textJson('Имя Фамилия'),
      getValue() { return this.v; },
      setValue(v, ui) { this.v = v; this.ui = ui; return true; },
    };
    expect(run('CRBK.pr.setMgtText(q, "Анна-Мария Ёлкина")')).toBe(true);
    expect(h.context.q.ui).toBe(1);
    expect(JSON.parse(h.context.q.v)).toEqual({ ...JSON.parse(textJson('x')), textEditValue: 'Анна-Мария Ёлкина', fontTextRunLength: [17] });
    expect(run('CRBK.pr.readMgtText(q)')).toBe('Анна-Мария Ёлкина');
  });

  it('refuses text for a parameter that is not an AE text, and reads null from one', () => {
    for (const raw of ['{"a":1}', 'garbage', '0', 'true']) {
      h.context.q = { getValue: () => raw, setValue() { throw new Error('must not be written'); } };
      expect(() => run('CRBK.pr.setMgtText(q, "x")'), raw).toThrow(/BK_NOT_AE_TEXT|SyntaxError|Unexpected/);
      expect(run('CRBK.pr.readMgtText(q)'), raw).toBeNull();
    }
  });

  it.each([undefined, 'noop', 'throws'])('makes a sequence active: openSequence first, then assigning activeSequence (openSequence: %s)', (openSequence) => {
    const host = createPremiere({ openSequence });
    host.addSequence({ id: 'A' });
    const b = host.addSequence({ id: 'B' });
    const loaded = loadAdapter('pr', host.globals, { parts: PARTS });
    host.bind(loaded.context);
    loaded.context.target = b.node;
    expect(host.active.sequenceID).toBe('A');
    expect(loaded.run('CRBK.pr.activateSequence(target)')).toBe(true);
    expect(host.active.sequenceID).toBe('B');
    expect(host.opened).toEqual(['B']);
    expect(host.ops.filter((o) => o[0] === 'activeSequence=')).toHaveLength(openSequence ? 1 : 0);
  });

  it('does not touch the sequences when the one asked for is active already', () => {
    const host = createPremiere();
    const a = host.addSequence({ id: 'A' });
    const loaded = loadAdapter('pr', host.globals, { parts: PARTS });
    host.bind(loaded.context);
    loaded.context.target = a.node;
    expect(loaded.run('CRBK.pr.activateSequence(target)')).toBe(true);
    expect(host.opened).toEqual([]);
    expect(host.ops).toEqual([]);
  });

  it('says false when no way makes the sequence active', () => {
    const host = createPremiere({ openSequence: 'noop' });
    host.addSequence({ id: 'A' });
    const loaded = loadAdapter('pr', host.globals, { parts: PARTS });
    host.bind(loaded.context);
    loaded.context.target = { sequenceID: 'Z' }; // not a sequence of the project: assigning it is no use either
    expect(loaded.run('CRBK.pr.activateSequence(target)')).toBe(false);
  });

  it('finds a sequence by its id, among several', () => {
    const host = createPremiere();
    host.addSequence({ id: 'A' });
    host.addSequence({ id: 'B', name: 'Вторая' });
    const loaded = loadAdapter('pr', host.globals, { parts: PARTS });
    host.bind(loaded.context);
    expect(loaded.run('CRBK.pr.findSequenceById("B").name')).toBe('Вторая');
    expect(loaded.run('CRBK.pr.findSequenceById("C")')).toBeNull();
  });
});

describe('pr adapter: the file', () => {
  const source = readFileSync(new URL('../../panel/host/pr.jsx', import.meta.url), 'utf8');

  it('is ASCII, and registers exactly the four functions of the plan next to ping', () => {
    expect(source).toMatch(ASCII);
    const { h } = rig();
    const names = h.run('(function () { var out = [], k; for (k in CRBK.fns) { if (Object.prototype.hasOwnProperty.call(CRBK.fns, k)) { out.push(k); } } return out.sort().join(","); })()');
    expect(names).toBe('diag,findPlaced,getContext,insertItem,ping');
    expect(h.run('CRBK.host')).toBe('pr');
  });

  it('passes the ES3 lint with no warning but the known one: Premiere has no undo groups', () => {
    const { warnings } = assembleAdapter('pr');
    expect(warnings.filter((w) => !/^mutations without app\.beginUndoGroup/.test(w))).toEqual([]);
  });

  it('adds no global but CRBK (and the JSON polyfill where the host has none), QE aside', () => {
    for (const nativeJson of [true, false]) {
      const { h } = rig({ load: { nativeJson }, seq: { video: [{ clips: [busy(50, 300)] }] } });
      ok(h.call('insertItem', insertArgs({ lenFrames: 100, fields: [{ egpName: 'Имя', type: 'text', value: 'А' }] })));
      h.call('findPlaced', { kind: 'clip', targetId: 'SEQ-A', startSec: 4, name: NAME });
      h.call('getContext');
      h.call('diag');
      h.load();
      expect(h.addedGlobals().filter((n) => n !== 'qe')).toEqual(nativeJson ? ['CRBK'] : ['CRBK', 'JSON']);
    }
  });

  it('never leaves a script error behind: any host surprise is an HOST_EXCEPTION reply', () => {
    const { host, h } = rig();
    Object.defineProperty(host.nodes[0], 'timebase', { get() { throw new Error('Object is invalid'); } });
    for (const fn of ['getContext', 'insertItem', 'findPlaced']) {
      const reply = h.call(fn, fn === 'insertItem' ? insertArgs() : { kind: 'clip', targetId: 'SEQ-A', startSec: 4, name: NAME });
      expect(reply.ok, fn).toBe(false);
      expect(reply.error.code, fn).toBe('HOST_EXCEPTION');
    }
  });
});
