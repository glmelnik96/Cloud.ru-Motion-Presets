// S3 probe 3: the same instance fitted by moving its out point instead of a time stretch.
// Information only: records where AE puts the out point and renders the intro and outro frames.
var DATA = { stage: 'trim-out' };

function s3TrimOut() {
  var userComp = null;
  var layer = null;

  if (!check('trim-out: instance found by id', function () {
    userComp = app.project.itemByID(PARAMS.ids.userCompId);
    layer = app.project.layerByID(PARAMS.ids.ltLayerId);
    return (userComp instanceof CompItem) && (layer instanceof AVLayer);
  }, true)) {
    s3Stop('ids from probe 1 not found');
    return;
  }

  app.beginUndoGroup('BK S3 trim out');
  try {
    check('trim-out: stretch back to 100 %', function () {
      layer.stretch = 100;
      return { pass: layer.stretch === 100, detail: { inPt: s3Round(layer.inPoint), outPt: s3Round(layer.outPoint) } };
    }, true);

    check('trim-out: out point set to 17 s (AE may clamp it to the end of the template)', function () {
      layer.outPoint = PARAMS.ltStart + PARAMS.ltTarget;
      DATA.trimOut = { stretch: layer.stretch, inPt: s3Round(layer.inPoint), outPt: s3Round(layer.outPoint) };
      return { pass: s3Near(layer.outPoint, PARAMS.ltStart + PARAMS.ltTarget), detail: DATA.trimOut };
    }, false);

    check('trim-out: frames requested (intro, outro)', function () {
      s3SaveFrame(userComp, PARAMS.frames.intro, PARAMS.out.trimIntro);
      s3SaveFrame(userComp, PARAMS.frames.outro, PARAMS.out.trimOutro);
      return true;
    }, true);
  } finally {
    app.endUndoGroup();
  }

  check('trim-out: user project saved', function () {
    return s3Save(null) !== '';
  }, true);
}

s3TrimOut();
finish(DATA);
