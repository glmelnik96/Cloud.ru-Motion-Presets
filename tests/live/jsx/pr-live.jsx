// Live checks of the panel in Premiere (ES3): the test bed around the adapter, not the adapter itself.
// Loaded after PARAMS, spikes/lib/check.jsx and spikes/lib/pr-helpers.jsx; PARAMS.op picks the step.
// Only the scratch project <work>/panel-live/pr/panel_live.prproj is opened, created and saved.
var DATA = { op: PARAMS.op };
var TPS = TICKS_PER_SECOND;

function lvProject() {
  var f = new File(PARAMS.project);
  var how = 'active';
  if (!sameFsPath(String(app.project.path), f.fsName)) {
    if (f.exists) {
      app.openDocument(f.fsName, true, true, true);
      how = 'opened';
    } else {
      app.newProject(f.fsName);
      how = 'created';
    }
  }
  return { how: how, path: String(app.project.path), ok: sameFsPath(String(app.project.path), f.fsName) };
}

function lvSeq(id) {
  var s = findSequenceById(id);
  if (!s) {
    throw new Error('BK_NO_SEQUENCE: ' + id);
  }
  return s;
}

function lvSetup() {
  if (!check('scratch project ' + PARAMS.project + ' is the active project', function () {
    var r = lvProject();
    return { pass: r.ok, detail: r };
  })) {
    return;
  }
  check('sequences created: ' + PARAMS.targets.length, function () {
    var ids = {};
    var i, s, r, seq, st;
    for (i = 0; i < PARAMS.targets.length; i++) {
      s = PARAMS.targets[i];
      r = newSequenceFromPreset(uniqueSequenceName(s.name), PARAMS.seqPreset);
      seq = r.seq;
      if (!seq) {
        return { pass: false, detail: { at: s.name, how: r.how } };
      }
      activateSequence(seq);
      if (Number(seq.frameSizeHorizontal) !== s.w || Number(seq.frameSizeVertical) !== s.h) {
        // Sequence.getSettings / setSettings: https://ppro-scripting.docsforadobe.dev/sequence/sequence/
        st = seq.getSettings();
        st.videoFrameWidth = s.w;
        st.videoFrameHeight = s.h;
        st.previewFrameWidth = s.w;
        st.previewFrameHeight = s.h;
        seq.setSettings(st);
      }
      ids[s.key] = String(seq.sequenceID);
    }
    DATA.ids = ids;
    app.project.save();
    return { pass: true, detail: ids };
  });
}

function lvActivate() {
  check('sequence ' + PARAMS.id + ' active, playhead at ' + PARAMS.time + ' s', function () {
    var seq = lvSeq(PARAMS.id);
    var ok = activateSequence(seq);
    var tpf = Number(seq.timebase);
    seq.setPlayerPosition(String(framesToTicks(secToFrames(PARAMS.time, tpf), tpf)));
    return { pass: ok, detail: { name: String(seq.name), player: Number(seq.getPlayerPosition().ticks) / TPS } };
  });
}

function lvFrames() {
  var seq = lvSeq(PARAMS.id);
  var i, f;
  DATA.frames = {};
  for (i = 0; i < PARAMS.frames.length; i++) {
    f = PARAMS.frames[i];
    frameCheck(seq, DATA, f.key, f.frame);
  }
}

// Clips of the video tracks and the Motion scale of each (what the adapter left behind).
function lvClips() {
  check('clips of sequence ' + PARAMS.id + ' listed', function () {
    var seq = lvSeq(PARAMS.id);
    var tpf = Number(seq.timebase);
    var out = [];
    var t, i, c, motion, scale;
    for (t = 0; t < seq.videoTracks.numTracks; t++) {
      for (i = 0; i < seq.videoTracks[t].clips.numItems; i++) {
        c = seq.videoTracks[t].clips[i];
        motion = componentByMatch(c, 'AE.ADBE Motion');
        scale = null;
        try { scale = motion ? Number(motion.properties[1].getValue()) : null; } catch (e) { scale = null; }
        out.push({
          track: t + 1,
          name: String(c.name),
          startSec: ticksToFrames(c.start.ticks, tpf) * tpf / TPS,
          endSec: ticksToFrames(c.end.ticks, tpf) * tpf / TPS,
          scale: scale,
          selected: c.isSelected()
        });
      }
    }
    DATA.clips = out;
    DATA.videoTracks = seq.videoTracks.numTracks;
    return true;
  });
}

// The out point of the sequence at PARAMS.endSec: a loop with no length runs up to it (media checks).
function lvRange() {
  check('out point of sequence ' + PARAMS.id + ' at ' + PARAMS.endSec + ' s', function () {
    var seq = lvSeq(PARAMS.id);
    var tpf = Number(seq.timebase);
    var how = 'seconds';
    var got;
    try {
      seq.setOutPoint(PARAMS.endSec);
    } catch (e) {
      how = 'ticks';
      seq.setOutPoint(String(framesToTicks(secToFrames(PARAMS.endSec, tpf), tpf)));
    }
    got = Number(seq.getOutPointAsTime().ticks) / TPS;
    return { pass: Math.abs(got - PARAMS.endSec) < 0.021, detail: { how: how, got: got } };
  });
}

// Clips on V1 that meet at PARAMS.cuts: the edges a transition snaps to. The test bed imports the file itself.
function lvCuts() {
  check('clips on V1 of sequence ' + PARAMS.id + ' cut at ' + PARAMS.edges.join(', ') + ' s', function () {
    var seq = lvSeq(PARAMS.id);
    var tpf = Number(seq.timebase);
    var root = app.project.rootItem;
    var item = null;
    var i, c, t, a, b, o, en;
    app.project.importFiles([new File(PARAMS.file).fsName], true, root, false);
    for (i = 0; i < root.children.numItems; i++) {
      c = root.children[i];
      if (c.type === ProjectItemType.CLIP && sameFsPath(String(c.getMediaPath()), new File(PARAMS.file).fsName)) {
        item = c;
      }
    }
    if (!item) {
      return { pass: false, detail: 'not imported' };
    }
    t = seq.videoTracks[0];
    for (i = 0; i + 1 < PARAMS.edges.length; i++) {
      a = framesToTicks(secToFrames(PARAMS.edges[i], tpf), tpf);
      b = framesToTicks(secToFrames(PARAMS.edges[i + 1], tpf), tpf);
      t.overwriteClip(item, a / TPS);
      for (c = 0; c < t.clips.numItems; c++) {
        if (Number(t.clips[c].start.ticks) === a) {
          // outPoint first, then end (as the adapter cuts a clip)
          o = new Time();
          o.ticks = String(Number(t.clips[c].inPoint.ticks) + b - a);
          t.clips[c].outPoint = o;
          en = new Time();
          en.ticks = String(b);
          t.clips[c].end = en;
        }
      }
    }
    return { pass: t.clips.numItems >= PARAMS.edges.length - 1, detail: { clips: t.clips.numItems } };
  });
}

// Every clip of the video and audio tracks as the media checks read it.
function lvTimeline() {
  check('clips of sequence ' + PARAMS.id + ' listed with their files', function () {
    var seq = lvSeq(PARAMS.id);
    var tpf = Number(seq.timebase);
    var out = [];
    var kinds = [['video', seq.videoTracks], ['audio', seq.audioTracks]];
    var k, t, i, c, file, bin, n;
    for (k = 0; k < kinds.length; k++) {
      for (t = 0; t < kinds[k][1].numTracks; t++) {
        for (i = 0; i < kinds[k][1][t].clips.numItems; i++) {
          c = kinds[k][1][t].clips[i];
          file = null;
          try { file = c.projectItem ? String(c.projectItem.getMediaPath()).split('\\').join('/') : null; } catch (e) { file = null; }
          out.push({
            track: t + 1,
            audio: kinds[k][0] === 'audio',
            name: String(c.name),
            startSec: ticksToFrames(c.start.ticks, tpf) * tpf / TPS,
            endSec: ticksToFrames(c.end.ticks, tpf) * tpf / TPS,
            file: file,
            selected: c.isSelected()
          });
        }
      }
    }
    n = 0;
    for (i = 0; i < app.project.rootItem.children.numItems; i++) {
      if (String(app.project.rootItem.children[i].name) === 'Cloud.ru BrandKit') {
        bin = app.project.rootItem.children[i];
        n = bin.children.numItems;
      }
    }
    DATA.clips = out;
    DATA.binItems = n;
    DATA.tracks = { video: seq.videoTracks.numTracks, audio: seq.audioTracks.numTracks };
    return true;
  });
}

// One undo step through the QE DOM, as S5 counted it (same stack as Edit > Undo). Information only.
function lvUndo() {
  check('one undo step (qe.project.undo)', function () {
    if (!ensureQE()) {
      return { pass: false, detail: 'QE unavailable' };
    }
    qe.project.undo();
    return true;
  }, false);
}

function lvSave() {
  check('scratch project saved', function () {
    app.project.save();
    return true;
  }, false);
}

// ---- «Экспорт» (tests/live/export.mjs) ----

// Sequences of the export checks, each with the clip at 0 on V1 (and its sound on A1). In 0 and Out 2 s,
// except «whole», which keeps no marks: Premiere then exports the whole sequence.
function lvExportSetup() {
  lvSetup();
  if (!DATA.ids) {
    return;
  }
  check('the clip on V1 of every sequence, In/Out set', function () {
    var imported = importFile(PARAMS.clip, app.project.rootItem, 15000);
    var out = {};
    var i, s, seq, tpf;
    if (!imported.item) {
      return { pass: false, detail: imported };
    }
    for (i = 0; i < PARAMS.targets.length; i++) {
      s = PARAMS.targets[i];
      seq = lvSeq(DATA.ids[s.key]);
      activateSequence(seq);
      tpf = Number(seq.timebase);
      placeClip(seq.videoTracks[0], imported.item, 0, tpf);
      if (s.key !== 'whole') {
        seq.setInPoint(PARAMS.range.pr.inSec + 0.001);
        seq.setOutPoint(PARAMS.range.pr.outSec + 0.001);
      }
      out[s.key] = {
        clips: seq.videoTracks[0].clips.numItems,
        audio: seq.audioTracks[0].clips.numItems,
        inSec: Number(seq.getInPointAsTime().ticks) / TPS,
        outSec: Number(seq.getOutPointAsTime().ticks) / TPS
      };
    }
    DATA.placed = out;
    app.project.save();
    return { pass: true, detail: out };
  });
}

// ---- «Вписать в окно» (tests/live/fit.mjs) ----

// A still of a known colour on a video track at a time, the only selected clip of the sequence.
function lvFitPlace() {
  check('still ' + PARAMS.file + ' on V' + (PARAMS.track + 1) + ' at ' + PARAMS.startSec + ' s, selected alone', function () {
    var seq = lvSeq(PARAMS.id);
    var tpf = Number(seq.timebase);
    var imported = importFile(PARAMS.file, app.project.rootItem, 15000);
    var placed, t, i, sel;
    if (!imported.item) {
      return { pass: false, detail: imported };
    }
    activateSequence(seq);
    placed = placeClip(seq.videoTracks[PARAMS.track], imported.item, PARAMS.startSec, tpf);
    try { sel = seq.getSelection(); } catch (e) { sel = []; }
    for (i = 0; sel && i < sel.length; i++) {
      try { sel[i].setSelected(false, true); } catch (e2) { t = null; }
    }
    if (placed.clip) {
      placed.clip.setSelected(true, true);
    }
    return { pass: !!placed.clip && placed.clip.isSelected(), detail: { startF: placed.startF } };
  });
}

if (PARAMS.op === 'setup') {
  lvSetup();
} else if (PARAMS.op === 'activate') {
  lvActivate();
} else if (PARAMS.op === 'frames') {
  lvFrames();
} else if (PARAMS.op === 'clips') {
  lvClips();
} else if (PARAMS.op === 'undo') {
  lvUndo();
} else if (PARAMS.op === 'range') {
  lvRange();
} else if (PARAMS.op === 'cuts') {
  lvCuts();
} else if (PARAMS.op === 'timeline') {
  lvTimeline();
} else if (PARAMS.op === 'save') {
  lvSave();
} else if (PARAMS.op === 'exportSetup') {
  lvExportSetup();
} else if (PARAMS.op === 'fitPlace') {
  lvFitPlace();
}
finish(DATA);
