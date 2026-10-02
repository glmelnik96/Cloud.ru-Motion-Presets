// S10: Output Module template by script, and the AME queue with a brand .epr through BridgeTalk (spec 3.1).
// Composed after check.jsx and ae-project.jsx. ES3. PARAMS.action picks one step per host call:
//   om          (a) queue the comp, dump settings, QuickTime + RGB + Alpha, saveAsTemplate, 10-frame test render
//   ame-status  (b) is Media Encoder known to BridgeTalk and running (launch it on request)
//   ame-queue   (b) send addCompToBatch + addDLToBatch + runBatch to AME, wait for the reply
//   om-persist  after an AE restart: is the template still in OutputModule.templates
// Docs: https://ae-scripting.docsforadobe.dev/renderqueue/outputmodule/ (getSettings/setSettings 13.0; Format
//       is readable but not settable; saveAsTemplate, templates; setSettings invalidates the object)
//       https://ae-scripting.docsforadobe.dev/other/preferences/ (saveToDisk)
//       https://ame-scripting.docsforadobe.dev/reference/index.html (FrontendScriptObject.addCompToBatch,
//       addDLToBatch, getDLItemsAtRoot; EncoderHostScriptObject.runBatch)
//       https://extendscript.docsforadobe.dev/interapplication-communication/bridgetalk-message-object/
//       (send(timeoutInSecs): synchronous when a timeout is given; onResult, onError, onTimeout)
var S10 = { opened: false, ready: false, rq: null, rq0: 0, base: null, path: 'none', survey: [], formatTry: null,
  channels: null, codecKeys: [], codecTry: [], saved: null, settableKeys: [], dumpSettable: null, dumpAll: null };
var A = { spec: null, running: null, launched: null, status: null, reply: null, error: null, timedOut: false,
  sent: null, waitMs: null, guidLt: null, guidHatch: null, targets: null, body: null };
var S10_OUT = { action: PARAMS.action };

function s10Guard(fn) {
  return function () {
    if (!S10.ready) {
      return { pass: false, detail: 'skipped: render queue item not ready' };
    }
    return fn();
  };
}

// Re-fetch every time: the docs warn that setSettings invalidates the OutputModule object.
function s10Om() {
  return S10.rq.outputModule(1);
}

function s10Settings() {
  return s10Om().getSettings(GetSettingsFormat.STRING);
}

function s10Alpha(text) {
  return new RegExp(PARAMS.alphaPattern, 'i').test(String(text));
}

function s10Qt(s) {
  return /QuickTime/i.test(String(s.Format));
}

function s10HasTemplate(name) {
  var list = s10Om().templates;
  for (var i = 0; i < list.length; i++) {
    if (list[i] === name) {
      return true;
    }
  }
  return false;
}

function s10Keys(obj) {
  var keys = [];
  if (obj) {
    for (var k in obj) {
      if (obj.hasOwnProperty(k)) {
        keys.push(k);
      }
    }
  }
  return keys;
}

// Settings change that may throw ("Property is read-only"): returns '' or the error text.
function s10Try(settings) {
  var err = '';
  app.beginSuppressDialogs();
  try {
    s10Om().setSettings(settings);
  } catch (e) {
    err = String(e);
  } finally {
    app.endSuppressDialogs(false);
  }
  return err;
}

// A JS string literal for the script that AME evaluates (backslashes and quotes escaped by JSON; the
// prelude polyfills JSON where the engine has none). No quote characters inside regex literals here:
// the ES3 lint reads them as the start of a string.
function s10Q(s) {
  return JSON.stringify(String(s));
}

// The script AME runs (ES3 as well): two jobs with the brand preset, runBatch, then the batch status.
// Each call is wrapped, so one failure is reported as "key=ERR ..." and the later calls still run.
// Returns "key=value|..." to onResult.
// The body runs in Media Encoder and writes its reply to replyFile. AE must not wait for it: AME reads
// the comps through Dynamic Link, which the running AE serves, so a waiting AE deadlocks both
// (seen live on AE 26.5 / AME 26.5.2, 2026-10-02). Node waits for replyFile instead.
function s10AmeBody(project, epr, outComp, outDl, guid, format, replyFile) {
  var want = String(guid).toLowerCase().replace(/[{}]/g, '');
  return [
    '(function () {',
    '  var out = [];',
    '  var fe = null;',
    '  var host = null;',
    '  var pick = ' + s10Q(guid) + ';',
    '  function step(key, fn) {',
    '    try { out.push(key + "=" + fn()); } catch (e) { out.push(key + "=ERR " + String(e).replace(/[|=]/g, " ")); }',
    '  }',
    '  step("build", function () { return app.buildNumber; });',
    '  step("frontend", function () { fe = app.getFrontend(); return fe ? "ok" : "null"; });',
    '  step("addComp", function () {',
    '    return fe.addCompToBatch(' + s10Q(project) + ', ' + s10Q(epr) + ', ' + s10Q(outComp) + ');',
    '  });',
    '  step("guids", function () {',
    '    var g = fe.getDLItemsAtRoot(' + s10Q(project) + ');',
    '    for (var i = 0; g && i < g.length; i++) {',
    '      if (String(g[i]).toLowerCase().replace(/[{}]/g, "") === ' + s10Q(want) + ') { pick = String(g[i]); }',
    '    }',
    '    return g ? g.join(";") : "null";',
    '  });',
    '  step("addDL", function () {',
    '    return fe.addDLToBatch(' + s10Q(project) + ', ' + s10Q(format) + ', ' + s10Q(epr) + ', pick, ' + s10Q(outDl) + ') ? "ok" : "null";',
    '  });',
    '  step("run", function () { host = app.getEncoderHost(); return host.runBatch(); });',
    '  step("status", function () { return host.getBatchEncoderStatus(); });',
    '  var f = new File(' + s10Q(replyFile) + ');',
    '  f.encoding = "UTF-8";',
    '  if (f.open("w")) { f.write(out.join("|")); f.close(); }',
    '  return out.join("|");',
    '})();'
  ].join('\n');
}

if (PARAMS.action === 'om') {
  check('om: fixture opened', function () {
    bkOpenProject(PARAMS.fixtureAep);
    S10.opened = true;
    return { pass: true, detail: bkProjectPath() };
  }, false);

  if (S10.opened) {
    app.beginUndoGroup('BK S10 output module');
  }

  check('om: comp queued in the render queue', function () {
    if (!S10.opened) {
      return { pass: false, detail: 'skipped: fixture not open' };
    }
    S10.rq0 = app.project.renderQueue.numItems;
    S10.rq = app.project.renderQueue.items.add(bkComp(PARAMS.comp));
    S10.ready = true;
    return { pass: true, detail: { queuedBefore: S10.rq0, templates: s10Om().templates.length } };
  }, false);

  check('om: settable settings dumped (STRING_SETTABLE)', s10Guard(function () {
    S10.dumpSettable = s10Om().getSettings(GetSettingsFormat.STRING_SETTABLE);
    S10.dumpAll = s10Settings();
    S10.settableKeys = s10Keys(S10.dumpSettable);
    return { pass: S10.settableKeys.length > 0, detail: S10.settableKeys };
  }), false);

  check('om: QuickTime base (Format by setSettings, else a built-in alpha template)', s10Guard(function () {
    var err = s10Try({ 'Format': 'QuickTime' });
    var now = s10Settings();
    S10.formatTry = { error: err, format: String(now.Format) };
    if (err === '' && s10Qt(now)) {
      S10.path = 'setSettings';
      return { pass: true, detail: S10.formatTry };
    }
    var list = s10Om().templates;
    for (var i = 0; i < list.length; i++) {
      if (s10Alpha(list[i]) && list[i] !== PARAMS.template) {     // our own template from a past run is not a base
        s10Om().applyTemplate(list[i]);
        var s = s10Settings();
        S10.survey.push({ name: list[i], format: String(s.Format), channels: String(s.Channels) });
        if (S10.base === null && s10Qt(s) && s10Alpha(s.Channels)) {
          S10.base = list[i];
        }
      }
    }
    if (S10.base !== null) {
      s10Om().applyTemplate(S10.base);
      S10.path = 'template:' + S10.base;
    }
    return { pass: S10.base !== null, detail: { formatTry: S10.formatTry, survey: S10.survey, base: S10.base } };
  }), false);

  check('om: Channels = RGB + Alpha via setSettings', s10Guard(function () {
    var err = s10Try({ 'Channels': 'RGB + Alpha' });
    var s = s10Settings();
    S10.channels = { error: err, channels: String(s.Channels), format: String(s.Format) };
    var keys = s10Keys(S10.dumpSettable);
    for (var i = 0; i < keys.length; i++) {
      if (/codec/i.test(keys[i])) {
        var o = {};
        o[keys[i]] = PARAMS.codec;
        var e2 = s10Try(o);
        S10.codecKeys.push(keys[i]);
        S10.codecTry.push({ key: keys[i], error: e2, now: String(s10Settings()[keys[i]]) });
      }
    }
    return { pass: err === '' && s10Qt(s) && s10Alpha(s.Channels),
      detail: { channels: S10.channels, codecKeys: S10.codecKeys, codecTry: S10.codecTry } };
  }), false);

  check('om: template ' + PARAMS.template + ' saved and listed', s10Guard(function () {
    if (s10HasTemplate(PARAMS.template)) {
      S10.saved = 'already existed, not overwritten';
    } else {
      s10Om().saveAsTemplate(PARAMS.template);
      S10.saved = 'saved now';
    }
    var prefs = 'saved to disk';
    try {
      app.preferences.saveToDisk();       // without it aerender does not see the template (ae-quirks #184)
    } catch (e) {
      prefs = 'saveToDisk failed: ' + String(e);
    }
    return { pass: s10HasTemplate(PARAMS.template), detail: { saved: S10.saved, prefs: prefs, path: S10.path } };
  }), false);

  check('om: template applies QuickTime + RGB + Alpha', s10Guard(function () {
    s10Om().applyTemplate(PARAMS.template);
    var s = s10Settings();
    return { pass: s10Qt(s) && s10Alpha(s.Channels),
      detail: { format: String(s.Format), channels: String(s.Channels), depth: String(s.Depth), color: String(s.Color) } };
  }), false);

  if (S10.opened) {
    app.endUndoGroup();
  }

  check('om: 10-frame test render with the template finished', s10Guard(function () {
    s10Om().file = new File(PARAMS.omTestMov);
    S10.rq.timeSpanStart = 0;
    S10.rq.timeSpanDuration = PARAMS.testFrames * S10.rq.comp.frameDuration;
    bkQuiet(function () {
      app.project.renderQueue.render();   // blocks until done; 10 frames of a simple comp (ae-quirks #33)
    });
    var f = new File(PARAMS.omTestMov);
    return { pass: S10.rq.status === RQItemStatus.DONE && f.exists,
      detail: { status: String(S10.rq.status), file: String(s10Om().file.fsName), exists: f.exists } };
  }), false);

  check('om: render queue cleaned, fixture closed without saving', s10Guard(function () {
    S10.rq.remove();
    var left = app.project.renderQueue.numItems;
    app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
    return { pass: left === S10.rq0, detail: left + ' item(s) left' };
  }), false);

  S10_OUT.om = { path: S10.path, base: S10.base, survey: S10.survey, formatTry: S10.formatTry, channels: S10.channels,
    codecKeys: S10.codecKeys, codecTry: S10.codecTry, saved: S10.saved, settableKeys: S10.settableKeys,
    settable: S10.dumpSettable, all: S10.dumpAll };
}

if (PARAMS.action === 'ame-status') {
  check('ame: BridgeTalk knows Media Encoder', function () {
    A.spec = BridgeTalk.getSpecifier(PARAMS.ameName);
    try {
      A.targets = BridgeTalk.getTargets().join(', ');
    } catch (e) {
      A.targets = 'getTargets failed: ' + String(e);
    }
    return { pass: A.spec !== null && A.spec !== undefined && String(A.spec) !== '',
      detail: { spec: String(A.spec), targets: A.targets } };
  }, true);

  check('ame: Media Encoder running (launched on request)', function () {
    if (!A.spec) {
      return { pass: false, detail: 'no specifier' };
    }
    A.running = BridgeTalk.isRunning(A.spec);
    if (!A.running && PARAMS.launch) {
      A.launched = BridgeTalk.launch(A.spec, 'background');
    }
    A.status = BridgeTalk.getStatus(A.spec);
    return { pass: A.running === true, detail: { running: A.running, launched: A.launched, status: String(A.status) } };
  }, false);

  S10_OUT.spec = String(A.spec);
  S10_OUT.running = A.running;
  S10_OUT.status = String(A.status);
}

if (PARAMS.action === 'ame-queue') {
  check('ame: dynamicLinkGUID of both comps', function () {
    bkOpenProject(PARAMS.fixtureAep);
    A.guidLt = String(bkComp(PARAMS.comps.lt).dynamicLinkGUID);
    A.guidHatch = String(bkComp(PARAMS.comps.hatch).dynamicLinkGUID);
    return { pass: A.guidLt !== '' && A.guidHatch !== '', detail: { lt: A.guidLt, hatch: A.guidHatch } };
  }, false);

  // Fire and forget: AE returns at once and stays free to serve Dynamic Link to Media Encoder.
  // The reply comes back as PARAMS.replyFile, which Node waits for.
  check('ame: job sent to Media Encoder (AE does not wait)', function () {
    A.spec = BridgeTalk.getSpecifier(PARAMS.ameName);
    var bt = new BridgeTalk();
    bt.target = A.spec;
    bt.body = s10AmeBody(new File(PARAMS.fixtureAep).fsName, new File(PARAMS.epr).fsName,
      new Folder(PARAMS.outComp).fsName, new Folder(PARAMS.outDl).fsName, A.guidLt || '', PARAMS.format,
      PARAMS.replyFile);
    A.body = bt.body;
    A.sent = bt.send();
    return { pass: A.sent === true, detail: { sent: A.sent, spec: String(A.spec) } };
  }, false);

  S10_OUT.spec = String(A.spec);
  S10_OUT.guidLt = A.guidLt;
  S10_OUT.guidHatch = A.guidHatch;
  S10_OUT.sent = A.sent;
  S10_OUT.reply = A.reply;
  S10_OUT.error = A.error;
  S10_OUT.timedOut = A.timedOut;
  S10_OUT.waitMs = A.waitMs;
  S10_OUT.body = A.body;
}

if (PARAMS.action === 'om-persist') {
  check('om: template ' + PARAMS.template + ' still listed after an AE restart', function () {
    bkOpenProject(PARAMS.fixtureAep);
    var list = [];
    app.beginUndoGroup('BK S10 persist check');
    try {
      var rq = app.project.renderQueue.items.add(bkComp(PARAMS.comp));
      list = rq.outputModule(1).templates;
      rq.remove();
    } finally {
      app.endUndoGroup();
    }
    var found = false;
    for (var i = 0; i < list.length; i++) {
      if (list[i] === PARAMS.template) {
        found = true;
      }
    }
    app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
    return { pass: found, detail: list.length + ' templates' };
  }, false);
}

finish(S10_OUT);
