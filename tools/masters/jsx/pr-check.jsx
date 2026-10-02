// Premiere acceptance of a master's MOGRT (spec §4.4 step 7), after spikes/lib/check.jsx and
// spikes/lib/pr-helpers.jsx. PARAMS: stage ('insert' | 'readback'), project (ASCII .prproj path, created
// when missing), seqPreset, seqBase, mogrt, tpf, clips [{ key, atSec, lenSec|null, values { label: index0 } }],
// framesDir, frames [{ key, clip, sec }] (sec from the clip start), pngPreset, frameWaitMs,
// seqId / seqName (readback). Dropdown values are 0-based in Premiere (S5); the library is 1-based.
var P = PARAMS;
var tpf = Number(P.tpf);
var data = { clips: {}, frames: {} };
var seq = null;

function mpProject() {
  var f = new File(P.project);
  var how = 'active';
  if (!sameFsPath(String(app.project.path), f.fsName)) {
    if (f.exists) {
      app.openDocument(f.fsName, true, true, true);
      how = 'opened';
    } else {
      app.newProject(f.fsName);
      how = 'created';
    }
  }
  return { how: how, path: String(app.project.path), ok: sameFsPath(String(app.project.path), f.fsName) };
}

function mpClipAt(atSec) {
  var tracks = seq.videoTracks;
  for (var t = 0; t < tracks.numTracks; t++) {
    var c = clipStartingAt(tracks[t], secToFrames(atSec, tpf), tpf);
    if (c) {
      return c;
    }
  }
  return null;
}

function mpRead(clip) {
  var out = {};
  var names = mgtParamNames(clip);
  for (var i = 0; i < names.length; i++) {
    var p = mgtParam(clip, names[i]);
    var v = null;
    try { v = p.getValue(); } catch (e) { v = 'EXC: ' + String(e); }
    out[names[i]] = describeValue(v).value;
  }
  return out;
}

var ready = check('project ' + P.project, function () {
  var r = mpProject();
  return { pass: r.ok, detail: r };
});

if (ready && P.stage === 'insert') {
  ready = check('sequence ' + P.seqBase + ' from ' + P.seqPreset, function () {
    var name = uniqueSequenceName(P.seqBase);
    var r = newSequenceFromPreset(name, P.seqPreset);
    seq = r.seq;
    if (seq) {
      activateSequence(seq);
      data.seqName = String(seq.name);
      data.seqId = String(seq.sequenceID);
      data.frameSize = [seq.frameSizeHorizontal, seq.frameSizeVertical];
    }
    return { pass: !!seq, detail: { how: r.how, name: data.seqName, size: data.frameSize } };
  });

  for (var ci = 0; ready && ci < P.clips.length; ci++) {
    (function (spec) {
      check('MOGRT ' + spec.key + ' inserted at ' + spec.atSec + ' s' + (spec.lenSec ? ', length ' + spec.lenSec + ' s' : ', default length'), function () {
        var r = importMogrt(seq, P.mogrt, spec.atSec, 0, 0, 3000);
        var info = { lenF: r.lenF, ms: r.ms, error: r.error };
        if (r.clip && spec.lenSec) {
          trimClip(r.clip, secToFrames(spec.lenSec, tpf), tpf);
          info.lenAfterF = clipTimes(mpClipAt(spec.atSec), tpf).endF - r.startF;
        }
        data.clips[spec.key] = info;
        return { pass: !!r.clip && (!spec.lenSec || info.lenAfterF === secToFrames(spec.lenSec, tpf)), detail: info };
      });
      check('fields of ' + spec.key + ' written: ' + JSON.stringify(spec.values) + ' ' + JSON.stringify(spec.texts || {}), function () {
        var clip = mpClipAt(spec.atSec);
        var got = {};
        var ok = true;
        var texts = spec.texts || {};
        for (var tl in texts) {
          if (texts.hasOwnProperty(tl)) {
            var tp = mgtParam(clip, tl);
            if (!tp) {
              ok = false;
              got[tl] = 'no parameter';
              continue;
            }
            setMgtText(tp, texts[tl]);
            got[tl] = readMgtText(tp);
            ok = ok && got[tl] === texts[tl];
          }
        }
        for (var label in spec.values) {
          if (spec.values.hasOwnProperty(label)) {
            var p = mgtParam(clip, label);
            if (!p) {
              ok = false;
              got[label] = 'no parameter';
              continue;
            }
            p.setValue(spec.values[label], 1);
            got[label] = describeValue(p.getValue()).value;
            ok = ok && Number(got[label]) === spec.values[label];
          }
        }
        data.clips[spec.key].params = mgtParamNames(clip);
        return { pass: ok, detail: { written: got, params: data.clips[spec.key].params } };
      });
    })(P.clips[ci]);
  }

  check('project saved', function () {
    app.project.save();
    return { pass: true, detail: String(app.project.path) };
  });
}

if (ready && P.stage === 'readback') {
  ready = check('sequence of the insert stage is active', function () {
    seq = findSequenceById(P.seqId) || findSequenceByName(P.seqName);
    return { pass: !!seq && activateSequence(seq), detail: P.seqName };
  });
  for (var ri = 0; ready && ri < P.clips.length; ri++) {
    (function (spec) {
      check('fields of ' + spec.key + ' read back in a new call', function () {
        var clip = mpClipAt(spec.atSec);
        var got = clip ? mpRead(clip) : null;
        var ok = !!got;
        for (var label in spec.values) {
          if (ok && spec.values.hasOwnProperty(label)) {
            ok = Number(got[label]) === spec.values[label];
          }
        }
        var texts = spec.texts || {};
        for (var tl in texts) {
          if (ok && texts.hasOwnProperty(tl)) {
            var back = readMgtText(mgtParam(clip, tl));
            got[tl] = back;
            ok = back === texts[tl];
          }
        }
        data.clips[spec.key] = got;
        return { pass: ok, detail: got };
      });
    })(P.clips[ri]);
  }
  for (var fi = 0; ready && fi < P.frames.length; fi++) {
    (function (fr) {
      var spec = null;
      for (var j = 0; j < P.clips.length; j++) {
        if (P.clips[j].key === fr.clip) {
          spec = P.clips[j];
        }
      }
      var frame = secToFrames(spec.atSec + fr.sec, tpf);
      frameCheck(seq, data, fr.key, frame);
    })(P.frames[fi]);
  }
}

finish(data);
