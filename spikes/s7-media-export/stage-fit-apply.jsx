// S7 stage "fit-apply" (Premiere, ES3, after pr-helpers.jsx): the "fit to window" recipe through Motion
// (match name AE.ADBE Motion; parameters by index: 0 Position, 1 Scale), read back and rendered; then Crop
// added through QE (every name variant tried and recorded) and set through the DOM by parameter index.
var P = PARAMS;
var tpf = Number(P.tpf);
var data = { frames: {}, undoApi: typeof app.beginUndoGroup };
var seq = null;
var crop = null;

function clipAt(trackIdx, sec) {
  return clipStartingAt(seq.videoTracks[trackIdx], secToFrames(sec, tpf), tpf);
}

function isNormalized(v) {
  return !!v && v.length === 2 && v[0] >= 0 && v[0] <= 1.0001 && v[1] >= 0 && v[1] <= 1.0001;
}

// Position goes to the centre of the window (normalized or in pixels, as the default value shows);
// Scale = window width / displayed width at Scale 100 x 100.
function fitRecipe(trackIdx, sec, win, baseW) {
  var m = componentByMatch(clipAt(trackIdx, sec), 'AE.ADBE Motion');
  var pos0 = m.properties[0].getValue();
  var norm = isNormalized(pos0);
  var cx = win.x + win.w / 2;
  var cy = win.y + win.h / 2;
  var target = norm ? [cx / P.frameW, cy / P.frameH] : [cx, cy];
  var scale = 100 * win.w / baseW;
  var m2, pos, sc;
  m.properties[0].setValue(target, 1);
  m.properties[1].setValue(scale, 1);
  m2 = componentByMatch(clipAt(trackIdx, sec), 'AE.ADBE Motion');
  pos = m2.properties[0].getValue();
  sc = Number(m2.properties[1].getValue());
  return {
    normalized: norm, pos0: describeValue(pos0), target: target, scale: scale, backPos: describeValue(pos), backScale: sc,
    names: [String(m2.properties[0].displayName), String(m2.properties[1].displayName)],
    ok: Math.abs(pos[0] - target[0]) < 0.0001 && Math.abs(pos[1] - target[1]) < 0.0001 && Math.abs(sc - scale) < 0.01
  };
}

var ready = projectCheck();
if (ready) {
  seq = workSeqCheck(data);
  ready = !!seq;
}
ready = ready && check('clips of stage fit-place found', function () {
  return { pass: !!clipAt(P.stillTrack, P.stillSec) && !!clipAt(P.wideTrack, P.wideSec), detail: [P.stillTrack, P.wideTrack] };
});

if (ready) {
  check('fit recipe on the still: Position and Scale set and read back', function () {
    data.fitStill = fitRecipe(P.stillTrack, P.stillSec, P.window, P.baseW);
    return { pass: data.fitStill.ok, detail: data.fitStill };
  });
  frameCheck(seq, data, 'fitWindow', secToFrames(P.shotSec, tpf));

  check('16:9 recipe on bars2: Position and Scale set and read back', function () {
    data.fitWide = fitRecipe(P.wideTrack, P.wideSec, P.wideWindow, P.frameW);
    return { pass: data.fitWide.ok, detail: data.fitWide };
  }, false);

  check('Crop found through QE (the name depends on the UI language)', function () {
    var tries = [];
    var listed = [];
    var i, h, e, nm, list;
    if (!ensureQE()) {
      return { pass: false, detail: 'QE unavailable' };
    }
    for (i = 0; i < P.cropNames.length; i++) {
      e = null;
      try { e = qe.project.getVideoEffectByName(P.cropNames[i]); } catch (err) { e = null; }
      // A miss may come back as an empty effect object (premiere-autopilot fillmono.mjs checks the name).
      if (e && e.name !== undefined && String(e.name) === '') {
        e = null;
      }
      tries.push(P.cropNames[i] + ': ' + (e ? 'found' : 'no'));
      if (e && !crop) {
        crop = e;
        data.cropBy = P.cropNames[i];
      }
    }
    try {
      list = qe.project.getVideoEffectList();
      data.effectCount = list.length;
      for (i = 0; i < list.length; i++) {
        nm = String(list[i]).toLowerCase();
        for (h = 0; h < P.cropHints.length; h++) {
          if (strHas(nm, P.cropHints[h])) {
            listed.push(String(list[i]));
          }
        }
      }
    } catch (err3) {
      listed.push('getVideoEffectList: ' + String(err3));
    }
    data.cropTries = tries;
    data.cropListed = listed;
    return { pass: !!crop, detail: { by: data.cropBy || null, tries: tries, listed: listed } };
  });
}

if (ready && crop) {
  check('Crop added to the still through QE and seen in the DOM', function () {
    var before = componentList(clipAt(P.stillTrack, P.stillSec));
    var qi = qeItemFor(qe.project.getActiveSequence().getVideoTrackAt(P.stillTrack), String(clipAt(P.stillTrack, P.stillSec).name), P.stillSec);
    var after;
    if (!qi) {
      return { pass: false, detail: 'no QE item for the still' };
    }
    qi.addVideoEffect(crop);
    after = componentList(clipAt(P.stillTrack, P.stillSec));
    data.cropComponent = after.length === before.length + 1 ? after[after.length - 1] : null;
    return { pass: !!data.cropComponent, detail: { before: before, after: after } };
  });
}

if (ready && data.cropComponent) {
  check('Crop parameter ' + P.cropParam + ' set to ' + P.cropLeft + ' and read back', function () {
    var c = clipAt(P.stillTrack, P.stillSec).components[data.cropComponent.index];
    var back;
    data.cropParams = paramList(c);
    c.properties[P.cropParam].setValue(P.cropLeft, 1);
    back = Number(clipAt(P.stillTrack, P.stillSec).components[data.cropComponent.index].properties[P.cropParam].getValue());
    return { pass: Math.abs(back - P.cropLeft) < 0.01, detail: { params: data.cropParams, back: back } };
  });
  frameCheck(seq, data, 'fitCrop', secToFrames(P.shotSec, tpf));
}

finish(data);
