// S2: export ONE MOGRT per call (spec 3.1). Composed after check.jsx and ae-project.jsx. ES3.
// Node (run.mjs) waits for a stable file before the next call: exports never overlap.
// Sequence: template name -> save -> openInEssentialGraphics -> save again if that dirtied the project
// (an unsaved project makes the export ask to save, a modal) -> exportAsMotionGraphicsTemplate.
// Both saves run inside bkQuiet and the export inside begin/endSuppressDialogs (plan conventions).
// Docs: https://ae-scripting.docsforadobe.dev/item/compitem/ (motionGraphicsTemplateName,
//       exportAsMotionGraphicsTemplate(doOverWriteFileIfExisting[, file_path]): "use save() before exporting").
// Known bug since 24.x: the call returns false before the export has finished; S2 records the value.
var S2 = { ready: false, comp: null, count: null, returned: null, callMs: null, dirtyAfterOpen: null };

function s2Guard(fn) {
  return function () {
    if (!S2.ready) {
      return { pass: false, detail: 'skipped: project not ready' };
    }
    return fn();
  };
}

check('project ready for ' + PARAMS.comp, function () {
  if (PARAMS.openProject) {
    bkOpenProject(PARAMS.egpAep);
    bkSaveAs(PARAMS.s2Aep);             // work on a copy: the S1 result stays as it is
  } else if (bkNorm(bkProjectPath()) !== bkNorm(PARAMS.s2Aep)) {
    throw new Error('BK_WRONG_PROJECT: expected ' + PARAMS.s2Aep + ', open: ' + (bkProjectPath() || 'untitled'));
  }
  S2.comp = bkComp(PARAMS.comp);
  S2.count = S2.comp.motionGraphicsTemplateControllerCount;
  S2.ready = true;
  return { pass: S2.count > 0, detail: bkProjectPath() + ', controllers: ' + S2.count };
}, true);

check('template name ' + PARAMS.templateName + ', saved, openInEssentialGraphics, clean', s2Guard(function () {
  app.beginUndoGroup('BK S2 template name');
  try {
    S2.comp.motionGraphicsTemplateName = PARAMS.templateName;
  } finally {
    app.endUndoGroup();
  }
  bkQuiet(function () {
    app.project.save();
  });
  S2.comp.openInEssentialGraphics();
  S2.dirtyAfterOpen = app.project.dirty;
  if (S2.dirtyAfterOpen) {
    bkQuiet(function () {
      app.project.save();
    });
  }
  return { pass: S2.comp.motionGraphicsTemplateName === PARAMS.templateName && app.project.dirty === false,
    detail: { name: S2.comp.motionGraphicsTemplateName, dirtyAfterOpenInEGP: S2.dirtyAfterOpen } };
}), true);

check('exportAsMotionGraphicsTemplate returned true (' + PARAMS.comp + ')', s2Guard(function () {
  var t0 = bkNow();
  var r = null;
  app.beginSuppressDialogs();
  try {
    r = S2.comp.exportAsMotionGraphicsTemplate(PARAMS.overwrite, new Folder(PARAMS.folder).fsName);
  } finally {
    app.endSuppressDialogs(false);
  }
  S2.returned = r;
  S2.callMs = bkNow() - t0;
  return { pass: r === true, detail: 'returned ' + String(r) + ' after ' + S2.callMs + ' ms' };
}), false);

finish({ comp: PARAMS.comp, templateName: PARAMS.templateName, overwrite: PARAMS.overwrite,
  returned: S2.returned, callMs: S2.callMs, controllerCount: S2.count, dirtyAfterOpenInEGP: S2.dirtyAfterOpen });
