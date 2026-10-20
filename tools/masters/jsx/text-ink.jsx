// Ink of the text layers of pack comps, which the JSX dump does not record: sourceRectAtTime (layer space) and
// the baselines of each line, read from a relinked working copy and closed WITHOUT saving. Composed after
// check.jsx and ae-project.jsx. PARAMS: workDir, aep (a relinked copy under C:/CRBK), cases: [{ comp, t }].
var TI = { cases: [] };

check('ink of ' + PARAMS.cases.length + ' comps', function () {
  var i, j, c, comp, L, doc, r, row, locs;
  bkOpenProject(PARAMS.aep);
  for (i = 0; i < PARAMS.cases.length; i++) {
    c = PARAMS.cases[i];
    comp = bkComp(c.comp);
    row = { comp: c.comp, t: c.t, layers: [] };
    for (j = 1; j <= comp.numLayers; j++) {
      L = comp.layer(j);
      if (!(L instanceof TextLayer) || !L.activeAtTime(c.t)) {
        continue;
      }
      doc = bkSourceText(L).valueAtTime(c.t, false);
      r = L.sourceRectAtTime(c.t, false);
      locs = null;
      try { locs = doc.baselineLocs; } catch (e) { locs = null; }
      row.layers.push({ name: L.name, index: j, text: doc.text, font: String(doc.font), size: doc.fontSize, tracking: doc.tracking, leading: doc.leading, rect: { left: r.left, top: r.top, width: r.width, height: r.height }, baselineLocs: locs });
    }
    TI.cases.push(row);
  }
  return { pass: TI.cases.length === PARAMS.cases.length, detail: TI.cases.length + ' comps' };
}, true);

check('closed without saving', function () {
  app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
  return { pass: true, detail: '' };
}, true);

finish(TI);
