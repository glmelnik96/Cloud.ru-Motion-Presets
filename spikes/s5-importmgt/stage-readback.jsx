// S5 stage "readback" (Premiere, ES3, after pr-helpers.jsx): a new host call reads back what stage
// "insert" wrote, through fresh MGT components. A value that only looked written inside the same call
// shows up here (spec 1.1 item 4 and 8.2: every written value is read back).
var P = PARAMS;
var tpf = Number(P.tpf);
var data = { values: {} };
var seq = null;

function clipAt(sec) {
  return clipStartingAt(seq.videoTracks[2], secToFrames(sec, tpf), tpf);
}

if (projectCheck()) {
  seq = workSeqCheck(data);
}

if (seq) {
  check('L1, L2 and the Hatch are still on V3', function () {
    return { pass: !!clipAt(P.at.l1) && !!clipAt(P.at.l2) && !!clipAt(P.at.hatch), detail: [P.at.l1, P.at.l2, P.at.hatch] };
  });

  check('L1 text fields read back in a new call', function () {
    var c = clipAt(P.at.l1);
    data.values.name = readMgtText(mgtParam(c, P.names.name));
    data.values.role = readMgtText(mgtParam(c, P.names.role));
    return { pass: data.values.name === P.expect.name && data.values.role === P.expect.role, detail: data.values };
  });

  check('L1 checkbox and slider read back in a new call', function () {
    var c = clipAt(P.at.l1);
    data.values.showRole = describeValue(mgtParam(c, P.names.showRole).getValue());
    data.values.duration = describeValue(mgtParam(c, P.names.duration).getValue());
    return {
      pass: truthy(data.values.showRole.value) === truthy(P.expect.showRole)
        && Math.abs(Number(data.values.duration.value) - P.expect.duration) < 0.001,
      detail: { got: [data.values.showRole, data.values.duration], want: [P.expect.showRole, P.expect.duration] }
    };
  });

  check('L2 dropdown read back in a new call', function () {
    data.values.style = describeValue(mgtParam(clipAt(P.at.l2), P.names.style).getValue());
    return { pass: Number(data.values.style.value) === Number(P.expect.style), detail: { got: data.values.style, want: P.expect.style } };
  });

  check('Hatch slider read back in a new call', function () {
    data.values.hatchDuration = describeValue(mgtParam(clipAt(P.at.hatch), P.hatchNames.duration).getValue());
    return {
      pass: Math.abs(Number(data.values.hatchDuration.value) - P.expect.hatchDuration) < 0.001,
      detail: { got: data.values.hatchDuration, want: P.expect.hatchDuration }
    };
  });

  check('L1 keeps its explicit length of ' + P.rdtSec + ' s', function () {
    var t = clipTimes(clipAt(P.at.l1), tpf);
    return { pass: t.endF - t.startF === secToFrames(P.rdtSec, tpf), detail: t };
  });
}

finish(data);
