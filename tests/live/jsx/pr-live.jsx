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
} else if (PARAMS.op === 'save') {
  lvSave();
}
finish(DATA);
