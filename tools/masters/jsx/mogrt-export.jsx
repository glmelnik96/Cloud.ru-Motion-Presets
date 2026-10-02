// Exports ONE variant comp of a packaged project as .mogrt (spec §4.4 step 4; S2, S6, S8 learnings).
// Composed after check.jsx and ae-project.jsx. PARAMS: workDir, aep, comp, template, outDir, qa (0/1).
// openInEssentialGraphics marks the project dirty, so it is saved (a plain save keeps comp references
// valid) before the export; the comp reference is invalid after the export, so everything is read before.
// AE writes <template>.mogrt into outDir; Node judges by the file, not by the return value.
var EX = { comp: null };

check('open ' + PARAMS.aep, function () {
  var cur = bkNorm(bkProjectPath());
  if (cur !== bkNorm(PARAMS.aep)) {
    bkOpenProject(PARAMS.aep);
  }
  EX.comp = bkComp(PARAMS.comp);
  return { pass: true, detail: bkProjectPath() };
}, true);

check('QA patch ' + (PARAMS.qa ? 'on (QA build)' : 'off (release)'), function () {
  if (!EX.comp) {
    return { pass: false, detail: 'no comp' };
  }
  var qa = bkEffect(bkLayer(EX.comp, 'CTRL'), 'QA', 'ADBE Checkbox Control').property(1);
  if (qa.value !== PARAMS.qa) {
    qa.setValue(PARAMS.qa);
  }
  return { pass: qa.value === PARAMS.qa, detail: qa.value };
}, true);

check('export ' + PARAMS.template + '.mogrt', function () {
  if (!EX.comp) {
    return { pass: false, detail: 'no comp' };
  }
  EX.comp.motionGraphicsTemplateName = PARAMS.template;
  EX.comp.openInEssentialGraphics();
  var rv = null;
  var info = null;
  app.beginSuppressDialogs();
  try {
    if (app.project.dirty === true) {
      app.project.save();
    }
    var comp = bkComp(PARAMS.comp);
    info = { template: String(comp.motionGraphicsTemplateName), controllers: comp.motionGraphicsTemplateControllerCount };
    if (info.controllers < 1) {
      throw new Error('no Essential Graphics properties: AE does not export such a comp');
    }
    rv = comp.exportAsMotionGraphicsTemplate(true, new Folder(PARAMS.outDir).fsName);
  } finally {
    app.endSuppressDialogs(false);
  }
  info.returned = String(rv);
  return { pass: info.template === PARAMS.template, detail: info };
}, true);

finish({ project: bkProjectPath() });
