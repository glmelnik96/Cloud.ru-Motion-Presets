// S5 stage "series" (Premiere, ES3, after pr-helpers.jsx): PARAMS.count importMGT calls on fresh ranges
// of one track of its own fresh clone of the fixture (a re-run starts clean), PARAMS.stepSec apart.
// No retries: a clip that did not land is the measurement (spec 3.1 S5; 6.1 step 5 allows one retry in
// the panel, recount and Node decide whether that is safe). Each call is timed in the host.
var P = PARAMS;
var data = { rows: [] };
var seq = null;

var ready = projectCheck();
if (ready) {
  seq = workCloneCheck(data);
  ready = !!seq;
}
ready = ready && check('series range is free on V' + (P.vIdx + 1), function () {
  var end = P.startSec + P.count * P.stepSec;
  return { pass: trackFreeAt(seq.videoTracks[P.vIdx], P.startSec, end), detail: [P.startSec, end] };
});

if (ready) {
  data.itemsBefore = projectTree().length;
  for (var i = 0; i < P.count; i++) {
    var r = importMogrt(seq, P.mogrt, P.startSec + i * P.stepSec, P.vIdx, P.vIdx, 2000);
    data.rows.push({ i: i, startF: r.startF, found: !!r.clip, returned: r.returned, lenF: r.lenF, ms: r.ms, error: r.error });
  }
  data.itemsAfter = projectTree().length;
  check('series ran to the end', function () {
    return { pass: data.rows.length === P.count, detail: data.rows.length + ' of ' + P.count };
  });
  check('project items added by the series recorded', function () {
    return { pass: true, detail: { before: data.itemsBefore, after: data.itemsAfter } };
  }, false);
}

finish(data);
