// Review renders of a packaged master (designer review): for every case a duplicate of a variant comp with
// the case's control values and texts goes into the Render Queue with an H.264 template; the project is
// saved as PARAMS.outAep for aerender (out of process, never renderQueue.render() over the bridge) and
// closed. Composed after check.jsx and ae-project.jsx. PARAMS: workDir, aep (packaged, opened read-only:
// the review project is saved under another name), outAep, omPattern / prefer (template regex sources),
// cases [{ name, comp, ctrl { effect: value }, text { layer: string }, out }].
// Transparent areas render black (H.264 has no alpha), as the pack previews do.
var RV = { comps: [], template: null };

function rvPick(names) {
  var re = new RegExp(PARAMS.omPattern, 'i');
  var pref = new RegExp(PARAMS.prefer, 'i');
  var best = null;
  for (var i = 0; i < names.length; i++) {
    if (re.test(names[i]) && (best === null || (pref.test(names[i]) && !pref.test(best)))) {
      best = names[i];
    }
  }
  return best;
}

check('open ' + PARAMS.aep, function () {
  bkOpenProject(PARAMS.aep);
  var rq = app.project.renderQueue;
  for (var r = rq.numItems; r >= 1; r--) {
    rq.item(r).remove();
  }
  return { pass: true, detail: bkProjectPath() };
}, true);

check('review comps queued (' + PARAMS.cases.length + ')', function () {
  var out = [];
  app.beginUndoGroup('BK review queue');
  try {
    for (var i = 0; i < PARAMS.cases.length; i++) {
      var c = PARAMS.cases[i];
      var dup = bkComp(c.comp).duplicate();
      dup.name = 'REVIEW_' + c.name;
      var C = bkLayer(dup, 'CTRL');
      for (var key in c.ctrl) {
        if (c.ctrl.hasOwnProperty(key)) {
          C.property('ADBE Effect Parade').property(key).property(1).setValue(c.ctrl[key]);
        }
      }
      for (var layer in c.text) {
        if (c.text.hasOwnProperty(layer)) {
          var st = bkSourceText(bkLayer(dup, layer));
          var doc = st.valueAtTime(0, true);
          doc.text = c.text[layer];
          st.setValue(doc);
        }
      }
      var item = app.project.renderQueue.items.add(dup);
      item.timeSpanStart = dup.displayStartTime;
      item.timeSpanDuration = dup.duration;
      var om = item.outputModule(1);
      if (RV.template === null) {
        RV.template = rvPick(om.templates);
        if (RV.template === null) {
          throw new Error('no Output Module template matches ' + PARAMS.omPattern);
        }
      }
      om.applyTemplate(RV.template);
      om.file = new File(c.out);
      out.push({ name: dup.name, size: [dup.width, dup.height], duration: dup.duration, file: om.file ? om.file.fsName : null });
    }
  } finally {
    app.endUndoGroup();
  }
  RV.comps = out;
  return { pass: out.length === PARAMS.cases.length, detail: { template: RV.template, comps: out } };
}, true);

check('saved as ' + PARAMS.outAep + ' and closed', function () {
  var r = bkSaveAs(PARAMS.outAep);
  app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
  return { pass: r.bytes > 0, detail: r };
}, true);

finish({ template: RV.template, comps: RV.comps });
