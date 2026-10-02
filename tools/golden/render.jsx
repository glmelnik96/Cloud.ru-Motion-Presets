// Queue golden PNG frames of one ROOT comp (Plan 2, Task 5). PARAMS:
//   expect  the relinked copy that must be open;  compId / compName  the comp (Item.id is persistent)
//   frames  [{ f, ms }] from keytimes.mjs;  outDir  ASCII folder that already exists
// CompItem.saveFrameToPng is not in the scripting guide; live-verified traps (ae-quirks #27, #34,
// #40, #50): it renders at comp.resolutionFactor, so the factor is set to [1, 1] and NOT restored
// (the write is asynchronous; Node closes this working copy without saving when the pack is done),
// and it returns before the PNG exists, so Node waits for size-stable files.
// Time = frame * frameDuration, comp time from 0, as in ae-quirks #34.
var out = { ok: false, queued: [] };

function slashes(p) {
  return String(p).replace(/\\/g, '/');
}

try {
  var cur = app.project.file ? app.project.file.fsName : '';
  var missing = 0;
  for (var i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (it instanceof FootageItem && it.footageMissing) {
      missing++;
    }
  }
  var comp = null;
  try {
    comp = app.project.itemByID(PARAMS.compId); // AE 13.0+
  } catch (e0) {
    comp = null;
  }
  if (slashes(cur).toLowerCase() !== slashes(PARAMS.expect).toLowerCase()) {
    out.error = 'NOT_EXPECTED_PROJECT';
    out.detail = cur;
  } else if (missing > 0) {
    out.error = 'MISSING_FOOTAGE';
    out.detail = missing;
  } else if (!comp || !(comp instanceof CompItem) || comp.name !== PARAMS.compName) {
    out.error = 'COMP_NOT_FOUND';
    out.detail = PARAMS.compId;
  } else if (!comp.saveFrameToPng) { // undocumented method: make sure it exists
    out.error = 'NO_SAVE_FRAME_TO_PNG';
  } else {
    out.dirtyBefore = app.project.dirty;
    out.resolutionBefore = [comp.resolutionFactor[0], comp.resolutionFactor[1]];
    app.beginUndoGroup('BK golden frames');
    try {
      if (comp.resolutionFactor[0] !== 1 || comp.resolutionFactor[1] !== 1) {
        comp.resolutionFactor = [1, 1];
      }
      for (var k = 0; k < PARAMS.frames.length; k++) {
        var fr = PARAMS.frames[k];
        comp.saveFrameToPng(fr.f * comp.frameDuration, new File(PARAMS.outDir + '/t' + fr.ms + '.png'));
        out.queued.push(fr.ms);
      }
    } finally {
      app.endUndoGroup();
    }
    out.width = comp.width;
    out.height = comp.height;
    out.version = String(app.version);
    out.ok = true;
  }
} catch (e) {
  out.error = 'EXC';
  out.detail = String(e) + ' (line ' + e.line + ', queued ' + out.queued.length + ')';
}
JSON.stringify(out);
