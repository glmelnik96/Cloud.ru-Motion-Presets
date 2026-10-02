// S3 probe 1: a fresh user project saved to an ASCII path, the template .aep imported once into the
// Cloud.ru BrandKit bin, the lower third placed at 2 s, and a baseline frame with template defaults.
var DATA = { stage: 'setup' };

function s3Setup() {
  var userComp = null;
  var imported = null;
  var lt = null;
  var hatch = null;
  var layer = null;

  // https://ae-scripting.docsforadobe.dev/general/project/ (dirty, AE 17.5+)
  if (!check('precondition: the open project has no unsaved changes', function () {
    return { pass: app.project.dirty === false, detail: { dirty: app.project.dirty } };
  }, true)) {
    s3Stop('unsaved project in AE: save or close it by hand, then rerun');
    return;
  }

  // https://ae-scripting.docsforadobe.dev/text/fontsobject/ and /text/fontobject/ (AE 24.0+)
  if (!check('precondition: SB Sans fonts installed, not substituted', function () {
    var rows = [];
    var ok = true;
    var i, list, f, loc, good;
    for (i = 0; i < PARAMS.fonts.length; i++) {
      list = app.fonts.getFontsByPostScriptName(PARAMS.fonts[i]);
      f = list.length ? list[0] : null;
      loc = f ? String(f.location) : '';
      good = f !== null && f.isSubstitute !== true && (loc === '' || /sbsans/i.test(loc));
      if (!good) {
        ok = false;
      }
      rows.push({ ps: PARAMS.fonts[i], found: f !== null, location: loc });
    }
    return { pass: ok, detail: rows };
  }, true)) {
    s3Stop('SB Sans fonts missing: an import would raise a font dialog');
    return;
  }

  // https://ae-scripting.docsforadobe.dev/general/application/ (newProject prompts only when dirty)
  if (!check('new project (app.newProject)', function () {
    var p = app.newProject();
    return { pass: p !== null && app.project.numItems === 0, detail: { numItems: app.project.numItems } };
  }, true)) {
    s3Stop('app.newProject failed');
    return;
  }

  if (!check('user project saved to its ASCII path', function () {
    var saved = s3Save(PARAMS.userProject);
    return { pass: s3Norm(saved) === s3Norm(PARAMS.userProject), detail: saved };
  }, true)) {
    s3Stop('first save failed');
    return;
  }

  check('project colour settings and expression engine read', function () {
    DATA.colorDefault = s3ColorSettings();
    return { pass: true, detail: DATA.colorDefault };
  }, false);

  app.beginUndoGroup('BK S3 setup');
  try {
    // https://ae-scripting.docsforadobe.dev/item/itemcollection/
    if (!check('USER_Comp 1920x1080, 25 fps, 30 s', function () {
      userComp = app.project.items.addComp('USER_Comp', 1920, 1080, 1, 30, 25);
      userComp.resolutionFactor = [1, 1];
      return { pass: s3Near(userComp.frameRate, 25) && s3Near(userComp.duration, 30), detail: { id: userComp.id } };
    }, true)) {
      s3Stop('addComp failed');
      return;
    }
    DATA.userCompId = userComp.id;

    if (!check('saveFrameToPng exists on CompItem (undocumented, ae-quirks #27)', function () {
      return typeof userComp.saveFrameToPng === 'function';
    }, true)) {
      s3Stop('no CompItem.saveFrameToPng in this AE');
      return;
    }

    // Project.importFile returns a FolderItem for an .aep; the docs do not say, so it is measured.
    if (!check('import of the template .aep returns a FolderItem', function () {
      var r = s3ImportTemplate(PARAMS.fixtureEgp);
      imported = r.item;
      return {
        pass: imported instanceof FolderItem,
        detail: {
          asProject: r.asProject,
          typeName: imported ? imported.typeName : null,
          name: imported ? imported.name : null
        }
      };
    }, true)) {
      s3Stop('import failed');
      return;
    }

    if (!check('template comps found exactly once in the imported folder', function () {
      var a = s3FindItems(imported, PARAMS.ltComp, s3IsComp);
      var b = s3FindItems(imported, PARAMS.hatchComp, s3IsComp);
      if (a.length === 1) {
        lt = a[0];
      }
      if (b.length === 1) {
        hatch = b[0];
      }
      return { pass: lt !== null && hatch !== null, detail: { lowerThird: a.length, hatch: b.length } };
    }, true)) {
      s3Stop('template comps not found');
      return;
    }
    DATA.ltCompId = lt.id;
    DATA.hatchCompId = hatch.id;

    // https://ae-scripting.docsforadobe.dev/other/markervalue/ (protectedRegion, AE 16.0+)
    check('lower third has protected regions 0-1 s and 9-10 s', function () {
      var mp = lt.markerProperty;
      var rows = [];
      var okIn = false;
      var okOut = false;
      var k, mv, t;
      for (k = 1; k <= mp.numKeys; k++) {
        mv = mp.keyValue(k);
        t = mp.keyTime(k);
        rows.push({ t: s3Round(t), dur: s3Round(mv.duration), protectedRegion: mv.protectedRegion, comment: mv.comment });
        if (mv.protectedRegion === true && s3Near(t, 0) && s3Near(mv.duration, 1)) {
          okIn = true;
        }
        if (mv.protectedRegion === true && s3Near(t, 9) && s3Near(mv.duration, 1)) {
          okOut = true;
        }
      }
      return { pass: okIn && okOut, detail: rows };
    }, true);

    if (!check('no expression errors in the template comps (read before any render)', function () {
      var errs = s3ExprErrors(lt).concat(s3ExprErrors(hatch));
      return { pass: errs.length === 0, detail: errs };
    }, true)) {
      s3Stop('expression errors in the template');
      return;
    }

    check('no missing or substituted fonts after the import', function () {
      var m = app.fonts.missingOrSubstitutedFonts;
      return { pass: m.length === 0, detail: m.length };
    }, false);

    // Spec §6.1 AE step 3: one import per id@version in the Cloud.ru BrandKit bin, label in the comment.
    check('template folder moved into the Cloud.ru BrandKit bin, id@version in its comment', function () {
      var root = app.project.rootFolder;
      var bin = null;
      var i;
      for (i = 1; i <= root.numItems; i++) {
        if (root.item(i) instanceof FolderItem && root.item(i).name === PARAMS.bin) {
          bin = root.item(i);
        }
      }
      if (bin === null) {
        bin = app.project.items.addFolder(PARAMS.bin);
      }
      imported.parentFolder = bin;
      imported.comment = PARAMS.binComment;
      return {
        pass: imported.parentFolder.id === bin.id && imported.comment === PARAMS.binComment,
        detail: { bin: bin.name, folder: imported.name }
      };
    }, false);

    DATA.footage = [];
    check('template footage listed for copying next to the project', function () {
      var list = s3FindItems(imported, null, s3IsFileFootage);
      var i;
      for (i = 0; i < list.length; i++) {
        DATA.footage.push({ id: list[i].id, name: list[i].name, path: list[i].file.fsName, missing: list[i].footageMissing });
      }
      return { pass: list.length > 0, detail: DATA.footage.length };
    }, true);

    // LayerCollection.add honours "Create Layers at Composition Start Time", so startTime is set
    // explicitly (https://ae-scripting.docsforadobe.dev/layer/layercollection/).
    if (!check('lower third added as a layer at 2 s', function () {
      layer = userComp.layers.add(lt);
      layer.startTime = PARAMS.ltStart;
      return {
        pass: s3Near(layer.inPoint, PARAMS.ltStart) && s3Near(layer.outPoint, PARAMS.ltStart + lt.duration) && layer.stretch === 100,
        detail: { inPt: s3Round(layer.inPoint), outPt: s3Round(layer.outPoint), stretch: layer.stretch }
      };
    }, true)) {
      s3Stop('layers.add failed');
      return;
    }
    DATA.ltLayerId = layer.id;

    check('baseline frame requested (8 s, template defaults)', function () {
      s3SaveFrame(userComp, PARAMS.frames.hold, PARAMS.out.before);
      return true;
    }, true);
  } finally {
    app.endUndoGroup();
  }

  check('setup: user project saved', function () {
    var saved = s3Save(null);
    return { pass: saved !== '' && app.project.dirty === false, detail: saved };
  }, true);
}

s3Setup();
finish(DATA);
