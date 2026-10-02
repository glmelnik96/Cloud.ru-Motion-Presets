// A tiny fake of the After Effects object model, enough to run tools/dump/dump-project.jsx in node:vm.
// It is evaluated INSIDE the vm context, so arrays and classes belong to the same realm as the JSX.
// Only the API surface the dumper reads is modelled; enum numbers are arbitrary but distinct.
var PropertyValueType = { NO_VALUE: 6412, ThreeD_SPATIAL: 6413, ThreeD: 6414, TwoD_SPATIAL: 6415, TwoD: 6416, OneD: 6417,
  COLOR: 6418, CUSTOM_VALUE: 6419, MARKER: 6420, LAYER_INDEX: 6421, MASK_INDEX: 6422, SHAPE: 6423, TEXT_DOCUMENT: 6424 };
var PropertyType = { PROPERTY: 6212, INDEXED_GROUP: 6213, NAMED_GROUP: 6214 };
var KeyframeInterpolationType = { LINEAR: 6612, BEZIER: 6613, HOLD: 6614 };
var BlendingMode = { NORMAL: 5212, ADD: 5220, SCREEN: 5222, MULTIPLY: 5216 };
var TrackMatteType = { ALPHA: 5012, ALPHA_INVERTED: 5013, LUMA: 5014, LUMA_INVERTED: 5015, NO_TRACK_MATTE: 5016 };
var MaskMode = { NONE: 6812, ADD: 6813, SUBTRACT: 6814, INTERSECT: 6815 };
var LayerQuality = { BEST: 4614, DRAFT: 4613, WIREFRAME: 4612 };
var ParagraphJustification = { LEFT_JUSTIFY: 7413, RIGHT_JUSTIFY: 7414, CENTER_JUSTIFY: 7415 };
var CloseOptions = { DO_NOT_SAVE_CHANGES: 1212, PROMPT_TO_SAVE_CHANGES: 1213, SAVE_CHANGES: 1214 };
var $ = { os: 'Windows/64 10.0' };

var __files = {};
var __calls = [];
var __existing = {};

function File(p) {
  this._path = p;
  this.fsName = String(p).replace(/\//g, '\\');
  this.encoding = '';
  this.lineFeed = '';
  this.error = '';
  this.exists = __existing[p] === true;
}
File.prototype.open = function () { this._buf = ''; return true; };
File.prototype.write = function (s) { this._buf += s; return true; };
File.prototype.close = function () { __files[this._path] = this._buf; return true; };

function Prop(o) {
  this.matchName = o.matchName;
  this.name = o.name || o.matchName;
  this.propertyIndex = 0;
  this.propertyType = PropertyType.PROPERTY;
  this.propertyValueType = PropertyValueType[o.pvt || 'OneD'];
  this.isModified = o.modified !== false;
  this.canSetExpression = o.pvt !== 'NO_VALUE' && o.pvt !== 'CUSTOM_VALUE';
  this.expression = o.expression || '';
  this.expressionEnabled = !!o.expression;
  this.expressionError = o.expressionError || '';
  this.isSeparationLeader = !!o.leader;
  this.dimensionsSeparated = false;
  this.isSeparationFollower = false;
  this.isSpatial = !!o.spatial;
  this._value = o.value;
  this._keys = o.keys || [];
  if (o.canSetEnabled) { this.canSetEnabled = true; this.enabled = o.enabled !== false; }
}
Prop.prototype = {
  get numKeys() { return this._keys.length; },
  valueAtTime: function () { if (this.propertyValueType === PropertyValueType.CUSTOM_VALUE) { throw new Error('custom'); } return this._value; },
  keyTime: function (k) { return this._keys[k - 1].time; },
  keyValue: function (k) { return this._keys[k - 1].value; },
  keyInInterpolationType: function (k) { return KeyframeInterpolationType[this._keys[k - 1].interp || 'LINEAR']; },
  keyOutInterpolationType: function (k) { return KeyframeInterpolationType[this._keys[k - 1].interp || 'LINEAR']; },
  keyInTemporalEase: function () { return [{ speed: 0, influence: 16.666666666 }]; },
  keyOutTemporalEase: function () { return [{ speed: 0, influence: 33.3333333 }]; },
  keyTemporalContinuous: function () { return false; },
  keyTemporalAutoBezier: function () { return false; },
  keyInSpatialTangent: function () { this._spatialOnly(); return [0, 0, 0]; },
  keyOutSpatialTangent: function () { this._spatialOnly(); return [0, 0, 0]; },
  keySpatialContinuous: function () { this._spatialOnly(); return false; },
  keySpatialAutoBezier: function () { this._spatialOnly(); return false; },
  keyRoving: function () { this._spatialOnly(); return false; },
  keyLabel: function () { return 0; },
  _spatialOnly: function () { if (!this.isSpatial) { throw new Error('not a spatial property'); } }
};

function Group(o) {
  var i;
  this.matchName = o.matchName;
  this.name = o.name || o.matchName;
  this.propertyIndex = 0;
  this.propertyType = PropertyType[o.type || 'NAMED_GROUP'];
  this._children = o.children || [];
  for (i = 0; i < this._children.length; i++) { this._children[i].propertyIndex = i + 1; }
  if (o.canSetEnabled) { this.canSetEnabled = true; this.enabled = o.enabled !== false; }
  if (o.extra) { for (i in o.extra) { this[i] = o.extra[i]; } }
}
Group.prototype = {
  get numProperties() { return this._children.length; },
  property: function (key) {
    var i;
    if (typeof key === 'number') { return this._children[key - 1]; }
    for (i = 0; i < this._children.length; i++) {
      if (this._children[i].matchName === key || this._children[i].name === key) { return this._children[i]; }
    }
    return null;
  }
};

function MarkerProp(list) { this._list = list; }
MarkerProp.prototype = {
  get numKeys() { return this._list.length; },
  keyTime: function (k) { return this._list[k - 1].time; },
  keyValue: function (k) { return this._list[k - 1].value; }
};

function TextDocument(o) { var k; for (k in o) { this[k] = o[k]; } }
Object.defineProperty(TextDocument.prototype, 'strokeColor', {
  get: function () { if (!this.applyStroke) { throw new Error('strokeColor: applyStroke is false'); } return this._strokeColor; }
});

function CompItem() {}
function FolderItem() {}
function FootageItem() {}
function SolidSource() {}
function FileSource() {}
function PlaceholderSource() {}
function AVLayer() {}
function ShapeLayer() {}
function TextLayer() {}
function CameraLayer() {}
function LightLayer() {}

function make(Cls, o) { var x = new Cls(), k; for (k in o) { x[k] = o[k]; } return x; }

function makeLayer(Cls, o, groups) {
  var L = make(Cls, o);
  var g = new Group({ matchName: o.matchName || 'ADBE AV Layer', children: groups });
  L._group = g;
  L.numProperties = groups.length;
  L.property = function (key) { return g.property(key); };
  return L;
}

function transformGroup(pos, posKeys) {
  return new Group({ matchName: 'ADBE Transform Group', name: 'Transform', children: [
    new Prop({ matchName: 'ADBE Anchor Point', pvt: 'ThreeD_SPATIAL', spatial: true, value: [0, 0, 0] }),
    new Prop({ matchName: 'ADBE Position', pvt: 'ThreeD_SPATIAL', spatial: true, leader: true, value: pos, keys: posKeys }),
    new Prop({ matchName: 'ADBE Scale', pvt: 'ThreeD', value: [100, 100, 100] }),
    new Prop({ matchName: 'ADBE Opacity', pvt: 'OneD', value: 100 })
  ] });
}
