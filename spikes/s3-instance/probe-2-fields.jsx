// S3 probe 2: Essential Properties written and read back, media replacement through
// setAlternateSource, template footage relinked to its copy next to the project, the RDT fit by a
// time stretch to 15 s, and three frames for Node to measure.
var DATA = { stage: 'fields' };

function s3Fields() {
  var userComp = null;
  var lt = null;
  var layer = null;
  var ep = null;
  var slotB = null;

  // https://ae-scripting.docsforadobe.dev/general/project/ (itemByID 13.0+, layerByID 22.0+)
  if (!check('instance found by id (itemByID, layerByID)', function () {
    userComp = app.project.itemByID(PARAMS.ids.userCompId);
    lt = app.project.itemByID(PARAMS.ids.ltCompId);
    layer = app.project.layerByID(PARAMS.ids.ltLayerId);
    return {
      pass: (userComp instanceof CompItem) && (lt instanceof CompItem) && (layer instanceof AVLayer),
      detail: { layer: layer ? layer.name : null }
    };
  }, true)) {
    s3Stop('ids from probe 1 not found');
    return;
  }

  if (!check('Essential Properties group on the instance', function () {
    var byMatch = layer.property('ADBE Layer Overrides');
    var viaAttr = null;
    try {
      viaAttr = layer.essentialProperty;
    } catch (e) {
      viaAttr = null;
    }
    ep = s3EpGroup(layer);
    return {
      pass: ep !== null && ep.numProperties > 0,
      detail: {
        count: ep ? ep.numProperties : 0,
        matchName: ep ? ep.matchName : null,
        viaAttribute: viaAttr !== null && viaAttr !== undefined,
        viaMatchName: byMatch !== null && byMatch !== undefined
      }
    };
  }, true)) {
    s3Stop('no Essential Properties on the instance');
    return;
  }

  check('instance exposes every S1 property by its display name', function () {
    var missing = [];
    var k;
    for (k in PARAMS.egp) {
      if (PARAMS.egp.hasOwnProperty(k) && !s3FindEp(ep, PARAMS.egp[k])) {
        missing.push(PARAMS.egp[k]);
      }
    }
    DATA.ep = s3ListEp(ep, '', []);
    return { pass: missing.length === 0, detail: { missing: missing } };
  }, false);

  app.beginUndoGroup('BK S3 fields');
  try {
    s3WriteText(ep, 'name', PARAMS.values.name, 'EP name (text, Cyrillic): written and read back');
    s3WriteNumber(ep, 'showRole', PARAMS.values.showRole, 'EP showRole (checkbox): written and read back');
    s3WriteNumber(ep, 'duration', PARAMS.values.ltDuration, 'EP duration (slider): written and read back');
    s3WriteNumber(ep, 'style', PARAMS.values.style, 'EP style (dropdown): written and read back');

    // https://ae-scripting.docsforadobe.dev/item/avitem/ (isMediaReplacementCompatible)
    check('slot_b.png imported, media-replacement compatible', function () {
      app.beginSuppressDialogs();
      try {
        slotB = app.project.importFile(new ImportOptions(new File(PARAMS.slotB)));
      } finally {
        app.endSuppressDialogs(false);
      }
      return { pass: slotB !== null && slotB.isMediaReplacementCompatible === true, detail: slotB ? slotB.name : null };
    }, true);

    // https://ae-scripting.docsforadobe.dev/property/property/ (canSetAlternateSource,
    // setAlternateSource, alternateSource: AE 18.0+)
    check('EP photo: setAlternateSource(slot_b) and read back', function () {
      var p = s3FindEp(ep, PARAMS.egp.photo);
      var alt;
      if (!p) {
        return { pass: false, detail: 'no Essential Property named ' + PARAMS.egp.photo };
      }
      if (p.canSetAlternateSource !== true) {
        return { pass: false, detail: 'canSetAlternateSource is false' };
      }
      p.setAlternateSource(slotB);
      alt = p.alternateSource;
      // AE 26.5 does not point at slot_b itself: it wraps it into a new comp named "<property>_<file>"
      // (the photo field name + "_slot_b"), the size of the footage, with slot_b as its only layer
      // (seen live 2026-10-02). Accept the item itself or such a wrapper over the same item.
      var wrapped = alt instanceof CompItem && alt.numLayers === 1 && alt.layer(1).source !== null &&
        alt.layer(1).source.id === slotB.id;
      return {
        pass: alt !== null && (alt.id === slotB.id || wrapped),
        detail: { alternate: alt ? alt.name : null, type: alt ? alt.typeName : null,
          sameItem: alt !== null && alt.id === slotB.id, wrapped: wrapped }
      };
    }, true);

    // https://ae-scripting.docsforadobe.dev/item/footageitem/ (replace keeps the interpretation)
    check('template footage relinked into Cloud.ru BrandKit/<id>@<version> (FootageItem.replace)', function () {
      var rows = [];
      var ok = PARAMS.relink.length > 0;
      var i, r, it, now;
      for (i = 0; i < PARAMS.relink.length; i++) {
        r = PARAMS.relink[i];
        it = app.project.itemByID(r.id);
        it.replace(new File(r.target));
        now = it.file ? it.file.fsName : '';
        if (s3Norm(now) !== s3Norm(r.target) || it.footageMissing !== false) {
          ok = false;
        }
        rows.push({ name: it.name, file: now, missing: it.footageMissing });
      }
      return { pass: ok, detail: rows };
    }, true);

    // https://ae-scripting.docsforadobe.dev/layer/layer/ (stretch, in %); the docs do not say
    // how stretch moves in/out points, so they are read back.
    check('RDT fit: a time stretch makes the instance last 15 s from 2 s', function () {
      layer.stretch = PARAMS.ltTarget / lt.duration * 100;
      return {
        pass: s3Near(layer.inPoint, PARAMS.ltStart) && s3Near(layer.outPoint, PARAMS.ltStart + PARAMS.ltTarget),
        detail: { stretch: layer.stretch, startTime: s3Round(layer.startTime), inPt: s3Round(layer.inPoint), outPt: s3Round(layer.outPoint) }
      };
    }, true);

    check('frames requested: intro, outro, hold (after the writes)', function () {
      s3SaveFrame(userComp, PARAMS.frames.intro, PARAMS.out.rdtIntro);
      s3SaveFrame(userComp, PARAMS.frames.outro, PARAMS.out.rdtOutro);
      s3SaveFrame(userComp, PARAMS.frames.hold, PARAMS.out.after);
      return true;
    }, true);
  } finally {
    app.endUndoGroup();
  }

  check('fields: user project saved', function () {
    return s3Save(null) !== '' && app.project.dirty === false;
  }, true);
}

s3Fields();
finish(DATA);
