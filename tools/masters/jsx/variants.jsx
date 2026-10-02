// Format variants of a built master (spec §4.4 steps 1-2). Composed after check.jsx, ae-project.jsx and
// ae-build-lib.jsx. PARAMS: workDir, workAep (the built master project), outAep, master (comp name),
// variants [{ key, w, h, k, comp, template }], removeMaster.
// A variant is comp.duplicate() (it keeps Essential Graphics, S2/S6) resized: the masters place every layer
// by expressions from thisComp.width/height, so only the text sizes change here (master size x k, C20).
var VR = { ready: false, master: null, made: [] };

function vrStep(name, required, fn) {
  return check(name, function () {
    if (!VR.ready) {
      return { pass: false, detail: 'skipped: master project not open' };
    }
    return fn();
  }, required);
}

// Base (pre-expression) text documents scaled by k; an expression on Source Text is kept.
function vrScaleText(comp, k) {
  var out = [];
  for (var i = 1; i <= comp.numLayers; i++) {
    var L = comp.layer(i);
    if (!(L instanceof TextLayer)) {
      continue;
    }
    var prop = bkSourceText(L);
    var doc = prop.valueAtTime(0, true);
    var was = doc.fontSize;
    doc.fontSize = was * k;
    if (doc.autoLeading === false) {
      doc.leading = doc.leading * k;
    }
    prop.setValue(doc);
    out.push(L.name + ' ' + was + ' -> ' + prop.valueAtTime(0, true).fontSize);
  }
  return out;
}

check('open ' + PARAMS.workAep, function () {
  bkOpenProject(PARAMS.workAep);
  VR.master = bkComp(PARAMS.master);
  VR.ready = true;
  return { pass: true, detail: { project: bkProjectPath(), controllers: VR.master.motionGraphicsTemplateControllerCount } };
}, true);

for (var vi = 0; vi < PARAMS.variants.length; vi++) {
  (function (v) {
    vrStep('variant ' + v.key + ': ' + v.comp + ' ' + v.w + 'x' + v.h + ', text x' + v.k, true, function () {
      app.beginUndoGroup('BK variant ' + v.key);
      var dup = null;
      try {
        dup = VR.master.duplicate();
        dup.name = v.comp;
        dup.width = v.w;
        dup.height = v.h;
        dup.motionGraphicsTemplateName = v.template;
      } finally {
        app.endUndoGroup();
      }
      var text = vrScaleText(dup, v.k);
      var sweep = bdExprSweep(dup, PARAMS.sweepTimes);
      var n = dup.motionGraphicsTemplateControllerCount;
      VR.made.push({ key: v.key, comp: dup.name, id: dup.id, template: String(dup.motionGraphicsTemplateName), controllers: n });
      return { pass: dup.width === v.w && dup.height === v.h && n === VR.master.motionGraphicsTemplateControllerCount &&
        sweep.errors.length === 0, detail: { text: text, controllers: n, expressionErrors: sweep.errors } };
    });
  })(PARAMS.variants[vi]);
}

if (PARAMS.removeMaster) {
  vrStep('master comp removed from the packaged project (variants carry everything)', true, function () {
    VR.master.remove();
    return { pass: true, detail: PARAMS.master };
  });
}

vrStep('saved: ' + PARAMS.outAep, true, function () {
  var r = bkSaveAs(PARAMS.outAep);
  return { pass: r.bytes > 0 && r.dirty === false, detail: r };
});

finish({ project: bkProjectPath(), variants: VR.made });
