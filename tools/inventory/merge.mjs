#!/usr/bin/env node
// Merges per-machine inventory JSON (tools/inventory/inventory.ps1 / inventory.sh) into one table and
// picks the weakest machine for S8: least RAM first, then the weakest GPU.
//   node tools/inventory/merge.mjs [docs/decisions/inventory] [more.json ...] [--out docs/decisions/inventory.md]
// A directory argument means every *.json inside it.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const KEY_FONTS = ['SBSansDisplay-Regular', 'SBSansDisplay-Semibold', 'SBSansDisplay-Bold', 'SBSansText-Regular'];
const INTEGRATED = /intel|uhd|iris|radeon\(tm\) graphics|microsoft basic/i;

const stripBom = (t) => (t.charCodeAt(0) === 0xfeff ? t.slice(1) : t);

export function loadInventories(args) {
  const files = [];
  for (const a of args) {
    if (statSync(a).isDirectory()) {
      for (const n of readdirSync(a).filter((x) => x.endsWith('.json')).sort()) files.push(path.join(a, n));
    } else {
      files.push(a);
    }
  }
  return files.map((f) => ({ ...JSON.parse(stripBom(readFileSync(f, 'utf8'))), sourceFile: f }));
}

// Dedicated VRAM in GB; Apple GPUs report cores, not VRAM: cores / 2 puts an 8-core M1 at 4 and a
// 19-core M2 Pro at 9.5. Integrated PC graphics count as 0. A machine scores by its best GPU.
function scoreOf(g) {
  if (/apple/i.test(g.name || '') && g.cores) return g.cores / 2;
  if (!INTEGRATED.test(g.name || '') && g.vramGB) return g.vramGB;
  return 0;
}

export function bestGpu(m) {
  let best = null;
  for (const g of m.gpus || []) if (!best || scoreOf(g) > scoreOf(best)) best = g;
  return best;
}

export function gpuScore(m) {
  const g = bestGpu(m);
  return g ? scoreOf(g) : 0;
}

export function pickWeakest(machines) {
  const sorted = [...machines].sort((a, b) => (a.ramGB ?? Infinity) - (b.ramGB ?? Infinity) || gpuScore(a) - gpuScore(b));
  return sorted[0] || null;
}

const versions = (list) => (list || []).map((a) => a.version || '?').join(', ') || 'нет';
const esc = (s) => String(s == null ? '—' : s).replace(/\|/g, '\\|');

export function fontBuilds(m) {
  if (!Array.isArray(m.fonts)) return null;
  const out = {};
  for (const ps of KEY_FONTS) {
    const f = m.fonts.find((x) => x.postScriptName === ps);
    out[ps] = f ? f.version : null;
  }
  return out;
}

function fontCell(m) {
  const b = fontBuilds(m);
  if (!b) return `файлов SBSans: ${(m.sbSansFiles || []).length} (сборки без Node не читались)`;
  return KEY_FONTS.map((ps) => `${ps.replace('SBSans', '')} ${b[ps] || 'НЕТ'}`).join('; ');
}

export function renderInventory(machines) {
  const lines = [
    '# Инвентаризация машин команды (D20)',
    '',
    'Собрано командой `node tools/inventory/merge.mjs`; исходники — `docs/decisions/inventory/*.json`. Руками не править: поправить JSON и пересобрать.',
    '',
    '| Машина | ОС | Модель | CPU | GPU | RAM, ГБ | AE | Pr | AME | CC desktop | UPIA | PlayerDebugMode 11/12 | SB Sans (сборки) | Вход Adobe ID |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const m of machines) {
    const gpu = (m.gpus || []).map((g) => g.name + (g.vramGB ? ` ${g.vramGB} ГБ` : g.cores ? ` ${g.cores} ядер` : '')).join(' + ');
    const os = m.os ? `${m.os.name || ''} ${m.os.version || ''} (${m.os.build || ''})`.trim() : null;
    const cpu = m.cpu ? `${m.cpu.name} (${m.cpu.cores}/${m.cpu.threads})` : null;
    const cep = m.cep ? `${m.cep['CSXS.11'] || '—'}/${m.cep['CSXS.12'] || '—'}` : null;
    const signed = m.manual && m.manual.adobeIdSignedIn != null ? (m.manual.adobeIdSignedIn ? 'да' : 'нет') : 'спросить';
    lines.push(`| ${esc(m.label || m.hostname)} | ${esc(os)} | ${esc(m.model)} | ${esc(cpu)} | ${esc(gpu)} | ${esc(m.ramGB)} | ` +
      `${esc(versions(m.adobe && m.adobe.afterEffects))} | ${esc(versions(m.adobe && m.adobe.premiere))} | ${esc(versions(m.adobe && m.adobe.mediaEncoder))} | ` +
      `${m.creativeCloud && m.creativeCloud.present ? esc(m.creativeCloud.version || 'есть') : 'нет'} | ${m.upia && m.upia.present ? 'есть' : 'нет'} | ` +
      `${esc(cep)} | ${esc(fontCell(m))} | ${signed} |`);
  }

  const weakest = pickWeakest(machines);
  lines.push('', '## Самая слабая машина для S8', '');
  if (weakest) {
    lines.push(`**${weakest.label || weakest.hostname}**: RAM ${weakest.ramGB} ГБ, GPU ${(bestGpu(weakest) || {}).name || '—'} (оценка GPU ${gpuScore(weakest)}).`);
  }
  lines.push('', 'Правило: меньше RAM; при равной RAM — слабее GPU (выделенная VRAM в ГБ; у Apple — число ядер GPU / 2; встроенная графика ПК = 0). Пользователь может выбрать другую машину в D20.');

  lines.push('', '## Расхождения', '');
  const diffs = [];
  for (const ps of KEY_FONTS) {
    const seen = new Map();
    for (const m of machines) {
      const b = fontBuilds(m);
      if (!b) continue;
      const v = b[ps] || 'нет';
      if (!seen.has(v)) seen.set(v, []);
      seen.get(v).push(m.label || m.hostname);
    }
    if (seen.size > 1) diffs.push(`- ${ps}: ` + [...seen].map(([v, who]) => `${v} — ${who.join(', ')}`).join('; '));
  }
  for (const [key, title] of [['afterEffects', 'After Effects'], ['premiere', 'Premiere']]) {
    const set = new Set(machines.map((m) => versions(m.adobe && m.adobe[key])));
    if (set.size > 1) diffs.push(`- ${title}: ` + machines.map((m) => `${m.label || m.hostname} ${versions(m.adobe && m.adobe[key])}`).join('; '));
  }
  lines.push(diffs.length ? diffs.join('\n') : 'Нет.');
  return lines.join('\n') + '\n';
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf('--out');
  const out = outIdx === -1 ? null : argv[outIdx + 1];
  const inputs = argv.filter((a, i) => outIdx === -1 || (i !== outIdx && i !== outIdx + 1));
  const machines = loadInventories(inputs.length ? inputs : ['docs/decisions/inventory']);
  const md = renderInventory(machines);
  if (out) {
    writeFileSync(out, md, 'utf8');
    const w = pickWeakest(machines);
    console.log(`written ${out}: ${machines.length} machines; weakest for S8: ${w ? w.label || w.hostname : '—'}`);
  } else {
    process.stdout.write(md);
  }
}
