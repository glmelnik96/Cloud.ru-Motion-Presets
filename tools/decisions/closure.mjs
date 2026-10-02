// Phase 0 closure (task 30): the closure table of the spikes, the sign-off check of the decision sheets
// and contract rule C27 from the S3 result. Pure functions on strings and result objects; the CLI
// (closure-cli.mjs) reads and writes the files.

export const SPIKES = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11'];
export const PENDING = '—';

const esc = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

// Suggested phase outcome per spike verdict; partial is left to the user.
export function suggest(result) {
  const failed = (result.checks || []).filter((c) => !c.pass).map((c) => c.name);
  const fallback = result.fallback ? 'запасной: ' + result.fallback : 'запасной путь не записан';
  switch (result.verdict) {
    case 'yes': return { outcome: 'да', path: 'основной', failed };
    case 'no': return { outcome: 'нет', path: fallback, failed };
    case 'measured': return { outcome: 'замер', path: 'бюджет — после повтора на мастерах (A4)', failed };
    case 'not-run': return { outcome: 'не проводилась', path: fallback, failed };
    default: return { outcome: PENDING, path: PENDING, failed };
  }
}

export function closureRows(results) {
  const byId = new Map(results.map((r) => [r.id, r]));
  return SPIKES.map((id) => {
    const r = byId.get(id);
    if (!r) return { id, title: '', verdict: 'нет итога', failed: [], outcome: PENDING, path: PENDING };
    const s = suggest(r);
    return { id, title: r.title, verdict: r.verdict, failed: s.failed, outcome: s.outcome, path: s.path };
  });
}

export function renderClosure(rows, { date = '' } = {}) {
  const lines = [
    '# Закрытие фазы 0: итоги пробных сборок',
    '',
    '**Как заполнять.** «Итог фазы» — да, нет, замер или не проводилась. `partial` решает пользователь: да, если не '
      + 'прошли только проверки, которые не трогают основной путь; иначе нет и запасной путь. «Путь» — основной или '
      + 'запасной. «Решение пользователя» — «принято» или своё решение, с датой. «—» — решения ещё нет.',
    '',
    '**Сформировано:** ' + (date || 'дата прогона') + ' из `spikes/results/*.json` командой '
      + '`node tools/decisions/closure-cli.mjs --write`.',
    '',
    '| # | Что | Итог сборки | Не прошли | Итог фазы | Путь | Решение пользователя | Дата |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    const cells = [r.id, esc(r.title), esc(r.verdict), esc(r.failed.join('; ')), esc(r.outcome), esc(r.path), '', ''];
    lines.push('| ' + cells.join(' | ') + ' |');
  }
  return lines.join('\n') + '\n';
}

// Markdown tables: header cells and data rows; cells split on unescaped pipes.
export function parseTables(md) {
  const tables = [];
  let cur = null;
  for (const line of String(md).split(/\r?\n/)) {
    if (!line.startsWith('|')) {
      cur = null;
      continue;
    }
    const cells = line.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim());
    if (!cur) {
      cur = { header: cells, rows: [] };
      tables.push(cur);
    } else if (!cells.every((c) => /^:?-{3,}:?$/.test(c))) {
      cur.rows.push(cells);
    }
  }
  return tables;
}

// First cells of the rows that lack a decision or a date, in every table with both columns
// (header names compared case-insensitively).
export function unsignedRows(md) {
  const out = [];
  for (const t of parseTables(md)) {
    const header = t.header.map((h) => h.toLowerCase());
    const d = header.indexOf('решение пользователя');
    const dt = header.indexOf('дата');
    if (d === -1 || dt === -1) continue;
    for (const r of t.rows) if (!r[d] || r[d].startsWith(PENDING) || !r[dt]) out.push(r[0]);
  }
  return out;
}

// Contract rule C27: how AE fits an instance of a fit: rdt template to the insert length (S3 decides).
export const MECHANISMS = {
  rdt: 'растяжение слоя экземпляра (Time Stretch) до длины вставки; защищённые области шаблона '
    + '(интро и аутро) играют с исходной скоростью',
  remap: 'time remap на слое экземпляра: ключи 0→0, in→in, (L − (D − out))→out, L→D, где D — длина шаблона, '
    + 'L — длина вставки',
  'trim-only': 'не подгоняется: шаблон с `fit: rdt` вставляется в AE в своей длине, длину в AE меняет только '
    + '`fit: trim`; в Premiere RDT работает штатно',
};

export function fillC27(md, mechanism) {
  const text = MECHANISMS[mechanism];
  if (!text) throw new Error('unknown S3 mechanism: ' + mechanism + ' (expected ' + Object.keys(MECHANISMS).join(', ') + ')');
  const lines = String(md).split('\n');
  const i = lines.findIndex((l) => /^\|\s*C27\s*\|/.test(l));
  if (i === -1) throw new Error('rule C27 not found');
  const eol = lines[i].endsWith('\r') ? '\r' : '';
  const cells = lines[i].replace(/\r$/, '').split(/(?<!\\)\|/);
  if (cells.length < 7) throw new Error('rule C27 has fewer cells than expected');
  const how = cells[4];
  const k = how.indexOf('Механизм');
  const head = (k === -1 ? how : how.slice(0, k)).trim();
  cells[4] = ' ' + (head ? head + ' ' : '') + 'Механизм длины `fit: rdt` в AE: ' + text
    + ' (итог S3: mechanism = ' + mechanism + '). `fit: trim` — обрезка out point и запись «Длительности». ';
  lines[i] = cells.join('|') + eol;
  return lines.join('\n');
}

export const c27Filled = (md) => /^\|\s*C27\s*\|.*итог S3: mechanism = /m.test(String(md));

// Everything phase 0 needs before it closes; an empty list means it can close.
export function closureProblems({ results, closureMd, decisionsMd, contractMd, panelMd, logoGeometry }) {
  const problems = [];
  const have = new Set(results.map((r) => r.id));
  for (const id of SPIKES) if (!have.has(id)) problems.push('spike ' + id + ': no spikes/results/' + id + '.json');
  if (closureMd == null) {
    problems.push('docs/decisions/phase0-closure.md: missing (run --write)');
  } else {
    const t = parseTables(closureMd).find((x) => x.header.includes('Итог фазы'));
    for (const id of SPIKES) {
      const r = t && t.rows.find((x) => x[0] === id);
      if (!r) {
        problems.push('phase0-closure.md: no row ' + id);
        continue;
      }
      const outcome = r[t.header.indexOf('Итог фазы')];
      const way = r[t.header.indexOf('Путь')];
      if (!outcome || outcome.startsWith(PENDING)) problems.push('phase0-closure.md ' + id + ': «Итог фазы» not decided');
      if (!way || way.startsWith(PENDING)) problems.push('phase0-closure.md ' + id + ': «Путь» not decided');
    }
    for (const id of unsignedRows(closureMd)) problems.push('phase0-closure.md ' + id + ': not signed');
  }
  if (decisionsMd == null) problems.push('docs/decisions/phase0-decisions.md: missing');
  else for (const id of unsignedRows(decisionsMd)) problems.push('phase0-decisions.md ' + id + ': not signed');
  if (contractMd == null || !c27Filled(contractMd)) {
    problems.push('template-contract.md C27: mechanism from S3 not filled (run --fill-c27)');
  }
  if (panelMd == null) {
    problems.push('docs/decisions/panel-framework.md: missing (task 29)');
  } else {
    for (const t of parseTables(panelMd)) {
      for (const r of t.rows) {
        if (/^K\d+$/.test(r[0]) && (String(r[2]).startsWith(PENDING) || String(r[3]).startsWith(PENDING))) {
          problems.push('panel-framework.md ' + r[0] + ': not checked');
        }
      }
    }
  }
  if (!logoGeometry) problems.push('docs/research/logo-geometry.md: missing (plan 2, task 7)');
  return problems;
}
