// After Effects Output Module research. Loaded after spikes/lib/check.jsx and spikes/lib/ae-project.jsx.
// PARAMS.op: list | render | saveTemplate | has
// PARAMS.workDir is required by the project helpers.
var P = PARAMS;
var data = { op: P.op, version: String(app.version) };

function aeKeys(obj) {
  var a = [];
  var k;
  if (!obj) return a;
  for (k in obj) a.push(String(k));
  return a;
}

function aeDump(obj) {
  var o = {};
  var i, ks;
  ks = aeKeys(obj);
  for (i = 0; i < ks.length; i++) {
    try { o[ks[i]] = String(obj[ks[i]]); } catch (e) { o[ks[i]] = 'EXC: ' + e; }
  }
  return o;
}

function aeH264(fmt, name) {
  var s = String(fmt) + ' ' + String(name);
  return s.indexOf('H.264') >= 0 || s.indexOf('H264') >= 0;
}

function aeComp() {
  return bkFindItem(P.comp, CompItem);
}

function aeSkipQueued() {
  var rq = app.project.renderQueue;
  var i, n = 0;
  for (i = 1; i <= rq.numItems; i++) {
    try { rq.item(i).render = false; n += 1; } catch (e) { n += 0; }
  }
  return n;
}

function aeQueue() {
  var comp = aeComp();
  if (!comp) throw new Error('BK_NO_COMP: ' + P.comp);
  aeSkipQueued();
  return app.project.renderQueue.items.add(comp);
}

function aeHas(om, name) {
  var list = om.templates;
  var i;
  for (i = 0; i < list.length; i++) {
    if (String(list[i]) === name) return true;
  }
  return false;
}

function aeTry(om, key, value) {
  var before = '';
  var after = '';
  var err = '';
  try { before = String(om.getSettings(GetSettingsFormat.STRING)[key]); } catch (e0) { before = 'read ' + e0; }
  try {
    var o = {};
    o[key] = value;
    om.setSettings(o);
  } catch (e1) { err = String(e1); }
  try { after = String(om.getSettings(GetSettingsFormat.STRING)[key]); } catch (e2) { after = 'read ' + e2; }
  return { key: key, set: value, before: before, after: after, error: err, changed: before !== after && err === '' };
}

if (P.op === 'list' || P.op === 'saveTemplate') {
  check('probe project', function () {
    var f = new File(P.project);
    if (f.exists && (P.op === 'saveTemplate')) {
      bkOpenProject(P.project);
      data.project = 'opened';
    } else if (!f.exists) {
      bkNewProject();
      data.project = 'created';
    } else if (bkProjectPath() && bkNorm(bkProjectPath()) === bkNorm(f.fsName)) {
      data.project = 'active';
    } else {
      bkOpenProject(P.project);
      data.project = 'opened';
    }
    return { pass: true, detail: data.project + ' ' + bkProjectPath() };
  });

  if (P.op === 'list') {
    check('comp and tone', function () {
      var comp = aeComp();
      if (!comp) {
        comp = app.project.items.addComp(P.comp, P.width, P.height, 1, P.seconds, P.fps);
        comp.displayStartTime = 0;
        comp.layers.addSolid([0.149, 0.816, 0.486], 'Fill', P.width, P.height, 1, P.seconds);
        if (P.tone) {
          var ft = app.project.importFile(new ImportOptions(new File(P.tone)));
          comp.layers.add(ft);
        }
      }
      data.comp = { name: comp.name, w: comp.width, h: comp.height, fps: comp.frameRate, dur: comp.duration, layers: comp.numLayers };
      return { pass: comp.frameRate === P.fps && comp.width === P.width, detail: data.comp };
    });
  }
}

if (P.op === 'list') {
  check('templates and H.264 settings', function () {
    var item = aeQueue();
    var om = item.outputModule(1);
    var names = om.templates;
    var all = [];
    var h264 = [];
    var i, s, settable, fmt;
    data.initial = aeDump(om.getSettings(GetSettingsFormat.STRING));
    data.initialSettable = aeKeys(om.getSettings(GetSettingsFormat.STRING_SETTABLE));
    data.rqSettable = aeKeys(item.getSettings(GetSettingsFormat.STRING_SETTABLE));
    data.rqSettings = aeDump(item.getSettings(GetSettingsFormat.STRING));
    for (i = 0; i < names.length; i++) {
      try {
        om.applyTemplate(names[i]);
        s = om.getSettings(GetSettingsFormat.STRING);
        fmt = String(s.Format);
        all.push({ name: String(names[i]), format: fmt });
        if (aeH264(fmt, names[i])) {
          settable = om.getSettings(GetSettingsFormat.STRING_SETTABLE);
          h264.push({ name: String(names[i]), format: fmt, settings: aeDump(s), settable: aeDump(settable) });
        }
      } catch (eT) {
        all.push({ name: String(names[i]), error: String(eT) });
      }
    }
    item.render = false;
    data.templates = all;
    data.h264 = h264;
    data.templateCount = names.length;
    return { pass: names.length > 0, detail: { count: names.length, h264: h264.length } };
  });

  check('Resize and frame-rate attempts', function () {
    var item = aeQueue();
    var om = item.outputModule(1);
    var tries = [];
    var rqTries = [];
    var i, list, name;
    list = om.templates;
    for (i = 0; i < list.length; i++) {
      om.applyTemplate(list[i]);
      if (aeH264(om.getSettings(GetSettingsFormat.STRING).Format, list[i])) { name = String(list[i]); break; }
    }
    data.resizeBase = name || null;
    if (name) om.applyTemplate(name);
    tries.push(aeTry(om, 'Resize', '1080 x 1920'));
    tries.push(aeTry(om, 'Resize', 'Custom'));
    tries.push(aeTry(om, 'Resize', '1920 x 1080'));
    rqTries.push(aeTry(item, 'Frame Rate', '30'));
    rqTries.push(aeTry(item, 'Use this frame rate', '30'));
    data.resizeTries = tries;
    data.fpsTries = rqTries;
    item.render = false;
    return { pass: true, detail: { resize: tries, fps: rqTries } };
  }, false);

  check('project saved', function () {
    var r = bkSaveAs(P.project);
    return { pass: true, detail: r };
  }, false);
}

if (P.op === 'approach') {
  check('project open', function () {
    bkOpenProject(P.project);
    return { pass: !!aeComp(), detail: bkProjectPath() };
  });
  check('Resize to and frame-rate mode', function () {
    var item = aeQueue();
    var om = item.outputModule(1);
    var tries = [];
    om.applyTemplate(P.template);
    tries.push(aeTry(om, 'Resize to', '1080,1920'));
    tries.push(aeTry(om, 'Resize to', '1080, 1920'));
    tries.push(aeTry(om, 'Resize', 'true'));
    tries.push(aeTry(om, 'Resize to', '1080 x 1920'));
    tries.push(aeTry(item, 'Frame Rate', 'Use this frame rate'));
    tries.push(aeTry(item, 'Use this frame rate', '30'));
    data.approach = tries;
    data.omNow = aeDump(om.getSettings(GetSettingsFormat.STRING));
    data.rqNow = aeDump(item.getSettings(GetSettingsFormat.STRING));
    item.render = false;
    return { pass: true, detail: tries };
  }, false);
}

if (P.op === 'ensure') {
  check('comp ' + P.comp, function () {
    bkOpenProject(P.project);
    var comp = bkFindItem(P.comp, CompItem);
    if (!comp) {
      var ft = app.project.importFile(new ImportOptions(new File(P.footage)));
      comp = app.project.items.addComp(P.comp, P.width, P.height, 1, P.seconds, P.fps);
      comp.displayStartTime = 0;
      comp.layers.add(ft);
    }
    data.comp = { name: comp.name, w: comp.width, h: comp.height, fps: comp.frameRate, layers: comp.numLayers };
    bkSaveAs(P.project);
    return { pass: comp.numLayers > 0, detail: data.comp };
  });
}

if (P.op === 'render') {
  check('project open', function () {
    bkOpenProject(P.project);
    return { pass: !!aeComp(), detail: bkProjectPath() };
  });
  check('render ' + P.template, function () {
    var item = aeQueue();
    var om = item.outputModule(1);
    var folder = new Folder(P.outDir);
    if (!folder.exists) folder.create();
    om.applyTemplate(P.template);
    if (P.resizeTo) {
      var rz = {};
      rz.Resize = 'true';
      om.setSettings(rz);
      var to = {};
      to['Resize to'] = P.resizeTo;
      om.setSettings(to);
    }
    if (P.useFrameRate) {
      var fr = {};
      fr['Use this frame rate'] = String(P.useFrameRate);
      item.setSettings(fr);
    }
    om.file = new File(P.out);
    data.appliedSettings = aeDump(om.getSettings(GetSettingsFormat.STRING));
    if (P.savePrefs) {
      try { app.preferences.saveToDisk(); data.prefs = 'saved'; }
      catch (ePrefs) { data.prefs = String(ePrefs); }
    }
    var t0 = new Date().getTime();
    app.project.renderQueue.render();
    var f = new File(P.out);
    var omNow = om.getSettings(GetSettingsFormat.STRING);
    var rqNow = item.getSettings(GetSettingsFormat.STRING);
    data.render = {
      template: P.template,
      file: P.out,
      ms: new Date().getTime() - t0,
      bytes: f.exists ? f.length : 0,
      format: String(omNow.Format),
      resize: String(omNow.Resize),
      resizeTo: String(omNow['Resize to']),
      frameRate: String(rqNow['Frame Rate']),
      useFrameRate: String(rqNow['Use this frame rate'])
    };
    return { pass: f.exists && f.length > 0, detail: data.render };
  });
}

if (P.op === 'saveTemplate') {
  check('save template ' + P.templateName, function () {
    var item = aeQueue();
    var om = item.outputModule(1);
    var tries = [];
    var i, keys, k, err;
    if (!aeHas(om, P.baseTemplate)) {
      item.render = false;
      return { pass: false, detail: 'base template missing: ' + P.baseTemplate };
    }
    om.applyTemplate(P.baseTemplate);
    keys = aeKeys(om.getSettings(GetSettingsFormat.STRING_SETTABLE));
    for (i = 0; i < keys.length; i++) {
      k = keys[i];
      if (/bitrate|quality|data rate/i.test(k)) tries.push(aeTry(om, k, P.bitrateValue || '10'));
    }
    if (P.also) {
      for (i = 0; i < P.also.length; i++) tries.push(aeTry(om, P.also[i].key, P.also[i].value));
    }
    data.bitrateTries = tries;
    if (aeHas(om, P.templateName)) {
      data.saved = 'already listed';
    } else {
      om.saveAsTemplate(P.templateName);
      data.saved = 'saved now';
    }
    err = '';
    try { app.preferences.saveToDisk(); } catch (e) { err = String(e); }
    data.prefs = err || 'saved';
    data.listed = aeHas(om, P.templateName);
    data.savedSettings = aeDump(om.getSettings(GetSettingsFormat.STRING));
    item.render = false;
    bkSaveAs(P.project);
    return { pass: data.listed, detail: { saved: data.saved, prefs: data.prefs, tries: tries.length } };
  });
}

if (P.op === 'has') {
  check('template listed: ' + P.templateName, function () {
    bkOpenProject(P.project);
    var item = aeQueue();
    var om = item.outputModule(1);
    var names = [];
    var i;
    for (i = 0; i < om.templates.length; i++) names.push(String(om.templates[i]));
    data.listed = aeHas(om, P.templateName);
    data.names = names;
    item.render = false;
    return { pass: data.listed, detail: data.listed };
  });
}

finish(data);
