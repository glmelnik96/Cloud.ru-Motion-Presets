// Premiere adapter of the BrandKit panel (ES3, ASCII only; plan 2026-10-05, task 6). It registers on CRBK.fns:
//   getContext()   the active sequence: size, frame rate, playhead; changes nothing
//   insertItem(a)  one call (plan P9): the video track (P10), importMGT, the length, the fields with a read-back, the
//                  selection. Premiere has no undo groups, but S5 measured one qe undo for an insert and three writes
//   findPlaced(p)  is a clip of that name at that frame in that sequence: what the panel asks after an insert it got no
//                  answer to (it never sends an insert twice)
//   diag()         what the panel copies into a bug report
// The panel never opens, saves or closes a project, never makes or clones a sequence and never acts on the first item
// it finds: a sequence is found by its id, the track by a rule, the clip by its start frame on that track.
// The helpers are the live-proven ones of spikes/lib/pr-helpers.jsx (time and ticks, tracks, trimClip, importMogrt,
// mgtParam, setMgtText, ensureQE), ported into this closure and also reachable as CRBK.pr for a live probe.
// Replies: CRBK.ok / CRBK.fail, or CRBK.error(code, message) thrown. Codes of this adapter: BAD_ARGS, TARGET_CHANGED,
// FILE_MISSING, NO_FREE_TRACK, INSERT_FAILED. Warnings of insertItem (codes, no text): NAME_MISMATCH, LENGTH_MISMATCH.
// Load-time code only defines functions; the one state that outlives a call, the last insert, is CRBK.state.pr.last.
(function (CRBK) {
  CRBK.host = 'pr';

  var TICKS_PER_SECOND = 254016000000;
  var POLL_MS = 100;
  var IMPORT_POLLS = 30; // 3 s after each importMGT: it may return before the clip is on the track (pr-check waited 3 s)
  var TRACK_POLLS = 20; // a track QE adds shows up in the DOM a little later
  var QE_TRIES = 10; // QE follows the active sequence with a lag (exportFramePNG waited 10 x 300 ms)
  var QE_WAIT_MS = 300;
  var SLIDER_EPS = 0.001; // how S5 compares a slider read back

  // JSON as loaded (native, or the prelude's polyfill) down to its functions, as common.jsx keeps it: another extension
  // replacing the shared global later must not change how a MOGRT text is read and written.
  var codec = typeof JSON !== 'undefined' && JSON ? JSON : null;
  var codecParse = codec ? codec.parse : null;
  var codecStringify = codec ? codec.stringify : null;

  function msg(e) {
    try {
      return String(e);
    } catch (x) {
      return 'unprintable error';
    }
  }

  function truthy(v) {
    return v === true || v === 1 || v === '1' || v === 'true';
  }

  // ---- time: whole frames on the sequence grid, ticks as Numbers (exact up to 2^53 ticks, 9.8 h) ----

  function ticksToFrames(ticks, tpf) {
    return Math.round(Number(ticks) / Number(tpf));
  }

  function framesToTicks(frames, tpf) {
    return Math.round(frames) * Number(tpf);
  }

  // A whole Time object from ticks: assigning .seconds on a clip's start is a silent no-op.
  function makeTime(ticks) {
    var t = new Time();
    t.ticks = String(ticks);
    return t;
  }

  // ---- project and sequences ----

  function projectPath() {
    var p;
    try {
      p = app.project.path;
    } catch (e) {
      p = '';
    }
    return p === undefined || p === null ? '' : String(p);
  }

  function activeSequence() {
    var seq = null;
    try {
      seq = app.project.activeSequence;
    } catch (e) {
      seq = null;
    }
    return seq || null;
  }

  function findSequenceById(id) {
    var seqs = app.project ? app.project.sequences : null;
    var i;
    if (!seqs) {
      return null;
    }
    for (i = 0; i < seqs.numSequences; i++) {
      if (String(seqs[i].sequenceID) === String(id)) {
        return seqs[i];
      }
    }
    return null;
  }

  // Ticks per frame: '10160640000' at 25 fps.
  function timebase(seq) {
    var tb = Number(seq.timebase);
    if (!(tb > 0)) {
      throw new Error('the sequence has no timebase: ' + String(seq.timebase));
    }
    return tb;
  }

  // Makes seq the active sequence, which QE follows. Already active costs nothing; openSequence and assigning
  // activeSequence are the two ways premiere-autopilot uses. True when seq is active afterwards.
  function activateSequence(seq) {
    var id = String(seq.sequenceID);
    var act = activeSequence();
    if (act && String(act.sequenceID) === id) {
      return true;
    }
    try {
      app.project.openSequence(id);
    } catch (e) {
      act = null;
    }
    act = activeSequence();
    if (act && String(act.sequenceID) === id) {
      return true;
    }
    try {
      app.project.activeSequence = seq;
    } catch (e2) {
      act = null;
    }
    act = activeSequence();
    return !!(act && String(act.sequenceID) === id);
  }

  // ---- tracks and clips ----

  function isLocked(track) {
    try {
      return typeof track.isLocked === 'function' && truthy(track.isLocked());
    } catch (e) {
      return false;
    }
  }

  // True when no clip of the track overlaps [fromT, toT) in ticks; touching edges are free.
  function trackFreeAt(track, fromT, toT) {
    var clips = track.clips;
    var i, c;
    for (i = 0; i < clips.numItems; i++) {
      c = clips[i];
      if (Number(c.start.ticks) < toT && Number(c.end.ticks) > fromT) {
        return false;
      }
    }
    return true;
  }

  // Plan P10: the first unlocked video track above the topmost one that has a clip over [fromT, toT); -1 when there is
  // none. With nothing over the interval anywhere it is the first unlocked track, V1 unless that is locked.
  function chooseTrack(tracks, fromT, toT) {
    var n = tracks.numTracks;
    var top = -1;
    var i;
    for (i = 0; i < n; i++) {
      if (!trackFreeAt(tracks[i], fromT, toT)) {
        top = i;
      }
    }
    for (i = top + 1; i < n; i++) {
      if (!isLocked(tracks[i])) {
        return i;
      }
    }
    return -1;
  }

  // The clip that starts at `frame` on the track (and has `name` when one is given), else null.
  function clipStartingAt(track, frame, tpf, name) {
    var clips = track.clips;
    var i, c;
    for (i = 0; i < clips.numItems; i++) {
      c = clips[i];
      if (ticksToFrames(c.start.ticks, tpf) === frame && (name === undefined || String(c.name) === name)) {
        return c;
      }
    }
    return null;
  }

  // A fresh look-up by sequence, track index and start frame: never a clip object kept from before a write.
  function clipAt(seq, vIdx, frame, tpf) {
    var track = seq.videoTracks[vIdx];
    return track ? clipStartingAt(track, frame, tpf) : null;
  }

  // A placed clip made lenF frames long: outPoint first, then end, both as whole Time objects built from ticks.
  // Assigning end alone lengthens the item and leaves outPoint. The in point of an inserted MOGRT is not 0.
  function trimClip(clip, lenF, tpf) {
    var startT = Number(clip.start.ticks);
    var inT = Number(clip.inPoint.ticks);
    clip.outPoint = makeTime(inT + framesToTicks(lenF, tpf));
    clip.end = makeTime(startT + framesToTicks(lenF, tpf));
  }

  // importMGT may return before the clip is on its track, so poll for the clip at `frame`; $.sleep blocks the host.
  function waitForClip(seq, vIdx, frame, tpf) {
    var clip = clipAt(seq, vIdx, frame, tpf);
    var i;
    for (i = 0; !clip && i < IMPORT_POLLS; i++) {
      $.sleep(POLL_MS);
      clip = clipAt(seq, vIdx, frame, tpf);
    }
    return clip;
  }

  // importMGT(native path, ticks string, video index, audio index) only overwrites; the clip is looked up on its
  // track afterwards. A call that left nothing changed nothing, so exactly one more is allowed (spec 6.1 step 5), and
  // only after the poll: a clip that lands late is never inserted twice. Throws INSERT_FAILED after two such calls.
  function importMogrt(seq, fsName, frame, tpf, vIdx) {
    var clip = null;
    var errors = [];
    var attempts = 0;
    while (!clip && attempts < 2) {
      attempts += 1;
      try {
        seq.importMGT(fsName, String(framesToTicks(frame, tpf)), vIdx, 0);
      } catch (e) {
        errors.push(msg(e));
      }
      clip = waitForClip(seq, vIdx, frame, tpf);
    }
    if (!clip) {
      throw CRBK.error('INSERT_FAILED', errors.length ? errors.join('; ') :
        'no clip at frame ' + frame + ' on video track ' + (vIdx + 1) + ' after ' + attempts + ' importMGT calls');
    }
    return { clip: clip, attempts: attempts };
  }

  // ---- QE: the DOM has no addTracks (premiere-autopilot, 26.3.2); this signature is unverified on 26.5.2 ----

  function ensureQE() {
    try {
      app.enableQE();
    } catch (e) {
      return false;
    }
    return typeof qe !== 'undefined' && !!qe && !!qe.project;
  }

  // Adds one video track on top of seq through QE, which acts on the active sequence only: QE is enabled, seq is
  // activated, and addTracks is called only on a QE sequence of seq's name (QE lags behind the active sequence).
  // Returns how many tracks the DOM shows more, 0 on any failure or when none showed up in time.
  function addVideoTrack(seq) {
    var before = seq.videoTracks.numTracks;
    var qs = null;
    var grown = 0;
    var i;
    if (!ensureQE() || !activateSequence(seq)) {
      return 0;
    }
    for (i = 0; i < QE_TRIES; i++) {
      qs = null;
      try {
        qs = qe.project.getActiveSequence();
        if (qs && String(qs.name) !== String(seq.name)) {
          qs = null;
        }
      } catch (e) {
        qs = null;
      }
      if (qs) {
        break;
      }
      $.sleep(QE_WAIT_MS);
    }
    if (!qs) {
      return 0;
    }
    try {
      qs.addTracks(1, before, 0);
    } catch (e2) {
      return 0;
    }
    for (i = 0; i < TRACK_POLLS; i++) {
      grown = seq.videoTracks.numTracks - before;
      if (grown > 0) {
        return grown;
      }
      $.sleep(POLL_MS);
    }
    return 0;
  }

  // ---- MOGRT parameters ----

  // TrackItem.getMGTComponent(): the Component of a MOGRT's parameters, null for other clips.
  function mgtComponent(clip) {
    try {
      return clip.getMGTComponent();
    } catch (e) {
      return null;
    }
  }

  function mgtParamNames(clip) {
    var out = [];
    var comp = mgtComponent(clip);
    var i;
    if (!comp) {
      return out;
    }
    for (i = 0; i < comp.properties.numItems; i++) {
      out.push(String(comp.properties[i].displayName));
    }
    return out;
  }

  // getParamForDisplayName is not in the official reference (Adobe's PProPanel sample uses it), so a miss, a throw or
  // its absence falls back to a look through the list. The names are the Essential Graphics names of the template.
  function mgtParam(clip, displayName) {
    var comp = mgtComponent(clip);
    var props, p, i;
    if (!comp) {
      return null;
    }
    props = comp.properties;
    p = null;
    try {
      p = props.getParamForDisplayName(displayName);
    } catch (e) {
      p = null;
    }
    if (p) {
      return p;
    }
    for (i = 0; i < props.numItems; i++) {
      if (String(props[i].displayName) === displayName) {
        return props[i];
      }
    }
    return null;
  }

  // The Source Text of an AE-made MOGRT reads as JSON: textEditValue plus fontTextRunLength per style run. One style
  // run per field (contract), so the run length is the text length; an empty text writes [0] (unverified live).
  function setMgtText(param, text) {
    var raw = String(param.getValue());
    var obj = codecParse.call(codec, raw);
    if (!obj || typeof obj !== 'object' || obj.textEditValue === undefined) {
      throw new Error('BK_NOT_AE_TEXT: ' + raw.substr(0, 80));
    }
    obj.textEditValue = text;
    obj.fontTextRunLength = [text.length];
    return param.setValue(codecStringify.call(codec, obj), 1);
  }

  // null when the value is not an AE text.
  function readMgtText(param) {
    var v;
    try {
      v = codecParse.call(codec, String(param.getValue())).textEditValue;
    } catch (e) {
      return null;
    }
    return v === undefined ? null : v;
  }

  // ---- fields ----

  // null when the value was handed to the host, else why it was not.
  function writeField(clip, f) {
    var p = mgtParam(clip, f.egpName);
    var n;
    if (!p) {
      return 'no such parameter';
    }
    if (f.type === 'text') {
      setMgtText(p, String(f.value));
      return null;
    }
    if (f.type === 'checkbox') {
      p.setValue(truthy(f.value) ? 1 : 0, 1);
      return null;
    }
    if (f.type === 'dropdown' || f.type === 'slider') {
      n = Number(f.value);
      if (!isFinite(n)) {
        return 'not a number';
      }
      p.setValue(n, 1);
      return null;
    }
    return 'a field of type ' + f.type + ' is not written';
  }

  // What the host holds: a text, or a number (a checkbox as 1 or 0, its getValue is a boolean); null when there is no
  // such parameter or no way to read it.
  function readField(clip, f) {
    var p = mgtParam(clip, f.egpName);
    var v;
    if (!p) {
      return null;
    }
    if (f.type === 'text') {
      v = readMgtText(p);
      return v === null ? null : String(v);
    }
    if (f.type === 'checkbox') {
      return truthy(p.getValue()) ? 1 : 0;
    }
    if (f.type === 'dropdown' || f.type === 'slider') {
      return Number(p.getValue());
    }
    return null;
  }

  function sameValue(f, back) {
    var w;
    if (back === null) {
      return false;
    }
    if (f.type === 'text') {
      return back === String(f.value);
    }
    if (f.type === 'checkbox') {
      return back === (truthy(f.value) ? 1 : 0);
    }
    if (f.type === 'dropdown' || f.type === 'slider') {
      w = Number(f.value);
      return isFinite(w) && isFinite(back) && Math.abs(back - w) <= (f.type === 'slider' ? SLIDER_EPS : 0);
    }
    return false;
  }

  // Writes every field in the order given, then reads each back through a fresh look-up of the clip. A field that
  // cannot be written (no such parameter, a throw, a type it does not know) costs only itself: its result says back
  // null or what the host holds, ok false. What went wrong goes into notes (CRBK.state.pr.last, for diag).
  function writeFields(seq, vIdx, frame, tpf, fields, notes) {
    var out = [];
    var clip, i, why;
    for (i = 0; i < fields.length; i++) {
      out.push({ egpName: fields[i].egpName, written: fields[i].value, back: null, ok: false });
    }
    clip = fields.length ? clipAt(seq, vIdx, frame, tpf) : null;
    for (i = 0; clip && i < fields.length; i++) {
      try {
        why = writeField(clip, fields[i]);
      } catch (e) {
        why = msg(e);
      }
      if (why !== null) {
        notes.push(fields[i].egpName + ': ' + why);
      }
    }
    clip = fields.length ? clipAt(seq, vIdx, frame, tpf) : null;
    for (i = 0; clip && i < fields.length; i++) {
      try {
        out[i].back = readField(clip, fields[i]);
      } catch (e2) {
        out[i].back = null;
        notes.push(fields[i].egpName + ': read back: ' + msg(e2));
      }
      out[i].ok = sameValue(fields[i], out[i].back);
    }
    return out;
  }

  // ---- selection ----

  // Deselects every selected clip of the sequence, video and audio, then selects clip alone (spec 6.1 step 10).
  function selectOnly(seq, clip, notes) {
    var groups = [seq.videoTracks, seq.audioTracks];
    var failed = false;
    var g, tracks, t, clips, i, c;
    for (g = 0; g < groups.length; g++) {
      tracks = groups[g];
      for (t = 0; t < tracks.numTracks; t++) {
        clips = tracks[t].clips;
        for (i = 0; i < clips.numItems; i++) {
          c = clips[i];
          try {
            if (c.isSelected()) {
              c.setSelected(0, 0);
            }
          } catch (e) {
            if (!failed) {
              notes.push('deselect: ' + msg(e));
            }
            failed = true;
          }
        }
      }
    }
    try {
      clip.setSelected(1, 1);
    } catch (e2) {
      notes.push('select: ' + msg(e2));
    }
  }

  // ---- answers ----

  // The Placed of the panel: id is the clip's nodeId when it has one, else name@startTicks.
  function placedOf(clip, vIdx) {
    var name = String(clip.name);
    var start = String(clip.start.ticks);
    var id = null;
    try {
      id = clip.nodeId;
    } catch (e) {
      id = null;
    }
    id = id === undefined || id === null || String(id) === '' ? name + '@' + start : String(id);
    return {
      kind: 'clip',
      id: id,
      name: name,
      track: vIdx,
      startSec: Number(start) / TICKS_PER_SECOND,
      endSec: Number(clip.end.ticks) / TICKS_PER_SECOND
    };
  }

  function badArg(name, why) {
    return CRBK.error('BAD_ARGS', name + ': ' + why);
  }

  function isCount(v, min) {
    return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= min;
  }

  // The arguments of insertItem (PrInsertArgs), checked before anything is touched.
  function insertArgs(args) {
    var fields = [];
    var list, f, i, kind;
    if (!args || typeof args !== 'object' || CRBK.isList(args)) {
      throw badArg('args', 'an object is expected');
    }
    if (typeof args.seqId !== 'string' || args.seqId === '') {
      throw badArg('seqId', 'a sequence id is expected');
    }
    if (typeof args.mogrtPath !== 'string' || args.mogrtPath === '') {
      throw badArg('mogrtPath', 'a path is expected');
    }
    if (typeof args.startTicks !== 'string' || !/^[0-9]+$/.test(args.startTicks)) {
      throw badArg('startTicks', 'ticks as a string of digits is expected');
    }
    if (!isCount(args.lenFrames, 1)) {
      throw badArg('lenFrames', 'a whole number of frames, 1 or more, is expected');
    }
    if (!isCount(args.defaultLenFrames, 0)) {
      throw badArg('defaultLenFrames', 'a whole number of frames is expected');
    }
    if (args.expectName !== undefined && typeof args.expectName !== 'string') {
      throw badArg('expectName', 'a string is expected');
    }
    list = args.fields === undefined ? [] : args.fields;
    if (!CRBK.isList(list)) {
      throw badArg('fields', 'a list is expected');
    }
    for (i = 0; i < list.length; i++) {
      f = list[i];
      kind = f ? typeof f.value : '';
      if (!f || typeof f !== 'object' || typeof f.egpName !== 'string' || typeof f.type !== 'string' ||
          (kind !== 'string' && kind !== 'number' && kind !== 'boolean')) {
        throw badArg('fields[' + i + ']', 'egpName, type and a text, number or boolean value are expected');
      }
      fields.push({ egpName: f.egpName, type: f.type, value: f.value });
    }
    return {
      seqId: args.seqId,
      mogrtPath: args.mogrtPath,
      startTicks: args.startTicks,
      lenFrames: args.lenFrames,
      defaultLenFrames: args.defaultLenFrames,
      expectName: args.expectName === undefined ? '' : args.expectName,
      fields: fields
    };
  }

  // The arguments of findPlaced (PlacedProbe).
  function probeArgs(probe) {
    if (!probe || typeof probe !== 'object' || CRBK.isList(probe)) {
      throw badArg('probe', 'an object is expected');
    }
    if (typeof probe.targetId !== 'string' || probe.targetId === '') {
      throw badArg('targetId', 'a sequence id is expected');
    }
    if (typeof probe.startSec !== 'number' || !isFinite(probe.startSec)) {
      throw badArg('startSec', 'seconds as a number are expected');
    }
    if (typeof probe.name !== 'string') {
      throw badArg('name', 'a string is expected');
    }
    return probe;
  }

  // What diag shows of the last insert. Never throws: it is information, not part of the insert.
  function remember(seq, clip, placed, attempts, notes) {
    try {
      if (!CRBK.state.pr) {
        CRBK.state.pr = {};
      }
      CRBK.state.pr.last = {
        seq: String(seq.sequenceID),
        placed: placed,
        params: mgtParamNames(clip),
        attempts: attempts,
        notes: notes
      };
    } catch (e) {
      notes.push('remember: ' + msg(e));
    }
  }

  // Which optional calls the host has, from the first track and the first clip found; null where nothing could be asked.
  function apiProbe(seq) {
    var out = { isLocked: null, isSelected: null, nodeId: null };
    var tracks, t, clips, c;
    if (!seq) {
      return out;
    }
    tracks = seq.videoTracks;
    if (tracks.numTracks > 0) {
      out.isLocked = typeof tracks[0].isLocked;
    }
    for (t = 0; t < tracks.numTracks && out.isSelected === null; t++) {
      clips = tracks[t].clips;
      if (clips.numItems > 0) {
        c = clips[0];
        out.isSelected = typeof c.isSelected;
        out.nodeId = typeof c.nodeId;
      }
    }
    return out;
  }

  // ---- the panel's functions ----

  CRBK.fns.getContext = function () {
    var path = projectPath();
    var seq = activeSequence();
    var out = {
      host: 'pr',
      hostVersion: String(app.version),
      project: { path: path === '' ? null : path, saved: path !== '' },
      target: null
    };
    var tb, ticks;
    if (seq) {
      tb = timebase(seq);
      ticks = String(seq.getPlayerPosition().ticks);
      out.target = {
        kind: 'sequence',
        id: String(seq.sequenceID),
        name: String(seq.name),
        w: Number(seq.frameSizeHorizontal),
        h: Number(seq.frameSizeVertical),
        fps: CRBK.round(TICKS_PER_SECOND / tb, 3),
        timeSec: Number(ticks) / TICKS_PER_SECOND,
        ticks: ticks
      };
    }
    return CRBK.ok(out);
  };

  CRBK.fns.insertItem = function (args) {
    var a = insertArgs(args);
    var seq = activeSequence();
    var warnings = [];
    var notes = [];
    var tracksAdded = 0;
    var tpf, startF, fromT, toT, file, vIdx, imported, clip, fields, placed, out;

    // Step 1: the sequence the panel measured must still be the active one; it is never switched.
    if (!seq || String(seq.sequenceID) !== a.seqId) {
      throw CRBK.error('TARGET_CHANGED', seq ? 'the active sequence is ' + String(seq.sequenceID) : 'no active sequence');
    }
    tpf = timebase(seq);
    startF = Math.round(Number(a.startTicks) / tpf);
    fromT = framesToTicks(startF, tpf);
    // importMGT lays the template down at its default length and only then is it trimmed, so the interval is the
    // longer of the two lengths: a clip beyond the trimmed end but inside the default would be cut first.
    toT = framesToTicks(startF + Math.max(a.lenFrames, a.defaultLenFrames), tpf);

    file = new File(a.mogrtPath);
    if (file.exists === false) {
      throw CRBK.error('FILE_MISSING', a.mogrtPath);
    }

    // Step 2: the video track (P10); QE adds one when every track above the busy ones is locked or missing.
    vIdx = chooseTrack(seq.videoTracks, fromT, toT);
    if (vIdx < 0) {
      tracksAdded = addVideoTrack(seq);
      vIdx = tracksAdded > 0 ? chooseTrack(seq.videoTracks, fromT, toT) : -1;
      if (vIdx < 0) {
        throw CRBK.error('NO_FREE_TRACK', 'no free video track over frames ' + startF + ' to ' +
          (startF + Math.max(a.lenFrames, a.defaultLenFrames)) + (tracksAdded > 0 ? '' : ', and QE added none'));
      }
    }

    // Step 3: the import. A clip of another name is still ours: it starts where we put it, on a track that was free.
    imported = importMogrt(seq, file.fsName, startF, tpf, vIdx);
    clip = imported.clip;
    if (a.expectName !== '' && String(clip.name) !== a.expectName) {
      warnings.push('NAME_MISMATCH');
    }

    // Step 4: the length. Only a length other than the default is set; the default is left as the template made it.
    if (a.lenFrames !== a.defaultLenFrames) {
      try {
        trimClip(clip, a.lenFrames, tpf);
      } catch (e) {
        notes.push('trim: ' + msg(e));
      }
      clip = clipAt(seq, vIdx, startF, tpf);
      if (!clip) {
        throw CRBK.error('INSERT_FAILED', 'the clip is not on its track after trimming');
      }
      if (ticksToFrames(clip.end.ticks, tpf) - startF !== a.lenFrames) {
        warnings.push('LENGTH_MISMATCH');
      }
    }

    // Step 5: the fields, read back through a fresh look-up of the clip.
    fields = writeFields(seq, vIdx, startF, tpf, a.fields, notes);

    // Step 6: only the new clip selected.
    clip = clipAt(seq, vIdx, startF, tpf) || clip;
    selectOnly(seq, clip, notes);

    // Step 7.
    placed = placedOf(clip, vIdx);
    remember(seq, clip, placed, imported.attempts, notes);
    out = { placed: placed, fields: fields, warnings: warnings };
    if (tracksAdded > 0) {
      out.tracksAdded = tracksAdded;
    }
    return CRBK.ok(out);
  };

  // The clip that starts at probe.startSec (on the frame grid) and is named probe.name, in the sequence with the id
  // probe.targetId (not only the active one), on any video track; the topmost, since the newest insert lands above
  // everything else. null when there is none.
  CRBK.fns.findPlaced = function (probe) {
    var p = probeArgs(probe);
    var seq = findSequenceById(p.targetId);
    var tpf, frame, tracks, i, clip;
    if (!seq) {
      return CRBK.ok(null);
    }
    tpf = timebase(seq);
    frame = Math.round(p.startSec * TICKS_PER_SECOND / tpf);
    tracks = seq.videoTracks;
    for (i = tracks.numTracks - 1; i >= 0; i--) {
      clip = clipStartingAt(tracks[i], frame, tpf, p.name);
      if (clip) {
        return CRBK.ok(placedOf(clip, i));
      }
    }
    return CRBK.ok(null);
  };

  CRBK.fns.diag = function () {
    var seq = activeSequence();
    var path = projectPath();
    var last = CRBK.state.pr ? CRBK.state.pr.last : null;
    var api = null;
    try {
      api = apiProbe(seq);
    } catch (e) {
      api = null;
    }
    return CRBK.ok({
      app: String(app.version),
      build: CRBK.build,
      qe: ensureQE(),
      json: CRBK.fns.ping().data.json,
      sequence: seq ? {
        id: String(seq.sequenceID),
        name: String(seq.name),
        videoTracks: Number(seq.videoTracks.numTracks),
        audioTracks: Number(seq.audioTracks.numTracks)
      } : null,
      project: path === '' ? null : path,
      api: api,
      last: last || null
    });
  };

  CRBK.pr = {
    TICKS_PER_SECOND: TICKS_PER_SECOND,
    ticksToFrames: ticksToFrames,
    framesToTicks: framesToTicks,
    makeTime: makeTime,
    findSequenceById: findSequenceById,
    activateSequence: activateSequence,
    trackFreeAt: trackFreeAt,
    chooseTrack: chooseTrack,
    clipStartingAt: clipStartingAt,
    trimClip: trimClip,
    importMogrt: importMogrt,
    mgtParam: mgtParam,
    mgtParamNames: mgtParamNames,
    setMgtText: setMgtText,
    readMgtText: readMgtText,
    ensureQE: ensureQE
  };
})($.global.CRBK);
