// Cross-field rules of the library that a JSON Schema cannot express (spec 4.2, 4.4, 6.1). One copy serves the
// Node validator (validate.mjs) and the panel bundle (plan 2026-10-05 P8), so this module stays pure: no imports,
// no fs, no Ajv, no Node globals. Errors are strings: '<id>: <rule>: <message>' and 'schema: <path> <message>'.
// In the panel: checkLibrary(doc, 'catalog', validateCatalogSchema) with the standalone validator from
// panel/src/generated/catalog-validate.mjs gives the same result as validateLibrary(doc, 'catalog') in Node.

const ASPECTS = { '16x9': 16 / 9, '9x16': 9 / 16, '1x1': 1, '4x5': 4 / 5, '4x3': 4 / 3 };
const FILE_NAME = /^[A-Za-z0-9_-]+\.[a-z0-9]+$/;
// Switch keys are arbitrary ("constructor" is a valid one), so lookups never go through the prototype.
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const someKeys = (o) => Boolean(o) && Object.keys(o).length > 0;

/** @param {any} doc @returns {'source' | 'catalog'} */
export function detectKind(doc) {
  return doc && typeof doc === 'object' && 'libraryVersion' in doc ? 'catalog' : 'source';
}

/** @param {any} e one Ajv error object @returns {string} */
export function formatSchemaError(e) {
  const at = e.instancePath || '/';
  if (e.keyword === 'propertyNames') return `schema: ${at} unknown property "${e.params.propertyName}"`;
  if (e.keyword === 'additionalProperties') return `schema: ${at} unknown property "${e.params.additionalProperty}"`;
  return `schema: ${at} ${e.message}`;
}

/** @param {any[] | null | undefined} errors Ajv errors of one call @returns {string[]} */
export function schemaMessages(errors) {
  // Errors inside propertyNames carry e.propertyName; the propertyNames error itself names the property.
  return [...new Set((errors || []).filter((e) => e.propertyName === undefined).map(formatSchemaError))];
}

function checkItem(item, byId, kind, err) {
  const fields = item.fields || [];
  const variants = item.variants || [];
  const fieldByKey = new Map();
  for (const f of fields) {
    if (fieldByKey.has(f.key)) err('unique-keys', `field "${f.key}" is declared twice`);
    fieldByKey.set(f.key, f);
  }
  const variantByKey = new Map();
  for (const v of variants) {
    if (variantByKey.has(v.key)) err('unique-keys', `variant "${v.key}" is declared twice`);
    variantByKey.set(v.key, v);
  }

  // Values of switches used by variant options and window conditions.
  const checkSwitches = (where, values) => {
    for (const [k, val] of Object.entries(values || {})) {
      const f = fieldByKey.get(k);
      if (!f || (f.type !== 'dropdown' && f.type !== 'checkbox')) {
        err('switch-ref', `${where}: "${k}" is not a dropdown or checkbox field`);
      } else if (f.type === 'checkbox' && typeof val !== 'boolean') {
        err('switch-ref', `${where}: "${k}" needs true or false`);
      } else if (f.type === 'dropdown' && !(Number.isInteger(val) && val >= 1 && val <= f.options.length)) {
        err('switch-ref', `${where}: "${k}" needs an option index 1..${f.options.length}`);
      }
    }
  };

  // Fields.
  const driving = fields.filter((f) => f.drivesDuration);
  if (driving.length > 1) err('drives-duration', `${driving.length} fields drive the duration; at most one may`);
  const egpNames = new Set();
  for (const f of fields) {
    if (f.type === 'dropdown') {
      f.options.forEach((o, i) => {
        if (o.index !== i + 1) err('options-index', `field "${f.key}": options must be indexed 1..${f.options.length} in order`);
      });
    }
    if (f.drivesDuration && (f.type !== 'slider' || f.service)) {
      err('drives-duration', `field "${f.key}": only a visible slider can drive the duration`);
    }
    if (f.service) {
      if (f.editable !== false) err('service-field', `field "${f.key}": a service field must set "editable": false`);
      if (f.type !== 'slider') err('service-field', `field "${f.key}": a service field must be a slider`);
    }
    if (f.enabledBy !== undefined) {
      const g = fieldByKey.get(f.enabledBy);
      if (!g || g.type !== 'checkbox') err('enabled-by', `field "${f.key}": enabledBy "${f.enabledBy}" is not a checkbox field`);
    }
    if (f.hosts && f.hosts.some((h) => !item.hosts.includes(h))) {
      err('field-hosts', `field "${f.key}": hosts ${f.hosts.join(',')} are not all item hosts`);
    }
    if (item.tier === 'T1') {
      if (!f.egpName) err('egp-name', `field "${f.key}": a T1 field needs egpName`);
      else if (egpNames.has(f.egpName)) err('egp-name', `field "${f.key}": egpName "${f.egpName}" is used twice`);
      else egpNames.add(f.egpName);
    }
    if (f.type === 'slider' && !(f.min < f.max)) err('field-default', `field "${f.key}": min must be below max`);
    if (f.default !== undefined && f.default !== null) {
      const d = f.default;
      const bad =
        (f.type === 'text' && (typeof d !== 'string' || d.length > f.maxLen)) ||
        (f.type === 'checkbox' && typeof d !== 'boolean') ||
        (f.type === 'dropdown' && !(Number.isInteger(d) && d >= 1 && d <= f.options.length)) ||
        (f.type === 'slider' && !(typeof d === 'number' && d >= f.min && d <= f.max)) ||
        (f.type === 'media' && typeof d !== 'string');
      if (bad) err('field-default', `field "${f.key}": default ${JSON.stringify(d)} does not fit type ${f.type}`);
    }
    if (f.type === 'media' && f.accepts.includes('video') && item.fit !== 'trim') {
      err('media-fit', `field "${f.key}": a slot that accepts video makes the template fit "trim"`);
    }
  }

  // Essential Graphics order. A T1 item shows every field there, so egpIndex runs 0..n-1 over its n fields:
  // the MOGRT controls follow it (build-catalog checks that), and the future UXP adapter finds controls by it.
  // With no index missing, repeated or out of range the n indices cannot leave a gap.
  if (item.tier === 'T1') {
    const taken = new Set();
    for (const f of fields) {
      if (f.egpIndex === undefined) {
        if (f.egpName) err('egp-index', `field "${f.key}": a T1 field needs egpIndex`);
      } else if (taken.has(f.egpIndex)) {
        err('egp-index', `field "${f.key}": egpIndex ${f.egpIndex} is used twice`);
      } else {
        taken.add(f.egpIndex);
        if (f.egpIndex >= fields.length) err('egp-index', `field "${f.key}": egpIndex ${f.egpIndex} is outside 0..${fields.length - 1}`);
      }
    }
  }

  // Variants.
  // The panel picks a variant by the exact frame of the target (P1); two variants of one size make that a guess.
  // Pre-rendered T2/T3 media come as copies per switch value (spec 4.4: items x formats x options), so there two
  // variants of one size are fine when a switch that both set has different values; a switch set by only one of
  // them leaves both fitting. The T1 panel looks at the frame alone, so a T1 item keeps one variant per size.
  const apart = (a, b) => item.tier !== 'T1' && Object.keys(a || {}).some((k) => own(b || {}, k) && a[k] !== b[k]);
  const aeComps = new Set();
  const sized = [];
  for (const v of variants) {
    if (v.aspect && v.w && v.h && Math.abs(v.w / v.h - ASPECTS[v.aspect]) / ASPECTS[v.aspect] > 0.01) {
      err('aspect', `variant "${v.key}": ${v.w}x${v.h} is not ${v.aspect}`);
    }
    if (v.w && v.h) {
      const twin = sized.find((u) => u.w === v.w && u.h === v.h && !apart(u.options, v.options));
      if (twin) {
        const why = item.tier !== 'T1' && (someKeys(twin.options) || someKeys(v.options)) ? ', and no switch tells them apart' : '';
        err('variant-size', `variant "${v.key}": ${v.w}x${v.h} is already variant "${twin.key}"${why}`);
      }
      sized.push(v);
    }
    checkSwitches(`variant "${v.key}" options`, v.options);
    if (item.tier === 'T1' && item.hosts.includes('ae')) {
      if (!v.aeComp) {
        err('ae-comp', `variant "${v.key}": an AE-capable variant needs aeComp`);
      } else {
        const versioned = /_v[0-9]+$/.test(v.aeComp);
        if (kind === 'source' && versioned) err('ae-comp', `variant "${v.key}": aeComp in the source has no _vN, the pipeline adds it`);
        if (kind === 'catalog' && !v.aeComp.endsWith('_v' + item.version)) err('ae-comp', `variant "${v.key}": aeComp must end with _v${item.version}`);
        if (aeComps.has(v.aeComp)) err('ae-comp', `variant "${v.key}": aeComp "${v.aeComp}" is used twice`);
        aeComps.add(v.aeComp);
      }
    }
    if (v.parts) {
      const frames = (p) => (Array.isArray(p) ? p[1] - p[0] : p.frames);
      if (kind === 'source') {
        for (const [name, r] of Object.entries(v.parts)) {
          if (!(r[0] < r[1])) err('parts', `variant "${v.key}": part ${name} needs from < to`);
        }
        const order = ['intro', 'loop', 'outro'].filter((n) => v.parts[n]);
        for (let i = 1; i < order.length; i += 1) {
          if (v.parts[order[i - 1]][1] !== v.parts[order[i]][0]) err('parts', `variant "${v.key}": ${order[i - 1]} and ${order[i]} must be contiguous`);
        }
      }
      if (item.loop && v.parts.loop && frames(v.parts.loop) !== item.loop.periodFrames) {
        err('loop', `variant "${v.key}": the loop part has ${frames(v.parts.loop)} frames, the period is ${item.loop.periodFrames}`);
      }
    }
  }
  if (item.loop && new Set(variants.map((v) => v.fps)).size > 1) {
    err('loop', 'a looped item needs one fps across its variants');
  }
  // The durations (introSec, holdSec, outroSec) belong to the item, so its variants share one frame grid.
  // A looped item already has its own message above.
  const fpsList = [...new Set(variants.filter((v) => v.fps !== undefined).map((v) => v.fps))];
  if (!item.loop && fpsList.length > 1) err('fps', `the variants mix ${fpsList.join(', ')} fps; an item has one fps`);

  // Windows.
  for (const win of item.windows || []) {
    for (const r of win.rects) {
      const v = variantByKey.get(r.variant);
      if (!v) { err('windows', `window "${win.key}": no variant "${r.variant}"`); continue; }
      checkSwitches(`window "${win.key}" when`, r.when);
      if (v.w && v.h && (r.x < 0 || r.y < 0 || r.x + r.w > v.w || r.y + r.h > v.h)) {
        err('windows', `window "${win.key}": the rect leaves the ${v.w}x${v.h} frame of "${v.key}"`);
      }
    }
  }

  // Companions.
  for (const c of item.companions || []) {
    const ref = byId.get(c.ref);
    if (!ref || c.ref === item.id) { err('companion-ref', `companion "${c.ref}" does not exist`); continue; }
    if ((c.kind === 'music' || c.kind === 'sfx') && ref.category !== 'sounds') err('companion-kind', `companion "${c.ref}": ${c.kind} must be a sounds item`);
    if (c.kind === 'video' && (ref.tier === 'T1' || c.placement !== 'under')) err('companion-kind', `companion "${c.ref}": a video companion is T2/T3 and goes under`);
  }

  // Catalog files.
  if (kind === 'catalog') {
    const stored = [];
    for (const k of ['aep', 'preview', 'poster']) if (item[k]) stored.push(item[k].file);
    for (const v of variants) {
      if (v.file) stored.push(v.file);
      for (const p of Object.values(v.parts || {})) stored.push(p.file);
      if (item.tier === 'T1' && item.hosts.includes('pr') && !(v.file && v.file.endsWith('.mogrt'))) err('files', `variant "${v.key}": a Premiere T1 variant needs a .mogrt file`);
      if (item.tier === 'T2' && !v.file && !v.parts) err('files', `variant "${v.key}": a T2 variant needs a file or parts`);
    }
    if (item.tier === 'T1' && item.hosts.includes('ae') && !(item.aep && item.aep.file.endsWith('.aep'))) err('files', 'an AE T1 item needs its .aep');
    for (const f of stored) {
      const base = f.split('/').pop();
      if (base.length > 64 || !FILE_NAME.test(base)) err('file-name', `"${base}" must be ASCII [A-Za-z0-9_-] and at most 64 characters`);
    }
  }
}

/**
 * Cross-field rules only; they assume a schema-valid document.
 * @param {any} doc @param {'source' | 'catalog'} [kind] @returns {string[]}
 */
export function crossCheck(doc, kind = detectKind(doc)) {
  const errors = [];
  const items = doc.items || [];
  const byId = new Map();
  for (const it of items) {
    if (byId.has(it.id)) errors.push(`${it.id}: unique-id: the id is used twice`);
    byId.set(it.id, it);
  }
  for (const it of items) checkItem(it, byId, kind, (rule, msg) => errors.push(`${it.id}: ${rule}: ${msg}`));
  return errors;
}

/**
 * The schema first, then the cross-field rules, which run only on a schema-valid document.
 * validateSchema is an Ajv validate function: compiled at run time (validate.mjs) or standalone (the panel).
 * @param {any} doc
 * @param {'source' | 'catalog'} kind
 * @param {((doc: any) => boolean) & { errors?: any[] | null }} validateSchema
 * @returns {{ ok: boolean, kind: 'source' | 'catalog', errors: string[] }}
 */
export function checkLibrary(doc, kind, validateSchema) {
  const errors = validateSchema(doc) ? [] : schemaMessages(validateSchema.errors);
  if (!errors.length) errors.push(...crossCheck(doc, kind));
  return { ok: errors.length === 0, kind, errors };
}
