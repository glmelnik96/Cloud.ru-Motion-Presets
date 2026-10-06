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

  // End of the in/out range in seconds, or null (getOutPointAsTime 13.1+; getOutPoint gives seconds as text).
  function rangeEnd(seq) {
    var t = null;
    try { t = seq.getOutPointAsTime(); } catch (e) { t = null; }
    if (t && t.ticks !== undefined) {
      return BK.round(Number(t.ticks) / TPS);
    }
    try { t = Number(seq.getOutPoint()); } catch (e2) { t = NaN; }
    return isFinite(t) && t > 0 ? BK.round(t) : null;
  }

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
        durationSec: BK.round(Number(seq.end) / TPS),
        rangeEndSec: rangeEnd(seq)
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

  // The lowest free track from `from` up over [start, end); V2 and A2 by default: V1 and A1 stay for the
  // footage (spec 6.1 step 3, decision P2).
  function freeTrack(tracks, startTicks, endTicks, from) {
    var i;
    for (i = from === undefined ? 1 : from; i < tracks.numTracks; i++) {
      if (trackFree(tracks[i], startTicks, endTicks)) {
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

  // One more stereo audio track at the bottom of the audio tracks (QE, as above).
  function addAudioTrack(seq) {
    var before = seq.audioTracks.numTracks;
    var qs = null;
    try {
      app.enableQE();
      qs = qe.project.getActiveSequence();
      qs.addTracks(0, seq.videoTracks.numTracks, 1, 1, before);
    } catch (e) {
      return { ok: false, error: String(e) };
    }
    return { ok: seq.audioTracks.numTracks === before + 1, error: null };
  }

  // n video tracks free over [start, end), each above the one before (companion or backdrop under the main
  // clip: spec 6.1 step 3); a track is added on top when none is free.
  function stackTracks(seq, startTicks, endTicks, n) {
    var out = [];
    var added = 0;
    var from = 1;
    var i, r;
    while (out.length < n) {
      i = freeTrack(seq.videoTracks, startTicks, endTicks, from);
      if (i < 0) {
        r = addVideoTrack(seq);
        if (!r.ok) {
          throw fail('INSERT_FAILED', 'нет свободной дорожки, новая не добавилась', r.error);
        }
        added += 1;
        i = seq.videoTracks.numTracks - 1;
      }
      out.push(i);
      from = i + 1;
    }
    return { tracks: out, added: added };
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

  // ---- Media: T2/T3 files and the companions of a template (spec 6.1, panel/src/core/media.ts) ----

  function findBin(name) {
    var root = app.project.rootItem;
    var i, c;
    for (i = 0; i < root.children.numItems; i++) {
      c = root.children[i];
      if (c.type === ProjectItemType.BIN && String(c.name) === name) {
        return c;
      }
    }
    return root.createBin(name);
  }

  function itemFor(bin, path) {
    var i, c;
    for (i = 0; i < bin.children.numItems; i++) {
      c = bin.children[i];
      if (c.type === ProjectItemType.CLIP && BK.samePath(c.getMediaPath(), path)) {
        return c;
      }
    }
    return null;
  }

  // The file in the BrandKit bin, imported once (spec 6.1 «Импорт ... без дублей»).
  function mediaItem(bin, path, stats) {
    var item = itemFor(bin, path);
    if (item) {
      return item;
    }
    if (!new File(path).exists) {
      throw fail('NO_FILE', 'нет файла ' + path);
    }
    app.project.importFiles([new File(path).fsName], true, bin, false);
    item = itemFor(bin, path);
    if (!item) {
      throw fail('INSERT_FAILED', 'файл не импортировался: ' + BK.leafName(path));
    }
    stats.imported += 1;
    return item;
  }

  function naturalFrames(item, tpf) {
    var a = item.getInPoint();
    var b = item.getOutPoint();
    return ticksToFrames(Number(b.ticks) - Number(a.ticks), tpf);
  }

  // Imports the files of a layout and fixes every piece in frames of the sequence.
  function prepareLayout(seq, layout, binName, stats) {
    var tpf = Number(seq.timebase);
    var bin = findBin(binName);
    var out = { video: [], backdrop: null, audio: [], scale: layout.scale };
    function fix(p) {
      var item = mediaItem(bin, p.file, stats);
      var nat = naturalFrames(item, tpf);
      var at = BK.resolvePiece(p, p.role === 'still' ? null : nat * Number(tpf) / TPS);
      return { role: p.role, item: item, startF: secToFrames(at.start, tpf), lenF: Math.max(1, secToFrames(at.len, tpf)), periodF: p.periodSec ? Math.max(1, secToFrames(p.periodSec, tpf)) : 0 };
    }
    var i, b;
    for (i = 0; i < layout.video.length; i++) {
      out.video.push(fix(layout.video[i]));
    }
    if (layout.backdrop) {
      b = layout.backdrop;
      out.backdrop = fix({ role: 'backdrop', file: b.file, startSec: b.startSec, lengthSec: b.lengthSec });
    }
    for (i = 0; i < layout.audio.length; i++) {
      out.audio.push(fix(layout.audio[i]));
    }
    return out;
  }

  // Interval in ticks the pieces cover.
  function span(pieces, tpf) {
    var s = Infinity;
    var e = -Infinity;
    var i;
    for (i = 0; i < pieces.length; i++) {
      s = Math.min(s, pieces[i].startF);
      e = Math.max(e, pieces[i].startF + pieces[i].lenF);
    }
    return { s: framesToTicks(s, tpf), e: framesToTicks(e, tpf) };
  }

  // One clip of the item at startF for lenF frames: overwriteClip, the clip looked up on its track, cut.
  function placeClip(seq, track, item, startF, lenF, label) {
    var tpf = Number(seq.timebase);
    var clip;
    track.overwriteClip(item, framesToTicks(startF, tpf) / TPS);
    clip = clipStartingAt(track, startF, tpf);
    if (!clip) {
      throw fail('INSERT_FAILED', label + ' не появился на дорожке ' + track.name);
    }
    if (ticksToFrames(clip.end.ticks, tpf) - startF !== lenF) {
      trimClip(clip, lenF, tpf);
      clip = clipStartingAt(track, startF, tpf) || clip;
    }
    return clip;
  }

  function placedRec(role, clip, track, audio, startF, lenF, clips, tpf) {
    return { role: role, name: String(clip.name), track: track + 1, audio: audio, clips: clips, startSec: BK.round(framesToTicks(startF, tpf) / TPS), lengthSec: BK.round(framesToTicks(lenF, tpf) / TPS) };
  }

  // Places prepared pieces. `tracks`: the video track for the pieces, or [backdrop track, video track]; when
  // empty they are chosen here. A loop repeats end to end, the last pass cut (spec 6.1 «Петли»).
  function placeLayout(seq, m, tracks, stats) {
    var tpf = Number(seq.timebase);
    var out = [];
    var first = null;
    var i, k, p, sp, st, vIdx, bIdx, aIdx, clip, n, len, r, ra;
    if (m.video.length && !tracks.length) {
      sp = span(m.backdrop ? m.video.concat([m.backdrop]) : m.video, tpf);
      st = stackTracks(seq, sp.s, sp.e, m.backdrop ? 2 : 1);
      stats.added += st.added;
      tracks = st.tracks;
    }
    vIdx = tracks[tracks.length - 1];
    bIdx = tracks.length > 1 ? tracks[0] : -1;
    for (i = 0; i < m.video.length; i++) {
      p = m.video[i];
      n = p.periodF ? Math.ceil(p.lenF / p.periodF) : 1;
      for (k = 0; k < n; k++) {
        len = p.periodF ? Math.min(p.periodF, p.lenF - k * p.periodF) : p.lenF;
        clip = placeClip(seq, seq.videoTracks[vIdx], p.item, p.startF + k * (p.periodF || 0), len, p.role);
        if (k === 0) {
          r = clip;
        }
        if (m.scale && Math.abs(m.scale - 1) > 0.000001) {
          scaleClip(clip, m.scale);
        }
      }
      if (!first) {
        first = r;
      }
      out.push(placedRec(p.role, r, vIdx, false, p.startF, p.lenF, n, tpf));
    }
    if (m.backdrop) {
      p = m.backdrop;
      clip = placeClip(seq, seq.videoTracks[bIdx], p.item, p.startF, p.lenF, 'подложка');
      out.push(placedRec('backdrop', clip, bIdx, false, p.startF, p.lenF, 1, tpf));
    }
    for (i = 0; i < m.audio.length; i++) {
      p = m.audio[i];
      sp = span([p], tpf);
      aIdx = freeTrack(seq.audioTracks, sp.s, sp.e, 1);
      if (aIdx < 0) {
        ra = addAudioTrack(seq);
        if (!ra.ok) {
          throw fail('INSERT_FAILED', 'нет свободной аудиодорожки, новая не добавилась', ra.error);
        }
        stats.added += 1;
        aIdx = seq.audioTracks.numTracks - 1;
      }
      clip = placeClip(seq, seq.audioTracks[aIdx], p.item, p.startF, p.lenF, 'звук');
      if (!first) {
        first = clip;
      }
      out.push(placedRec(p.role, clip, aIdx, true, p.startF, p.lenF, 1, tpf));
    }
    return { placed: out, first: first };
  }

  // A T2/T3 file on its own (spec 6.1 «Premiere, элементы T2/T3»).
  A.insertMedia = function (req) {
    var seq = targetSeq(req.targetId);
    var stats = { imported: 0, added: 0 };
    var r, last;
    if (!/\.prproj$/i.test(projectPath())) {
      throw fail('NOT_SAVED', 'project is not saved');
    }
    r = placeLayout(seq, prepareLayout(seq, req.layout, req.bin, stats), [], stats);
    if (!r.placed.length) {
      throw fail('INSERT_FAILED', 'нечего вставлять');
    }
    selectOnly(seq, r.first);
    last = r.placed[r.placed.length - 1];
    return {
      name: r.placed[0].name,
      startSec: r.placed[0].startSec,
      lengthSec: BK.round(last.startSec + last.lengthSec - r.placed[0].startSec),
      placed: r.placed,
      imported: stats.imported,
      addedTracks: stats.added,
      notes: []
    };
  };

  // Edges of the clips on the video tracks within windowSec of aroundSec, for transitions (read only).
  A.getCuts = function (args) {
    var seq = targetSeq(args.targetId);
    var lo = (Number(args.aroundSec) - Number(args.windowSec)) * TPS;
    var hi = (Number(args.aroundSec) + Number(args.windowSec)) * TPS;
    var seen = {};
    var out = [];
    var t, i, c, e, k, v;
    for (t = 0; t < seq.videoTracks.numTracks; t++) {
      for (i = 0; i < seq.videoTracks[t].clips.numItems; i++) {
        c = seq.videoTracks[t].clips[i];
        e = [Number(c.start.ticks), Number(c.end.ticks)];
        for (k = 0; k < 2; k++) {
          v = BK.round(e[k] / TPS);
          if (e[k] >= lo && e[k] <= hi && seen['t' + v] !== true) {
            seen['t' + v] = true;
            out.push(v);
          }
        }
      }
    }
    out.sort(function (a, b) { return a - b; });
    return { cuts: out };
  };

  // The whole insert (spec 6.1 «Premiere, элемент T1», steps 3-8 and 10). Premiere ExtendScript has no undo
  // groups; one insert with its writes undoes in one step (S5).
  A.insertItem = function (req) {
    var seq = targetSeq(req.targetId);
    var tpf = Number(seq.timebase);
    var notes = [];
    var startF, lenF, startTicks, endTicks, vIdx, added, r, clip, retried, i, w, readback, scaled, media, stats, companions, tracks;
    if (!/\.prproj$/i.test(projectPath())) {
      throw fail('NOT_SAVED', 'project is not saved');
    }
    if (!req.variant.file || !new File(req.variant.file).exists) {
      throw fail('NO_FILE', 'нет файла библиотеки ' + req.variant.file);
    }
    stats = { imported: 0, added: 0 };
    startF = secToFrames(req.startSec, tpf);
    lenF = Math.max(1, secToFrames(req.lengthSec, tpf));
    startTicks = framesToTicks(startF, tpf);
    endTicks = startTicks + Math.max(framesToTicks(lenF, tpf), Math.round(Number(req.placeSec) * TPS));

    // With a video companion: its track first, the MOGRT on a free track above it.
    media = req.companions ? prepareLayout(seq, req.companions, req.bin, stats) : null;
    r = stackTracks(seq, startTicks, endTicks, media && media.video.length ? 2 : 1);
    added = r.added;
    tracks = r.tracks;
    vIdx = tracks[tracks.length - 1];

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
    if (media) {
      companions = placeLayout(seq, media, tracks.length > 1 ? [tracks[0]] : [], stats).placed;
    }
    selectOnly(seq, clip);
    return {
      name: String(clip.name),
      track: vIdx + 1,
      companions: companions || [],
      startSec: BK.round(Number(clip.start.ticks) / TPS),
      lengthSec: BK.round((Number(clip.end.ticks) - Number(clip.start.ticks)) / TPS),
      readback: readback,
      retried: retried,
      addedTracks: added + stats.added,
      notes: notes
    };
  };

  function findClip(seq, startSec, name, audio) {
    var tpf = Number(seq.timebase);
    var f = secToFrames(startSec, tpf);
    var tracks = audio ? seq.audioTracks : seq.videoTracks;
    var t, c;
    for (t = 0; t < tracks.numTracks; t++) {
      c = clipStartingAt(tracks[t], f, tpf);
      if (c && (!name || String(c.name) === name)) {
        return { clip: c, track: t };
      }
    }
    return null;
  }

  // After a timeout: is there a clip of this MOGRT (named without .mogrt) or media file (named with its
  // extension) starting at that time? (read only)
  A.probeInsert = function (args) {
    var seq = targetSeq(args.targetId);
    var hit = null;
    if (!args.file) {
      hit = findClip(seq, args.startSec, null, false);
    } else if (/\.mogrt$/i.test(args.file)) {
      hit = findClip(seq, args.startSec, BK.baseName(args.file), false);
    } else {
      hit = findClip(seq, args.startSec, BK.leafName(args.file), false) || findClip(seq, args.startSec, BK.leafName(args.file), true);
    }
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

  // In and out of the sequence in seconds (Premiere gives 0 and the end when there are no marks).
  function inOut(seq) {
    var a = null;
    var b = null;
    try { a = BK.round(Number(seq.getInPointAsTime().ticks) / TPS); } catch (e) { a = null; }
    try { b = BK.round(Number(seq.getOutPointAsTime().ticks) / TPS); } catch (e2) { b = null; }
    return { inSec: a, outSec: b };
  }

  // «Экспорт» (decision P19): the brand .epr from In to Out (workArea 1; without marks it is the whole sequence).
  // queue — into the AME queue and the batch started: returns at once, AME writes the file; direct —
  // exportAsMediaDirect, Premiere is busy until the file is there. The .epr sets frame and fps itself.
  A.exportSequence = function (req) {
    var seq = targetSeq(req.targetId);
    var out = new File(req.output);
    var epr = new File(req.epr);
    var range = inOut(seq);
    var t0 = new Date().getTime();
    var rv, job;
    if (!epr.exists) {
      throw fail('NO_FILE', 'no preset ' + req.epr);
    }
    if (out.parent && !out.parent.exists) {
      BK.mkdirs(out.parent.fsName);
    }
    if (req.mode === 'queue') {
      try { app.encoder.launchEncoder(); } catch (e0) { rv = null; }
      job = app.encoder.encodeSequence(seq, out.fsName, epr.fsName, 1, 1);
      if (!job || String(job) === '0') {
        throw fail('EXPORT_FAILED', 'Media Encoder не принял задание');
      }
      app.encoder.startBatch();
      return { file: BK.slash(out.fsName), queued: true, job: String(job), inSec: range.inSec, outSec: range.outSec, ms: new Date().getTime() - t0 };
    }
    rv = seq.exportAsMediaDirect(out.fsName, epr.fsName, 1);
    out = new File(req.output);
    if (!out.exists || out.length <= 0) {
      throw fail('EXPORT_FAILED', 'файл не появился (' + String(rv) + ')');
    }
    return { file: BK.slash(out.fsName), bytes: out.length, inSec: range.inSec, outSec: range.outSec, ms: new Date().getTime() - t0 };
  };

  // ---- «Вписать в окно» (spec 6.1, spike S7) ----

  // Size of the source frame from the project metadata: «1920 x 1080 (1.0)» (width, height, pixel aspect).
  function sourceSize(item) {
    var md = '';
    var m;
    try { md = String(item.getProjectMetadata()); } catch (e) { md = ''; }
    m = /VideoInfo>\s*([0-9]+)\s*x\s*([0-9]+)(\s*\(([0-9]+([.][0-9]+|[\x2c][0-9]+)?)\))?/.exec(md);
    if (!m) {
      return null;
    }
    return { w: Number(m[1]), h: Number(m[2]), par: m[4] ? Number(String(m[4]).replace(',', '.')) || 1 : 1 };
  }

  function isMogrt(clip) {
    try { return clip.isMGT() === true; } catch (e) { return false; }
  }

  // The one video clip selected on the timeline (audio clips and the template itself do not count).
  A.selectedClip = function (args) {
    var seq = targetSeq(args && args.targetId);
    var found = [];
    var t, i, c, src;
    for (t = 0; t < seq.videoTracks.numTracks; t++) {
      for (i = 0; i < seq.videoTracks[t].clips.numItems; i++) {
        c = seq.videoTracks[t].clips[i];
        if (c.isSelected()) {
          found.push({ clip: c, track: t });
        }
      }
    }
    if (found.length !== 1) {
      throw fail('NO_SELECTION', found.length ? 'выделено клипов: ' + found.length : '');
    }
    c = found[0].clip;
    if (isMogrt(c)) {
      throw fail('NO_SELECTION', 'выделен шаблон, а не клип');
    }
    src = c.projectItem ? sourceSize(c.projectItem) : null;
    if (!src) {
      throw fail('NO_SIZE', 'no frame size of ' + String(c.name));
    }
    return { track: found[0].track, startTicks: String(c.start.ticks), name: String(c.name), src: src, motion: motionOf(c, seq) };
  };

  // Motion of a clip: Position in pixels of the sequence (normalized when its value is, S7), Scale, and Scale
  // Width with Uniform Scale when Premiere has them (indexes 2 and 3 of AE.ADBE Motion).
  function motionOf(clip, seq) {
    var m = componentByMatch(clip, 'AE.ADBE Motion');
    var w = Number(seq.frameSizeHorizontal);
    var h = Number(seq.frameSizeVertical);
    var p, norm, out;
    if (!m) {
      return null;
    }
    try {
      p = m.properties[0].getValue();
      norm = !!p && p.length === 2 && p[0] >= 0 && p[0] <= 1.0001 && p[1] >= 0 && p[1] <= 1.0001;
      out = { position: norm ? [BK.round(p[0] * w), BK.round(p[1] * h)] : [Number(p[0]), Number(p[1])], scale: Number(m.properties[1].getValue()), scaleWidth: null, uniform: null };
      if (m.properties.numItems > 3) {
        out.scaleWidth = Number(m.properties[2].getValue());
        out.uniform = m.properties[3].getValue() === true;
      }
    } catch (e) {
      return null;
    }
    return out;
  }

  function clipOf(seq, ref) {
    var track = seq.videoTracks[ref.track];
    var i, c;
    for (i = 0; track && i < track.clips.numItems; i++) {
      c = track.clips[i];
      if (String(c.start.ticks) === String(ref.startTicks) && String(c.name) === String(ref.name)) {
        return c;
      }
    }
    throw fail('NO_TARGET', 'the clip ' + ref.name + ' is no longer on V' + (ref.track + 1));
  }

  // An effect through QE (Crop, Fast Blur): by one of its localized names, onto the QE item at the clip's start
  // (S7).
  function addEffect(seq, ref, names) {
    var effect = null;
    var i, e, qt, it, s, start;
    try { app.enableQE(); } catch (e0) { return false; }
    for (i = 0; i < names.length && !effect; i++) {
      e = null;
      try { e = qe.project.getVideoEffectByName(names[i]); } catch (e1) { e = null; }
      // a miss may come back as an effect without a name
      if (e && !(e.name !== undefined && String(e.name) === '')) {
        effect = e;
      }
    }
    if (!effect) {
      return false;
    }
    start = Number(ref.startTicks) / TPS;
    try { qt = qe.project.getActiveSequence().getVideoTrackAt(ref.track); } catch (e2) { return false; }
    for (i = 0; i < qt.numItems; i++) {
      it = qt.getItemAt(i);
      if (!it || String(it.type) === 'Empty' || String(it.name) !== String(ref.name)) {
        continue;
      }
      s = NaN;
      try { s = parseFloat(it.start.secs); } catch (e3) { s = NaN; }
      if (isNaN(s) || Math.abs(s - start) < 0.02) {
        it.addVideoEffect(effect);
        return true;
      }
    }
    return false;
  }

  function cropValues(crop) {
    var p = crop.properties;
    return { left: Number(p[0].getValue()), top: Number(p[1].getValue()), right: Number(p[2].getValue()), bottom: Number(p[3].getValue()) };
  }

  // Motion Position and Scale, then Crop: the one on the clip, else a new one through QE when the clip sticks
  // out of the window. Position is normalized when its default is (S7), else in pixels.
  A.fitClip = function (req) {
    var seq = targetSeq(req.targetId);
    var clip = clipOf(seq, req.clip);
    var motion = componentByMatch(clip, 'AE.ADBE Motion');
    var pos0, norm, crop, added, missing, back, v, i;
    var sides = ['left', 'top', 'right', 'bottom'];
    if (!motion) {
      throw fail('INSERT_FAILED', 'no Motion on ' + req.clip.name);
    }
    pos0 = motion.properties[0].getValue();
    norm = !!pos0 && pos0.length === 2 && pos0[0] >= 0 && pos0[0] <= 1.0001 && pos0[1] >= 0 && pos0[1] <= 1.0001;
    motion.properties[0].setValue(norm ? [req.position[0] / req.frame.w, req.position[1] / req.frame.h] : [req.position[0], req.position[1]], 1);
    motion.properties[1].setValue(req.scale, 1);
    crop = componentByMatch(clip, 'AE.ADBE AECrop');
    added = false;
    missing = false;
    if (!crop && req.crop) {
      added = addEffect(seq, req.clip, req.cropNames || []);
      clip = clipOf(seq, req.clip);
      crop = componentByMatch(clip, 'AE.ADBE AECrop');
      missing = !crop;
      added = added && !!crop;
    }
    if (crop) {
      for (i = 0; i < 4; i++) {
        crop.properties[i].setValue(req.crop ? req.crop[sides[i]] : 0, 1);
      }
    }
    clip = clipOf(seq, req.clip);
    motion = componentByMatch(clip, 'AE.ADBE Motion');
    v = motion.properties[0].getValue();
    back = norm ? [v[0] * req.frame.w, v[1] * req.frame.h] : [Number(v[0]), Number(v[1])];
    crop = componentByMatch(clip, 'AE.ADBE AECrop');
    return {
      name: String(clip.name),
      scale: Number(motion.properties[1].getValue()),
      position: [BK.round(back[0]), BK.round(back[1])],
      normalized: norm,
      crop: crop && req.crop ? cropValues(crop) : null,
      cropAdded: added,
      cropMissing: missing
    };
  };

  // ---- «Размыть поля» (D11, panel/src/core/edit.ts) ----

  var INTRINSIC = { 'AE.ADBE Motion': true, 'AE.ADBE Opacity': true, 'AE.ADBE Time Remapping': true };

  // Effects of the clip beyond Motion, Opacity and Time Remapping (Lumetri and the like).
  function effectNames(clip) {
    var out = [];
    var i, c;
    for (i = 0; i < clip.components.numItems; i++) {
      c = clip.components[i];
      if (!INTRINSIC[String(c.matchName)]) {
        out.push(String(c.displayName || c.matchName));
      }
    }
    return out;
  }

  function trackFree(track, a, b) {
    var i, c;
    for (i = 0; i < track.clips.numItems; i++) {
      c = track.clips[i];
      if (Number(c.start.ticks) < b && Number(c.end.ticks) > a) {
        return false;
      }
    }
    return true;
  }

  function clipAt(track, ticks) {
    var i;
    for (i = 0; i < track.clips.numItems; i++) {
      if (String(track.clips[i].start.ticks) === String(ticks)) {
        return track.clips[i];
      }
    }
    return null;
  }

  // The values of Motion and Opacity at the start of the clip onto its copy; true when the clip has keys there.
  function copyLook(from, to) {
    var names = ['AE.ADBE Motion', 'AE.ADBE Opacity'];
    var keyed = false;
    var k, i, a, b;
    for (k = 0; k < names.length; k++) {
      a = componentByMatch(from, names[k]);
      b = componentByMatch(to, names[k]);
      for (i = 0; a && b && i < a.properties.numItems && i < b.properties.numItems; i++) {
        try {
          if (a.properties[i].isTimeVarying && a.properties[i].isTimeVarying()) {
            keyed = true;
          }
        } catch (e0) { keyed = keyed || false; }
        try { b.properties[i].setValue(a.properties[i].getValue(), 1); } catch (e1) { keyed = keyed || false; }
      }
    }
    return keyed;
  }

  function paramByName(comp, re, fallback) {
    var i;
    for (i = 0; i < comp.properties.numItems; i++) {
      if (re.test(String(comp.properties[i].displayName))) {
        return comp.properties[i];
      }
    }
    return comp.properties.numItems > fallback ? comp.properties[fallback] : null;
  }

  // The clip gets Fast Blur; a copy of it over the same time on the track above gets Crop to the inside of the
  // margins and keeps the centre sharp. The copy takes the same source range, the Motion and Opacity of the clip
  // and no audio. Nothing changes when the track above is busy or the clip is blurred already.
  A.blurFields = function (req) {
    var seq = targetSeq(req.targetId);
    var clip = clipOf(seq, req.clip);
    var a = Number(clip.start.ticks);
    var b = Number(clip.end.ticks);
    var up = req.clip.track + 1;
    var item = clip.projectItem;
    var sides = ['left', 'top', 'right', 'bottom'];
    var audio = [];
    var fx = effectNames(clip);
    var t, i, c, copy, oldIn, oldOut, crop, blur, edge, keyed, ref;
    if (componentByMatch(clip, 'AE.ADBE Fast Blur')) {
      throw fail('ALREADY', 'Fast Blur is on ' + req.clip.name);
    }
    if (up >= seq.videoTracks.numTracks || !trackFree(seq.videoTracks[up], a, b)) {
      throw fail('NO_TRACK', 'V' + (up + 1));
    }
    if (!item) {
      throw fail('INSERT_FAILED', 'no project item of ' + req.clip.name);
    }
    for (t = 0; t < seq.audioTracks.numTracks; t++) {
      c = clipAt(seq.audioTracks[t], a);
      audio.push(c ? String(c.name) : null);
    }
    oldIn = item.getInPoint().seconds;
    oldOut = item.getOutPoint().seconds;
    item.setInPoint(clip.inPoint.seconds, 4);
    item.setOutPoint(clip.outPoint.seconds, 4);
    try {
      seq.videoTracks[up].overwriteClip(item, clip.start.seconds);
    } finally {
      item.setInPoint(oldIn, 4);
      item.setOutPoint(oldOut, 4);
    }
    copy = clipAt(seq.videoTracks[up], a);
    if (!copy) {
      throw fail('INSERT_FAILED', 'the copy did not appear on V' + (up + 1));
    }
    if (String(copy.end.ticks) !== String(b)) {
      copy.end = clip.end;
    }
    // the copy brings its audio along: what was not at the start of the clip on an audio track goes
    for (t = 0; t < seq.audioTracks.numTracks; t++) {
      c = clipAt(seq.audioTracks[t], a);
      if (c && audio[t] === null) {
        try { c.remove(false, false); } catch (e2) { audio[t] = 'left'; }
      }
    }
    keyed = copyLook(clip, copy);
    ref = { track: up, startTicks: String(a), name: String(copy.name) };
    addEffect(seq, ref, req.cropNames || []);
    copy = clipAt(seq.videoTracks[up], a);
    crop = componentByMatch(copy, 'AE.ADBE AECrop');
    if (!crop) {
      throw fail('INSERT_FAILED', 'Crop was not added to the copy on V' + (up + 1));
    }
    for (i = 0; i < 4; i++) {
      crop.properties[i].setValue(req.crop[sides[i]], 1);
    }
    addEffect(seq, req.clip, req.blurNames || []);
    clip = clipOf(seq, req.clip);
    blur = componentByMatch(clip, 'AE.ADBE Fast Blur');
    if (!blur) {
      throw fail('INSERT_FAILED', 'Fast Blur was not added to ' + req.clip.name);
    }
    blur.properties[0].setValue(req.blurriness, 1);
    edge = paramByName(blur, /Repeat Edge|\u041f\u043e\u0432\u0442\u043e\u0440/, 2);
    if (edge) {
      edge.setValue(true, 1);
    }
    return {
      name: String(clip.name),
      copyTrack: up,
      blurriness: Number(blur.properties[0].getValue()),
      crop: cropValues(crop),
      effects: fx,
      keyed: keyed
    };
  };

  // ---- «Стиль субтитров» (D25) ----

  function findNamed(bin, name) {
    var i, c, r;
    for (i = 0; i < bin.children.numItems; i++) {
      c = bin.children[i];
      if (c.type === ProjectItemType.BIN) {
        r = findNamed(c, name);
        if (r) {
          return r;
        }
      } else if (String(c.name) === name) {
        return c;
      }
    }
    return null;
  }

  // The Track Style file into the BrandKit bin, once; the item gets the name of the style.
  A.importTextStyle = function (req) {
    var f = new File(req.file);
    var stem = BK.leafName(req.file).replace(/[.][^.]+$/, '');
    var bin, it;
    it = findNamed(app.project.rootItem, req.name);
    if (it) {
      return { name: String(it.name), imported: false };
    }
    if (!f.exists) {
      throw fail('NO_FILE', 'нет файла ' + req.file);
    }
    bin = findBin(req.bin);
    app.project.importFiles([f.fsName], true, bin, false);
    it = findNamed(bin, stem) || findNamed(bin, req.name);
    if (!it) {
      throw fail('INSERT_FAILED', 'стиль не появился в проекте');
    }
    if (String(it.name) !== req.name) {
      it.name = req.name;
    }
    return { name: String(it.name), imported: true };
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
