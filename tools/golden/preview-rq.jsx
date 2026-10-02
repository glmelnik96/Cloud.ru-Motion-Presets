// Half-resolution H.264 previews through aerender (Plan 2, Task 5). PARAMS:
//   expect      the relinked copy that must be open
//   mode        'probe'  add one Render Queue item, read the Output Module templates, try Resolution
//                        "Half", then remove the item (the copy is closed without saving afterwards)
//               'queue'  keep only our items in the queue, set them up, Save As PARAMS.savePath
//   items       [{ id, name, out, span }]: comps (persistent Item.id), their .mp4 outputs (ASCII) and
//               the seconds to render from the start (the whole comp, or the first 60 s of a longer one)
//   omPattern / prefer  regex sources: an H.264 template, preferably the 15 Mbps one
//   omTemplate  (queue) the template name the probe found
// Template names follow the AE UI language, hence the regex. Docs:
//   https://ae-scripting.docsforadobe.dev/renderqueue/rqitemcollection/
//   https://ae-scripting.docsforadobe.dev/renderqueue/outputmodule/  (templates, applyTemplate, file)
//   https://ae-scripting.docsforadobe.dev/renderqueue/renderqueueitem/ (setSettings/getSettings, AE 13.0+)
var out = { ok: false, mode: PARAMS.mode };

function slashes(p) {
  return String(p).replace(/\\/g, '/');
}

function compOf(job) {
  var c = null;
  try {
    c = app.project.itemByID(job.id);
  } catch (e0) {
    c = null;
  }
  return (c && c instanceof CompItem && c.name === job.name) ? c : null;
}

function pickTemplate(names) {
  var re = new RegExp(PARAMS.omPattern, 'i');
  var pref = new RegExp(PARAMS.prefer, 'i');
  var best = null;
  for (var i = 0; i < names.length; i++) {
    if (re.test(names[i]) && (best === null || (pref.test(names[i]) && !pref.test(best)))) {
      best = names[i];
    }
  }
  return best;
}

// Resolution "Half" is not in the guide's examples: set it, then read it back as a string.
// Quality "Best" is attempted separately and only recorded.
function setHalf(rq) {
  var r = { keys: [], readBack: null, error: null, quality: null };
  try {
    var settable = rq.getSettings(GetSettingsFormat.STRING_SETTABLE);
    for (var k in settable) {
      r.keys.push(k);
    }
    rq.setSettings({ 'Resolution': 'Half' });
    r.readBack = rq.getSettings(GetSettingsFormat.STRING)['Resolution'];
  } catch (e1) {
    r.error = String(e1);
  }
  try {
    rq.setSettings({ 'Quality': 'Best' });
    r.quality = rq.getSettings(GetSettingsFormat.STRING)['Quality'];
  } catch (e2) {
    r.quality = 'ERROR ' + String(e2);
  }
  return r;
}

// timeSpanStart / timeSpanDuration are read-write (custom start and end in Render Settings).
// The span is in display time: a comp with a start timecode (SMM transitions start at 3.17 s) renders
// from comp.displayStartTime. A span from 0 raises a modal warning that beginSuppressDialogs does not
// hide ("timeSpanStart of 0 seconds will cause render to have frames outside of range"), seen live on
// AE 26.5, 2026-10-02. saveFrameToPng, by contrast, takes time from the comp start (0-based).
function setUp(rq, comp, job, template) {
  rq.timeSpanStart = comp.displayStartTime;
  rq.timeSpanDuration = Math.min(job.span, comp.duration);
  var half = setHalf(rq);
  var om = rq.outputModule(1);
  om.applyTemplate(template);
  om.file = new File(job.out);
  return { half: half, omName: om.name, file: om.file ? om.file.fsName : null };
}

try {
  var cur = app.project.file ? app.project.file.fsName : '';
  var rqs = app.project.renderQueue;
  if (slashes(cur).toLowerCase() !== slashes(PARAMS.expect).toLowerCase()) {
    out.error = 'NOT_EXPECTED_PROJECT';
    out.detail = cur;
  } else if (PARAMS.mode === 'probe') {
    var pc = compOf(PARAMS.items[0]);
    if (!pc) {
      out.error = 'COMP_NOT_FOUND';
    } else {
      app.beginUndoGroup('BK preview probe');
      try {
        var prq = rqs.items.add(pc);
        try {
          var names = prq.outputModule(1).templates;
          out.templates = [];
          for (var n = 0; n < names.length; n++) {
            out.templates.push(names[n]);
          }
          out.omTemplate = pickTemplate(out.templates);
          if (out.omTemplate) {
            out.setup = setUp(prq, pc, PARAMS.items[0], out.omTemplate);
          }
        } finally {
          prq.remove();
        }
      } finally {
        app.endUndoGroup();
      }
      out.capable = Boolean(out.omTemplate) && Boolean(out.setup) && out.setup.half.readBack === 'Half';
      out.version = String(app.version);
      out.ok = true;
    }
  } else if (PARAMS.mode === 'queue') {
    out.queued = [];
    app.beginUndoGroup('BK preview queue');
    try {
      out.removedExisting = rqs.numItems;
      for (var r = rqs.numItems; r >= 1; r--) {
        rqs.item(r).remove();
      }
      for (var j = 0; j < PARAMS.items.length; j++) {
        var job = PARAMS.items[j];
        var c = compOf(job);
        if (!c) {
          throw new Error('COMP_NOT_FOUND ' + job.id);
        }
        var s = setUp(rqs.items.add(c), c, job, PARAMS.omTemplate);
        if (s.half.readBack !== 'Half') {
          throw new Error('RESOLUTION_NOT_HALF ' + job.id + ': ' + s.half.readBack + ' ' + s.half.error);
        }
        out.queued.push({ id: job.id, index: rqs.numItems, file: s.file });
      }
    } finally {
      app.endUndoGroup();
    }
    app.beginSuppressDialogs();
    try {
      app.project.save(new File(PARAMS.savePath));
    } finally {
      app.endSuppressDialogs(false);
    }
    out.saved = app.project.file ? app.project.file.fsName : null;
    out.ok = true;
  } else {
    out.error = 'BAD_MODE';
  }
} catch (e) {
  out.error = 'EXC';
  out.detail = String(e) + ' (line ' + e.line + ')';
}
JSON.stringify(out);
