// S9 spike: MOGRT text and dropdown through UXP in Premiere (Beta) 27.
// Command "Run S9": insert CRT_LowerThird_v1.mogrt at 00:00 on V1 of the active sequence, write the name
// field through MogrtText.setText (Cyrillic) and the "Стиль" dropdown through a number keyframe, read both
// back and save a JSON report to the plugin data folder (its path is printed to the UDT console).
// API: @adobe/premierepro 27.0.0-beta (MogrtText since beta.22, https://github.com/adobe/premierepro-types/pull/90);
// patterns from https://github.com/AdobeDocs/uxp-premiere-pro-samples/tree/main/sample-panels/premiere-api/src
// (sequenceEditor.ts: insertMogrtFromPath inside lockedAccess; keyframe.ts: 'AE.ADBE Capsule',
// createKeyframe + createSetValueAction inside lockedAccess/executeTransaction).
const ppro = require('premierepro');
const uxp = require('uxp');
const os = require('os');

const MOGRT = os.platform() === 'darwin'
  ? '/Users/Shared/CRBK/work/mogrt/CRT_LowerThird_v1.mogrt'
  : 'C:/CRBK/work/mogrt/CRT_LowerThird_v1.mogrt';
const TEXT_VALUE = 'Проверка ЁЙ ёй S9';
const NAME_LABEL = 'Имя';
const STYLE_LABEL = 'Стиль';

function step(report, name, ok, ms, detail) {
  report.steps.push({ name, ok, ms, detail: detail || '' });
}

function kindOf(v) {
  if (v === null || v === undefined) return 'null';
  if (ppro.MogrtText && v instanceof ppro.MogrtText) return 'MogrtText';
  if (typeof v.getText === 'function' && typeof v.setText === 'function') return 'MogrtText';
  if (typeof v.getText === 'function') return 'MogrtComment';
  if ('red' in v && 'green' in v && 'blue' in v) return 'Color';
  if ('value' in v) return 'Keyframe';
  return 'other';
}

function plain(v, kind) {
  try {
    if (kind === 'MogrtText' || kind === 'MogrtComment') return v.getText();
    if (kind === 'Color') return [v.red, v.green, v.blue, v.alpha];
    if (kind === 'Keyframe') {
      const w = v.value;
      return w !== null && typeof w === 'object' && 'value' in w ? w.value : w;
    }
  } catch (e) {
    return 'ERR ' + e.message;
  }
  return null;
}

async function insertMogrt(project, sequence, report) {
  const editor = ppro.SequenceEditor.getEditor(sequence);
  const track = await sequence.getVideoTrack(0);
  const before = track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false).length;
  if (before !== 0) throw new Error('V1 is not empty (' + before + ' clips): use an empty sequence');
  let items = [];
  const t0 = Date.now();
  project.lockedAccess(() => {
    // An immediate call, not an Action: it is not part of a transaction (Adobe sample does the same).
    items = editor.insertMogrtFromPath(MOGRT, ppro.TickTime.TIME_ZERO, 0, 0);
  });
  step(report, 'insertMogrtFromPath', Array.isArray(items) && items.length > 0, Date.now() - t0, (items ? items.length : 0) + ' items returned');
  return items || [];
}

async function findCapsule(sequence, items, report) {
  let candidates = items;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    if (!candidates.length) {
      candidates = (await sequence.getVideoTrack(0)).getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
    }
    for (const it of candidates) {
      if (typeof it.getComponentChain !== 'function') continue;
      const chain = await it.getComponentChain();
      for (let i = 0; i < chain.getComponentCount(); i += 1) {
        const comp = chain.getComponentAtIndex(i);
        if ((await comp.getMatchName()) === 'AE.ADBE Capsule') {
          step(report, 'find AE.ADBE Capsule', true, 0, 'attempt ' + attempt + ', component ' + i);
          return comp;
        }
      }
    }
    candidates = [];
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  step(report, 'find AE.ADBE Capsule', false, 0, 'not found after 10 attempts');
  throw new Error('AE.ADBE Capsule not found');
}

async function dumpParams(capsule) {
  const out = [];
  for (let i = 0; i < capsule.getParamCount(); i += 1) {
    const p = capsule.getParam(i);
    const row = { index: i, displayName: null, kind: 'null', value: null, error: null };
    try { row.displayName = p.displayName; } catch (e) { row.error = 'displayName: ' + e.message; }
    try {
      const v = await p.getStartValue();
      row.kind = kindOf(v);
      row.value = plain(v, row.kind);
    } catch (e) {
      row.error = (row.error ? row.error + '; ' : '') + 'getStartValue: ' + e.message;
    }
    out.push(row);
  }
  return out;
}

function pickText(params) {
  const byName = params.find((p) => p.displayName === NAME_LABEL);
  if (byName) return { index: byName.index, by: 'displayName' };
  const byKind = params.find((p) => p.kind === 'MogrtText');
  return byKind ? { index: byKind.index, by: 'first MogrtText' } : null;
}

// The dropdown is found by its Essential Graphics name only: a guess by position would assume that every
// S1 field exists, in S1's order. Without the name, runS9 reports the names it saw instead.
function pickStyle(params) {
  const byName = params.find((p) => p.displayName === STYLE_LABEL);
  return byName ? { index: byName.index, by: 'displayName' } : null;
}

async function writeText(project, capsule, pick, report) {
  const p = capsule.getParam(pick.index);
  const mt = await p.getStartValue();
  report.text = { index: pick.index, by: pick.by, kind: kindOf(mt) };
  if (report.text.kind !== 'MogrtText') throw new Error('param ' + pick.index + ' is not MogrtText');
  report.text.before = mt.getText();
  report.text.uniform = typeof mt.isUniformStyling === 'function' ? mt.isUniformStyling() : null;
  report.text.written = TEXT_VALUE;
  project.lockedAccess(() => {
    mt.setText(TEXT_VALUE);
    const kf = p.createKeyframe(mt);
    report.text.transaction = project.executeTransaction((compound) => {
      compound.addAction(p.createSetValueAction(kf, true));
    }, 'BK S9 text');
  });
  const after = await p.getStartValue();
  report.text.readback = kindOf(after) === 'MogrtText' ? after.getText() : null;
  report.text.ok = report.text.readback === TEXT_VALUE;
}

async function writeDropdown(project, capsule, pick, report) {
  const p = capsule.getParam(pick.index);
  const v0 = await p.getStartValue();
  const before = plain(v0, kindOf(v0));
  // Default item 1 (Dark) reads as 0 or 1 depending on the index base; +1 selects Light in both cases.
  const target = typeof before === 'number' ? (before <= 1 ? before + 1 : before - 1) : 1;
  report.dropdown = { index: pick.index, by: pick.by, kind: kindOf(v0), before, written: target };
  project.lockedAccess(() => {
    const kf = p.createKeyframe(target);
    report.dropdown.transaction = project.executeTransaction((compound) => {
      compound.addAction(p.createSetValueAction(kf, true));
    }, 'BK S9 dropdown');
  });
  const v1 = await p.getStartValue();
  report.dropdown.readback = plain(v1, kindOf(v1));
  report.dropdown.ok = report.dropdown.readback === target;
}

async function saveReport(report) {
  const lfs = uxp.storage.localFileSystem;
  const folder = await lfs.getDataFolder();
  const file = await folder.createFile('s9-report.json', { overwrite: true });
  await file.write(JSON.stringify(report, null, 2));
  let where = null;
  try { where = lfs.getNativePath(file); } catch (e) { where = file.nativePath || file.name; }
  console.log('S9 report: ' + where);
}

async function runS9() {
  const report = {
    spike: 'S9',
    createdAt: new Date().toISOString(),
    host: { name: uxp.host.name, version: uxp.host.version, uiLocale: uxp.host.uiLocale },
    uxp: uxp.versions ? uxp.versions.uxp : null,
    platform: os.platform(),
    mogrtPath: MOGRT,
    steps: [],
    params: [],
    text: null,
    dropdown: null,
    error: null,
  };
  try {
    const project = await ppro.Project.getActiveProject();
    if (!project) throw new Error('no active project');
    const sequence = await project.getActiveSequence();
    if (!sequence) throw new Error('no active sequence');
    const items = await insertMogrt(project, sequence, report);
    const capsule = await findCapsule(sequence, items, report);
    report.params = await dumpParams(capsule);
    const t = pickText(report.params);
    if (!t) throw new Error('no MogrtText parameter among ' + report.params.length);
    await writeText(project, capsule, t, report);
    const s = pickStyle(report.params);
    if (s) {
      await writeDropdown(project, capsule, s, report);
    } else {
      // A failed dropdown check in Node, not an exception: the check lists these names.
      report.dropdown = { ok: false, by: 'displayName', missing: STYLE_LABEL, seen: report.params.map((p) => p.displayName) };
      console.error('S9: no parameter named "' + STYLE_LABEL + '"; seen: ' + report.dropdown.seen.join(', '));
    }
  } catch (e) {
    report.error = String(e && e.message ? e.message : e);
    console.error('S9 failed: ' + report.error);
  }
  await saveReport(report);
}

uxp.entrypoints.setup({
  commands: {
    runS9,
  },
});
