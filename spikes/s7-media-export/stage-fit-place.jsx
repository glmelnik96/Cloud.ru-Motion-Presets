// S7 stage "fit-place" (Premiere, ES3, after pr-helpers.jsx), in a fresh clone of the fixture: slot_b.png
// (400x400, #FF4517) at P.stillSec and a second bars2 at P.wideSec, on free tracks over black (V1 ends at
// 30 s); the Motion parameters as they arrive; one frame from which Node measures the still's displayed size.
var P = PARAMS;
var tpf = Number(P.tpf);
var data = { frames: {} };
var seq = null;
var still = null;

var ready = projectCheck();
if (ready) {
  seq = workCloneCheck(data);
  ready = !!seq;
}

if (ready) {
  check('slot_b.png placed at ' + P.stillSec + ' s', function () {
    var r = importFile(P.still, ensureBin(P.binName), 8000);
    var v;
    if (!r.item) {
      return { pass: false, detail: 'import failed' };
    }
    v = firstFreeTrack(seq.videoTracks, 1, P.stillSec, P.stillSec + 6);
    if (v < 0) {
      return { pass: false, detail: 'no free video track' };
    }
    still = placeClip(seq.videoTracks[v], r.item, P.stillSec, tpf).clip;
    data.still = { track: v, name: still ? String(still.name) : null, times: still ? clipTimes(still, tpf) : null };
    return { pass: !!still, detail: data.still };
  });

  check('second bars2 instance placed at ' + P.wideSec + ' s', function () {
    var item = findItemByPath(P.bars2);
    var v, wide;
    if (!item) {
      return { pass: false, detail: 'bars2 is not in the project (Task 15)' };
    }
    v = firstFreeTrack(seq.videoTracks, 1, P.wideSec, P.wideSec + 11);
    if (v < 0) {
      return { pass: false, detail: 'no free video track' };
    }
    wide = placeClip(seq.videoTracks[v], item, P.wideSec, tpf).clip;
    data.wide = { track: v, times: wide ? clipTimes(wide, tpf) : null };
    return { pass: !!wide, detail: data.wide };
  });
}

if (still) {
  // Motion by match name, never by its localized display name; parameters by index (0 Position, 1 Scale,
  // as Extensions-LLM-Chat_Pr applyVerticalReframe uses them). The defaults show whether Position is normalized.
  check('Motion found by match name AE.ADBE Motion', function () {
    var m = componentByMatch(still, 'AE.ADBE Motion');
    data.components = componentList(still);
    data.motion = m ? paramList(m) : null;
    return { pass: !!m, detail: { components: data.components, motion: data.motion } };
  });
  frameCheck(seq, data, 'fitBase', secToFrames(P.shotSec, tpf));
}

finish(data);
