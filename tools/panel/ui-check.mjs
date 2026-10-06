#!/usr/bin/env node
// End-to-end check of the real panel (spec 8.3 «живые прогоны панели»): the dev install of
// tools/panel/install-dev.mjs opens DevTools of the panel on 8101 (AE) and 8102 (Premiere); this script
// drives its page like a user — opens «Подпись спикера», types a name, picks a style, clicks «Вставить на
// плейхед» — and checks in the host, through the BrandKit Dev panel (8094/8096), that the insert is there.
//   node tools/panel/ui-check.mjs --host ae|pr
// Screenshots and the report: docs/research/panel-live/<host>-ui-*.png, <host>-ui-report.json.
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../host-run.mjs';
import { getPageTarget } from '../lib/cdp.mjs';
import { workPath } from '../lib/work.mjs';
import { composeProbe } from '../spike/runner.mjs';
import { presetSources, stagePreset } from '../pr/env.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PANEL_PORTS = { ae: 8101, pr: 8102 };

// A DevTools session on one page: send(method, params) -> result.
export function cdpSession(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.onerror = (e) => reject(new Error('CDP_WS_ERROR: ' + ((e && e.message) || e)));
    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      if (data.error) p.reject(new Error('CDP_ERROR: ' + JSON.stringify(data.error)));
      else p.resolve(data.result);
    };
    ws.onopen = () => resolve({
      send(method, params = {}) {
        id += 1;
        ws.send(JSON.stringify({ id, method, params }));
        return new Promise((res, rej) => pending.set(id, { resolve: res, reject: rej }));
      },
      close() {
        ws.close();
      },
    });
  });
}

export async function evaluate(s, expression) {
  const r = await s.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}

export async function waitFor(s, expression, { timeoutMs = 20000, intervalMs = 250 } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = await evaluate(s, expression);
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error('timeout waiting for ' + expression.slice(0, 80));
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// Page helpers, as expressions evaluated in the panel.
export const page = {
  ready: `document.querySelector('.card') ? 'catalog' : document.querySelector('.form-head') ? 'form' : (document.querySelector('.fatal') ? 'fatal: ' + document.querySelector('.fatal').textContent : '')`,
  text: (sel) => `(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`,
  openCard: (title) => `(() => { const c = [...document.querySelectorAll('.card')].find((e) => (e.querySelector('.title') || {}).textContent === ${JSON.stringify(title)}); if (!c) return false; c.click(); return true; })()`,
  type: (id, value) => `(() => { const el = document.getElementById(${JSON.stringify(id)}); if (!el) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`,
  pressSeg: (label) => `(() => { const b = [...document.querySelectorAll('.seg button')].find((e) => e.textContent === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true; })()`,
  insert: `(() => { const b = document.querySelector('.insert'); if (!b || b.disabled) return false; b.click(); return true; })()`,
  outcome: `(() => { const d = document.querySelector('.done'); const e = [...document.querySelectorAll('.problems li.error')].map((x) => x.textContent); const busy = ['Вставка…', 'Применение…', 'Экспорт…', 'Рендер…'].includes((document.querySelector('.insert') || {}).textContent); return busy ? '' : (d ? 'done: ' + d.textContent : (e.length ? 'error: ' + e.join(' | ') : '')); })()`,
  problems: `[...document.querySelectorAll('.problems li')].map((x) => x.className + ': ' + x.textContent)`,
  cardMedia: `(() => { const v = document.querySelectorAll('.card video'); const i = [...document.querySelectorAll('.card img')]; return { videos: v.length, posters: i.length, postersLoaded: i.filter((x) => x.naturalWidth > 0).length, h264: document.createElement('video').canPlayType('video/mp4; codecs="avc1.640028"') }; })()`,
  tabs: `[...document.querySelectorAll('.tab')].map((t) => t.textContent)`,
  openTab: (label) => `(() => { const t = [...document.querySelectorAll('.tab')].find((e) => e.textContent === ${JSON.stringify(label)}); if (!t) return false; t.click(); return true; })()`,
  presets: `[...document.querySelectorAll('.preset')].map((b) => b.querySelector('.preset-title').textContent + ' | ' + b.querySelector('.preset-meta').textContent)`,
  exportDone: `(() => { const d = document.querySelector('.export .done'); const e = [...document.querySelectorAll('.export .problems li.error')].map((x) => x.textContent); const b = (document.querySelector('.export .insert') || {}).textContent; if (b === 'Экспорт…' || b === 'Рендер…') return ''; return d ? 'done: ' + d.textContent : (e.length ? 'error: ' + e.join(' | ') : ''); })()`,
  cardPlaying: `(() => { const v = document.querySelector('.card video'); return !!v && v.readyState >= 2 && !v.paused && v.currentTime > 0; })()`,
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const host = argv.includes('--host') ? argv[argv.indexOf('--host') + 1] : null;
  if (host !== 'ae' && host !== 'pr') {
    console.error('usage: node tools/panel/ui-check.mjs --host ae|pr');
    process.exit(2);
  }
  const outDir = path.join(REPO, 'docs', 'research', 'panel-live');
  mkdirSync(outDir, { recursive: true });
  const report = { host, startedAt: new Date().toISOString(), checks: [] };
  const check = (name, pass, detail = null) => {
    report.checks.push({ name, pass: Boolean(pass), detail });
    console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${pass ? '' : ' -> ' + JSON.stringify(detail).slice(0, 300)}`);
    return pass;
  };
  let s = null;
  const shot = async (name) => {
    const r = await s.send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(outDir, `${host}-ui-${name}.png`);
    writeFileSync(file, Buffer.from(r.data, 'base64'));
    return file;
  };
  try {
    // The scratch target, through the BrandKit Dev panel (the test bed of the live checks).
    const libs = host === 'ae' ? ['spikes/lib/ae-project.jsx', 'tests/live/jsx/ae-live.jsx'] : ['spikes/lib/pr-helpers.jsx', 'tests/live/jsx/pr-live.jsx'];
    const base = { workDir: workPath() };
    if (host === 'ae') base.project = workPath('panel-live', 'ae', 'panel_ui.aep');
    else {
      base.project = workPath('panel-live', 'pr', 'panel_live.prproj');
      base.seqPreset = stagePreset(presetSources().seq1080p25, 'HD1080p25.sqpreset');
    }
    const hostRun = (op, params) => run(host, composeProbe(libs, { ...base, ...params, op }), { timeoutMs: 600000 });
    const setup = await hostRun('setup', { targets: [{ key: 'ui', name: 'UI_check', w: 1920, h: 1080, fps: 25, dur: 120 }] });
    const id = setup?.data?.ids?.ui;
    if (!check('scratch comp or sequence UI_check 1920x1080 created', id, setup?.checks)) throw new Error('no scratch target');
    check('UI_check active, playhead at 4 s', (await hostRun('activate', { id, time: 4 }))?.checks?.every((c) => c.pass));

    // The real panel.
    const target = await getPageTarget(PANEL_PORTS[host]);
    s = await cdpSession(target.webSocketDebuggerUrl);
    await s.send('Runtime.enable');
    await s.send('Page.reload', { ignoreCache: true });
    const ready = await waitFor(s, page.ready);
    check('panel opens and shows the catalog (N3/N4 of panel-framework.md)', ready === 'catalog', ready);
    // the status fills in once the host answers: the catalog may show a moment earlier (checkpoint 2026-10-06)
    const STATUS = /панель \d+\.\d+\.\d+ · библиотека \d{4}\.\d{2}\.\d{2}/;
    const status = await waitFor(s, `(() => { const t = ${page.text('.status')}; return ${STATUS}.test(t) ? t : ''; })()`, { timeoutMs: 10000 }).catch(() => '');
    check('status line shows the host, the panel and the library', Boolean(status), status || await evaluate(s, page.text('.status')));
    // Card previews (tools/masters/preview.mjs): the poster shows, and the 480 px H.264 plays under the cursor
    // in the Chromium of CEP (a CEF build may lack the codec). Only when the library carries previews.
    const media = await evaluate(s, page.cardMedia);
    if (media.videos) {
      check('card previews: H.264 is playable in the panel', /probably|maybe/.test(media.h264), media);
      await evaluate(s, `(() => { const c = document.querySelector('.card'); c.dispatchEvent(new MouseEvent('mouseenter')); return true; })()`);
      const playing = await waitFor(s, page.cardPlaying, { timeoutMs: 8000 }).catch(() => false);
      check('card previews: the preview under the cursor plays', playing, await evaluate(s, page.cardMedia));
      await new Promise((r) => setTimeout(r, 1200));
      await shot('1b-preview');
      await evaluate(s, `(() => { const c = document.querySelector('.card'); c.dispatchEvent(new MouseEvent('mouseleave')); return true; })()`);
    } else {
      check('card previews: none in this library yet (posters and placeholders only)', true, media);
    }
    await shot('1-catalog');
    check('card «Подпись спикера» opens the form', await evaluate(s, page.openCard('Подпись спикера')));
    await waitFor(s, `!!document.getElementById('f-name')`);
    check('format chip follows UI_check 1920x1080', /1920×1080/.test(await evaluate(s, page.text('.chip-format'))), await evaluate(s, page.text('.chip-format')));
    check('name typed', await evaluate(s, page.type('f-name', 'Анна Проверкина')));
    // The preview of the form follows the style (previews per format and look, tools/masters/preview.mjs),
    // when the library carries them.
    const heroSrc = `(() => { const p = document.querySelector('.hero .poster'); return p ? p.getAttribute('src') : ''; })()`;
    const before = await evaluate(s, heroSrc);
    check('style «Подкаст» picked', await evaluate(s, page.pressSeg('Подкаст')));
    if (/poster_16x9_style-1\.jpg/.test(before)) {
      const after = await waitFor(s, `(() => { const v = ${heroSrc}; return /style-2/.test(v) ? v : ''; })()`, { timeoutMs: 5000 }).catch(() => '');
      check('form preview: «Подкаст» shows its own preview', /poster_16x9_style-2\.jpg/.test(after), { before, after: after || await evaluate(s, heroSrc) });
    } else {
      check('form preview: no previews per style in this library yet', true, before);
    }
    await shot('2-form');
    check('«Вставить на плейхед» clicked', await evaluate(s, page.insert));
    const outcome = await waitFor(s, page.outcome, { timeoutMs: 120000 });
    check('insert reported as done in the panel', outcome.startsWith('done'), { outcome, problems: await evaluate(s, page.problems) });
    await shot('3-inserted');

    // What the host has now.
    if (host === 'ae') {
      const c = await hostRun('count', { id });
      check('AE: one layer in UI_check', c?.data?.count?.layers === 1, c?.data);
    } else {
      const c = await hostRun('clips', { id });
      const clip = (c?.data?.clips ?? []).find((x) => Math.abs(x.startSec - 4) < 0.05);
      check('Premiere: the clip is on the timeline at 4 s, selected', clip && clip.selected, c?.data?.clips);
    }
    await hostRun('save', {});

    // «Экспорт» from the interface (decisions P18–P23): the presets for the 1920x1080 frame, then a file in
    // Export next to the project — AE through the Render Queue with «CR FullHD», Premiere straight from the .epr.
    const tabs = await evaluate(s, page.tabs);
    check(`tabs: ${tabs.join(', ')}`, JSON.stringify(tabs) === JSON.stringify(host === 'ae' ? ['Каталог', 'Цвета', 'Экспорт'] : ['Каталог', 'Экспорт']), tabs);
    if (await evaluate(s, page.openTab('Экспорт'))) {
      await waitFor(s, `document.querySelectorAll('.preset').length > 0`, { timeoutMs: 10000 }).catch(() => false);
      const presets = await evaluate(s, page.presets);
      check('export: Full HD first among the presets for 1920×1080, 4K marked «увеличение», no vertical', /^Full HD/.test(presets[0] ?? '') && presets.some((x) => /^4K.*увеличение$/.test(x)) && !presets.some((x) => /9:16/.test(x)), presets);
      if (host === 'pr') check('export: «Сразу, без AME» picked', await evaluate(s, page.pressSeg('Сразу, без AME')));
      await shot('4-export');
      check('export: the button clicked', await evaluate(s, `(() => { const b = document.querySelector('.export .insert'); if (!b || b.disabled) return false; b.click(); return true; })()`));
      const done = await waitFor(s, page.exportDone, { timeoutMs: 600000 });
      check('export: reported as done in the panel', done.startsWith('done: Готово:'), { done, problems: await evaluate(s, page.problems) });
      const name = (done.match(/Готово: (.+?\.mp4)/) ?? [])[1];
      const file = name ? path.posix.join(path.posix.dirname(base.project), 'Export', name) : null;
      check(`export: the file is in Export next to the project (${file})`, file && existsSync(file) && statSync(file).size > 0, file);
      await shot('5-exported');
    } else {
      check('export: the tab is there', false, tabs);
    }
  } catch (e) {
    check('ui check finished without an exception', false, String(e && e.stack ? e.stack : e));
  } finally {
    if (s) s.close();
    const failed = report.checks.filter((c) => !c.pass).map((c) => c.name);
    writeFileSync(path.join(outDir, `${host}-ui-report.json`), JSON.stringify({ ...report, finishedAt: new Date().toISOString(), failed }, null, 2) + '\n', 'utf8');
    console.log(`report docs/research/panel-live/${host}-ui-report.json: ${report.checks.length - failed.length}/${report.checks.length} passed`);
    if (failed.length) process.exitCode = 1;
  }
}
