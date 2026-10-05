// E2E fixture of the panel in Premiere (plan 2026-10-05, task 10), after spikes/lib/check.jsx and
// spikes/lib/pr-helpers.jsx. PARAMS: path (ASCII .prproj under the work folder), seqPreset (a staged 1080p25
// .sqpreset), seqs [{ name, w, h }]. Opens the fixture project, or creates it, as the active project (other open
// projects stay open and untouched), makes missing sequences from the 1080p25 preset and resizes them with
// setSettings (the 25p presets have no 9:16, 1:1 or QHD), then saves the fixture. Returns
// finish({ path, made, seqs: [{ name, id, w, h }] }).
var P = PARAMS;
var data = { path: P.path, made: [], seqs: [] };

var ready = check('fixture project ' + P.path, function () {
  var f = new File(P.path);
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
  data.how = how;
  return { pass: sameFsPath(String(app.project.path), f.fsName), detail: { how: how, path: String(app.project.path) } };
});

if (ready) {
  check('fixture sequences', function () {
    for (var i = 0; i < P.seqs.length; i++) {
      var s = P.seqs[i];
      var seq = findSequenceByName(s.name);
      if (!seq) {
        seq = newSequenceFromPreset(s.name, P.seqPreset).seq;
        if (!seq) {
          return { pass: false, detail: 'cannot make ' + s.name };
        }
        activateSequence(seq);
        if (Number(seq.frameSizeHorizontal) !== s.w || Number(seq.frameSizeVertical) !== s.h) {
          var st = seq.getSettings();
          st.videoFrameWidth = s.w;
          st.videoFrameHeight = s.h;
          st.previewFrameWidth = s.w;
          st.previewFrameHeight = s.h;
          seq.setSettings(st);
        }
        data.made.push(s.name);
      }
      data.seqs.push({ name: String(seq.name), id: String(seq.sequenceID), w: Number(seq.frameSizeHorizontal), h: Number(seq.frameSizeVertical) });
    }
    var sizesOk = true;
    for (var j = 0; j < P.seqs.length; j++) {
      if (data.seqs[j].w !== P.seqs[j].w || data.seqs[j].h !== P.seqs[j].h) {
        sizesOk = false;
      }
    }
    return { pass: sizesOk, detail: data.made };
  });
  if (data.made.length) {
    check('fixture saved', function () {
      app.project.save();
      return { pass: true, detail: String(app.project.path) };
    });
  }
}

finish(data);
