// S3 probe 4: the lower third goes back to the RDT fit; then a trim template (no RDT):
// CRT_Hatch_v1 at 0 s in USER_Comp_Trim, cut to 12 s, service Duration written to 12; two frames.
var DATA = { stage: 'trim' };

function s3Trim() {
  var lt = null;
  var hatch = null;
  var layer = null;
  var comp = null;
  var h = null;

  if (!check('trim: template comps and instance found by id', function () {
    lt = app.project.itemByID(PARAMS.ids.ltCompId);
    hatch = app.project.itemByID(PARAMS.ids.hatchCompId);
    layer = app.project.layerByID(PARAMS.ids.ltLayerId);
    return (lt instanceof CompItem) && (hatch instanceof CompItem) && (layer instanceof AVLayer);
  }, true)) {
    s3Stop('ids from probe 1 not found');
    return;
  }

  app.beginUndoGroup('BK S3 trim');
  try {
    // ae-quirks #159: assign startTime, then inPoint, then outPoint.
    check('lower third back to the RDT fit (2-17 s)', function () {
      layer.stretch = 100;
      layer.startTime = PARAMS.ltStart;
      layer.inPoint = PARAMS.ltStart;
      layer.outPoint = PARAMS.ltStart + lt.duration;
      layer.stretch = PARAMS.ltTarget / lt.duration * 100;
      return {
        pass: s3Near(layer.inPoint, PARAMS.ltStart) && s3Near(layer.outPoint, PARAMS.ltStart + PARAMS.ltTarget),
        detail: { stretch: layer.stretch, inPt: s3Round(layer.inPoint), outPt: s3Round(layer.outPoint) }
      };
    }, false);

    if (!check('trim: Hatch added at 0 s in USER_Comp_Trim and cut to 12 s', function () {
      comp = app.project.items.addComp('USER_Comp_Trim', 1920, 1080, 1, 30, 25);
      comp.resolutionFactor = [1, 1];
      h = comp.layers.add(hatch);
      h.startTime = 0;
      h.inPoint = 0;
      h.outPoint = PARAMS.hatchLength;
      return {
        pass: s3Near(h.inPoint, 0) && s3Near(h.outPoint, PARAMS.hatchLength),
        detail: { inPt: s3Round(h.inPoint), outPt: s3Round(h.outPoint), templateDuration: hatch.duration }
      };
    }, true)) {
      s3Stop('Hatch instance failed');
      return;
    }

    s3WriteNumber(s3EpGroup(h), 'duration', PARAMS.values.hatchDuration, 'trim: EP duration = 12 written and read back');

    check('trim: frames requested (10.48 s, 11.48 s)', function () {
      s3SaveFrame(comp, PARAMS.frames.hatchHold, PARAMS.out.hatchHold);
      s3SaveFrame(comp, PARAMS.frames.hatchOut, PARAMS.out.hatchOut);
      return true;
    }, true);
  } finally {
    app.endUndoGroup();
  }

  check('trim: user project saved', function () {
    return s3Save(null) !== '' && app.project.dirty === false;
  }, true);
}

s3Trim();
finish(DATA);
