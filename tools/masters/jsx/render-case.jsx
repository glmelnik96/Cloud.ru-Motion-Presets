// Renders frames of one variant comp with given control values (golden comparison). Composed after
// check.jsx and ae-project.jsx. PARAMS: workDir, aep, comp, ctrl { effectName: value }, frames [{ t, file }].
// saveFrameToPng is undocumented and asynchronous (ae-quirks #27, #34): it renders at the comp's
// resolution factor, so that is set to full, and the control values must stay until the files exist.
// The project is left dirty; Node closes it without saving after the files are in (close-project.jsx).
var RC = { comp: null, queued: [] };

check('open ' + PARAMS.aep + ', comp ' + PARAMS.comp, function () {
  if (bkNorm(bkProjectPath()) !== bkNorm(PARAMS.aep)) {
    bkOpenProject(PARAMS.aep);
  }
  RC.comp = bkComp(PARAMS.comp);
  return { pass: true, detail: RC.comp.width + 'x' + RC.comp.height };
}, true);

check('controls set', function () {
  var C = bkLayer(RC.comp, 'CTRL');
  var got = {};
  for (var key in PARAMS.ctrl) {
    if (PARAMS.ctrl.hasOwnProperty(key)) {
      var p = C.property('ADBE Effect Parade').property(key).property(1);
      p.setValue(PARAMS.ctrl[key]);
      got[key] = p.value;
    }
  }
  return { pass: true, detail: got };
}, true);

check('frames queued (' + PARAMS.frames.length + ')', function () {
  if (RC.comp.resolutionFactor[0] !== 1 || RC.comp.resolutionFactor[1] !== 1) {
    RC.comp.resolutionFactor = [1, 1];
  }
  for (var i = 0; i < PARAMS.frames.length; i++) {
    RC.comp.saveFrameToPng(PARAMS.frames[i].t, new File(PARAMS.frames[i].file));
    RC.queued.push(PARAMS.frames[i].t);
  }
  return { pass: RC.queued.length === PARAMS.frames.length, detail: RC.queued };
}, true);

finish({ project: bkProjectPath() });
