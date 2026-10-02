// Text metrics of a pack comp that the JSX dump does not record (box text baselines, line advances), read
// from a working copy and closed WITHOUT saving. Composed after check.jsx and ae-project.jsx.
// PARAMS: workDir, aep (a relinked copy under C:/CRBK), comp, t. TextDocument.baselineLocs: per line
// [x0, y0, x1, y1] in layer space (an empty line reports 3.4e38).
var TM = { layers: [] };

check('metrics of ' + PARAMS.comp + ' at ' + PARAMS.t + ' s', function () {
  bkOpenProject(PARAMS.aep);
  var comp = bkComp(PARAMS.comp);
  for (var j = 1; j <= comp.numLayers; j++) {
    var L = comp.layer(j);
    if (!(L instanceof TextLayer) || !L.activeAtTime(PARAMS.t)) {
      continue;
    }
    var doc = bkSourceText(L).valueAtTime(PARAMS.t, false);
    var row = { name: L.name, index: j, font: String(doc.font), size: doc.fontSize, leading: doc.leading, text: doc.text, baselineLocs: null };
    try {
      row.baselineLocs = doc.baselineLocs;
    } catch (e) {
      row.baselineLocs = null;
    }
    TM.layers.push(row);
  }
  return { pass: TM.layers.length > 0, detail: TM.layers.length + ' text layers' };
}, true);

check('closed without saving', function () {
  app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
  return { pass: true, detail: '' };
}, true);

finish(TM);
