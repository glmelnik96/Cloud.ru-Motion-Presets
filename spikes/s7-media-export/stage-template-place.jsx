// S7 stage "template-place" (Premiere, ES3, after pr-helpers.jsx), in a fresh clone of the fixture: the
// imported adjustment layer on the first free track above V2, over bars2; a frame at the same moment before
// and after it for the Node blur map.
var P = PARAMS;
var tpf = Number(P.tpf);
var data = { frames: {} };
var seq = null;
var adj = null;
var shot = 0;

var ready = projectCheck();
if (ready) {
  seq = workCloneCheck(data);
  ready = !!seq;
}
ready = ready && check('adjustment layer item found', function () {
  adj = (P.adjNodeId ? findItemByNodeId(P.adjNodeId) : null) || findItemByName(P.adjName);
  return { pass: !!adj, detail: adj ? String(adj.treePath) : null };
});

if (ready) {
  shot = secToFrames(P.shotSec, tpf);
  frameCheck(seq, data, 'tplBefore', shot);
  check(P.adjName + ' placed above V2 at ' + P.atSec + ' s', function () {
    var v = firstFreeTrack(seq.videoTracks, 2, P.atSec, P.atSec + 6);
    var clip;
    if (v < 0) {
      return { pass: false, detail: 'no free video track above V2' };
    }
    clip = placeClip(seq.videoTracks[v], adj, P.atSec, tpf).clip;
    if (!clip) {
      return { pass: false, detail: 'nothing on V' + (v + 1) + ' at ' + P.atSec + ' s' };
    }
    data.placed = { track: 'V' + (v + 1), times: clipTimes(clip, tpf), components: componentList(clip) };
    // TrackItem.isAdjustmentLayer(): https://ppro-scripting.docsforadobe.dev/item/trackitem/
    try { data.placed.isAdjustmentLayer = clip.isAdjustmentLayer(); } catch (e) { data.placed.isAdjustmentLayer = 'EXC: ' + String(e); }
    return { pass: true, detail: data.placed };
  });
  frameCheck(seq, data, 'tplAfter', shot);
}

finish(data);
