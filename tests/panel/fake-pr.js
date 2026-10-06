// A fake of the Premiere object model for panel/host/pr.jsx, evaluated INSIDE node:vm. Behaviour taken from
// spike S5 and the masters acceptance on Premiere 26.5.2:
// - importMGT overwrites the clips it covers on its track and places the MOGRT at its default length;
//   now and then a call places nothing (the fake drops the calls listed in __pr.drop);
// - trimming: outPoint first, then end;
// - MOGRT parameters by display name; Source Text reads as JSON with textEditValue; dropdowns from 0;
// - media (__pr.media): importFiles into a bin, overwriteClip at seconds snapped to the frame, a still lasts
//   5 s until it is cut; QE addTracks adds video or audio tracks.
var BridgeTalk = { appName: 'premierepro' };
var $ = { os: 'Windows/64 10.0', sleep: function () {} };
var TPS = 254016000000;

var __pr = { files: {}, folders: {}, mogrts: {}, media: {}, calls: [], drop: [], imports: 0, qe: true, exports: [], jobs: 0, effects: ['Crop', 'Fast Blur'], styles: {} };
var ProjectItemType = { CLIP: 1, BIN: 2, ROOT: 3, FILE: 4 };

function __norm(p) { return String(p).split('\\').join('/'); }

function File(p) {
  this._path = __norm(p);
  this.fsName = this._path;
  this.exists = __pr.files[this._path] !== undefined;
  this.length = this.exists ? 1000 : 0;
}
Object.defineProperty(File.prototype, 'parent', { get: function () { return new Folder(this._path.slice(0, this._path.lastIndexOf('/'))); } });

// Folders exist once created, or when a file lies in them.
function Folder(p) {
  this._path = __norm(p);
  this.fsName = this._path;
  var self = this._path;
  this.exists = __pr.folders[self] === true || Object.keys(__pr.files).some(function (f) { return f.indexOf(self + '/') === 0; });
}
Object.defineProperty(Folder.prototype, 'parent', { get: function () { var i = this._path.lastIndexOf('/'); return i > 0 ? new Folder(this._path.slice(0, i)) : null; } });
Folder.prototype.create = function () { __pr.folders[this._path] = true; this.exists = true; return true; };

function Time() { this.ticks = '0'; }
Object.defineProperty(Time.prototype, 'seconds', { get: function () { return Number(this.ticks) / TPS; } });
function __time(ticks) { var t = new Time(); t.ticks = String(ticks); return t; }

function __param(name, kind, value) {
  var p = { displayName: name, _kind: kind, _value: value };
  p.getValue = function () { return p._value; };
  p.setValue = function (v) {
    if (kind === 'text') {
      var o = JSON.parse(v);
      if (typeof o.textEditValue !== 'string') throw new Error('bad text');
    }
    p._value = v;
    __pr.calls.push('set ' + name);
    return true;
  };
  return p;
}

function __collection(list) {
  var c = { numItems: list.length };
  for (var i = 0; i < list.length; i++) c[i] = list[i];
  return c;
}

function TrackItem(name, startTicks, lenTicks, def) {
  this.name = name;
  this._start = startTicks;
  this._end = startTicks + lenTicks;
  this._in = 0;
  this._out = lenTicks;
  this._selected = false;
  var params = (def.params || []).map(function (d) {
    var v = d.kind === 'text' ? JSON.stringify({ textEditValue: d.value, fontTextRunLength: [String(d.value).length] }) : d.value;
    return __param(d.name, d.kind, v);
  });
  var props = __collection(params);
  props.getParamForDisplayName = function (n) {
    for (var i = 0; i < params.length; i++) if (params[i].displayName === n) return params[i];
    return null;
  };
  this._mgt = { properties: props };
  this._scale = __param('Scale', 'number', 100);
  this._position = __param('Position', 'point', [0.5, 0.5]);
  var motion = { matchName: 'AE.ADBE Motion', displayName: 'Motion', properties: __collection([this._position, this._scale]) };
  this._components = [{ matchName: 'AE.ADBE Opacity', displayName: 'Opacity', properties: __collection([]) }, motion];
  this._isMgt = false;
}
Object.defineProperty(TrackItem.prototype, 'components', { get: function () { return __collection(this._components); } });
TrackItem.prototype.isMGT = function () { return this._isMgt; };
// Crop as QE adds it (S7): matchName AE.ADBE AECrop, parameters Left, Top, Right, Bottom in percent.
function __crop() {
  return { matchName: 'AE.ADBE AECrop', displayName: 'Crop', properties: __collection(['Left', 'Top', 'Right', 'Bottom', 'Zoom', 'Edge Feather'].map(function (n) { return __param(n, 'number', n === 'Zoom' ? false : 0); })) };
}
// Fast Blur as QE adds it: matchName AE.ADBE Fast Blur; Blurriness, Blur Dimensions, Repeat Edge Pixels.
function __fastBlur() {
  return { matchName: 'AE.ADBE Fast Blur', displayName: 'Fast Blur', properties: __collection([__param('Blurriness', 'number', 0), __param('Blur Dimensions', 'number', 0), __param('Repeat Edge Pixels', 'bool', false)]) };
}
Object.defineProperty(TrackItem.prototype, 'start', { get: function () { return __time(this._start); } });
Object.defineProperty(TrackItem.prototype, 'end', {
  get: function () { return __time(this._end); },
  set: function (t) { this._end = Number(t.ticks); },
});
Object.defineProperty(TrackItem.prototype, 'inPoint', { get: function () { return __time(this._in); } });
Object.defineProperty(TrackItem.prototype, 'outPoint', {
  get: function () { return __time(this._out); },
  set: function (t) { this._out = Number(t.ticks); },
});
TrackItem.prototype.getMGTComponent = function () { return this._mgt; };
TrackItem.prototype.setSelected = function (on) { this._selected = !!on; };
TrackItem.prototype.isSelected = function () { return this._selected; };

function Track(name, seq) {
  this.name = name;
  this._clips = [];
  this._seq = seq;
}
Track.prototype.overwriteClip = function (item, sec) {
  var tpf = Number(this._seq.timebase);
  var start = Math.round(Number(sec) * TPS / tpf) * tpf;
  var m = __pr.media[item._path];
  var inT = item._inT || 0;
  var len = item._outT !== undefined ? item._outT - inT : Math.round((m.still ? 5 : m.sec) * TPS);
  __pr.calls.push('overwrite ' + item.name + ' ' + this.name + ' @' + Math.round(start / tpf));
  this._clips = this._clips.filter(function (c) { return !(c._start < start + len && c._end > start); });
  var clip = new TrackItem(item.name, start, len, { params: [] });
  clip.projectItem = item;
  clip._in = inT;
  clip._out = inT + len;
  this._clips.push(clip);
  // a video track brings the audio of the media along, onto the audio track of the same index
  if (m.audio && this.name.charAt(0) === 'V') {
    var at = this._seq._atracks[Number(this.name.slice(1)) - 1];
    var a = new TrackItem(item.name, start, len, { params: [] });
    a.projectItem = item;
    at._clips = at._clips.filter(function (c) { return !(c._start < start + len && c._end > start); });
    at._clips.push(a);
  }
  return true;
};
TrackItem.prototype.remove = function () {
  var self = this;
  var s = app.project.activeSequence;
  s._tracks.concat(s._atracks).forEach(function (t) { t._clips = t._clips.filter(function (c) { return c !== self; }); });
  __pr.calls.push('remove ' + this.name);
  return true;
};

function ProjectItem(name, type, path) {
  this.name = name;
  this.type = type;
  this._path = path || null;
  this._children = [];
}
Object.defineProperty(ProjectItem.prototype, 'children', { get: function () { return __collection(this._children); } });
ProjectItem.prototype.createBin = function (name) {
  var b = new ProjectItem(name, ProjectItemType.BIN);
  this._children.push(b);
  __pr.calls.push('createBin ' + name);
  return b;
};
ProjectItem.prototype.getMediaPath = function () { return this._path; };
// The frame size column of the project metadata, as Premiere writes it: «1920 x 1080 (1.0)».
ProjectItem.prototype.getProjectMetadata = function () {
  var m = __pr.media[this._path];
  if (!m || !m.w) return '<?xpacket?><rdf:RDF><premierePrivateProjectMetaData:Column.Intrinsic.MediaType>Audio</premierePrivateProjectMetaData:Column.Intrinsic.MediaType></rdf:RDF>';
  return '<?xpacket?><rdf:RDF><premierePrivateProjectMetaData:Column.Intrinsic.VideoInfo>' + m.w + ' x ' + m.h + ' (' + (m.par || '1.0') + ')</premierePrivateProjectMetaData:Column.Intrinsic.VideoInfo></rdf:RDF>';
};
ProjectItem.prototype.getInPoint = function () { return __time(this._inT || 0); };
ProjectItem.prototype.getOutPoint = function () {
  if (this._outT !== undefined) return __time(this._outT);
  var m = __pr.media[this._path];
  return __time(Math.round((m.still ? 5 : m.sec) * TPS));
};
// In and out of the source in seconds (mediaType 4: video and audio); the full range clears the marks.
ProjectItem.prototype.setInPoint = function (sec) { this._inT = Math.round(Number(sec) * TPS); };
ProjectItem.prototype.setOutPoint = function (sec) {
  var m = __pr.media[this._path];
  var t = Math.round(Number(sec) * TPS);
  if (m && t === Math.round((m.still ? 5 : m.sec) * TPS)) delete this._outT;
  else this._outT = t;
};
Object.defineProperty(Track.prototype, 'clips', {
  get: function () {
    this._clips.sort(function (a, b) { return a._start - b._start; });
    return __collection(this._clips);
  },
});

function Sequence(name, w, h, fps, tracks) {
  this.name = name;
  this.sequenceID = 'seq-' + name;
  this.frameSizeHorizontal = w;
  this.frameSizeVertical = h;
  this.timebase = String(Math.round(TPS / fps));
  this.end = String(TPS * 600);
  this._player = 0;
  this._outTicks = null;
  this._tracks = [];
  this._atracks = [];
  for (var i = 0; i < tracks; i++) {
    this._tracks.push(new Track('V' + (i + 1), this));
    this._atracks.push(new Track('A' + (i + 1), this));
  }
}
Object.defineProperty(Sequence.prototype, 'audioTracks', {
  get: function () {
    var c = __collection(this._atracks);
    c.numTracks = this._atracks.length;
    return c;
  },
});
Sequence.prototype.getInPointAsTime = function () { return __time(this._inTicks || 0); };
// Export (decision P19): the .epr must exist and the folder of the file too; the file appears at once.
Sequence.prototype.exportAsMediaDirect = function (out, epr, workArea) {
  if (__pr.files[__norm(epr)] === undefined) return 'Error: no preset';
  if (!new File(out).parent.exists) return 'Error: no folder';
  __pr.exports.push({ how: 'direct', seq: this.name, out: __norm(out), epr: __norm(epr), workArea: workArea });
  __pr.files[__norm(out)] = 'mp4';
  return 'No Error';
};
Sequence.prototype.getOutPointAsTime = function () { return __time(this._outTicks === null ? this.end : this._outTicks); };
Object.defineProperty(Sequence.prototype, 'videoTracks', {
  get: function () {
    var c = __collection(this._tracks);
    c.numTracks = this._tracks.length;
    return c;
  },
});
Sequence.prototype.getPlayerPosition = function () { return __time(this._player); };
Sequence.prototype.getSelection = function () {
  var out = [];
  this._tracks.forEach(function (t) { t._clips.forEach(function (c) { if (c._selected) out.push(c); }); });
  return out;
};
Sequence.prototype.importMGT = function (path, ticks, vIdx) {
  var p = __norm(path);
  __pr.imports += 1;
  __pr.calls.push('importMGT ' + p.slice(p.lastIndexOf('/') + 1) + ' V' + (vIdx + 1) + ' @' + ticks);
  if (__pr.drop.length && __pr.drop[0] === __pr.imports) {
    __pr.drop.shift();
    return null;
  }
  var name = p.slice(p.lastIndexOf('/') + 1).replace(/\.mogrt$/, '');
  var def = __pr.mogrts[name];
  var start = Number(ticks);
  var len = Math.round(def.lenSec * TPS);
  var track = this._tracks[vIdx];
  track._clips = track._clips.filter(function (c) { return !(c._start < start + len && c._end > start); });
  var clip = new TrackItem(name, start, len, def);
  clip._isMgt = true;
  track._clips.push(clip);
  return clip;
};

var __qeSeq = {
  addTracks: function (n, after, audio, audioType, audioAfter) {
    if (!__pr.qe) throw new Error('QE disabled');
    var s = app.project.activeSequence;
    __pr.calls.push('qe.addTracks ' + Array.prototype.slice.call(arguments).join(','));
    for (var i = 0; i < n; i++) s._tracks.push(new Track('V' + (s._tracks.length + 1), s));
    for (var j = 0; j < (audio || 0); j++) s._atracks.push(new Track('A' + (s._atracks.length + 1), s));
  },
};
// QE track items of the active sequence: addVideoEffect puts Crop onto the DOM clip; __pr.effects lists the
// names the fake knows (the language of the interface decides them in Premiere).
__qeSeq.getVideoTrackAt = function (i) {
  var clips = app.project.activeSequence._tracks[i]._clips;
  return {
    numItems: clips.length,
    getItemAt: function (k) {
      var c = clips[k];
      return { type: 'Clip', name: c.name, start: { secs: String(c._start / TPS) }, addVideoEffect: function (e) {
        if (e.name === 'Crop' || e.name === 'Обрезка') c._components.push(__crop());
        if (e.name === 'Fast Blur' || e.name === 'Быстрое размытие') c._components.push(__fastBlur());
        __pr.calls.push('qe.addVideoEffect ' + e.name + ' ' + c.name);
      } };
    },
  };
};
var qe = { project: {
  getActiveSequence: function () { return __qeSeq; },
  getVideoEffectByName: function (n) { return { name: __pr.effects.indexOf(n) >= 0 ? n : '' }; },
} };

var app = {
  version: '26.5.2',
  // AME: the job is queued, the file comes after startBatch (written at once here).
  encoder: {
    _queue: [],
    launchEncoder: function () { __pr.calls.push('launchEncoder'); return true; },
    encodeSequence: function (seq, out, epr, workArea, remove) {
      if (__pr.files[__norm(epr)] === undefined) return '0';
      __pr.jobs += 1;
      this._queue.push({ how: 'queue', seq: seq.name, out: __norm(out), epr: __norm(epr), workArea: workArea, remove: remove, job: String(__pr.jobs) });
      return String(__pr.jobs);
    },
    startBatch: function () {
      while (this._queue.length) { var j = this._queue.shift(); __pr.exports.push(j); __pr.files[j.out] = 'mp4'; }
      return true;
    },
  },
  build: '2',
  enableQE: function () {},
  project: {
    path: 'C:\\CRBK\\work\\pr\\edit.prproj',
    activeSequence: null,
    rootItem: new ProjectItem('root', ProjectItemType.ROOT),
    importFiles: function (paths, suppress, bin) {
      for (var i = 0; i < paths.length; i++) {
        var p = __norm(paths[i]);
        // a Track Style file (.prtextstyle) becomes an item named by the style inside it
        if (__pr.styles[p]) {
          __pr.calls.push('import style ' + p.slice(p.lastIndexOf('/') + 1) + ' -> ' + bin.name);
          bin._children.push(new ProjectItem(__pr.styles[p], 5, null));
          continue;
        }
        if (!__pr.media[p]) return false;
        __pr.imports += 1;
        __pr.calls.push('import ' + p.slice(p.lastIndexOf('/') + 1) + ' -> ' + bin.name);
        bin._children.push(new ProjectItem(p.slice(p.lastIndexOf('/') + 1), ProjectItemType.CLIP, p));
      }
      return true;
    },
  },
};

// Test setup helpers (not part of the Premiere model).
__pr.sequence = function (w, h, fps, tracks, playerSec) {
  var s = new Sequence('Edit', w, h, fps, tracks);
  s._player = Math.round((playerSec || 0) * TPS);
  app.project.activeSequence = s;
  return s;
};
__pr.mogrt = function (path, lenSec, params) {
  __pr.files[__norm(path)] = 'mogrt';
  var p = __norm(path);
  __pr.mogrts[p.slice(p.lastIndexOf('/') + 1).replace(/\.mogrt$/, '')] = { lenSec: lenSec, params: params };
};
__pr.occupy = function (trackIdx, fromSec, toSec, name, audio) {
  var s = app.project.activeSequence;
  var c = new TrackItem(name || 'footage', Math.round(fromSec * TPS), Math.round((toSec - fromSec) * TPS), { params: [] });
  (audio ? s._atracks : s._tracks)[trackIdx]._clips.push(c);
  return c;
};
__pr.addMedia = function (path, sec, still, w, h, par, audio) {
  __pr.files[__norm(path)] = 'media';
  __pr.media[__norm(path)] = { sec: sec, still: !!still, w: w, h: h, par: par, audio: !!audio };
};
__pr.addStyle = function (path, name) {
  __pr.files[__norm(path)] = 'style';
  __pr.styles[__norm(path)] = name;
};
// A clip of a media file on a video track, selected, for «вписать в окно».
__pr.clipOf = function (path, trackIdx, fromSec, selected) {
  var s = app.project.activeSequence;
  var name = __norm(path).slice(__norm(path).lastIndexOf('/') + 1);
  var m = __pr.media[__norm(path)];
  var c = new TrackItem(name, Math.round(fromSec * TPS), Math.round((m.sec || 5) * TPS), { params: [] });
  c.projectItem = new ProjectItem(name, ProjectItemType.CLIP, __norm(path));
  c._selected = !!selected;
  s._tracks[trackIdx]._clips.push(c);
  return c;
};
