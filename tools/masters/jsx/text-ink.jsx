// Ink of the text layers of pack comps, which the JSX dump does not record: sourceRectAtTime (layer space) and
// the baselines of each line, read from a relinked working copy and closed WITHOUT saving. Composed after
// check.jsx and ae-project.jsx. PARAMS: workDir, aep (a relinked copy under C:/CRBK), cases: [{ comp, t, id }];
// id (the item id of the dump) picks one of two comps with the same name. runs: true also reads the style
// runs of every text (characterRange, AE 24.3+): the dump keeps only the style of the first character.
var TI = { cases: [] };

// Consecutive characters with the same font, size, leading, tracking and fill as one run.
function tiRuns(doc) {
  var runs = [];
  var n = doc.text.length;
  var cur = null;
  for (var i = 0; i < n; i++) {
    var r = doc.characterRange(i, i + 1);
    var fill = r.fillColor;
    var key = [String(r.font), r.fontSize, r.leading, r.tracking, fill ? fill.join(',') : ''].join('|');
    if (cur && cur.key === key) {
      cur.end = i + 1;
    } else {
      cur = { key: key, start: i, end: i + 1, font: String(r.font), size: r.fontSize, leading: r.leading, tracking: r.tracking, fill: fill };
      runs.push(cur);
    }
  }
  for (var j = 0; j < runs.length; j++) {
    delete runs[j].key;
  }
  return runs;
}

check('ink of ' + PARAMS.cases.length + ' comps', function () {
  var i, j, c, comp, L, doc, r, row, locs, runs;
  bkOpenProject(PARAMS.aep);
  for (i = 0; i < PARAMS.cases.length; i++) {
    c = PARAMS.cases[i];
    comp = c.id ? app.project.itemByID(c.id) : bkComp(c.comp);
    if (!(comp instanceof CompItem) || comp.name !== c.comp) {
      throw new Error('BK_NO_COMP: ' + c.comp + ' #' + c.id);
    }
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
      runs = null;
      if (PARAMS.runs) {
        try { runs = tiRuns(doc); } catch (e2) { runs = String(e2); }
      }
      row.layers.push({ name: L.name, index: j, text: doc.text, font: String(doc.font), size: doc.fontSize, tracking: doc.tracking, leading: doc.leading, rect: { left: r.left, top: r.top, width: r.width, height: r.height }, baselineLocs: locs, runs: runs });
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
