// S5 stages "undo" and "undo-group" (Premiere, ES3, on demand): one LowerThird and three field writes
// (text, checkbox, dropdown) on a fresh range of the work clone, right before the manual count of undo
// steps in Window > History (Task 16). With PARAMS.useUndoGroup the four actions run inside
// app.beginUndoGroup / endUndoGroup, when Premiere has them. These checks only prepare the manual count,
// so they do not decide the verdict; a silent drop here means: run the stage again.
var P = PARAMS;
var tpf = Number(P.tpf);
var data = { undoGroup: false };
var seq = null;
var clip = null;

var ready = projectCheck();
if (ready) {
  seq = workSeqCheck(data);
  ready = !!seq;
}

// A repeated count gets the next free 20 s slot on the track, so nothing is overwritten.
if (ready) {
  data.atSec = P.atSec;
  while (!trackFreeAt(seq.videoTracks[P.vIdx], data.atSec, data.atSec + 15) && data.atSec < P.atSec + 2000) {
    data.atSec += 20;
  }
}

if (ready) {
  if (P.useUndoGroup && typeof app.beginUndoGroup === 'function') {
    app.beginUndoGroup('BK S5 insert');
    data.undoGroup = true;
  }
  try {
    check('one LowerThird inserted at ' + data.atSec + ' s on V' + (P.vIdx + 1), function () {
      var r = importMogrt(seq, P.mogrt, data.atSec, P.vIdx, P.vIdx, 2000);
      clip = r.clip;
      return { pass: !!clip, detail: { startF: r.startF, lenF: r.lenF, error: r.error } };
    }, false);
    if (clip) {
      check('three fields written: text, checkbox, dropdown', function () {
        var show = mgtParam(clip, P.names.showRole);
        var style = mgtParam(clip, P.names.style);
        var s0 = show.getValue();
        var d0 = style.getValue();
        setMgtText(mgtParam(clip, P.names.name), P.text);
        show.setValue((typeof s0 === 'boolean') ? !s0 : (truthy(s0) ? 0 : 1), 1);
        style.setValue(Number(d0) + 1, 1);
        data.back = readMgtText(mgtParam(clipStartingAt(seq.videoTracks[P.vIdx], secToFrames(data.atSec, tpf), tpf), P.names.name));
        return { pass: data.back === P.text, detail: data.back };
      }, false);
    }
  } finally {
    if (data.undoGroup) {
      app.endUndoGroup();
    }
  }
  if (clip) {
    check('the clip is selected for the History count', function () {
      return { pass: true, detail: describeValue(clip.setSelected(1, 1)) };
    }, false);
  }
}

finish(data);
