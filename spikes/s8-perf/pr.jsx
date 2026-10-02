// S8, Premiere stage. One action per call so that Node can time each call:
//   state  - open project file name and the S8_ sequences (read only); optional expectations
//   setup  - create the S8_ sequences from .sqpreset files and import the baseline clip
//   base   - put the baseline clip on V1 of the S8_base_ sequences
//   insert - importMGT of one MOGRT at 0 on V1 of one sequence (V1 must be empty)
//   export - In/Out 0..rangeSec, then exportAsMediaDirect with an .epr (1 = in/out range)
// Composed after spikes/lib/pr-helpers.jsx (part D, task 15): insert goes through its importMogrt.
// Docs: https://ppro-scripting.docsforadobe.dev/general/project/ (newSequence, openSequence, importFiles)
//       https://ppro-scripting.docsforadobe.dev/sequence/sequence/ (importMGT: time in ticks as a string;
//       exportAsMediaDirect workAreaType 0 entire, 1 in/out, 2 work area; setInPoint in seconds)
//       https://ppro-scripting.docsforadobe.dev/sequence/track/ (overwriteClip)
// $.hiresTimer: microseconds since the previous read (ExtendScript), used to time the export call.
// The insert time is importMogrt's ms: from the importMGT call until the clip is on V1.

var S8P = { data: {} };
var S8P_REQUIRED = PARAMS.required !== false;   // baseline sequences are informative only

function s8pIsS8(name) {
  return /^S8_/.test(String(name));
}

function s8pByName(name) {
  var hits = [], seqs = app.project.sequences, i;
  for (i = 0; i < seqs.numSequences; i++) {
    if (String(seqs[i].name) === name) { hits.push(seqs[i]); }
  }
  return hits;
}

function s8pFps(seq) {
  var tb = Number(seq.timebase);
  return tb > 0 ? Math.round((254016000000 / tb) * 1000) / 1000 : 0;
}

function s8pDescribe(seq) {
  var v1 = seq.videoTracks.numTracks > 0 ? seq.videoTracks[0].clips.numItems : -1;
  return {
    name: String(seq.name), id: String(seq.sequenceID), w: seq.frameSizeHorizontal,
    h: seq.frameSizeVertical, fps: s8pFps(seq), v1Clips: v1
  };
}

function s8pProjectFile() {
  var m = /([^\/\\]+)$/.exec(String(app.project.path));
  return m ? m[1] : String(app.project.path);
}

function s8pTimerReset() {
  try { return $.hiresTimer; } catch (e) { return -1; }
}

function s8pTimerMs() {
  var us = -1;
  try { us = $.hiresTimer; } catch (e) { us = -1; }
  return us > 0 ? Math.round(us / 1000) : null;
}

function s8pState() {
  var list = [], seqs = app.project.sequences, i;
  for (i = 0; i < seqs.numSequences; i++) {
    if (s8pIsS8(seqs[i].name)) { list.push(s8pDescribe(seqs[i])); }
  }
  S8P.data.project = s8pProjectFile();
  S8P.data.sequences = list;
  if (PARAMS.expectFresh) {
    check('pr: project ' + PARAMS.projectFile + ' is open and has no S8_ sequences', function () {
      var same = S8P.data.project.toLowerCase() === String(PARAMS.projectFile).toLowerCase();
      return { pass: same && list.length === 0, detail: 'open=' + S8P.data.project + ', S8_ sequences=' + list.length };
    });
  }
  if (PARAMS.expectSequences) {
    for (i = 0; i < PARAMS.expectSequences.length; i++) {
      check('pr: sequence ' + PARAMS.expectSequences[i].name + ' exists once with the planned size and 25 fps', (function (e) {
        return function () {
          var hits = s8pByName(e.name), d;
          if (hits.length !== 1) { return { pass: false, detail: hits.length + ' found' }; }
          d = s8pDescribe(hits[0]);
          return { pass: d.w === e.w && d.h === e.h && Math.abs(d.fps - 25) < 0.01, detail: d.w + 'x' + d.h + ' ' + d.fps + ' fps' };
        };
      })(PARAMS.expectSequences[i]));
    }
  }
}

function s8pCreate(name, preset) {
  var how = [], seq = null, presetFs = new File(preset).fsName;  // not "native": an ES3 reserved word, ExtendScript refuses it
  try {
    seq = app.project.newSequence(name, presetFs);
    how.push(seq ? 'newSequence ok' : 'newSequence returned ' + String(seq));
  } catch (e) {
    how.push('newSequence threw ' + String(e));
  }
  if (!seq) {
    try {
      app.enableQE();
      qe.project.newSequence(name, presetFs);
      how.push('qe.project.newSequence called');
    } catch (e2) {
      how.push('qe threw ' + String(e2));
      return { ok: false, how: how.join('; ') };
    }
  }
  return { ok: true, how: how.join('; ') };
}

function s8pSetup() {
  var i;
  for (i = 0; i < PARAMS.create.length; i++) {
    check('pr: create sequence ' + PARAMS.create[i].name, (function (s) {
      return function () {
        var r = s8pCreate(s.name, s.preset);
        return { pass: r.ok, detail: r.how };
      };
    })(PARAMS.create[i]));
  }
  check('pr: import the baseline clip', function () {
    var ok = app.project.importFiles([new File(PARAMS.baseClip).fsName], true, app.project.rootItem, false);
    return { pass: ok !== false, detail: 'importFiles returned ' + String(ok) };
  }, false);
}

function s8pFindItems(name) {
  var root = app.project.rootItem, hits = [], i;
  for (i = 0; i < root.children.numItems; i++) {
    if (String(root.children[i].name) === name) { hits.push(root.children[i]); }
  }
  return hits;
}

function s8pBase() {
  var items = s8pFindItems(PARAMS.baseItemName), i;
  var ok = check('pr: baseline clip is in the project once', function () {
    return { pass: items.length === 1, detail: items.length + ' items named ' + PARAMS.baseItemName };
  }, false);
  if (!ok) { return; }
  for (i = 0; i < PARAMS.targets.length; i++) {
    check('pr: baseline clip on V1 of ' + PARAMS.targets[i], (function (name) {
      return function () {
        var hits = s8pByName(name), seq;
        if (hits.length !== 1) { return { pass: false, detail: hits.length + ' sequences' }; }
        seq = hits[0];
        app.project.openSequence(seq.sequenceID);
        seq.videoTracks[0].overwriteClip(items[0], 0);
        return { pass: seq.videoTracks[0].clips.numItems === 1, detail: 'V1 clips=' + seq.videoTracks[0].clips.numItems };
      };
    })(PARAMS.targets[i]), false);
  }
}

// importMogrt (pr-helpers.jsx) calls importMGT once, then polls V1 for the clip at frame 0 for up to 2 s.
// Spec 6.1: a call that left nothing on V1 changed nothing, so exactly one more insert is allowed, and only
// after that wait: a clip that lands late is never inserted twice.
function s8pInsert() {
  var hits = s8pByName(PARAMS.seqName), seq = null;
  var ok = check('pr: ' + PARAMS.seqName + ' exists once and V1 is empty', function () {
    if (hits.length !== 1) { return { pass: false, detail: hits.length + ' found' }; }
    seq = hits[0];
    app.project.openSequence(seq.sequenceID);
    return { pass: seq.videoTracks[0].clips.numItems === 0, detail: 'V1 clips=' + seq.videoTracks[0].clips.numItems };
  });
  if (!ok) { return; }
  check('pr: importMGT ' + PARAMS.label + ' into ' + PARAMS.seqName, function () {
    var r, clips, c, mgt = null;
    r = importMogrt(seq, PARAMS.mogrtPath, 0, 0, 0, 2000);
    S8P.data.hostMs = r.ms;
    S8P.data.retried = false;
    if (!r.clip) {
      S8P.data.firstAttempt = { returned: r.returned, error: r.error, ms: r.ms };
      S8P.data.retried = true;
      r = importMogrt(seq, PARAMS.mogrtPath, 0, 0, 0, 2000);
      S8P.data.retryMs = r.ms;
    }
    clips = seq.videoTracks[0].clips;
    if (!r.clip || clips.numItems !== 1) {
      return {
        pass: false,
        detail: 'V1 clips=' + clips.numItems + ', returned ' + (r.returned ? 'a track item' : 'nothing')
          + (r.error ? ', error ' + r.error : '') + (S8P.data.retried ? ', after the second attempt' : '')
      };
    }
    c = r.clip;
    try { mgt = c.getMGTComponent(); } catch (e) { mgt = null; }
    S8P.data.clip = { name: String(c.name), start: c.start.seconds, end: c.end.seconds, mgt: mgt ? true : false };
    return {
      pass: Math.abs(c.start.seconds) < 0.001,
      detail: S8P.data.clip.name + ' ' + c.start.seconds + '..' + c.end.seconds + ' s, MGT component=' + S8P.data.clip.mgt
        + (S8P.data.retried ? ', inserted on the second attempt' : '')
    };
  });
}

function s8pExport() {
  var hits = s8pByName(PARAMS.seqName), seq = null;
  var ok = check('pr: ' + PARAMS.seqName + ' is the active sequence', function () {
    if (hits.length !== 1) { return { pass: false, detail: hits.length + ' found' }; }
    seq = hits[0];
    app.project.openSequence(seq.sequenceID);
    return { pass: String(app.project.activeSequence.sequenceID) === String(seq.sequenceID), detail: 'active=' + app.project.activeSequence.name };
  }, S8P_REQUIRED);
  if (!ok) { return; }
  ok = check('pr: In/Out of ' + PARAMS.seqName + ' set to 0..' + PARAMS.rangeSec + ' s', function () {
    var a, b;
    seq.setInPoint(0);
    seq.setOutPoint(PARAMS.rangeSec);
    a = seq.getInPointAsTime().seconds;
    b = seq.getOutPointAsTime().seconds;
    return { pass: Math.abs(a) < 0.001 && Math.abs(b - PARAMS.rangeSec) < 0.05, detail: a + '..' + b + ' s' };
  }, S8P_REQUIRED);
  if (!ok) { return; }
  check('pr: exportAsMediaDirect ' + PARAMS.seqName, function () {
    var rv, f;
    s8pTimerReset();
    rv = seq.exportAsMediaDirect(new File(PARAMS.outPath).fsName, new File(PARAMS.presetPath).fsName, 1);
    S8P.data.hostMs = s8pTimerMs();
    S8P.data.returned = String(rv);
    f = new File(PARAMS.outPath);
    return { pass: f.exists && f.length > 0, detail: 'returned ' + String(rv) + ', bytes=' + (f.exists ? f.length : 0) };
  }, S8P_REQUIRED);
}

if (PARAMS.action === 'state') {
  s8pState();
} else if (PARAMS.action === 'setup') {
  s8pSetup();
} else if (PARAMS.action === 'base') {
  s8pBase();
} else if (PARAMS.action === 'insert') {
  s8pInsert();
} else if (PARAMS.action === 'export') {
  s8pExport();
} else {
  check('pr: known action ' + PARAMS.action, function () { return false; });
}
S8P.data.action = PARAMS.action;
finish(S8P.data);
