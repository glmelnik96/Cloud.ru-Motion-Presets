// Premiere export research. Loaded after spikes/lib/check.jsx and spikes/lib/pr-helpers.jsx.
// PARAMS.op:
//   setup  — park the open project, make a 1920x1080 25p sequence, place the 2s clip, save
//   export — exportAsMediaDirect of one .epr over In/Out
//   ame    — queue one .epr in AME and start the batch (returns before the file is finished)
//   seq    — read the sequence settings back
var P = PARAMS;
var data = { op: P.op };

function prPath() {
  try { return String(app.project.path || ''); } catch (e) { return ''; }
}

function prEnsureProject() {
  var f = new File(P.project);
  var how = 'active';
  if (!sameFsPath(prPath(), f.fsName)) {
    if (f.exists) {
      app.openDocument(f.fsName, true, true, true);
      how = 'opened';
    } else {
      app.newProject(f.fsName);
      how = 'created';
    }
  }
  return { how: how, path: prPath(), ok: sameFsPath(prPath(), f.fsName) };
}

function prSeq() {
  var seq = findSequenceByName(P.seqName);
  if (seq) activateSequence(seq);
  return seq;
}

function prSettings(seq) {
  var tb = Number(seq.timebase);
  var st = null;
  try { st = seq.getSettings(); } catch (e) { st = null; }
  return {
    name: String(seq.name),
    width: Number(seq.frameSizeHorizontal),
    height: Number(seq.frameSizeVertical),
    timebase: tb,
    fps: tb ? Math.round((TICKS_PER_SECOND / tb) * 1000) / 1000 : null,
    videoClips: seq.videoTracks.numTracks ? seq.videoTracks[0].clips.numItems : 0,
    audioClips: seq.audioTracks.numTracks ? seq.audioTracks[0].clips.numItems : 0,
    settingsFps: st && st.videoFrameRate ? String(st.videoFrameRate.ticks) : null
  };
}

if (P.op === 'setup') {
  check('current project saved before switching', function () {
    var cur = prPath();
    var note = cur || 'no path';
    if (cur) {
      try { app.project.save(); note = 'saved ' + cur; } catch (e) { note = 'save failed: ' + e; }
    }
    data.parked = note;
    return { pass: true, detail: note };
  }, false);

  var ready = check('probe project ' + P.project, function () {
    var r = prEnsureProject();
    data.project = r;
    return { pass: r.ok, detail: r };
  });

  if (ready) {
    ready = check('sequence ' + P.seqName, function () {
      var seq = prSeq();
      var how = seq ? 'existed' : '';
      var made = null;
      if (!seq) {
        made = newSequenceFromPreset(P.seqName, P.seqPreset);
        seq = made.seq;
        how = made.how.join('; ');
      }
      if (seq) activateSequence(seq);
      data.sequence = seq ? prSettings(seq) : null;
      data.sequenceHow = how;
      return { pass: !!seq && data.sequence.width === 1920 && data.sequence.height === 1080 && data.sequence.fps === 25,
        detail: data.sequence || how };
    });
  }

  if (ready) {
    check('clip placed at 0', function () {
      var seq = prSeq();
      var tpf = Number(seq.timebase);
      var imported = importFile(P.clip, app.project.rootItem, 15000);
      var placed = null;
      if (imported.item && seq.videoTracks[0].clips.numItems === 0) {
        placed = placeClip(seq.videoTracks[0], imported.item, 0, tpf);
      }
      data.import = { attempts: imported.attempts, reused: imported.reused, placed: placed ? placed.startF : null };
      data.sequence = prSettings(seq);
      return { pass: data.sequence.videoClips > 0, detail: data.sequence };
    });

    check('In/Out is 0-2s', function () {
      var seq = prSeq();
      var tpf = Number(seq.timebase);
      seq.setInPoint(0.001);
      seq.setOutPoint(P.outSec + 0.001);
      var a = ticksToFrames(seq.getInPointAsTime().ticks, tpf);
      var b = ticksToFrames(seq.getOutPointAsTime().ticks, tpf);
      data.inOut = [a, b];
      return { pass: a === 0 && b === secToFrames(P.outSec, tpf), detail: data.inOut };
    });

    check('project saved', function () {
      app.project.save();
      return { pass: sameFsPath(prPath(), new File(P.project).fsName), detail: prPath() };
    }, false);
  }
}

if (P.op === 'export' || P.op === 'ame') {
  var ready2 = check('probe project open', function () {
    var r = prEnsureProject();
    data.project = r;
    return { pass: r.ok, detail: r };
  });
  var seq2 = null;
  if (ready2) {
    ready2 = check('sequence ' + P.seqName, function () {
      seq2 = prSeq();
      data.sequence = seq2 ? prSettings(seq2) : null;
      return { pass: !!seq2, detail: data.sequence };
    });
  }
  if (ready2) {
    check('In/Out refreshed', function () {
      var tpf = Number(seq2.timebase);
      seq2.setInPoint(Number(P.inSec) + 0.001);
      seq2.setOutPoint(Number(P.outSec) + 0.001);
      var a = ticksToFrames(seq2.getInPointAsTime().ticks, tpf);
      var b = ticksToFrames(seq2.getOutPointAsTime().ticks, tpf);
      data.inOut = [a, b];
      return { pass: a === secToFrames(P.inSec, tpf) && b === secToFrames(P.outSec, tpf), detail: data.inOut };
    });
  }
  if (ready2 && P.op === 'export') {
    check('exportAsMediaDirect ' + P.label, function () {
      var out = new File(P.out).fsName;
      var t0 = new Date().getTime();
      var rv = seq2.exportAsMediaDirect(out, new File(P.epr).fsName, 1);
      var f = new File(P.out);
      data.export = { file: out, returned: String(rv), ms: new Date().getTime() - t0, bytes: f.exists ? f.length : 0 };
      return { pass: f.exists && f.length > 0, detail: data.export };
    });
  }
  if (ready2 && P.op === 'ame') {
    check('AME launched', function () {
      return { pass: true, detail: describeValue(app.encoder.launchEncoder()) };
    }, false);
    check('AME job queued', function () {
      var job = app.encoder.encodeSequence(seq2, new File(P.out).fsName, new File(P.epr).fsName, 1, 1);
      data.ame = { file: P.out, job: String(job) };
      return { pass: !!job && String(job) !== '0', detail: data.ame };
    }, false);
    check('AME batch started', function () {
      var t0 = new Date().getTime();
      var rv = app.encoder.startBatch();
      data.ame.started = describeValue(rv);
      data.ame.startMs = new Date().getTime() - t0;
      return { pass: true, detail: data.ame };
    }, false);
  }
}

finish(data);
