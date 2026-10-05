// BrandKit adapter for Premiere (ExtendScript, ES3). Spec 6.1 «Premiere, элемент T1»; the calls repeat what
// spike S5 and the masters acceptance (tools/masters/jsx/pr-check.jsx) proved on Premiere 26.5.2:
// importMGT onto a free track, the clip looked up on its track, one more insert only if it never appeared,
// the length cut by outPoint then end, parameters by display name, dropdowns from 0, text as JSON.
// Docs: https://ppro-scripting.docsforadobe.dev/ (Sequence.importMGT, Track, TrackItem, ComponentParam).
(function () {
  var A = {};
  var TPS = 254016000000;

  function fail(code, msg, detail) {
    return BK.fail(code, msg, detail);
  }

  function secToFrames(sec, tpf) {
    return Math.round(Number(sec) * TPS / Number(tpf));
  }

  function ticksToFrames(ticks, tpf) {
    return Math.round(Number(ticks) / Number(tpf));
  }

  function framesToTicks(frames, tpf) {
    return Math.round(frames) * Number(tpf);
  }

  // Whole Time objects built from ticks: assigning .seconds on a clip time is a silent no-op.
  function makeTime(ticks) {
    var t = new Time();
    t.ticks = String(ticks);
    return t;
  }

  function projectPath() {
    var p = '';
    try { p = String(app.project.path); } catch (e) { p = ''; }
    return p;
  }

  function targetSeq(targetId) {
    var seq = app.project.activeSequence;
    if (!seq) {
      throw fail('NO_TARGET', 'no active sequence');
    }
    if (targetId !== undefined && targetId !== null && String(seq.sequenceID) !== String(targetId)) {
      throw fail('NO_TARGET', 'the active sequence changed');
    }
    return seq;
  }

  function seqFps(seq) {
    return Math.round(TPS / Number(seq.timebase) * 1000) / 1000;
  }

  A.ping = function () {
    return { app: 'pr', version: String(app.version), bk: BK.version };
  };

  A.getContext = function () {
    var seq = app.project.activeSequence;
    var path = projectPath();
    var pos = null;
    if (seq) {
      try { pos = seq.getPlayerPosition(); } catch (e) { pos = null; }
    }
    return {
      host: 'pr',
      version: String(app.version),
      project: { saved: /\.prproj$/i.test(path), path: path ? BK.slash(path) : null },
      target: seq ? {
        kind: 'sequence',
        id: String(seq.sequenceID),
        name: String(seq.name),
        w: Number(seq.frameSizeHorizontal),
        h: Number(seq.frameSizeVertical),
        fps: seqFps(seq),
        timeSec: pos ? BK.round(Number(pos.ticks) / TPS) : 0,
        durationSec: BK.round(Number(seq.end) / TPS)
      } : null
    };
  };

  // ---- Tracks ----

  function trackFree(track, startTicks, endTicks) {
    var i, c;
    for (i = 0; i < track.clips.numItems; i++) {
      c = track.clips[i];
      if (Number(c.start.ticks) < endTicks && Number(c.end.ticks) > startTicks) {
        return false;
      }
    }
    return true;
  }

  // The lowest free video track from V2 up over [start, end): V1 stays for the footage (spec 6.1 step 3).
  function freeTrack(seq, startTicks, endTicks) {
    var i;
    for (i = 1; i < seq.videoTracks.numTracks; i++) {
      if (trackFree(seq.videoTracks[i], startTicks, endTicks)) {
        return i;
      }
    }
    return -1;
  }

  // One more video track on top through the QE DOM (undocumented; isolated and recorded).
  function addVideoTrack(seq) {
    var before = seq.videoTracks.numTracks;
    var qs = null;
    try {
      app.enableQE();
      qs = qe.project.getActiveSequence();
      qs.addTracks(1, before, 0);
    } catch (e) {
      return { ok: false, error: String(e) };
    }
    return { ok: seq.videoTracks.numTracks === before + 1, error: null };
  }

  function clipStartingAt(track, frame, tpf) {
    var i;
    for (i = 0; i < track.clips.numItems; i++) {
      if (ticksToFrames(track.clips[i].start.ticks, tpf) === frame) {
        return track.clips[i];
      }
    }
    return null;
  }

  // importMGT only overwrites and returns before the clip is there now and then (S5): the clip is looked
  // up on its track for waitMs.
  function importMogrt(seq, path, startF, vIdx, waitMs) {
    var tpf = Number(seq.timebase);
    var track = seq.videoTracks[vIdx];
    var err = null;
    var clip, deadline;
    try {
      seq.importMGT(new File(path).fsName, String(framesToTicks(startF, tpf)), vIdx, 0);
    } catch (e) {
      err = String(e);
    }
    clip = clipStartingAt(track, startF, tpf);
    deadline = new Date().getTime() + waitMs;
    while (!clip && new Date().getTime() < deadline) {
      $.sleep(100);
      clip = clipStartingAt(track, startF, tpf);
    }
    return { clip: clip, error: err };
  }

  // outPoint first, then end: assigning end alone lengthens the item and leaves outPoint.
  function trimClip(clip, lenF, tpf) {
    var startT = Number(clip.start.ticks);
    var inT = Number(clip.inPoint.ticks);
    clip.outPoint = makeTime(inT + framesToTicks(lenF, tpf));
    clip.end = makeTime(startT + framesToTicks(lenF, tpf));
  }

  // ---- MOGRT parameters ----

  // getParamForDisplayName is not in the reference; Adobe's PProPanel sample uses it. A walk is the fallback.
  function mgtParam(clip, name) {
    var comp = clip.getMGTComponent();
    var p = null;
    var i;
    if (!comp) {
      return null;
    }
    try { p = comp.properties.getParamForDisplayName(name); } catch (e) { p = null; }
    if (p) {
      return p;
    }
    for (i = 0; i < comp.properties.numItems; i++) {
      if (String(comp.properties[i].displayName) === name) {
        return comp.properties[i];
      }
    }
    return null;
  }

  // Source Text of an AE-made MOGRT reads as JSON with textEditValue; one style run per field (contract).
  function setText(p, text) {
    var obj = BK.json.parse(String(p.getValue()));
    if (!obj || typeof obj !== 'object' || obj.textEditValue === undefined) {
      return false;
    }
    obj.textEditValue = text;
    obj.fontTextRunLength = [text.length];
    p.setValue(BK.json.stringify(obj), 1);
    return true;
  }

  function readParam(p, type) {
    var v;
    if (!p) {
      return null;
    }
    v = p.getValue();
    if (type === 'text') {
      try { return BK.json.parse(String(v)).textEditValue; } catch (e) { return String(v); }
    }
    if (type === 'checkbox') {
      return v === true || v === 1 || v === 'true';
    }
    return Number(v);
  }

  function writeParam(clip, w) {
    var p = mgtParam(clip, w.egpName);
    if (!p) {
      return false;
    }
    if (w.type === 'text') {
      return setText(p, String(w.value));
    }
    p.setValue(w.type === 'checkbox' ? w.value === true : Number(w.value), 1);
    return true;
  }

  function componentByMatch(clip, matchName) {
    var i;
    for (i = 0; i < clip.components.numItems; i++) {
      if (String(clip.components[i].matchName) === matchName) {
        return clip.components[i];
      }
    }
    return null;
  }

  // Motion > Scale (percent) of a clip; the variant is scaled into a frame it was not made for.
  function scaleClip(clip, s) {
    var motion = componentByMatch(clip, 'AE.ADBE Motion');
    var p = motion ? motion.properties[1] : null;
    if (!p) {
      return null;
    }
    p.setValue(Math.round(s * 100000) / 1000, 1);
    return Number(p.getValue());
  }

  function selectOnly(seq, clip) {
    var sel = null;
    var i;
    try { sel = seq.getSelection(); } catch (e) { sel = null; }
    for (i = 0; sel && i < sel.length; i++) {
      try { sel[i].setSelected(false, true); } catch (e2) { /* an item that cannot be deselected stays */ }
    }
    clip.setSelected(true, true);
  }

  // The whole insert (spec 6.1 «Premiere, элемент T1», steps 3-8 and 10). Premiere ExtendScript has no undo
  // groups; one insert with its writes undoes in one step (S5).
  A.insertItem = function (req) {
    var seq = targetSeq(req.targetId);
    var tpf = Number(seq.timebase);
    var notes = [];
    var startF, lenF, startTicks, endTicks, vIdx, added, r, clip, retried, i, w, readback, scaled;
    if (!/\.prproj$/i.test(projectPath())) {
      throw fail('NOT_SAVED', 'project is not saved');
    }
    if (!req.variant.file || !new File(req.variant.file).exists) {
      throw fail('NO_FILE', 'нет файла библиотеки ' + req.variant.file);
    }
    startF = secToFrames(req.startSec, tpf);
    lenF = Math.max(1, secToFrames(req.lengthSec, tpf));
    startTicks = framesToTicks(startF, tpf);
    endTicks = startTicks + Math.max(framesToTicks(lenF, tpf), Math.round(Number(req.placeSec) * TPS));

    vIdx = freeTrack(seq, startTicks, endTicks);
    added = 0;
    if (vIdx < 0) {
      r = addVideoTrack(seq);
      if (!r.ok) {
        throw fail('INSERT_FAILED', 'нет свободной дорожки, новая не добавилась', r.error);
      }
      added = 1;
      vIdx = seq.videoTracks.numTracks - 1;
    }

    r = importMogrt(seq, req.variant.file, startF, vIdx, req.waitMs || 3000);
    retried = false;
    if (!r.clip) {
      // Nothing changed: one more insert cannot double the clip (spec 6.1 step 5).
      retried = true;
      r = importMogrt(seq, req.variant.file, startF, vIdx, req.waitMs || 3000);
    }
    if (!r.clip) {
      throw fail('INSERT_FAILED', 'клип не появился на V' + (vIdx + 1), { error: r.error, addedTracks: added });
    }
    clip = r.clip;
    if (ticksToFrames(clip.end.ticks, tpf) - startF !== lenF) {
      trimClip(clip, lenF, tpf);
      clip = clipStartingAt(seq.videoTracks[vIdx], startF, tpf) || clip;
    }
    if (req.scale && Math.abs(req.scale - 1) > 0.000001) {
      scaled = scaleClip(clip, req.scale);
      notes.push('scale: ' + scaled);
    }

    readback = {};
    for (i = 0; i < req.writes.length; i++) {
      w = req.writes[i];
      if (!writeParam(clip, w)) {
        notes.push('not written: ' + w.egpName);
      }
    }
    if (req.serviceDuration && !writeParam(clip, { egpName: req.serviceDuration.egpName, type: 'slider', value: req.serviceDuration.value })) {
      notes.push('not written: ' + req.serviceDuration.egpName);
    }
    for (i = 0; i < req.writes.length; i++) {
      w = req.writes[i];
      readback[w.egpName] = readParam(mgtParam(clip, w.egpName), w.type);
    }
    if (req.serviceDuration) {
      readback[req.serviceDuration.egpName] = readParam(mgtParam(clip, req.serviceDuration.egpName), 'slider');
    }
    selectOnly(seq, clip);
    return {
      name: String(clip.name),
      track: vIdx + 1,
      startSec: BK.round(Number(clip.start.ticks) / TPS),
      lengthSec: BK.round((Number(clip.end.ticks) - Number(clip.start.ticks)) / TPS),
      readback: readback,
      retried: retried,
      addedTracks: added,
      notes: notes
    };
  };

  function findClip(seq, startSec, name) {
    var tpf = Number(seq.timebase);
    var f = secToFrames(startSec, tpf);
    var t, c;
    for (t = 0; t < seq.videoTracks.numTracks; t++) {
      c = clipStartingAt(seq.videoTracks[t], f, tpf);
      if (c && (!name || String(c.name) === name)) {
        return { clip: c, track: t };
      }
    }
    return null;
  }

  // After a timeout: is there a clip of this MOGRT starting at that time? (read only)
  A.probeInsert = function (args) {
    var seq = targetSeq(args.targetId);
    var hit = findClip(seq, args.startSec, args.file ? BK.baseName(args.file) : null);
    return hit ? { found: true, name: String(hit.clip.name), track: hit.track + 1 } : { found: false };
  };

  // Field values of a clip, read in a call of their own (live checks, spec 8.3).
  A.readFields = function (args) {
    var seq = targetSeq(args.targetId);
    var hit = findClip(seq, args.startSec, args.name || null);
    var out = {};
    var i;
    if (!hit) {
      throw fail('NO_TARGET', 'no clip at ' + args.startSec + ' s');
    }
    for (i = 0; i < args.fields.length; i++) {
      out[args.fields[i].egpName] = readParam(mgtParam(hit.clip, args.fields[i].egpName), args.fields[i].type);
    }
    return {
      values: out,
      track: hit.track + 1,
      startSec: BK.round(Number(hit.clip.start.ticks) / TPS),
      lengthSec: BK.round((Number(hit.clip.end.ticks) - Number(hit.clip.start.ticks)) / TPS)
    };
  };

  A.diag = function () {
    var seq = app.project.activeSequence;
    return {
      app: 'Premiere',
      version: String(app.version),
      build: String(app.build),
      os: String($.os),
      bk: BK.version,
      project: projectPath() ? BK.slash(projectPath()) : null,
      sequence: seq ? { name: String(seq.name), w: Number(seq.frameSizeHorizontal), h: Number(seq.frameSizeVertical), fps: seqFps(seq), videoTracks: seq.videoTracks.numTracks } : null
    };
  };

  BK.adapters.pr = A;
}());
