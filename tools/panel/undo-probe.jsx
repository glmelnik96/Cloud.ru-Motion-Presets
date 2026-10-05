// Probe for «Undo group mismatch» in After Effects (build PC, 2026-10-05): a footage import inside one undo
// group with a layer of it, nothing else. Run it with a saved project and an active comp, then press Ctrl+Z
// once on the timeline and note whether the warning shows and what is left.
//   node tools/host-run.mjs --host ae "@tools/panel/undo-probe.jsx"
// Imports a fresh copy of the synthetic whoosh each time, so the import really happens.
(function () {
  var src = new File('C:/CRBK/work/panel-live/media/library/items/SFX_WhooshIn/SFX_WhooshIn_wav_v1.wav');
  var comp = app.project.activeItem;
  var out = { ok: false };
  var dst, item, layer;
  if (!(comp instanceof CompItem) || !app.project.file) {
    out.error = 'needs a saved project and an active comp';
    return JSON.stringify(out);
  }
  if (!src.exists) {
    out.error = 'no ' + src.fsName + ': run node tools/panel/live.mjs --host ae --media first';
    return JSON.stringify(out);
  }
  dst = new File(app.project.file.parent.fsName + '/undo-probe-' + new Date().getTime() + '.wav');
  src.copy(dst);
  app.beginUndoGroup('BrandKit undo probe');
  try {
    item = app.project.importFile(new ImportOptions(dst));
    layer = comp.layers.add(item);
    layer.startTime = comp.time;
  } finally {
    app.endUndoGroup();
  }
  out.ok = true;
  out.layer = String(layer.name);
  out.layers = comp.numLayers;
  return JSON.stringify(out);
}());
