// A fake of the Premiere object model for panel/host/pr.jsx, evaluated INSIDE node:vm. Behaviour taken from
// spike S5 and the masters acceptance on Premiere 26.5.2:
// - importMGT overwrites the clips it covers on its track and places the MOGRT at its default length;
//   now and then a call places nothing (the fake drops the calls listed in __pr.drop);
// - trimming: outPoint first, then end;
// - MOGRT parameters by display name; Source Text reads as JSON with textEditValue; dropdowns from 0.
var BridgeTalk = { appName: 'premierepro' };
var $ = { os: 'Windows/64 10.0', sleep: function () {} };
var TPS = 254016000000;

var __pr = { files: {}, mogrts: {}, calls: [], drop: [], imports: 0, qe: true };

function __norm(p) { return String(p).split('\\').join('/'); }

function File(p) {
  this._path = __norm(p);
  this.fsName = this._path;
  this.exists = __pr.files[this._path] !== undefined;
}

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
  var motion = { matchName: 'AE.ADBE Motion', displayName: 'Motion', properties: __collection([__param('Position', 'point', [0.5, 0.5]), this._scale]) };
  this.components = __collection([{ matchName: 'AE.ADBE Opacity', displayName: 'Opacity', properties: __collection([]) }, motion]);
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

function Track(name) {
  this.name = name;
  this._clips = [];
}
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
  this._tracks = [];
  for (var i = 0; i < tracks; i++) this._tracks.push(new Track('V' + (i + 1)));
}
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
  track._clips.push(clip);
  return clip;
};

var __qeSeq = {
  addTracks: function (n, after, audio) {
    if (!__pr.qe) throw new Error('QE disabled');
    __pr.calls.push('qe.addTracks ' + n + ',' + after + ',' + audio);
    for (var i = 0; i < n; i++) app.project.activeSequence._tracks.push(new Track('V' + (app.project.activeSequence._tracks.length + 1)));
  },
};
var qe = { project: { getActiveSequence: function () { return __qeSeq; } } };

var app = {
  version: '26.5.2',
  build: '2',
  enableQE: function () {},
  project: { path: 'C:\\CRBK\\work\\pr\\edit.prproj', activeSequence: null },
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
__pr.occupy = function (trackIdx, fromSec, toSec, name) {
  var s = app.project.activeSequence;
  var c = new TrackItem(name || 'footage', Math.round(fromSec * TPS), Math.round((toSec - fromSec) * TPS), { params: [] });
  s._tracks[trackIdx]._clips.push(c);
  return c;
};
