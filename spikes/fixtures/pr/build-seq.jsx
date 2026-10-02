// Task 15: the Premiere fixture in the open project CRT_pr_test.prproj (ES3, after pr-helpers.jsx).
// Sequence CRT_Seq_1080p25 from the HD 1080p 25 fps preset; bars on V1 at 0-30 s, bars2 on V2 at 10-20 s;
// both files in the bin CRT_Media. A sequence of that name that exists already is only checked.
var P = PARAMS;
var data = { existed: false };
var tpf = Number(P.tpf);
var seq = null;
var bin = null;
var bars = null;
var bars2 = null;

var inProject = check('active project is ' + P.projectFile, function () {
  return { pass: projectIs(P.projectFile), detail: String(app.project.path) };
});

if (inProject) {
  seq = findSequenceByName(P.seqName);
  data.existed = !!seq;
}

if (inProject && !data.existed) {
  check('media bin ' + P.binName + ' ready', function () {
    bin = ensureBin(P.binName);
    return { pass: !!bin, detail: bin ? String(bin.name) : 'createBin returned 0' };
  });
}

if (bin) {
  check('bars_1080p25_30s.mp4 imported', function () {
    var r = importFile(P.bars, bin, 8000);
    bars = r.item;
    return { pass: !!bars, detail: { attempts: r.attempts, ms: r.ms, reused: r.reused } };
  });
  check('bars2_1080p25_10s.mp4 imported', function () {
    var r = importFile(P.bars2, bin, 8000);
    bars2 = r.item;
    return { pass: !!bars2, detail: { attempts: r.attempts, ms: r.ms, reused: r.reused } };
  });
  check('sequence ' + P.seqName + ' created from the HD 1080p 25 fps preset', function () {
    var r = newSequenceFromPreset(P.seqName, P.preset);
    seq = r.seq;
    return { pass: !!seq, detail: r.how };
  });
}

if (seq) {
  data.sequenceId = String(seq.sequenceID);
  check('fixture sequence is active', function () {
    return activateSequence(seq);
  });
  check('sequence is 1920x1080 at 25 fps', function () {
    var w = seq.frameSizeHorizontal;
    var h = seq.frameSizeVertical;
    return { pass: w === 1920 && h === 1080 && Number(seq.timebase) === tpf, detail: { w: w, h: h, timebase: String(seq.timebase) } };
  });
}

if (seq && !data.existed && bars && bars2) {
  check('bars placed on V1 at 0 s', function () {
    var r = placeClip(seq.videoTracks[0], bars, 0, tpf);
    return { pass: !!r.clip, detail: r.startF };
  });
  check('bars2 placed on V2 at 10 s', function () {
    var r = placeClip(seq.videoTracks[1], bars2, 10, tpf);
    return { pass: !!r.clip, detail: r.startF };
  });
}

if (seq) {
  data.occupancy = occupancy(seq);
  data.tracks = { video: seq.videoTracks.numTracks, audio: seq.audioTracks.numTracks };
  check('V1 holds exactly bars, frames 0-750 (0-30 s)', function () {
    var it = trackItems(seq.videoTracks[0], tpf);
    return { pass: it.length === 1 && it[0].startF === 0 && it[0].endF === 750, detail: it };
  });
  check('V2 holds exactly bars2, frames 250-500 (10-20 s)', function () {
    var it = trackItems(seq.videoTracks[1], tpf);
    return { pass: it.length === 1 && it[0].startF === 250 && it[0].endF === 500, detail: it };
  });
  check('V3 exists and is empty (S5-S7 place their clips there)', function () {
    var n = seq.videoTracks.numTracks;
    return { pass: n >= 3 && seq.videoTracks[2].clips.numItems === 0, detail: data.tracks };
  });
}

if (seq && !data.existed) {
  check('project saved', function () {
    return { pass: true, detail: describeValue(app.project.save()) };
  }, false);
}

finish(data);
