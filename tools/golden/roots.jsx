// Read-only inventory of every comp in the open project (Plan 2, Task 4): size, fps, duration,
// markers and the comps that use it as a layer source. ROOT comps are those with usedIn empty.
// AVItem.usedIn: https://ae-scripting.docsforadobe.dev/item/avitem/#avitemusedin
// CompItem.markerProperty (AE 14.0+): https://ae-scripting.docsforadobe.dev/item/compitem/#compitemmarkerproperty
// MarkerValue.protectedRegion (AE 16.0+): https://ae-scripting.docsforadobe.dev/other/markervalue/
// All times are comp times from 0 (displayStartTime is reported, never added).
var out = { ok: false };

function slashes(p) {
  return String(p).replace(/\\/g, '/');
}

function folderPath(it, rootId) {
  var names = [];
  var f = it.parentFolder;
  while (f && f.id !== rootId) {
    names.unshift(f.name);
    f = f.parentFolder;
  }
  return names.join('/');
}

function usedInIds(it) {
  var ids = [];
  var u = it.usedIn;
  for (var i = 0; i < u.length; i++) {
    ids.push(u[i].id);
  }
  return ids;
}

function markers(comp) {
  var list = [];
  var mp = comp.markerProperty;
  if (!mp) {
    return list;
  }
  for (var i = 1; i <= mp.numKeys; i++) {
    var mv = mp.keyValue(i);
    list.push({ time: mp.keyTime(i), duration: mv.duration, comment: mv.comment, protectedRegion: mv.protectedRegion === true });
  }
  return list;
}

try {
  var cur = app.project.file ? app.project.file.fsName : '';
  if (slashes(cur).toLowerCase() !== slashes(PARAMS.expect).toLowerCase()) {
    out.error = 'NOT_EXPECTED_PROJECT';
    out.detail = cur;
  } else {
    var rootId = app.project.rootFolder.id;
    var comps = [];
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (!(it instanceof CompItem)) {
        continue;
      }
      comps.push({
        id: it.id,
        name: it.name,
        folder: folderPath(it, rootId),
        width: it.width,
        height: it.height,
        pixelAspect: it.pixelAspect,
        fps: it.frameRate,
        frameDuration: it.frameDuration,
        duration: it.duration,
        displayStartTime: it.displayStartTime,
        workAreaStart: it.workAreaStart,
        workAreaDuration: it.workAreaDuration,
        numLayers: it.numLayers,
        renderer: it.renderer,
        resolutionFactor: [it.resolutionFactor[0], it.resolutionFactor[1]],
        usedIn: usedInIds(it),
        markers: markers(it)
      });
    }
    out.comps = comps;
    out.file = cur;
    out.version = String(app.version);
    out.ok = true;
  }
} catch (e) {
  out.error = 'EXC';
  out.detail = String(e) + ' (line ' + e.line + ')';
}
JSON.stringify(out);
