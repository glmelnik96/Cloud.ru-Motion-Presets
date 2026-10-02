// S1: Essential Graphics by script (spec 3.1). Composed after check.jsx and ae-project.jsx. ES3.
// Opens a fresh copy of the fixture, first measures canAdd on a comp copy WITHOUT openInEssentialGraphics
// (third-party report premiere-pro-mcp #504), then adds the contract properties one by one: canAdd first,
// because a failed add raises a warning dialog. Reads controller names back, checks the protected-region
// markers and saves the result as PARAMS.egpAep for S2 and S3.
// Docs: https://ae-scripting.docsforadobe.dev/property/property/ (canAddToMotionGraphicsTemplate 15.0,
//       addToMotionGraphicsTemplateAs 16.1; documented types: checkbox, color, slider, source text;
//       "warning dialogs" when a property cannot be added)
//       https://ae-scripting.docsforadobe.dev/layer/avlayer/ (AVLayer.canAdd/addToMotionGraphicsTemplateAs, 18.0)
//       https://ae-scripting.docsforadobe.dev/item/compitem/ (openInEssentialGraphics; controller count and
//       getMotionGraphicsTemplateControllerName 16.1; the index base is not documented)
var S1 = { open: false, lt: null, hatch: null, base: null, order: null, added: {}, controllers: {}, noEgp: null, markers: null };

function s1Guard(fn) {
  return function () {
    if (!S1.open) {
      return { pass: false, detail: 'skipped: fixture not open' };
    }
    return fn();
  };
}

// The Property (or the AVLayer, for media replacement) that a contract spec points at.
function s1Target(comp, spec) {
  var L = bkLayer(comp, spec.layer);
  if (spec.kind === 'text') {
    return bkSourceText(L);
  }
  if (spec.kind === 'media') {
    return L;
  }
  return bkEffect(L, spec.effect, spec.matchName).property(1);
}

// canAdd, then addAs. Never calls add after canAdd said no: that is the call that shows a dialog.
// The docs mention the warning dialog for canAdd too, so both calls run with dialogs suppressed.
function s1Add(comp, spec) {
  var t = s1Target(comp, spec);
  var can = null;
  var ok = null;
  app.beginSuppressDialogs();
  try {
    can = t.canAddToMotionGraphicsTemplate(comp);
    if (can === true) {
      ok = t.addToMotionGraphicsTemplateAs(comp, spec.label);
    }
  } finally {
    app.endSuppressDialogs(false);
  }
  if (can !== true) {
    return { pass: false, detail: 'canAdd=' + String(can) + ', not added' };
  }
  if (ok === true) {
    S1.added[comp.name] = (S1.added[comp.name] || []).concat([spec.label]);
  }
  return { pass: ok === true, detail: 'canAdd=true, addAs=' + String(ok) };
}

// Reads names at base..base+count-1, returned in the order they were added. The docs give neither the
// index base nor the order; S1 learns both from index 1, which is valid for both bases once there are
// two controllers, so no call goes out of range. AE 26.5 (checked live 2026-10-02): base 1 and the
// newest controller first, so index 1 is the last one added.
function s1Names(comp, order) {
  var n = comp.motionGraphicsTemplateControllerCount;
  var names = [];
  for (var i = 0; i < n; i++) {
    names.push(comp.getMotionGraphicsTemplateControllerName(order.base + i));
  }
  if (order.reverse) {
    names.reverse();
  }
  return { count: n, base: order.base, reverse: order.reverse, names: names };
}

function s1LearnOrder(comp, added) {
  var n = comp.motionGraphicsTemplateControllerCount;
  if (n < 2 || added.length !== n) {
    return null;
  }
  var at1 = comp.getMotionGraphicsTemplateControllerName(1);
  if (at1 === added[0]) {
    return { base: 1, reverse: false };
  }
  if (at1 === added[1]) {
    return { base: 0, reverse: false };
  }
  if (at1 === added[n - 1]) {
    return { base: 1, reverse: true };
  }
  if (at1 === added[n - 2]) {
    return { base: 0, reverse: true };
  }
  return null;
}

function s1SameList(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

check('fixture opened from disk', function () {
  bkOpenProject(PARAMS.fixtureAep);
  S1.lt = bkComp(PARAMS.comps.lt);
  S1.hatch = bkComp(PARAMS.comps.hatch);
  S1.open = true;
  return { pass: true, detail: bkProjectPath() };
}, true);

if (S1.open) {
  app.beginUndoGroup('BK S1 essential graphics');
}

check('without openInEssentialGraphics: canAdd on a comp copy (report #504)', s1Guard(function () {
  var dup = S1.lt.duplicate();
  dup.name = PARAMS.comps.lt + '_noEGP';
  var can = null;
  app.beginSuppressDialogs();
  try {
    can = bkSourceText(bkLayer(dup, 'TXT_NAME')).canAddToMotionGraphicsTemplate(dup);
  } finally {
    app.endSuppressDialogs(false);
    dup.remove();
  }
  S1.noEgp = can;
  return { pass: can === true,
    detail: 'canAdd=' + String(can) + (can === true ? ' (report not reproduced)' : ' (report reproduced: always open the comp in EGP first)') };
}), false);

check('openInEssentialGraphics(' + PARAMS.comps.lt + ')', s1Guard(function () {
  S1.lt.openInEssentialGraphics();
  return { pass: true, detail: 'opened' };
}), true);

for (var s1i = 0; s1i < PARAMS.egp.lt.length; s1i++) {
  (function (spec) {
    check('add ' + spec.kind + ': ' + spec.layer + (spec.effect ? '/' + spec.effect : ''), s1Guard(function () {
      return s1Add(S1.lt, spec);
    }), spec.required);
  })(PARAMS.egp.lt[s1i]);
}

check('controller names read back intact (Cyrillic) in ' + PARAMS.comps.lt, s1Guard(function () {
  var added = S1.added[S1.lt.name] || [];
  S1.order = s1LearnOrder(S1.lt, added);
  S1.base = S1.order ? S1.order.base : null;
  if (S1.order === null) {
    return { pass: false, detail: { count: S1.lt.motionGraphicsTemplateControllerCount, added: added,
      at1: S1.lt.motionGraphicsTemplateControllerCount >= 2 ? S1.lt.getMotionGraphicsTemplateControllerName(1) : null } };
  }
  var r = s1Names(S1.lt, S1.order);
  S1.controllers[S1.lt.name] = r;
  return { pass: r.count === added.length && s1SameList(r.names, added), detail: r };
}), true);

check('openInEssentialGraphics(' + PARAMS.comps.hatch + ') and add slider Duration', s1Guard(function () {
  S1.hatch.openInEssentialGraphics();
  return s1Add(S1.hatch, PARAMS.egp.hatch[0]);
}), true);

check('controller name read back in ' + PARAMS.comps.hatch, s1Guard(function () {
  if (!S1.order) {
    return { pass: false, detail: 'index base unknown (see the lower third check)' };
  }
  var r = s1Names(S1.hatch, S1.order);
  S1.controllers[S1.hatch.name] = r;
  return { pass: r.count === 1 && r.names[0] === PARAMS.egp.hatch[0].label, detail: r };
}), true);

check('protected-region markers survive save and open', s1Guard(function () {
  var got = bkMarkers(S1.lt);
  S1.markers = got;
  var ok = got.length === PARAMS.markers.length;
  for (var i = 0; ok && i < got.length; i++) {
    ok = got[i].protectedRegion === true && got[i].comment === PARAMS.markers[i].comment &&
      Math.abs(got[i].time - PARAMS.markers[i].time) < 0.001 && Math.abs(got[i].duration - PARAMS.markers[i].duration) < 0.001;
  }
  return { pass: ok, detail: got };
}), true);

if (S1.open) {
  app.endUndoGroup();
}

check('saved as ' + PARAMS.egpAep, s1Guard(function () {
  var r = bkSaveAs(PARAMS.egpAep);
  return { pass: r.bytes > 0 && r.dirty === false, detail: r };
}), true);

var S1_DATA = { base: S1.base, reverse: S1.order ? S1.order.reverse : null, noEgpCanAdd: S1.noEgp, controllers: S1.controllers, markers: S1.markers, project: '' };
try {
  S1_DATA.project = bkProjectPath();
} catch (e) {
  S1_DATA.error = String(e);
}
finish(S1_DATA);
