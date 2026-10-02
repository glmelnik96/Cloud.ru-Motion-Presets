// S6, Premiere stage (ES3, after spikes/lib/pr-helpers.jsx), in a fresh project of its own (CRT_pr_s6.prproj):
//   setup  - sequence CRT_S6 from the HD 1080p 25 fps preset, then the same as insert
//   insert - one MOGRT at PARAMS.atSec on V1, then frames of every instance so far (PARAMS.shots)
// The frames of all instances after each import show whether an import changed what older ones render.
// PARAMS: { mode, projectFile, seqName, seqId, preset, tpf, key, label, file, atSec, shots, framesDir,
//           pngPreset, frameWaitMs, templateHint }
var P = PARAMS;
var data = { frames: {}, item: null };
var seq = null;

var ready = projectCheck();

if (ready && P.mode === 'setup') {
  ready = check('the S6 project is fresh: no sequence ' + P.seqName + ' yet', function () {
    return { pass: !findSequenceByName(P.seqName), detail: P.seqName };
  });
  ready = ready && check('sequence ' + P.seqName + ' created from the HD 1080p 25 fps preset', function () {
    var r = newSequenceFromPreset(P.seqName, P.preset);
    seq = r.seq;
    return { pass: !!seq, detail: r.how };
  });
}

if (ready && P.mode !== 'setup') {
  ready = check('sequence ' + P.seqName + ' found', function () {
    seq = (P.seqId ? findSequenceById(P.seqId) : null) || findSequenceByName(P.seqName);
    return { pass: !!seq, detail: P.seqId || P.seqName };
  });
}

if (ready) {
  data.seqId = String(seq.sequenceID);
  ready = check('sequence ' + P.seqName + ' is active', function () {
    return activateSequence(seq);
  });
}

if (ready) {
  check(P.key + ': ' + P.label + ' inserted at ' + P.atSec + ' s on V1', function () {
    var r = importMogrt(seq, P.file, P.atSec, 0, 0, 3000);
    var info = { file: P.file, startF: r.startF, lenF: r.lenF, returned: r.returned, ms: r.ms, error: r.error };
    if (r.clip) {
      try {
        info.projectItem = String(r.clip.projectItem.name);
        info.nodeId = String(r.clip.projectItem.nodeId);
      } catch (e) {
        info.projectItem = 'EXC: ' + String(e);
      }
    }
    data.item = info;
    return { pass: !!r.clip, detail: info };
  });

  for (var k = 0; k < P.shots.length; k++) {
    frameCheck(seq, data, P.shots[k].key, P.shots[k].frame);
  }

  check('project items of the template recorded', function () {
    var items = [];
    walkProject(function (c, p) {
      if (strHas(String(c.name), P.templateHint)) {
        items.push({ path: p, nodeId: String(c.nodeId), type: c.type });
      }
      return false;
    });
    data.templateItems = items;
    return { pass: true, detail: items };
  }, false);
}

finish(data);
