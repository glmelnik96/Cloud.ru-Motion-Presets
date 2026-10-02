// S7 stage "export" (Premiere, ES3, after pr-helpers.jsx): the brand FullHD.epr through
// exportAsMediaDirect and through the AME queue (encodeSequence + startBatch), both over In/Out
// P.inSec-P.outSec of the work clone, which holds the alpha clip and the tone.
var P = PARAMS;
var data = {};
var seq = null;
var tpf = 0;

var ready = projectCheck();
if (ready) {
  seq = workSeqCheck(data);
  ready = !!seq;
}

if (ready) {
  tpf = Number(seq.timebase);
  // AME takes a while to start, so it is launched first. https://ppro-scripting.docsforadobe.dev/general/encoder/
  check('AME launched (app.encoder.launchEncoder)', function () {
    return { pass: true, detail: describeValue(app.encoder.launchEncoder()) };
  }, false);
  ready = check('In/Out set to ' + P.inSec + '-' + P.outSec + ' s', function () {
    var a, b;
    // setInPoint/setOutPoint take seconds and round down: aim one millisecond into the frame.
    seq.setInPoint(P.inSec + 0.001);
    seq.setOutPoint(P.outSec + 0.001);
    a = ticksToFrames(seq.getInPointAsTime().ticks, tpf);
    b = ticksToFrames(seq.getOutPointAsTime().ticks, tpf);
    return { pass: a === secToFrames(P.inSec, tpf) && b === secToFrames(P.outSec, tpf), detail: [a, b] };
  });
}

if (ready) {
  check('file extension of the brand preset', function () {
    // Sequence.getExportFileExtension(presetPath): https://ppro-scripting.docsforadobe.dev/sequence/sequence/
    var ext = String(seq.getExportFileExtension(new File(P.epr).fsName));
    if (ext.charAt(0) === '.') {
      ext = ext.substr(1);
    }
    data.ext = ext;
    return { pass: ext !== '', detail: ext };
  }, false);

  check('exportAsMediaDirect with the brand .epr wrote a file', function () {
    var out = P.outDir + '/direct_FullHD.' + (data.ext || 'mp4');
    var t0 = new Date().getTime();
    var rv, f;
    // Active sequence and native paths only; workAreaType 1 = In/Out (premiere-autopilot SKILL.md).
    // https://ppro-scripting.docsforadobe.dev/sequence/sequence/ (exportAsMediaDirect)
    rv = seq.exportAsMediaDirect(new File(out).fsName, new File(P.epr).fsName, 1);
    f = new File(out);
    data.direct = { file: out, returned: String(rv), ms: new Date().getTime() - t0, bytes: f.exists ? f.length : 0 };
    return { pass: f.exists && f.length > 0, detail: data.direct };
  });

  check('AME job queued with the brand .epr (app.encoder.encodeSequence)', function () {
    var out = P.outDir + '/ame_FullHD.' + (data.ext || 'mp4');
    // encodeSequence(sequence, outputPath, presetPath, workArea 1 = In/Out, removeUponCompletion) -> job ID.
    var job = app.encoder.encodeSequence(seq, new File(out).fsName, new File(P.epr).fsName, 1, 1);
    data.ame = { file: out, job: String(job) };
    return { pass: !!job && String(job) !== '0', detail: data.ame };
  }, false);

  check('AME batch started (app.encoder.startBatch)', function () {
    return { pass: true, detail: describeValue(app.encoder.startBatch()) };
  }, false);
}

finish(data);
