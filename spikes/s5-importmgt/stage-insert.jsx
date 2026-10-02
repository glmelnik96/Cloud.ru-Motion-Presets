// S5 stage "insert" (Premiere, ES3, after spikes/lib/pr-helpers.jsx): importMGT onto an occupied V2
// (overwrite) and onto the free V3 of a fixture clone; Essential Graphics fields written and read back;
// the RDT LowerThird made 15 s long; the Hatch trimmed to 12 s with Duration = 12. Track indices are
// 0-based (V2 = 1, V3 = 2). Frames come from the next stage (spikes/lib/pr-shots.jsx); L1 is left
// selected for the manual Properties check. PARAMS.names and PARAMS.hatchNames: the Essential Graphics
// labels of the LowerThird and of the Hatch by contract key (spikes/fixtures/contract.mjs, EGP).
var P = PARAMS;
var tpf = Number(P.tpf);
var V3 = 2;
var data = { writes: {} };
var seq = null;
var l1 = null;
var l2 = null;
var l3 = null;
var hatch = null;

function onV3(sec) {
  return clipStartingAt(seq.videoTracks[V3], secToFrames(sec, tpf), tpf);
}

// ComponentParam.getColorValue returns a Color object or an array, depending on the build: record either.
function colorText(c) {
  if (c && typeof c === 'object' && c.red !== undefined) {
    return [c.alpha, c.red, c.green, c.blue].join(',');
  }
  return String(describeValue(c).value);
}

var ready = projectCheck();
if (ready) {
  seq = workCloneCheck(data);
  ready = !!seq;
}
ready = ready && check('S2 MOGRT files exist', function () {
  return { pass: new File(P.lt).exists && new File(P.hatch).exists, detail: [P.lt, P.hatch] };
});

if (ready) {
  check('undo groups exist in Premiere ExtendScript (app.beginUndoGroup)', function () {
    data.undoApi = typeof app.beginUndoGroup;
    return { pass: data.undoApi === 'function', detail: data.undoApi };
  }, false);

  check('importMGT onto the occupied V2 at ' + P.at.overwrite + ' s overwrites bars2, nothing shifts', function () {
    var v1Before = JSON.stringify(trackItems(seq.videoTracks[0], tpf));
    var v2Before = trackItems(seq.videoTracks[1], tpf);
    var r = importMogrt(seq, P.lt, P.at.overwrite, 1, 1, 2000);
    var v2After = trackItems(seq.videoTracks[1], tpf);
    var bars2End = -1;
    var i;
    for (i = 0; i < v2After.length; i++) {
      if (v2After[i].startF === secToFrames(10, tpf)) {
        bars2End = v2After[i].endF;
      }
    }
    data.overwrite = {
      v2Before: v2Before, v2After: v2After, returned: r.returned, lenF: r.lenF, error: r.error,
      v1Same: JSON.stringify(trackItems(seq.videoTracks[0], tpf)) === v1Before
    };
    return { pass: !!r.clip && bars2End === r.startF && data.overwrite.v1Same, detail: data.overwrite };
  }, false);

  check('importMGT onto the free V3 at ' + P.at.l1 + ' s: the clip is there', function () {
    var free = trackFreeAt(seq.videoTracks[V3], P.at.l1, P.at.l1 + P.rdtSec);
    var r = importMogrt(seq, P.lt, P.at.l1, V3, V3, 2000);
    l1 = r.clip;
    data.l1 = { wasFree: free, startF: r.startF, lenF: r.lenF, returned: r.returned, returnedName: r.returnedName, ms: r.ms, error: r.error };
    if (l1) {
      data.l1.times = clipTimes(l1, tpf);
    }
    return { pass: !!l1 && free, detail: data.l1 };
  });

  check('importMGT returns the TrackItem it placed', function () {
    return { pass: !!l1 && data.l1.returned && data.l1.returnedName === String(l1.name), detail: data.l1.returnedName };
  }, false);

  check('default length of the LowerThird recorded', function () {
    return {
      pass: !!l1 && data.l1.lenF > 0,
      detail: { frames: data.l1.lenF, sec: l1 ? ticksToSec(framesToTicks(data.l1.lenF, tpf)) : null, times: data.l1.times || null }
    };
  });
}

if (ready && l1) {
  check('Essential Graphics parameters found by display name', function () {
    var want = [P.names.name, P.names.role, P.names.showRole, P.names.duration, P.names.style];
    var missing = [];
    var i;
    for (i = 0; i < want.length; i++) {
      if (!mgtParam(l1, want[i])) {
        missing.push(want[i]);
      }
    }
    data.params = paramList(l1.getMGTComponent());
    return { pass: missing.length === 0, detail: { missing: missing, params: data.params } };
  });

  check('media replacement ' + P.names.photo + ': what Premiere exposes (not writable by script, spec 1.1)', function () {
    var p = mgtParam(l1, P.names.photo);
    var v = null;
    if (p) {
      try { v = p.getValue(); } catch (e) { v = 'EXC: ' + String(e); }
    }
    data.photo = { found: !!p, value: describeValue(v) };
    return { pass: true, detail: data.photo };
  }, false);

  check('text with Cyrillic written and read back: ' + P.names.name, function () {
    var p = mgtParam(l1, P.names.name);
    var before = readMgtText(p);
    var w = setMgtText(p, P.values.name);
    var back = readMgtText(mgtParam(onV3(P.at.l1), P.names.name));
    data.writes.name = { before: before, rv: w.rv, runsBefore: w.runsBefore, back: back };
    return { pass: back === P.values.name, detail: data.writes.name };
  });

  check('text written and read back: ' + P.names.role, function () {
    var p = mgtParam(l1, P.names.role);
    var before = readMgtText(p);
    var w = setMgtText(p, P.values.role);
    var back = readMgtText(mgtParam(onV3(P.at.l1), P.names.role));
    data.writes.role = { before: before, rv: w.rv, runsBefore: w.runsBefore, back: back };
    return { pass: back === P.values.role, detail: data.writes.role };
  });

  check('checkbox written and read back: ' + P.names.showRole, function () {
    var p = mgtParam(l1, P.names.showRole);
    var v0 = p.getValue();
    var next = (typeof v0 === 'boolean') ? !v0 : (truthy(v0) ? 0 : 1);
    var rv = p.setValue(next, 1);
    var back = mgtParam(onV3(P.at.l1), P.names.showRole).getValue();
    data.writes.showRole = { before: describeValue(v0), written: describeValue(next), rv: describeValue(rv), back: describeValue(back) };
    return { pass: truthy(back) === truthy(next), detail: data.writes.showRole };
  });

  check('slider written and read back: ' + P.names.duration, function () {
    var p = mgtParam(l1, P.names.duration);
    var v0 = p.getValue();
    var rv = p.setValue(P.rdtSec, 1);
    var back = mgtParam(onV3(P.at.l1), P.names.duration).getValue();
    data.writes.duration = { before: describeValue(v0), rv: describeValue(rv), back: describeValue(back) };
    return { pass: Math.abs(Number(back) - P.rdtSec) < 0.001, detail: data.writes.duration };
  });

  check('colour written and read back: ' + P.names.accent, function () {
    var p = mgtParam(l1, P.names.accent);
    var v0 = null;
    var rv, back;
    if (!p) {
      return { pass: false, detail: 'no parameter ' + P.names.accent };
    }
    try { v0 = p.getColorValue(); } catch (e) { v0 = 'EXC: ' + String(e); }
    // setColorValue(alpha, red, green, blue, updateUI), 0-255:
    // https://ppro-scripting.docsforadobe.dev/sequence/componentparam/
    rv = p.setColorValue(255, P.values.accent.r, P.values.accent.g, P.values.accent.b, 1);
    back = colorText(mgtParam(onV3(P.at.l1), P.names.accent).getColorValue());
    data.writes.accent = { before: colorText(v0), rv: describeValue(rv), back: back };
    return { pass: strHas(back, String(P.values.accent.r)) && strHas(back, String(P.values.accent.g)), detail: data.writes.accent };
  }, false);

  check('explicit length of ' + P.rdtSec + ' s on the RDT LowerThird (outPoint, then end)', function () {
    var before = clipTimes(onV3(P.at.l1), tpf);
    var lenF = secToFrames(P.rdtSec, tpf);
    var after;
    trimClip(onV3(P.at.l1), lenF, tpf);
    after = clipTimes(onV3(P.at.l1), tpf);
    data.l1.rdt = { before: before, after: after };
    return { pass: after.startF === data.l1.startF && after.endF === data.l1.startF + lenF, detail: data.l1.rdt };
  });
}

if (ready) {
  check('second LowerThird at ' + P.at.l2 + ' s for the dropdown', function () {
    var r = importMogrt(seq, P.lt, P.at.l2, V3, V3, 2000);
    l2 = r.clip;
    return { pass: !!l2, detail: { startF: r.startF, lenF: r.lenF, error: r.error } };
  });
}

if (ready && l2) {
  check('dropdown written and read back: ' + P.names.style, function () {
    var p = mgtParam(l2, P.names.style);
    var v0 = p.getValue();
    var next = Number(v0) + 1;
    var rv = p.setValue(next, 1);
    var back = mgtParam(onV3(P.at.l2), P.names.style).getValue();
    data.style = { before: describeValue(v0), written: next, rv: describeValue(rv), back: describeValue(back) };
    return { pass: Number(back) === next, detail: data.style };
  });
}

if (ready) {
  check('reference LowerThird at ' + P.at.l3 + ' s (template defaults)', function () {
    var r = importMogrt(seq, P.lt, P.at.l3, V3, V3, 2000);
    l3 = r.clip;
    return { pass: !!l3, detail: { startF: r.startF, lenF: r.lenF, error: r.error } };
  });

  check('Hatch MOGRT at ' + P.at.hatch + ' s: the clip is there', function () {
    var r = importMogrt(seq, P.hatch, P.at.hatch, V3, V3, 2000);
    hatch = r.clip;
    data.hatch = { startF: r.startF, lenF: r.lenF, returned: r.returned, ms: r.ms, error: r.error };
    if (hatch) {
      data.hatch.times = clipTimes(hatch, tpf);
    }
    return { pass: !!hatch, detail: data.hatch };
  });
}

if (ready && hatch) {
  check('Hatch: slider written and read back: ' + P.hatchNames.duration, function () {
    var p = mgtParam(hatch, P.hatchNames.duration);
    var v0 = p.getValue();
    var rv = p.setValue(P.hatchSec, 1);
    var back = mgtParam(onV3(P.at.hatch), P.hatchNames.duration).getValue();
    data.hatch.duration = { before: describeValue(v0), rv: describeValue(rv), back: describeValue(back) };
    return { pass: Math.abs(Number(back) - P.hatchSec) < 0.001, detail: data.hatch.duration };
  });

  check('Hatch trimmed to ' + P.hatchSec + ' s (outPoint, then end)', function () {
    var lenF = secToFrames(P.hatchSec, tpf);
    var t;
    trimClip(onV3(P.at.hatch), lenF, tpf);
    t = clipTimes(onV3(P.at.hatch), tpf);
    data.hatch.trimmed = t;
    return { pass: t.startF === data.hatch.startF && t.endF === data.hatch.startF + lenF, detail: t };
  });
}

if (ready && l1) {
  check('L1 left selected for the manual Properties check', function () {
    // TrackItem.setSelected(state, updateUI): https://ppro-scripting.docsforadobe.dev/item/trackitem/
    return { pass: true, detail: describeValue(onV3(P.at.l1).setSelected(1, 1)) };
  }, false);
}

if (ready) {
  check('project saved', function () {
    return { pass: true, detail: describeValue(app.project.save()) };
  }, false);
}

finish(data);
