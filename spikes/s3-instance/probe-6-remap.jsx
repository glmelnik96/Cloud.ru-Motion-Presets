// S3 probe 6: the time-remap fit (spec §3.1 S3: Responsive Time or time remap). A fresh lower third goes
// in at 2 s in its own comp USER_Comp_Remap: USER_Comp holds the stretched instance, whose PROBE_SQ would
// share the frames. Two fields are written, time remap is switched on, the keys AE adds are removed, the
// layer is made 15 s long and keyed with PARAMS.remapKeys; the fields are read back and two frames requested.
var DATA = { stage: 'remap' };

function s3Remap() {
  var lt = null;
  var comp = null;
  var layer = null;

  if (!check('remap: template comp found by id', function () {
    lt = app.project.itemByID(PARAMS.ids.ltCompId);
    return lt instanceof CompItem;
  }, true)) {
    s3Stop('ids from probe 1 not found');
    return;
  }

  app.beginUndoGroup('BK S3 remap');
  try {
    if (!check('remap: fresh lower third added at 2 s in USER_Comp_Remap', function () {
      comp = app.project.items.addComp('USER_Comp_Remap', 1920, 1080, 1, 30, 25);
      comp.resolutionFactor = [1, 1];
      layer = comp.layers.add(lt);
      layer.startTime = PARAMS.ltStart;
      return {
        pass: s3Near(layer.inPoint, PARAMS.ltStart) && layer.stretch === 100,
        detail: { inPt: s3Round(layer.inPoint), outPt: s3Round(layer.outPoint), stretch: layer.stretch }
      };
    }, true)) {
      s3Stop('remap instance failed');
      return;
    }

    s3WriteText(s3EpGroup(layer), 'name', PARAMS.values.name,
      'remap: EP name (text) written before time remap', false);
    s3WriteNumber(s3EpGroup(layer), 'showRole', PARAMS.values.showRole,
      'remap: EP showRole (checkbox) written before time remap', false);

    // https://ae-scripting.docsforadobe.dev/layer/avlayer/ (canSetTimeRemapEnabled, timeRemapEnabled) and
    // /matchnames/layer/avlayer/ (ADBE Time Remapping). AE keys the property when time remap is switched on;
    // the docs do not say where, so the keys are recorded. They are NOT removed here: removing every
    // time-remap key switches time remap off again (seen live on AE 26.5, 2026-10-02).
    check('remap: time remap on (AE adds its own keys)', function () {
      var tr, k;
      if (layer.canSetTimeRemapEnabled !== true) {
        return { pass: false, detail: 'canSetTimeRemapEnabled is false' };
      }
      layer.timeRemapEnabled = true;
      tr = layer.property('ADBE Time Remapping');
      DATA.remapAdded = [];
      for (k = 1; k <= tr.numKeys; k++) {
        DATA.remapAdded.push([s3Round(tr.keyTime(k)), s3Round(tr.keyValue(k))]);
      }
      return { pass: layer.timeRemapEnabled === true, detail: { added: DATA.remapAdded } };
    }, false);

    // With time remap on, the layer may run past the end of its source.
    check('remap: out point at 17 s (a 15 s instance, no stretch)', function () {
      layer.outPoint = PARAMS.ltStart + PARAMS.ltTarget;
      return {
        pass: s3Near(layer.outPoint, PARAMS.ltStart + PARAMS.ltTarget) && layer.stretch === 100,
        detail: { inPt: s3Round(layer.inPoint), outPt: s3Round(layer.outPoint), stretch: layer.stretch }
      };
    }, false);

    // setValueAtTime takes comp time, so layer time + startTime; linear keys keep the intro and the outro
    // at template speed (https://ae-scripting.docsforadobe.dev/property/property/). Our keys go in first,
    // then every other key (AE's own) is removed, so time remap never runs out of keys.
    check('remap: keys 0->0, 1->1, 14->9, 15->10 s (layer time -> template time), linear', function () {
      var tr = layer.property('ADBE Time Remapping');
      var rows = [];
      var ok, i, k, key, t, mine;
      if (layer.timeRemapEnabled !== true) {
        return { pass: false, detail: 'time remap is off' };
      }
      for (i = 0; i < PARAMS.remapKeys.length; i++) {
        key = PARAMS.remapKeys[i];
        tr.setValueAtTime(layer.startTime + key[0], key[1]);
      }
      for (k = tr.numKeys; k >= 1; k--) {
        t = tr.keyTime(k) - layer.startTime;
        mine = false;
        for (i = 0; i < PARAMS.remapKeys.length; i++) {
          if (s3Near(t, PARAMS.remapKeys[i][0])) {
            mine = true;
          }
        }
        if (!mine) {
          tr.removeKey(k);
        }
      }
      for (k = 1; k <= tr.numKeys; k++) {
        tr.setInterpolationTypeAtKey(k, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
        rows.push([s3Round(tr.keyTime(k) - layer.startTime), s3Round(tr.keyValue(k))]);
      }
      ok = rows.length === PARAMS.remapKeys.length;
      for (i = 0; ok && i < rows.length; i++) {
        ok = s3Near(rows[i][0], PARAMS.remapKeys[i][0]) && s3Near(rows[i][1], PARAMS.remapKeys[i][1]);
      }
      return {
        pass: ok,
        detail: {
          keys: rows,
          atIntroFrame: s3Round(tr.valueAtTime(PARAMS.frames.intro * comp.frameDuration, false)),
          atOutroFrame: s3Round(tr.valueAtTime(PARAMS.frames.outro * comp.frameDuration, false))
        }
      };
    }, false);

    // Switching time remap on adds a property to the layer, which can invalidate property objects taken
    // before it, so the Essential Properties group is looked up again.
    check('remap: Essential Properties written before time remap still read back', function () {
      var ep = s3EpGroup(layer);
      var name = s3FindEp(ep, PARAMS.egp.name);
      var showRole = s3FindEp(ep, PARAMS.egp.showRole);
      var back = { name: name ? name.value.text : null, showRole: showRole ? Number(showRole.value) : null };
      return {
        pass: back.name === PARAMS.values.name && back.showRole === Number(PARAMS.values.showRole),
        detail: back
      };
    }, false);

    check('remap: frames requested (intro, outro)', function () {
      s3SaveFrame(comp, PARAMS.frames.intro, PARAMS.out.remapIntro);
      s3SaveFrame(comp, PARAMS.frames.outro, PARAMS.out.remapOutro);
      return true;
    }, true);
  } finally {
    app.endUndoGroup();
  }

  check('remap: user project saved', function () {
    return s3Save(null) !== '' && app.project.dirty === false;
  }, true);
}

s3Remap();
finish(DATA);
