// A Premiere stand-in for the adapter tests (plan 2026-10-05, task 6), meant for loadAdapter('pr', host.globals) of
// tests/panel-host/vm-host.mjs. It models the slice of the DOM the adapter touches, with the behaviours measured live
// on Premiere 26.5.2 (spikes/results/S5, tools/masters/jsx/pr-check.jsx) and the shapes of tests/spikes/pr-helpers.test.mjs:
// - Time keeps ticks (a string) and seconds in step; a clip hands out copies, so assigning clip.start.seconds is a
//   silent no-op, and clip.end / clip.outPoint accept a whole Time object only;
// - collections (sequences, tracks, clips, parameters) have a count and an index and nothing else: no length, no array
//   methods; seq.videoTracks is a snapshot, so an adapter must fetch it again after adding a track;
// - importMGT only overwrites, places the clip at once, after some $.sleep polls or never (host.importPlan, one entry
//   per call), and a MOGRT clip's inPoint is not 0 (one hour in, as seen live). What the new clip covers is cut the way
//   S5 measured it: a clip that runs under the new start keeps its head (bars2 250..500 under a template at 300 became
//   250..300), one that runs past the end keeps its tail, one inside is gone, one around it is split;
// - a text parameter is a JSON string (textEditValue + fontTextRunLength), a dropdown counts from 0, a checkbox reads
//   back as a boolean, setValue answers true even when the value is not taken (readOnly);
// - app.enableQE() makes the global qe appear; the QE sequence adds tracks to the DOM sequence.
// Whatever the panel must never do (open, save or close a project, make, clone or export sequences, import files) is
// recorded in host.forbidden and throws. Usage:
//   const host = createPremiere();
//   const seq = host.addSequence({ id: 'SEQ-A', video: 3, playheadF: 100 });
//   host.addTemplate('C:/lib/TTL_16x9_v1.mogrt', { name: 'TTL_16x9_v1', lenF: 150, params: TTL_PARAMS() });
//   const h = loadAdapter('pr', host.globals); host.bind(h.context);
export const TPS = 254016000000;
export const TPF_25 = 10160640000; // ticks per frame at 25 fps
export const TPF_2997 = 8475667200; // 30000/1001 fps
const HOUR_FRAMES = 90000; // inPoint of an inserted MOGRT clip at 25 fps: one hour

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const INDEX = /^\d+$/;

// Ticks (a string) and seconds in step, as Premiere's Time.
export function Time() {
  this._t = 0;
}
Object.defineProperty(Time.prototype, 'ticks', { get() { return String(this._t); }, set(v) { this._t = Number(v); } });
Object.defineProperty(Time.prototype, 'seconds', { get() { return this._t / TPS; }, set(v) { this._t = Math.round(v * TPS); } });
export const timeOf = (ticks) => {
  const t = new Time();
  t._t = Number(ticks);
  return t;
};

// The host's list objects: a count under one name, the items by index, and the methods given. Nothing else.
function collection(items, count, methods = {}) {
  return new Proxy({}, {
    get: (_, k) => {
      if (k === count) return items.length;
      if (typeof k === 'string' && INDEX.test(k)) return items[Number(k)];
      return own(methods, k) ? methods[k] : undefined;
    },
    has: (_, k) => k === count || (typeof k === 'string' && INDEX.test(k) && Number(k) < items.length) || own(methods, k),
  });
}

// The value of a text parameter of an AE-made MOGRT: JSON with one style run.
export const textJson = (text, runs = [text.length]) => JSON.stringify({
  capPropFontEdit: false,
  capPropTextRunCount: runs.length,
  fontEditValue: ['SBSansText-Regular'],
  fontFSBoldValue: [false],
  fontSizeEditValue: [40],
  fontTextRunLength: runs,
  textEditValue: text,
});

// The Essential Graphics controls of TTL_LowerThird at the template defaults (dropdowns 0-based, as Premiere keeps them).
export const TTL_PARAMS = () => [
  { name: 'Имя', kind: 'text', value: 'Имя Фамилия' },
  { name: 'Должность', kind: 'text', value: 'Должность' },
  { name: 'Должность, 2-я строка', kind: 'text', value: '', runs: [0] },
  { name: 'Стиль', kind: 'dropdown', value: 0 },
  { name: 'Сторона', kind: 'dropdown', value: 0 },
  { name: 'Скорость', kind: 'dropdown', value: 1 },
  { name: 'Размер текста', kind: 'dropdown', value: 1 },
];

function whole(v) {
  if (!(v instanceof Time)) throw new Error('a Time object is expected');
}

// opts: version, projectPath ('' for a project with no file), noProject (app.project is null), importPlan (per call:
// 'now' | n polls | 'never' | 'throw' | { throw: true, after: n } (it throws, and the clip still lands after n polls);
// the last entry repeats), staleParams (a parameter keeps the value it had when its
// component was fetched), endIgnored (clip.end = ... changes nothing), getParam ('native' | 'absent' | 'null' |
// 'throws': what properties.getParamForDisplayName does), qe ('ok' | 'noop' | 'throws' | 'enableThrows' |
// 'unavailable'), qeAt ('top' | 'bottom': where QE puts the track it adds; the real placement was never verified
// live), qeDelay (polls before QE tracks appear), qeStale (QE answers with another sequence this many times),
// selectionThrows (clip.isSelected() throws), openSequence ('noop' | 'throws': it does not make the sequence active),
// fileThrows (new File(...) throws), lookupThrows (a track's clips cannot be fetched; a test may switch it on and off
// at any moment).
// A template parameter spec: { name, kind: 'text' | 'dropdown' | 'checkbox' |
// 'slider', value, runs (text), readOnly, throwsOnSet, throwsOnGet, throwsOnGetAfterSet, float32 (a slider keeps single
// precision) }. A template spec may carry faults for the clip it places: { name (the name getter throws), end (the end
// getter throws), endAfterTrim (it throws once end was assigned), movesOnTrim (ticks the clip is shifted by when its
// end is assigned), lookupsFailAfterTrim (track look-ups throw once end was assigned), selectThrows (setSelected
// throws on this clip) }.
export function createPremiere(opts = {}) {
  const host = {
    opts: { qe: 'ok', getParam: 'native', ...opts },
    nodes: [], // the DOM sequences
    handles: [], // what the tests hold: the same sequences with their tracks as arrays
    templates: new Map(),
    importPlan: opts.importPlan ?? ['now'],
    imports: [], // every importMGT call: { path, ticks, vIdx, aIdx, n }
    ops: [], // the writes in order: ['outPoint', ticks], ['end', ticks], ['setValue', name, value, ui], ['select', clip, state, ui]
    events: [], // 'lookup' (a track's clips fetched), 'read' (getValue), 'write' (setValue), 'trim' (end set), 'readEnd'
    overwrites: [], // clips an importMGT cut: { track, name, how }
    qeCalls: [], // addTracks arguments
    forbidden: [],
    opened: [], // openSequence ids
    sleeps: 0,
    pending: [], // work that lands after some sleeps
    enabledQE: 0,
    context: null,
    active: null,
    projectPath: opts.projectPath ?? 'C:\\CRBK\\work\\pr\\CRT_panel_pr.prproj',
  };

  const flush = () => {
    host.pending = host.pending.filter((p) => {
      if (p.at > host.sleeps) return true;
      p.run();
      return false;
    });
  };
  const planOf = (n) => host.importPlan[Math.min(n, host.importPlan.length) - 1];
  const keyOf = (p) => String(p).replace(/\//g, '\\').toLowerCase();

  function File(p) {
    if (host.opts.fileThrows) throw new Error('File: Object is invalid');
    this.path = String(p);
    this.fsName = this.path.replace(/\//g, '\\');
    this.exists = host.templates.has(keyOf(p));
  }

  const forbid = (target, prefix, names) => {
    for (const n of names) {
      target[n] = () => {
        host.forbidden.push(prefix + n);
        throw new Error(prefix + n + ' is not for the panel');
      };
    }
  };

  function paramObject(p, snapshot) {
    const frozen = p.raw;
    return {
      displayName: p.name,
      getValue: () => {
        host.events.push('read');
        if (p.throwsOnGet || (p.throwsOnGetAfterSet && p.wrote)) throw new Error('getValue failed');
        return snapshot ? frozen : p.raw;
      },
      setValue(v, ui) {
        host.ops.push(['setValue', p.name, v, ui]);
        host.events.push('write');
        if (p.throwsOnSet) throw new Error('setValue failed');
        p.wrote = true;
        if (p.readOnly) return true;
        if (p.kind === 'text') {
          if (typeof v !== 'string') throw new Error('a string is expected');
          p.raw = v;
        } else if (p.kind === 'checkbox') {
          p.raw = Number(v) !== 0;
        } else {
          p.raw = p.float32 ? Math.fround(Number(v)) : Number(v);
        }
        return true;
      },
    };
  }

  // spec: name, startT, endT, inT (ticks), selected, nodeId (absent: the clip has none), params (a MOGRT instance),
  // faults (see the header: a clip that a read or a write on fails, as a stale host object does).
  function createClip(spec) {
    const faults = spec.faults ?? {};
    const clip = {
      name: spec.name,
      _start: spec.startT,
      _end: spec.endT,
      _in: spec.inT ?? 0,
      _out: (spec.inT ?? 0) + (spec.endT - spec.startT),
      _selected: !!spec.selected,
      _params: spec.params ?? null,
      _trimmed: false,
      get start() { return timeOf(this._start); },
      get end() {
        host.events.push('readEnd');
        if (faults.end || (faults.endAfterTrim && this._trimmed)) throw new Error('Object is invalid');
        return timeOf(this._end);
      },
      set end(v) {
        whole(v);
        host.ops.push(['end', Number(v.ticks)]);
        host.events.push('trim');
        this._trimmed = true;
        if (faults.lookupsFailAfterTrim) host.opts.lookupThrows = true;
        if (!host.opts.endIgnored) this._end = Number(v.ticks);
        if (faults.movesOnTrim) {
          this._start += faults.movesOnTrim;
          this._end += faults.movesOnTrim;
        }
      },
      get inPoint() { return timeOf(this._in); },
      get outPoint() { return timeOf(this._out); },
      set outPoint(v) {
        whole(v);
        host.ops.push(['outPoint', Number(v.ticks)]);
        this._out = Number(v.ticks);
      },
      isSelected() {
        if (host.opts.selectionThrows) throw new Error('isSelected failed');
        return this._selected;
      },
      setSelected(state, ui) {
        // spec.name, not this.name: a clip whose name getter fails must not make the bookkeeping fail
        host.ops.push(['select', spec.name, !!state, ui]);
        if (faults.selectThrows && state) throw new Error('setSelected failed');
        this._selected = !!state;
        return true;
      },
      getMGTComponent() {
        if (!this._params) return null;
        const params = this._params.map((p) => paramObject(p, host.opts.staleParams));
        const methods = {};
        if (host.opts.getParam !== 'absent') {
          methods.getParamForDisplayName = (name) => {
            if (host.opts.getParam === 'throws') throw new Error('getParamForDisplayName failed');
            if (host.opts.getParam === 'null') return null;
            return params.find((q) => q.displayName === name) ?? null;
          };
        }
        return { properties: collection(params, 'numItems', methods) };
      },
    };
    if (spec.nodeId !== undefined) clip.nodeId = spec.nodeId;
    if (faults.name) {
      Object.defineProperty(clip, 'name', { get() { throw new Error('Object is invalid'); }, enumerable: true, configurable: true });
    }
    return clip;
  }

  const instanceParams = (template) => (template.params ?? []).map((p) => ({
    ...p,
    raw: p.kind === 'text' ? textJson(p.value, p.runs ?? [p.value.length]) : p.kind === 'checkbox' ? !!p.value : Number(p.value),
  }));

  // One track: `clips` is what the tests read, `node` what the adapter gets.
  function makeTrack(spec, tpf) {
    const clips = [];
    const track = {
      clips,
      locked: !!spec.locked,
      node: { name: spec.name ?? 'Track', clips: null },
      // A clip that was on the track before the panel came.
      addClip(c) {
        const clip = createClip({
          name: c.name ?? 'clip',
          startT: c.startF * tpf,
          endT: c.endF * tpf,
          inT: (c.inF ?? 0) * tpf,
          selected: c.selected,
          nodeId: c.nodeId,
        });
        clips.push(clip);
        clips.sort((a, b) => a._start - b._start);
        return clip;
      },
    };
    Object.defineProperty(track.node, 'clips', {
      get: () => {
        host.events.push('lookup');
        if (host.opts.lookupThrows) throw new Error('Object is invalid');
        return collection(clips, 'numItems');
      },
      enumerable: true,
    });
    if (!spec.noLockApi) track.node.isLocked = () => track.locked;
    for (const c of spec.clips ?? []) track.addClip(c);
    return track;
  }

  // A template placed on a video track at startT. importMGT only overwrites: what the new clip covers is cut the way S5
  // measured it (see the header), and host.overwrites says what became of each clip it touched:
  // 'head kept' | 'tail kept' | 'split' | 'removed'.
  function place(handle, vIdx, template, startT) {
    const track = handle.video[vIdx];
    const endT = startT + template.lenF * handle.tpf;
    for (const c of [...track.clips]) {
      if (!(c._start < endT && c._end > startT)) continue;
      const head = c._start < startT; // a part before the new clip stays
      const tail = c._end > endT; // a part after it stays
      const { _start: start0, _end: end0, _in: in0 } = c;
      host.overwrites.push({ track: vIdx, name: c.name, how: head && tail ? 'split' : head ? 'head kept' : tail ? 'tail kept' : 'removed' });
      if (head) {
        c._end = startT;
        c._out = in0 + (startT - start0);
      }
      if (tail && head) {
        // a new clip of the same name holds the tail; its in point has moved on by what was cut away
        track.clips.push(createClip({ name: c.name, startT: endT, endT: end0, inT: in0 + (endT - start0) }));
      } else if (tail) {
        c._start = endT;
        c._in = in0 + (endT - start0);
      } else if (!head) {
        track.clips.splice(track.clips.indexOf(c), 1);
      }
    }
    const clip = createClip({
      name: template.name,
      startT,
      endT,
      inT: (template.inF ?? HOUR_FRAMES) * handle.tpf,
      nodeId: template.nodeId === undefined ? '000' + (host.imports.length + 1000).toString(16) : template.nodeId ?? undefined,
      params: instanceParams(template),
      faults: template.faults,
    });
    track.clips.push(clip);
    track.clips.sort((a, b) => a._start - b._start);
    return clip;
  }

  // spec: id, name, w, h, tpf, playheadF, video / audio (a count of empty tracks, or [{ locked, clips: [{ name, startF,
  // endF, inF, selected, nodeId }] }]), active (true: the active sequence; default: the first one added).
  host.addSequence = (spec = {}) => {
    const tpf = spec.tpf ?? TPF_25;
    const id = spec.id ?? 'SEQ-' + (host.nodes.length + 1);
    const video = [];
    const audio = [];
    const handle = {
      id,
      tpf,
      video,
      audio,
      playheadF: spec.playheadF ?? 0,
      // at: the index the track takes (default: on top, as the Timeline shows a new track)
      addVideoTrack: (s = {}, at = video.length) => {
        const track = makeTrack(s, tpf);
        video.splice(at, 0, track);
        return track;
      },
      addAudioTrack: (s = {}) => audio[audio.push(makeTrack(s, tpf)) - 1],
    };
    const seq = {
      sequenceID: id,
      name: spec.name ?? 'Sequence ' + id,
      frameSizeHorizontal: spec.w ?? 1920,
      frameSizeVertical: spec.h ?? 1080,
      timebase: String(tpf),
      get videoTracks() { return collection(video.map((t) => t.node), 'numTracks'); },
      get audioTracks() { return collection(audio.map((t) => t.node), 'numTracks'); },
      getPlayerPosition: () => timeOf(handle.playheadF * tpf),
      importMGT(path, ticks, vIdx, aIdx) {
        const call = { path, ticks, vIdx, aIdx, n: host.imports.length + 1 };
        host.imports.push(call);
        const plan = planOf(call.n);
        const template = host.templates.get(keyOf(path));
        if (plan === 'throw' || !template) throw new Error('importMGT failed for ' + path);
        if (!video[vIdx]) throw new Error('no video track ' + vIdx);
        if (plan === 'never') return null;
        const land = () => place(handle, vIdx, template, Number(ticks));
        if (typeof plan === 'object') {
          // { throw: true, after: n }: the call reports an error, yet the clip lands (after n polls, or at once)
          if (plan.after > 0) host.pending.push({ at: host.sleeps + plan.after, run: land });
          else land();
          throw new Error('importMGT threw after it had started');
        }
        if (plan === 'now' || plan === 0) return land();
        host.pending.push({ at: host.sleeps + plan, run: land });
        return null;
      },
    };
    forbid(seq, 'sequence.', ['clone', 'setSettings', 'exportAsMediaDirect', 'setInPoint', 'setOutPoint', 'setZeroPoint']);
    handle.node = seq;
    const tracks = (n, add) => {
      if (Array.isArray(n)) n.forEach((s) => add(s));
      else for (let i = 0; i < n; i++) add();
    };
    tracks(spec.video ?? 3, handle.addVideoTrack);
    tracks(spec.audio ?? 2, handle.addAudioTrack);
    host.nodes.push(seq);
    host.handles.push(handle);
    if (spec.active === true || !host.active) host.active = seq;
    return handle;
  };

  // A MOGRT the library holds: it exists as a file, and importMGT of it places a clip of lenF frames (inF: its inPoint;
  // nodeId null: the clip has no nodeId).
  host.addTemplate = (path, spec) => {
    host.templates.set(keyOf(path), { lenF: 150, params: [], ...spec });
  };

  // The QE sequence of a DOM sequence: addTracks adds video tracks to it, at once or after qeDelay polls, on top of the
  // others or (qeAt: 'bottom') under them.
  const qeSequence = (handle) => ({
    name: handle.node.name,
    addTracks(...args) {
      host.qeCalls.push(args);
      if (host.opts.qe === 'throws') throw new Error('addTracks failed');
      if (host.opts.qe === 'noop') return;
      const add = () => {
        for (let i = 0; i < Number(args[0]); i++) handle.addVideoTrack({}, host.opts.qeAt === 'bottom' ? 0 : undefined);
      };
      if (host.opts.qeDelay) host.pending.push({ at: host.sleeps + host.opts.qeDelay, run: add });
      else add();
    },
  });
  let qeAnswers = 0;
  const qeObject = {
    project: {
      getActiveSequence() {
        qeAnswers += 1;
        if (qeAnswers <= (host.opts.qeStale ?? 0)) {
          return { name: 'Another sequence', addTracks: (...a) => host.qeCalls.push(['stale', ...a]) };
        }
        const handle = host.handles.find((s) => s.node === host.active);
        return handle ? qeSequence(handle) : null;
      },
    },
  };

  const project = {
    get path() { return host.projectPath; },
    get activeSequence() { return host.active; },
    set activeSequence(s) {
      host.ops.push(['activeSequence=']);
      if (host.nodes.includes(s)) host.active = s; // anything else is no sequence of the project: no change
    },
    get sequences() { return collection(host.nodes, 'numSequences'); },
    openSequence(id) {
      host.opened.push(String(id));
      if (host.opts.openSequence === 'throws') throw new Error('openSequence failed');
      const s = host.nodes.find((n) => n.sequenceID === String(id));
      if (s && host.opts.openSequence !== 'noop') host.active = s;
      return !!s;
    },
  };
  forbid(project, 'project.', [
    'save', 'saveAs', 'closeDocument', 'importFiles', 'newSequence', 'createNewSequence', 'importSequences', 'deleteSequence',
  ]);

  const app = {
    version: opts.version ?? '26.5.2',
    project: opts.noProject ? null : project,
    enableQE() {
      host.enabledQE += 1;
      if (host.opts.qe === 'enableThrows') throw new Error('QE is not available');
      if (host.opts.qe !== 'unavailable') host.context.qe = qeObject;
    },
  };
  forbid(app, 'app.', ['openDocument', 'newProject', 'quit']);

  host.app = app;
  host.globals = {
    app,
    Time,
    File,
    $: {
      sleep() {
        host.sleeps += 1;
        flush();
      },
    },
  };
  // loadAdapter builds its context from a copy of the globals: qe has to be set on the context itself.
  host.bind = (context) => {
    host.context = context;
  };
  return host;
}
