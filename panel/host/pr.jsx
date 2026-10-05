// Premiere adapter of the BrandKit panel (ES3, ASCII only; plan 2026-10-05, task 6). It registers on CRBK.fns:
//   getContext()   the active sequence: size, frame rate, playhead; changes nothing
//   insertItem(a)  one call (plan P9): the video track (P10), importMGT, the length, the fields with a read-back, the
//                  selection. Premiere has no undo groups, but S5 measured one qe undo for an insert and three writes
//   findPlaced(p)  the clip an insert the panel got no answer to has left (it never sends an insert twice): the clip
//                  that insert placed, from its record; for a probe about no insert it knows, a clip of that name at
//                  that frame in that sequence
//   diag()         what the panel copies into a bug report
// The panel never opens, saves or closes a project, never makes or clones a sequence and never acts on the first item
// it finds: a sequence is found by its id, the track by a rule, the clip by its start frame on that track.
// The helpers are the live-proven ones of spikes/lib/pr-helpers.jsx (time and ticks, tracks, trimClip, importMogrt,
// mgtParam, setMgtText, ensureQE), ported into this closure and also reachable as CRBK.pr for a live probe.
// Replies: CRBK.ok / CRBK.fail, or CRBK.error(code, message) thrown. Codes of this adapter: BAD_ARGS, TARGET_CHANGED,
// FILE_MISSING, NO_FREE_TRACK, INSERT_FAILED. After the clip is on the timeline nothing is thrown any more (a refusal
// would send the user to insert it twice): what fails becomes a note for diag, or a warning. Warnings of insertItem
// (result.warnings, in this order): 'CLIPS_OVERWRITTEN: <clip names>', 'NAME_MISMATCH', 'LENGTH_MISMATCH', the field
// warnings 'FIELD_NOT_FOUND | FIELD_TYPE_UNSUPPORTED | FIELD_VALUE_INVALID: <egpName>' and 'FIELD_WRITE_FAILED |
// FIELD_READ_FAILED: <egpName>: <host message>', and 'SELECTION_FAILED: <reason>'. The panel's texts are in errors.ts.
// Load-time code only defines functions. What outlives a call is CRBK.state.pr: .last, the last insert (for diag), and
// .inflight, the record of the latest insert that findPlaced answers from.
(function (CRBK) {
  CRBK.host = 'pr';

  var TICKS_PER_SECOND = 254016000000;
  var POLL_MS = 100;
  var IMPORT_POLLS = 30; // 3 s after each importMGT: it may return before the clip is on the track (pr-check waited 3 s)
  var TRACK_POLLS = 20; // a track QE adds shows up in the DOM a little later
  var QE_TRIES = 10; // QE follows the active sequence with a lag (exportFramePNG waited 10 x 300 ms)
  var QE_WAIT_MS = 300;
  // How S5 compares a slider read back. The core re-checks only the fields this adapter marks not ok (insert.ts), so its
  // sameValue (fields.ts) must use the same slack, or a looser rule here would win unseen.
  var SLIDER_EPS = 0.001;

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

  // clipAt for a clip that is on the timeline already: when the host will not give the track, null and a note.
  function findClip(seq, vIdx, frame, tpf, notes, what) {
    try {
      return clipAt(seq, vIdx, frame, tpf);
    } catch (e) {
      notes.push(what + ': ' + msg(e));
      return null;
    }
  }

  // The id the panel gets for a clip: its nodeId when it has one, else name@startTicks.
  function idOf(clip, name, startTicks) {
    var id = null;
    try {
      id = clip.nodeId;
    } catch (e) {
      id = null;
    }
    return id === undefined || id === null || String(id) === '' ? name + '@' + startTicks : String(id);
  }

  // The clips of a video track as plain data (name, start and end in ticks, id), to tell afterwards what importMGT did
  // to them. A clip that cannot be read is left out (one note says how many, and why the first); a track that cannot be
  // listed gives null, and what the list was for goes unchecked: the insert itself does not depend on it.
  function listClips(seq, vIdx, notes) {
    var out = [];
    var skipped = 0;
    var first = '';
    var clips, i, c, name, start;
    try {
      clips = seq.videoTracks[vIdx].clips;
      for (i = 0; i < clips.numItems; i++) {
        c = clips[i];
        try {
          name = String(c.name);
          start = String(c.start.ticks);
          out.push({ name: name, start: Number(start), end: Number(c.end.ticks), id: idOf(c, name, start) });
        } catch (e) {
          skipped += 1;
          first = first || msg(e);
        }
      }
    } catch (e2) {
      notes.push('clips of the track: ' + msg(e2));
      return null;
    }
    if (skipped) {
      notes.push(skipped + ' clip(s) of the track could not be read: ' + first);
    }
    return out;
  }

  // The ids of the listed clips that start at `frame` (none for a list that is null).
  function idsAt(list, frame, tpf) {
    var out = [];
    var i;
    for (i = 0; list && i < list.length; i++) {
      if (ticksToFrames(list[i].start, tpf) === frame) {
        out.push(list[i].id);
      }
    }
    return out;
  }

  function isIn(list, value) {
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] === value) {
        return true;
      }
    }
    return false;
  }

  // The names of the clips listed before an importMGT that the track no longer holds as they were: cut at either end,
  // split or gone. A clip is the same when name, start and end are the same, in ticks.
  function cutClips(seq, vIdx, before, notes) {
    var now = before ? listClips(seq, vIdx, notes) : null;
    var out = [];
    var i, j, same;
    if (!now) {
      notes.push('the clips of the track were not compared');
      return out;
    }
    for (i = 0; i < before.length; i++) {
      same = false;
      for (j = 0; !same && j < now.length; j++) {
        same = now[j].name === before[i].name && now[j].start === before[i].start && now[j].end === before[i].end;
      }
      if (!same) {
        out.push(before[i].name);
      }
    }
    return out;
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

  // The Source Text of an AE-made MOGRT reads as JSON: textEditValue plus fontTextRunLength per style run. The parsed
  // object, or null when the value is anything else (another kind of parameter, or no JSON at all).
  function parseText(raw) {
    var obj;
    try {
      obj = codecParse.call(codec, raw);
    } catch (e) {
      return null;
    }
    return obj && typeof obj === 'object' && obj.textEditValue !== undefined ? obj : null;
  }

  // One style run per field (contract), so the run length is the text length; an empty text writes [0] (unverified
  // live). A value that is not an AE text throws an Error with notText set: that is a refusal of the value, where a
  // getValue or setValue that throws is the host failing.
  function setMgtText(param, text) {
    var raw = String(param.getValue());
    var obj = parseText(raw);
    var refusal;
    if (obj === null) {
      refusal = new Error('BK_NOT_AE_TEXT: ' + raw.substr(0, 80));
      refusal.notText = true;
      throw refusal;
    }
    obj.textEditValue = text;
    obj.fontTextRunLength = [text.length];
    return param.setValue(codecStringify.call(codec, obj), 1);
  }

  // The text a parameter holds, null when it is not an AE text. A getValue that throws throws.
  function textOf(param) {
    var obj = parseText(String(param.getValue()));
    return obj === null ? null : obj.textEditValue;
  }

  // null when the value is not an AE text, or cannot be read.
  function readMgtText(param) {
    try {
      return textOf(param);
    } catch (e) {
      return null;
    }
  }

  // ---- fields ----

  // null when the value was handed to the host, else { code, why }: the FIELD_* code for the user and the reason for
  // diag. A host call that throws is not caught here: the caller makes it FIELD_WRITE_FAILED.
  function writeField(clip, f) {
    var p, n;
    if (f.type !== 'text' && f.type !== 'checkbox' && f.type !== 'dropdown' && f.type !== 'slider') {
      return { code: 'FIELD_TYPE_UNSUPPORTED', why: 'a field of type ' + f.type + ' is not written' };
    }
    p = mgtParam(clip, f.egpName);
    if (!p) {
      return { code: 'FIELD_NOT_FOUND', why: 'no such parameter' };
    }
    if (f.type === 'text') {
      try {
        setMgtText(p, String(f.value));
      } catch (e) {
        if (e && e.notText === true) {
          return { code: 'FIELD_VALUE_INVALID', why: msg(e) };
        }
        throw e;
      }
      return null;
    }
    if (f.type === 'checkbox') {
      p.setValue(truthy(f.value) ? 1 : 0, 1);
      return null;
    }
    n = Number(f.value);
    if (!isFinite(n)) {
      return { code: 'FIELD_VALUE_INVALID', why: 'not a number' };
    }
    p.setValue(n, 1);
    return null;
  }

  // What the host holds: a text, or a number (a checkbox as 1 or 0, its getValue is a boolean); null when there is no
  // such parameter or the value is no AE text. A getValue that throws throws.
  function readField(clip, f) {
    var p = mgtParam(clip, f.egpName);
    var v;
    if (!p) {
      return null;
    }
    if (f.type === 'text') {
      v = textOf(p);
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

  // The results of fields that were not written: nothing read back, not ok.
  function unwritten(fields) {
    var out = [];
    var i;
    for (i = 0; i < fields.length; i++) {
      out.push({ egpName: fields[i].egpName, written: fields[i].value, back: null, ok: false });
    }
    return out;
  }

  // One field gone wrong: the FIELD_* warning for the user ('FIELD_*: <egpName>', and for a host error the host's words
  // after it) and the reason in the notes, for diag. said: the host's message, when there is one.
  function fieldTrouble(warnings, notes, egpName, code, why, said) {
    warnings.push(code + ': ' + egpName + (said ? ': ' + said : ''));
    notes.push(egpName + ': ' + why);
  }

  // Writes every field in the order given, then reads each back through a fresh look-up of the clip. A field that
  // cannot be written (no such parameter, a throw, a type it does not know) costs only itself: its result says back
  // null or what the host holds, ok false, and a FIELD_* warning names it. What went wrong goes into notes too
  // (CRBK.state.pr.last, for diag).
  function writeFields(seq, vIdx, frame, tpf, fields, warnings, notes) {
    var out = unwritten(fields);
    var clip, i, bad, said;
    clip = fields.length ? findClip(seq, vIdx, frame, tpf, notes, 'fields') : null;
    for (i = 0; clip && i < fields.length; i++) {
      bad = null;
      try {
        bad = writeField(clip, fields[i]);
      } catch (e) {
        said = msg(e);
        fieldTrouble(warnings, notes, fields[i].egpName, 'FIELD_WRITE_FAILED', said, said);
      }
      if (bad !== null) {
        fieldTrouble(warnings, notes, fields[i].egpName, bad.code, bad.why, '');
      }
    }
    clip = fields.length ? findClip(seq, vIdx, frame, tpf, notes, 'fields') : null;
    for (i = 0; clip && i < fields.length; i++) {
      try {
        out[i].back = readField(clip, fields[i]);
      } catch (e2) {
        out[i].back = null;
        said = msg(e2);
        fieldTrouble(warnings, notes, fields[i].egpName, 'FIELD_READ_FAILED', 'read back: ' + said, said);
      }
      out[i].ok = sameValue(fields[i], out[i].back);
    }
    return out;
  }

  // ---- selection ----

  // Deselects every selected clip of the sequence, video and audio, then selects clip alone (spec 6.1 step 10). A clip
  // that cannot be deselected, or the new one that cannot be selected, leaves the selection as the user did not expect
  // it: one SELECTION_FAILED warning (the first reason), every failure in the notes. Never throws.
  function selectOnly(seq, clip, warnings, notes) {
    var why = null;
    var groups, g, tracks, t, clips, i, c;
    try {
      groups = [seq.videoTracks, seq.audioTracks];
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
              if (why === null) {
                why = 'deselect: ' + msg(e);
                notes.push(why);
              }
            }
          }
        }
      }
    } catch (e1) {
      if (why === null) {
        why = 'deselect: ' + msg(e1);
        notes.push(why);
      }
    }
    try {
      clip.setSelected(1, 1);
    } catch (e2) {
      notes.push('select: ' + msg(e2));
      if (why === null) {
        why = 'select: ' + msg(e2);
      }
    }
    if (why !== null) {
      warnings.push('SELECTION_FAILED: ' + why);
    }
  }

  // ---- answers ----

  // The Placed of the panel: id is the clip's nodeId when it has one, else name@startTicks. Throws when the host will
  // not tell name, start or end.
  function placedOf(clip, vIdx) {
    var name = String(clip.name);
    var start = String(clip.start.ticks);
    return {
      kind: 'clip',
      id: idOf(clip, name, start),
      name: name,
      track: vIdx,
      startSec: Number(start) / TICKS_PER_SECOND,
      endSec: Number(clip.end.ticks) / TICKS_PER_SECOND
    };
  }

  // The Placed an insert expects, from its own arguments alone: the answer of last resort for a clip that is on the
  // timeline and cannot be read.
  function plannedPlaced(a, vIdx, startF, tpf) {
    var startT = framesToTicks(startF, tpf);
    return {
      kind: 'clip',
      id: a.expectName + '@' + String(startT),
      name: a.expectName,
      track: vIdx,
      startSec: startT / TICKS_PER_SECOND,
      endSec: (startT + framesToTicks(a.lenFrames, tpf)) / TICKS_PER_SECOND
    };
  }

  // ---- the insert in flight: what findPlaced answers from ----

  function prState() {
    if (!CRBK.state.pr) {
      CRBK.state.pr = {};
    }
    return CRBK.state.pr;
  }

  // The record of the insert that is starting, CRBK.state.pr.inflight: it ties a probe to that insert, so a clip of an
  // older insert with the same name is not taken for it, and a clip it placed under another name is not missed.
  //   phase 'checking'   nothing of the insert is on the timeline yet
  //   phase 'importing'  importMGT is called on `track`; `before` holds the ids of the clips that started at `frame`
  //                      there beforehand, none of which is this insert's
  //   phase 'placed'     the clip is on the timeline; `placed` is the answer for it
  // The insert keeps the record up to date as it goes; a later insert replaces it.
  function begin(seqId, frame, name) {
    var rec = { seqId: seqId, frame: frame, name: name, phase: 'checking', track: -1, before: [], placed: null };
    prState().inflight = rec;
    return rec;
  }

  // The clip the recorded insert placed, as a Placed: on the track it imported to, starting at the frame, and not one
  // of those that were there before. null while the insert has not imported anything, or when no such clip is there.
  function placedByRecord(seq, rec, tpf) {
    var track = rec.phase === 'checking' ? null : seq.videoTracks[rec.track];
    var clips, i, c;
    if (!track) {
      return null;
    }
    clips = track.clips;
    for (i = 0; i < clips.numItems; i++) {
      c = clips[i];
      if (ticksToFrames(c.start.ticks, tpf) === rec.frame &&
          !isIn(rec.before, idOf(c, String(c.name), String(c.start.ticks)))) {
        return placedOf(c, rec.track);
      }
    }
    return null;
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
      prState().last = {
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
    var tpf, startF, span, fromT, toT, rec, file, vIdx, others, imported, clip, found, placed, real, len, cut, moved;
    var verified, fields, out;

    // Step 1: the sequence the panel measured must still be the active one; it is never switched.
    if (!seq || String(seq.sequenceID) !== a.seqId) {
      throw CRBK.error('TARGET_CHANGED', seq ? 'the active sequence is ' + String(seq.sequenceID) : 'no active sequence');
    }
    tpf = timebase(seq);
    startF = Math.round(Number(a.startTicks) / tpf);
    fromT = framesToTicks(startF, tpf);
    // importMGT lays the template down at its default length and only then is it trimmed, so the interval is the
    // longer of the two lengths: a clip beyond the trimmed end but inside the default would be cut first. The default
    // is the library's word for the template's length; step 3 checks it against the clip that comes out.
    span = Math.max(a.lenFrames, a.defaultLenFrames);
    toT = framesToTicks(startF + span, tpf);
    // From here findPlaced answers for this insert, and says that none of it is on the timeline yet.
    rec = begin(a.seqId, startF, a.expectName);

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
        throw CRBK.error('NO_FREE_TRACK', 'no free video track over frames ' + startF + ' to ' + (startF + span) +
          (tracksAdded > 0 ? ', and the track QE added is not above the busy ones' : ', and QE added none'));
      }
    }

    // Step 3: the import. importMGT only overwrites, so the clips of the track are listed first: what is left of them
    // afterwards tells whether the template was longer than the library says. The record gets the track and the
    // clips that were at the frame already, none of which findPlaced may take for this insert's.
    others = listClips(seq, vIdx, notes);
    rec.track = vIdx;
    rec.before = idsAt(others, startF, tpf);
    rec.phase = 'importing';
    imported = importMogrt(seq, file.fsName, startF, tpf, vIdx);
    clip = imported.clip;

    // The clip is on the timeline. From here nothing is thrown: what fails becomes a note, and the answer keeps the
    // last good value. A refusal now would tell the user the insert did not happen, and the next click would put
    // another clip above this one.
    placed = plannedPlaced(a, vIdx, startF, tpf);
    real = false;
    try {
      placed = placedOf(clip, vIdx);
      real = true;
    } catch (e) {
      notes.push('placed: ' + msg(e));
    }
    rec.placed = placed;
    rec.phase = 'placed';

    // A template longer than the interval that was checked has covered what lay beyond it, with no word from the host.
    // The clips are compared again then (and when the length cannot be read, to be safe).
    len = null;
    try {
      len = ticksToFrames(clip.end.ticks, tpf) - startF;
    } catch (e1) {
      notes.push('length: ' + msg(e1));
    }
    if (len !== null && len !== a.defaultLenFrames) {
      notes.push('the clip is ' + len + ' frames long, the library says ' + a.defaultLenFrames);
    }
    if (len === null || len > span) {
      cut = cutClips(seq, vIdx, others, notes);
      if (cut.length) {
        warnings.push('CLIPS_OVERWRITTEN: ' + cut.join(', '));
      }
    }
    // A clip of another name is still ours: it starts where we put it, on a track that was free.
    if (real && a.expectName !== '' && placed.name !== a.expectName) {
      warnings.push('NAME_MISMATCH');
    }

    // Step 4: the length. Only a length other than the default is set; the default is left as the template made it.
    moved = false;
    if (a.lenFrames !== a.defaultLenFrames) {
      try {
        trimClip(clip, a.lenFrames, tpf);
      } catch (e2) {
        notes.push('trim: ' + msg(e2));
      }
      // The clip is looked up again, never the object from before the write. A length that could not be checked is
      // as unverified as one that is wrong: LENGTH_MISMATCH.
      verified = false;
      try {
        found = clipAt(seq, vIdx, startF, tpf);
        if (found) {
          clip = found;
          verified = ticksToFrames(clip.end.ticks, tpf) - startF === a.lenFrames;
        } else {
          moved = true;
          notes.push('trim: the clip is not at its start frame afterwards');
        }
      } catch (e3) {
        notes.push('trim: ' + msg(e3));
      }
      if (!verified) {
        warnings.push('LENGTH_MISMATCH');
      }
    }

    // Step 5: the fields, read back through a fresh look-up of the clip. A clip that is not at its start frame is not
    // written to: what stands at that frame now is not the new clip.
    fields = moved ? unwritten(a.fields) : writeFields(seq, vIdx, startF, tpf, a.fields, warnings, notes);

    // Step 6: only the new clip selected.
    clip = findClip(seq, vIdx, startF, tpf, notes, 'select') || clip;
    selectOnly(seq, clip, warnings, notes);

    // Step 7: the answer, from the clip as it is now; when that cannot be read, the last good one.
    try {
      placed = placedOf(clip, vIdx);
    } catch (e4) {
      notes.push('placed: ' + msg(e4));
    }
    rec.placed = placed;
    remember(seq, clip, placed, imported.attempts, notes);
    out = { placed: placed, fields: fields, warnings: warnings };
    if (tracksAdded > 0) {
      out.tracksAdded = tracksAdded;
    }
    return CRBK.ok(out);
  };

  // The clip an insert has left, for the panel after an insert it got no answer to. A probe about the insert this
  // adapter has a record of (same sequence, frame and name) is answered from that record: the clip that insert
  // placed, under whatever name, and none that was there before it; nothing while it had placed nothing. Any other
  // probe is answered by name and frame alone: the clip that starts at probe.startSec (on the frame grid) and is named
  // probe.name, in the sequence with the id probe.targetId (not only the active one), on any video track; the topmost,
  // since the newest insert lands above everything else. null when there is none.
  CRBK.fns.findPlaced = function (probe) {
    var p = probeArgs(probe);
    var seq = findSequenceById(p.targetId);
    var rec = CRBK.state.pr ? CRBK.state.pr.inflight : null;
    var tpf, frame, tracks, i, clip;
    if (!seq) {
      return CRBK.ok(null);
    }
    tpf = timebase(seq);
    frame = Math.round(p.startSec * TICKS_PER_SECOND / tpf);
    if (rec && rec.seqId === p.targetId && rec.frame === frame && rec.name === p.name) {
      return CRBK.ok(placedByRecord(seq, rec, tpf));
    }
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
    var inflight = CRBK.state.pr ? CRBK.state.pr.inflight : null;
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
      last: last || null,
      // how far the latest insert got, also when it did not finish (last is only set by one that did)
      inflight: inflight || null
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
