// S5 stage "count" (Premiere, ES3, read-only): a new host call recounts the series clips, so clips that
// arrived after the 2 s check of stage "series" are told apart from real drops.
var P = PARAMS;
var tpf = Number(P.tpf);
var data = { present: {} };
var seq = null;

if (projectCheck()) {
  seq = workSeqCheck(data);
}

if (seq) {
  check('series recounted on V' + (P.vIdx + 1), function () {
    var tr = seq.videoTracks[P.vIdx];
    var i, f, c;
    for (i = 0; i < P.count; i++) {
      f = secToFrames(P.startSec + i * P.stepSec, tpf);
      c = clipStartingAt(tr, f, tpf);
      if (c) {
        data.present[String(f)] = ticksToFrames(c.end.ticks, tpf) - f;
      }
    }
    return { pass: true, detail: data.present };
  });
}

finish(data);
