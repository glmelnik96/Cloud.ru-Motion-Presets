// Premiere ExtendScript helpers for the BrandKit spikes (ES3). Loaded after spikes/lib/check.jsx:
//   files: ['spikes/lib/pr-helpers.jsx', 'spikes/<spike>/<stage>.jsx']   (S5, S6, S7; S8 may reuse them)
// Docs: https://ppro-scripting.docsforadobe.dev/ (Project, ProjectItem, Sequence, Track, TrackItem,
// Component, ComponentParam, Time). The QE DOM is undocumented: every QE call records what it did.
// Paths come in through PARAMS as ASCII with forward slashes; Premiere gets them as File(p).fsName.
//
// Time:     TICKS_PER_SECOND, secToTicks, ticksToSec, secToFrames, framesToTicks, ticksToFrames,
//           onFrameGrid, makeTime. tpf = ticks per frame = Number(sequence.timebase).
// Values:   strHas, endsWith, normPath, sameFsPath, truthy, describeValue
// Project:  projectIs, isBin, walkProject, findItemByName, findItemByNodeId, findItemByPath, projectTree,
//           ensureBin, importFile
// Sequence: findSequenceByName, findSequenceById, uniqueSequenceName, cloneSequence, activateSequence,
//           newSequenceFromPreset
// Tracks:   clipTimes, trackItems, occupancy, trackFreeAt, firstFreeTrack, clipStartingAt, placeClip, trimClip
// MOGRT:    importMogrt, mgtParamNames, mgtParam, setMgtText, readMgtText
// Effects:  componentList, componentByMatch, paramList
// QE:       ensureQE, qeItemFor
// Frames:   waitForFile, filesWithPrefix, exportFramePNG
// Undo:     undoBegin, undoEnd
// Stages:   projectCheck, workCloneCheck, workSeqCheck, frameCheck - check() wrappers that read PARAMS
//           projectFile, srcSeq, workBase, workSeq, workSeqId, framesDir, pngPreset, frameWaitMs.

var TICKS_PER_SECOND = 254016000000;

function secToTicks(sec) {
  return Math.round(Number(sec) * TICKS_PER_SECOND);
}

function ticksToSec(ticks) {
  return Number(ticks) / TICKS_PER_SECOND;
}

function secToFrames(sec, tpf) {
  return Math.round(Number(sec) * TICKS_PER_SECOND / Number(tpf));
}

function framesToTicks(frames, tpf) {
  return Math.round(frames) * Number(tpf);
}

function ticksToFrames(ticks, tpf) {
  return Math.round(Number(ticks) / Number(tpf));
}

function onFrameGrid(ticks, tpf) {
  return Number(ticks) % Number(tpf) === 0;
}

// Whole Time objects built from ticks: assigning .seconds on a clip's start is a silent no-op
// (premiere-autopilot SKILL.md, "Times, in/out points"). https://ppro-scripting.docsforadobe.dev/other/time/
function makeTime(ticks) {
  var t = new Time();
  t.ticks = String(ticks);
  return t;
}

function strHas(s, sub) {
  return String(s).split(sub).length > 1;
}

function endsWith(s, suffix) {
  var str = String(s);
  return str.length >= suffix.length && str.substr(str.length - suffix.length) === suffix;
}

function normPath(p) {
  return String(p).split('\\').join('/').toLowerCase();
}

function sameFsPath(a, b) {
  return normPath(a) === normPath(b);
}

function truthy(v) {
  return v === true || v === 1 || v === '1' || v === 'true';
}

// A host value made safe for the JSON answer: { type, value }.
function describeValue(v) {
  var t = typeof v;
  var s = '';
  if (v === null || t === 'undefined') {
    return { type: v === null ? 'null' : t, value: null };
  }
  if (t === 'object') {
    try { s = JSON.stringify(v); } catch (e) { s = String(v); }
    return { type: t, value: s };
  }
  return { type: t, value: v };
}

function projectIs(fileName) {
  var p = '';
  try { p = String(app.project.path); } catch (e) { p = ''; }
  return endsWith(normPath(p), '/' + String(fileName).toLowerCase());
}

// ProjectItem.type: 1 clip, 2 bin, 3 root, 4 file (Phygital cep-premiere host.jsx compares with 2).
function isBin(item) {
  return item.type === 2;
}

// Depth-first walk over bins; visit(item, treePath) returns true to stop the walk and get that item back.
function walkProject(visit) {
  var stack = [{ item: app.project.rootItem, path: '' }];
  var n, kids, count, i, c, p;
  while (stack.length) {
    n = stack.pop();
    kids = n.item.children;
    count = kids ? kids.numItems : 0;
    for (i = 0; i < count; i++) {
      c = kids[i];
      p = n.path + '/' + String(c.name);
      if (visit(c, p) === true) {
        return c;
      }
      if (isBin(c)) {
        stack.push({ item: c, path: p });
      }
    }
  }
  return null;
}

function findItemByName(name) {
  return walkProject(function (c) { return String(c.name) === name; });
}

function findItemByNodeId(nodeId) {
  return walkProject(function (c) { return String(c.nodeId) === String(nodeId); });
}

// ProjectItem.getMediaPath(): https://ppro-scripting.docsforadobe.dev/item/projectitem/
function findItemByPath(mediaPath) {
  var want = normPath(new File(mediaPath).fsName);
  return walkProject(function (c) {
    var mp = '';
    if (isBin(c)) {
      return false;
    }
    try { mp = String(c.getMediaPath()); } catch (e) { mp = ''; }
    return mp !== '' && normPath(mp) === want;
  });
}

function projectTree() {
  var out = [];
  walkProject(function (c, p) {
    out.push({ path: p, type: c.type, nodeId: String(c.nodeId) });
    return false;
  });
  return out;
}

function ensureBin(name) {
  var root = app.project.rootItem;
  var i, c;
  for (i = 0; i < root.children.numItems; i++) {
    c = root.children[i];
    if (isBin(c) && String(c.name) === name) {
      return c;
    }
  }
  return root.createBin(name);
}

// importFiles returns before the item exists and now and then drops a call (Phygital cep-premiere
// host.jsx, importToBin): poll for the item by its media path, import a second time only when the first
// call left nothing in the project. https://ppro-scripting.docsforadobe.dev/general/project/ (importFiles)
function importFile(path, bin, timeoutMs) {
  var t0 = new Date().getTime();
  var limit = timeoutMs || 8000;
  var item = findItemByPath(path);
  var attempts = 0;
  var deadline;
  if (item) {
    return { item: item, attempts: 0, ms: 0, reused: true };
  }
  while (!item && attempts < 2) {
    attempts += 1;
    app.project.importFiles([new File(path).fsName], true, bin, false);
    deadline = new Date().getTime() + limit;
    item = findItemByPath(path);
    while (!item && new Date().getTime() < deadline) {
      $.sleep(100);
      item = findItemByPath(path);
    }
  }
  return { item: item, attempts: attempts, ms: new Date().getTime() - t0, reused: false };
}

function findSequenceByName(name) {
  var seqs = app.project.sequences;
  var i;
  for (i = 0; i < seqs.numSequences; i++) {
    if (String(seqs[i].name) === name) {
      return seqs[i];
    }
  }
  return null;
}

function findSequenceById(id) {
  var seqs = app.project.sequences;
  var i;
  for (i = 0; i < seqs.numSequences; i++) {
    if (String(seqs[i].sequenceID) === String(id)) {
      return seqs[i];
    }
  }
  return null;
}

function uniqueSequenceName(base) {
  var n;
  if (!findSequenceByName(base)) {
    return base;
  }
  for (n = 2; n < 1000; n++) {
    if (!findSequenceByName(base + '_' + n)) {
      return base + '_' + n;
    }
  }
  return base + '_' + new Date().getTime();
}

// Sequence.clone() returns a Boolean; the copy is found by diffing sequenceIDs
// (premiere-autopilot panel-api-notes). https://ppro-scripting.docsforadobe.dev/sequence/sequence/ (clone)
function cloneSequence(src, baseName) {
  var known = {};
  var seqs = app.project.sequences;
  var name = uniqueSequenceName(baseName);
  var copy = null;
  var i, j, tries, rv;
  for (i = 0; i < seqs.numSequences; i++) {
    known[String(seqs[i].sequenceID)] = true;
  }
  rv = src.clone();
  for (tries = 0; tries < 20 && !copy; tries++) {
    seqs = app.project.sequences;
    for (j = 0; j < seqs.numSequences; j++) {
      if (!known[String(seqs[j].sequenceID)]) {
        copy = seqs[j];
        break;
      }
    }
    if (!copy) {
      $.sleep(100);
    }
  }
  if (copy) {
    copy.name = name;
  }
  return { seq: copy, name: copy ? String(copy.name) : null, id: copy ? String(copy.sequenceID) : null, rv: String(rv) };
}

// openSequence makes a sequence active; assigning activeSequence is the fallback premiere-autopilot uses.
// https://ppro-scripting.docsforadobe.dev/general/project/ (openSequence, activeSequence)
function activateSequence(seq) {
  var id = String(seq.sequenceID);
  var act = null;
  try { app.project.openSequence(id); } catch (e) { act = null; }
  act = app.project.activeSequence;
  if (act && String(act.sequenceID) === id) {
    return true;
  }
  try { app.project.activeSequence = seq; } catch (e2) { act = null; }
  act = app.project.activeSequence;
  return !!(act && String(act.sequenceID) === id);
}

// Project.newSequence(name, presetPath) returns a Sequence or 0; QE newSequence is the fallback (Adobe
// PProPanel, createSequenceFromPreset). https://ppro-scripting.docsforadobe.dev/general/project/
function newSequenceFromPreset(name, presetPath) {
  var how = [];
  var made = null;
  var seq;
  try {
    made = app.project.newSequence(name, new File(presetPath).fsName);
    how.push('dom: ' + (made ? 'sequence' : String(made)));
  } catch (e) {
    how.push('dom: ' + String(e));
  }
  seq = findSequenceByName(name);
  if (!seq && ensureQE()) {
    try {
      qe.project.newSequence(name, new File(presetPath).fsName);
      how.push('qe: called');
    } catch (e2) {
      how.push('qe: ' + String(e2));
    }
    seq = findSequenceByName(name);
  }
  return { seq: seq, how: how };
}

function clipTimes(clip, tpf) {
  return {
    startF: ticksToFrames(clip.start.ticks, tpf),
    endF: ticksToFrames(clip.end.ticks, tpf),
    inF: ticksToFrames(clip.inPoint.ticks, tpf),
    outF: ticksToFrames(clip.outPoint.ticks, tpf),
    onGrid: onFrameGrid(clip.start.ticks, tpf) && onFrameGrid(clip.end.ticks, tpf),
    startTicks: String(clip.start.ticks),
    endTicks: String(clip.end.ticks)
  };
}

function trackItems(track, tpf) {
  var out = [];
  var i, t;
  for (i = 0; i < track.clips.numItems; i++) {
    t = clipTimes(track.clips[i], tpf);
    t.name = String(track.clips[i].name);
    out.push(t);
  }
  return out;
}

function occupancy(seq) {
  var tpf = Number(seq.timebase);
  var out = { video: [], audio: [] };
  var v, a;
  for (v = 0; v < seq.videoTracks.numTracks; v++) {
    out.video.push({ track: 'V' + (v + 1), items: trackItems(seq.videoTracks[v], tpf) });
  }
  for (a = 0; a < seq.audioTracks.numTracks; a++) {
    out.audio.push({ track: 'A' + (a + 1), items: trackItems(seq.audioTracks[a], tpf) });
  }
  return out;
}

// True when no item of the track overlaps [startSec, endSec).
function trackFreeAt(track, startSec, endSec) {
  var s = secToTicks(startSec);
  var e = secToTicks(endSec);
  var i, c;
  for (i = 0; i < track.clips.numItems; i++) {
    c = track.clips[i];
    if (Number(c.start.ticks) < e && Number(c.end.ticks) > s) {
      return false;
    }
  }
  return true;
}

// Index of the first track, from fromIndex up, free over [startSec, endSec); -1 when there is none.
function firstFreeTrack(tracks, fromIndex, startSec, endSec) {
  var i;
  for (i = fromIndex; i < tracks.numTracks; i++) {
    if (trackFreeAt(tracks[i], startSec, endSec)) {
      return i;
    }
  }
  return -1;
}

function clipStartingAt(track, frame, tpf) {
  var i;
  for (i = 0; i < track.clips.numItems; i++) {
    if (ticksToFrames(track.clips[i].start.ticks, tpf) === frame) {
      return track.clips[i];
    }
  }
  return null;
}

// Overwrite onto one track at a whole frame. The docs give the time as a ticks string; premiere-autopilot
// places with a seconds number one millisecond into the frame, which lands exactly on it on 26.3
// (Edit_Skill scripts/gfxplace.mjs). https://ppro-scripting.docsforadobe.dev/sequence/track/ (overwriteClip)
function placeClip(track, item, startSec, tpf) {
  var f = secToFrames(startSec, tpf);
  track.overwriteClip(item, f * Number(tpf) / TICKS_PER_SECOND + 0.001);
  return { clip: clipStartingAt(track, f, tpf), startF: f };
}

// A placed clip made lenF frames long: outPoint first, then end. Assigning end alone lengthens the item
// and leaves outPoint (premiere-autopilot SKILL.md). The caller reads the clip back from its track.
// TrackItem start/end/inPoint/outPoint are read/write Time objects: https://ppro-scripting.docsforadobe.dev/item/trackitem/
function trimClip(clip, lenF, tpf) {
  var startT = Number(clip.start.ticks);
  var inT = Number(clip.inPoint.ticks);
  clip.outPoint = makeTime(inT + framesToTicks(lenF, tpf));
  clip.end = makeTime(startT + framesToTicks(lenF, tpf));
}

// importMGT(path, time as a ticks string, video track index, audio track index) returns a TrackItem and
// only overwrites. The clip is looked up on its track afterwards: a null return and a silent drop are both
// measured. https://ppro-scripting.docsforadobe.dev/sequence/sequence/ (importMGT)
function importMogrt(seq, mogrtPath, startSec, vIdx, aIdx, waitMs) {
  var tpf = Number(seq.timebase);
  var f = secToFrames(startSec, tpf);
  var track = seq.videoTracks[vIdx];
  var t0 = new Date().getTime();
  var rv = null;
  var err = null;
  var name = null;
  var clip, deadline;
  try {
    rv = seq.importMGT(new File(mogrtPath).fsName, String(framesToTicks(f, tpf)), vIdx, aIdx);
  } catch (e) {
    err = String(e);
  }
  try { name = rv ? String(rv.name) : null; } catch (e2) { name = 'EXC: ' + String(e2); }
  clip = track ? clipStartingAt(track, f, tpf) : null;
  deadline = new Date().getTime() + (waitMs || 2000);
  while (!clip && track && new Date().getTime() < deadline) {
    $.sleep(100);
    clip = clipStartingAt(track, f, tpf);
  }
  return {
    clip: clip,
    returned: rv ? true : false,
    returnedName: name,
    startF: f,
    lenF: clip ? ticksToFrames(clip.end.ticks, tpf) - f : null,
    ms: new Date().getTime() - t0,
    error: err
  };
}

// TrackItem.getMGTComponent(): the Component of a MOGRT's parameters, null for other clips.
// https://ppro-scripting.docsforadobe.dev/item/trackitem/
function mgtParamNames(clip) {
  var out = [];
  var comp = clip.getMGTComponent();
  var i;
  if (!comp) {
    return out;
  }
  for (i = 0; i < comp.properties.numItems; i++) {
    out.push(String(comp.properties[i].displayName));
  }
  return out;
}

// getParamForDisplayName is not in the official reference; Adobe's PProPanel sample uses it
// (github.com/Adobe-CEP/Samples, PProPanel/jsx/PPRO/Premiere.jsx, importMoGRT). The display names are
// the names our templates give in Essential Graphics, not localized UI strings.
function mgtParam(clip, displayName) {
  var comp = clip.getMGTComponent();
  var p = null;
  var i;
  if (!comp) {
    return null;
  }
  try { p = comp.properties.getParamForDisplayName(displayName); } catch (e) { p = null; }
  if (p) {
    return p;
  }
  for (i = 0; i < comp.properties.numItems; i++) {
    if (String(comp.properties[i].displayName) === displayName) {
      return comp.properties[i];
    }
  }
  return null;
}

// Source Text of an AE-made MOGRT reads as JSON: textEditValue plus fontTextRunLength per style run
// (Adobe community answers 2020-2024, not in the official reference). One style run per field (contract).
// setValue(value, updateUI): https://ppro-scripting.docsforadobe.dev/sequence/componentparam/
function setMgtText(param, text) {
  var raw = String(param.getValue());
  var obj = JSON.parse(raw);
  var runs;
  if (!obj || typeof obj !== 'object' || obj.textEditValue === undefined) {
    throw new Error('BK_NOT_AE_TEXT: ' + raw.substr(0, 80));
  }
  runs = obj.fontTextRunLength ? obj.fontTextRunLength.length : 0;
  obj.textEditValue = text;
  obj.fontTextRunLength = [text.length];
  return { rv: describeValue(param.setValue(JSON.stringify(obj), 1)), runsBefore: runs };
}

function readMgtText(param) {
  try { return JSON.parse(String(param.getValue())).textEditValue; } catch (e) { return null; }
}

// Component.matchName / displayName / properties: https://ppro-scripting.docsforadobe.dev/sequence/component/
function componentList(clip) {
  var out = [];
  var i, c;
  for (i = 0; i < clip.components.numItems; i++) {
    c = clip.components[i];
    out.push({ index: i, matchName: String(c.matchName), displayName: String(c.displayName) });
  }
  return out;
}

function componentByMatch(clip, matchName) {
  var i;
  for (i = 0; i < clip.components.numItems; i++) {
    if (String(clip.components[i].matchName) === matchName) {
      return clip.components[i];
    }
  }
  return null;
}

function paramList(component) {
  var out = [];
  var i, p, v;
  for (i = 0; i < component.properties.numItems; i++) {
    p = component.properties[i];
    v = null;
    try { v = p.getValue(); } catch (e) { v = 'EXC: ' + String(e); }
    out.push({ index: i, displayName: String(p.displayName), value: describeValue(v) });
  }
  return out;
}

// app.enableQE(): https://ppro-scripting.docsforadobe.dev/application/application/ (the QE DOM itself is undocumented)
function ensureQE() {
  try { app.enableQE(); } catch (e) { return false; }
  return typeof qe !== 'undefined' && !!qe && !!qe.project;
}

// QE track items include gaps as items of type "Empty" (pymiere docs). A clip is matched by name and,
// where QE reports it, by start.secs (as premiere-autopilot scripts read it).
function qeItemFor(qeTrack, name, startSec) {
  var i, it, s;
  for (i = 0; i < qeTrack.numItems; i++) {
    it = qeTrack.getItemAt(i);
    if (!it || String(it.type) === 'Empty' || String(it.name) !== String(name)) {
      continue;
    }
    s = NaN;
    try { s = parseFloat(it.start.secs); } catch (e) { s = NaN; }
    if (isNaN(s) || Math.abs(s - startSec) < 0.02) {
      return it;
    }
  }
  return null;
}

function waitForFile(path, timeoutMs) {
  var deadline = new Date().getTime() + timeoutMs;
  var f = new File(path);
  while (!(f.exists && f.length > 0) && new Date().getTime() < deadline) {
    $.sleep(100);
    f = new File(path);
  }
  return f.exists && f.length > 0;
}

function filesWithPrefix(dirPath, prefix) {
  var out = [];
  var folder = new Folder(dirPath);
  var all, i;
  if (!folder.exists) {
    return out;
  }
  all = folder.getFiles();
  for (i = 0; i < all.length; i++) {
    if (all[i] instanceof File && String(all[i].name).substr(0, prefix.length) === prefix && all[i].length > 0) {
      out.push(String(all[i].fsName).split('\\').join('/'));
    }
  }
  return out;
}

// One frame of `seq` as PNG; `frame` counts from the sequence start, outBase has no extension.
// 1) QE, as verified in premiere-autopilot (Edit_Skill SKILL.md "A frame", references/review-to-edit.md):
//    the DOM playhead to the frame, then exportFramePNG(CTI timecode, native path) on the QE sequence;
//    Premiere appends ".png"; past one hour QE returns the head of the sequence (frames stay under 1 h).
//    QE follows the active sequence, so its name is compared with ours first.
// 2) No file after waitMs: exportAsMediaDirect over a one-frame In/Out with the PNG still preset
//    (Phygital cep-premiere host.jsx, exportTimelineFrame); the still exporter appends a frame number.
// Returns { ok, file, method, tc, playhead, attempts }. Node still waits for a complete PNG (read-png).
function exportFramePNG(seq, frame, outBase, pngPreset, waitMs) {
  var res = { ok: false, file: null, method: null, tc: null, playhead: null, attempts: [] };
  var tpf = Number(seq.timebase);
  var limit = waitMs || 5000;
  var qs = null;
  var qname = '';
  var tries, parts, leaf, dir, oldIn, oldOut, rv, found;
  if (!activateSequence(seq)) {
    res.attempts.push('activate: failed');
    return res;
  }
  if (ensureQE()) {
    for (tries = 0; tries < 10 && !qs; tries++) {
      try { qs = qe.project.getActiveSequence(); } catch (e) { qs = null; }
      qname = qs ? String(qs.name) : '';
      if (qs && qs.name !== undefined && qname !== String(seq.name)) {
        qs = null;
        $.sleep(300);
      }
    }
    if (!qs) {
      res.attempts.push('qe: active sequence is "' + qname + '", not "' + String(seq.name) + '"');
    }
  } else {
    res.attempts.push('qe: unavailable');
  }
  if (qs) {
    try {
      // Sequence.setPlayerPosition(ticks string): https://ppro-scripting.docsforadobe.dev/sequence/sequence/
      seq.setPlayerPosition(String(framesToTicks(frame, tpf)));
      res.playhead = String(seq.getPlayerPosition().ticks);
      res.tc = String(qs.CTI.timecode);
      qs.exportFramePNG(res.tc, new File(outBase).fsName);
      if (waitForFile(outBase + '.png', limit)) {
        res.ok = true;
        res.file = outBase + '.png';
        res.method = 'qe';
        return res;
      }
      res.attempts.push('qe ' + res.tc + ': no file after ' + limit + ' ms');
    } catch (e2) {
      res.attempts.push('qe: ' + String(e2));
    }
  }
  if (!pngPreset) {
    res.attempts.push('direct: no PNG preset');
    return res;
  }
  parts = String(outBase).split('/');
  leaf = parts.pop() + '_direct';
  dir = parts.join('/');
  oldIn = null;
  oldOut = null;
  try { oldIn = seq.getInPointAsTime(); oldOut = seq.getOutPointAsTime(); } catch (e3) { oldIn = null; }
  try {
    // setInPoint takes seconds and rounds down: aim one millisecond into the frame (premiere-autopilot).
    seq.setInPoint(frame * tpf / TICKS_PER_SECOND + 0.001);
    seq.setOutPoint((frame + 1) * tpf / TICKS_PER_SECOND + 0.001);
    // workAreaType 1 = In/Out; active sequence and native paths only (premiere-autopilot SKILL.md).
    // https://ppro-scripting.docsforadobe.dev/sequence/sequence/ (exportAsMediaDirect)
    rv = seq.exportAsMediaDirect(new File(dir + '/' + leaf + '.png').fsName, new File(pngPreset).fsName, 1);
    found = filesWithPrefix(dir, leaf);
    if (found.length) {
      res.ok = true;
      res.file = found[0];
      res.method = 'direct: ' + String(rv);
    } else {
      res.attempts.push('direct: no file, returned ' + String(rv));
    }
  } catch (e4) {
    res.attempts.push('direct: ' + String(e4));
  }
  try {
    if (oldIn && Number(oldIn.ticks) >= 0) {
      seq.setInPoint(oldIn);
    }
    if (oldOut && Number(oldOut.ticks) >= 0) {
      seq.setOutPoint(oldOut);
    }
  } catch (e5) {
    res.attempts.push('restore In/Out: ' + String(e5));
  }
  return res;
}

// After Effects has undo groups; whether Premiere ExtendScript has them is measured in S5, so both calls
// are guarded. One Ctrl+Z per click is the goal of spec section 6 (the bridge).
function undoBegin(label) {
  if (typeof app.beginUndoGroup === 'function') {
    app.beginUndoGroup(label);
    return true;
  }
  return false;
}

function undoEnd(opened) {
  if (opened && typeof app.endUndoGroup === 'function') {
    app.endUndoGroup();
  }
}

// ---- Stage scaffolding: check() wrappers shared by the S5-S7 stages ----

function projectCheck() {
  return check('active project is ' + PARAMS.projectFile, function () {
    return { pass: projectIs(PARAMS.projectFile), detail: String(app.project.path) };
  });
}

// Clones PARAMS.srcSeq as PARAMS.workBase (then _2, _3 ...) and activates it; sets data.workSeq(Id).
function workCloneCheck(data) {
  var seq = null;
  var ok = check('work clone of ' + PARAMS.srcSeq + ' is active', function () {
    var src = findSequenceByName(PARAMS.srcSeq);
    var c;
    if (!src) {
      return { pass: false, detail: 'no sequence ' + PARAMS.srcSeq + ' (Task 15)' };
    }
    c = cloneSequence(src, PARAMS.workBase);
    seq = c.seq;
    data.workSeq = c.name;
    data.workSeqId = c.id;
    return { pass: !!seq && activateSequence(seq), detail: { name: c.name, id: c.id, rv: c.rv } };
  });
  return ok ? seq : null;
}

// The clone an earlier stage made: by PARAMS.workSeqId, else by PARAMS.workSeq (its name).
function workSeqCheck(data) {
  var seq = null;
  var ok = check('work sequence of an earlier stage is active', function () {
    if (PARAMS.workSeqId) {
      seq = findSequenceById(PARAMS.workSeqId);
    }
    if (!seq && PARAMS.workSeq) {
      seq = findSequenceByName(PARAMS.workSeq);
    }
    data.workSeq = seq ? String(seq.name) : null;
    data.workSeqId = seq ? String(seq.sequenceID) : null;
    return {
      pass: !!seq && activateSequence(seq),
      detail: { found: data.workSeq, wanted: PARAMS.workSeqId || PARAMS.workSeq || null }
    };
  });
  return ok ? seq : null;
}

// One frame into data.frames[key] = <PARAMS.framesDir>/<key>.png; `frame` counts from the sequence start.
function frameCheck(seq, data, key, frame) {
  return check('frame ' + key + ' (' + frame + ') exported', function () {
    var r = exportFramePNG(seq, frame, PARAMS.framesDir + '/' + key, PARAMS.pngPreset, PARAMS.frameWaitMs);
    if (!data.frames) {
      data.frames = {};
    }
    if (r.ok) {
      data.frames[key] = r.file;
    }
    return { pass: r.ok, detail: { method: r.method, tc: r.tc, playhead: r.playhead, attempts: r.attempts } };
  });
}
