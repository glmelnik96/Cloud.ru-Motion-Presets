// S3 probe 5 (after the manual step that created user_linear.aep): the lower third inserted into
// a project with a linearized sRGB working space; one frame for the colour patch.
var DATA = { stage: 'linear' };

function s3Linear() {
  var comp = null;
  var lt = null;

  if (!check('linear: precondition: the open project has no unsaved changes', function () {
    return { pass: app.project.dirty === false, detail: { dirty: app.project.dirty } };
  }, true)) {
    s3Stop('unsaved project in AE: save or close it by hand, then rerun');
    return;
  }

  // https://ae-scripting.docsforadobe.dev/general/application/ (open prompts only when dirty)
  if (!check('linear: user_linear.aep is the open project', function () {
    var cur = app.project.file ? s3Norm(app.project.file.fsName) : '';
    if (cur !== s3Norm(PARAMS.linearProject) && app.open(new File(PARAMS.linearProject)) === null) {
      return { pass: false, detail: 'app.open returned null' };
    }
    return {
      pass: app.project.file !== null && s3Norm(app.project.file.fsName) === s3Norm(PARAMS.linearProject),
      detail: app.project.file ? app.project.file.fsName : null
    };
  }, true)) {
    s3Stop('user_linear.aep did not open');
    return;
  }

  if (!check('linear: precondition: linearized sRGB working space (set by hand)', function () {
    DATA.color = s3ColorSettings();
    return { pass: DATA.color.linearize === true && /srgb/i.test(DATA.color.workingSpace), detail: DATA.color };
  }, true)) {
    s3Stop('colour settings of user_linear.aep are not the ones from the manual step');
    return;
  }

  app.beginUndoGroup('BK S3 linear');
  try {
    if (!check('linear: template imported, lower third found', function () {
      var r = s3ImportTemplate(PARAMS.fixtureEgp);
      var a = (r.item instanceof FolderItem) ? s3FindItems(r.item, PARAMS.ltComp, s3IsComp) : [];
      if (a.length === 1) {
        lt = a[0];
      }
      return { pass: lt !== null, detail: { folder: r.item instanceof FolderItem, found: a.length } };
    }, true)) {
      s3Stop('import failed');
      return;
    }

    if (!check('linear: no expression errors in the template (read before the render)', function () {
      var errs = s3ExprErrors(lt);
      return { pass: errs.length === 0, detail: errs };
    }, true)) {
      s3Stop('expression errors in the template');
      return;
    }

    if (!check('linear: lower third added at 2 s in USER_Comp', function () {
      var l;
      comp = app.project.items.addComp('USER_Comp', 1920, 1080, 1, 30, 25);
      comp.resolutionFactor = [1, 1];
      l = comp.layers.add(lt);
      l.startTime = PARAMS.ltStart;
      return { pass: s3Near(l.inPoint, PARAMS.ltStart), detail: { inPt: s3Round(l.inPoint) } };
    }, true)) {
      s3Stop('layers.add failed');
      return;
    }

    check('linear: frame requested (8 s)', function () {
      s3SaveFrame(comp, PARAMS.frames.hold, PARAMS.out.linear);
      return true;
    }, true);
  } finally {
    app.endUndoGroup();
  }

  check('linear: project saved', function () {
    return s3Save(null) !== '';
  }, true);
}

s3Linear();
finish(DATA);
