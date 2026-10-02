// Frames of a work sequence for the Node analysis (ES3, after spikes/lib/pr-helpers.jsx).
//   PARAMS.shots = [{ key, frame }]: frame counted from the sequence start, PNG to <framesDir>/<key>.png.
//   PARAMS.workSeqId / workSeq: the clone an earlier stage made.
var SHOTS = { frames: {} };
var shotsSeq = null;

if (projectCheck()) {
  shotsSeq = workSeqCheck(SHOTS);
}

if (shotsSeq) {
  for (var shotI = 0; shotI < PARAMS.shots.length; shotI++) {
    frameCheck(shotsSeq, SHOTS, PARAMS.shots[shotI].key, PARAMS.shots[shotI].frame);
  }
}

finish(SHOTS);
