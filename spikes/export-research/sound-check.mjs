// Listen to SFX_WhooshIn in the real BrandKit panel.
// DevTools of the product panel: AE 8101, Premiere 8102 (tools/panel/install-dev.mjs).
//   node spikes/export-research/sound-check.mjs 8101
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { getPageTarget } from '../../tools/lib/cdp.mjs';

const port = Number(process.argv[2]);
if (port !== 8101 && port !== 8102) {
  console.error('usage: node spikes/export-research/sound-check.mjs 8101|8102');
  process.exit(2);
}

function session(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const logs = [];
    ws.onerror = (e) => reject(new Error('CDP_WS_ERROR: ' + ((e && e.message) || e)));
    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.method === 'Runtime.consoleAPICalled') {
        const text = (data.params.args || []).map((a) => a.value || a.description || a.type).join(' ');
        logs.push(data.params.type + ': ' + text);
      } else if (data.method === 'Runtime.exceptionThrown') {
        const ex = data.params.exceptionDetails || {};
        logs.push('exception: ' + ((ex.exception && ex.exception.description) || ex.text || 'unknown'));
      } else if (data.method === 'Log.entryAdded') {
        logs.push('log: ' + (data.params.entry && data.params.entry.text));
      }
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      if (data.error) p.reject(new Error('CDP_ERROR: ' + JSON.stringify(data.error)));
      else p.resolve(data.result);
    };
    ws.onopen = () => resolve({
      logs,
      send(method, params = {}) {
        id += 1;
        ws.send(JSON.stringify({ id, method, params }));
        return new Promise((res, rej) => pending.set(id, { resolve: res, reject: rej }));
      },
      close() { ws.close(); },
    });
  });
}

async function evaluate(s, expression) {
  const r = await s.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) {
    throw new Error('page: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  }
  return r.result.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const target = await getPageTarget(port);
const s = await session(target.webSocketDebuggerUrl);
await s.send('Runtime.enable');
await s.send('Console.enable');
await s.send('Log.enable');

const report = { port, title: target.title, url: target.url };
try {
  report.ready = await evaluate(s, `document.querySelector('.card') ? 'catalog' : (document.querySelector('.fatal') ? document.querySelector('.fatal').textContent : document.body.innerText.slice(0, 200))`);
  report.category = await evaluate(s, `(() => { const b = [...document.querySelectorAll('.chip')].find((e) => e.textContent === 'Звуки'); if (!b) return false; b.click(); return true; })()`);
  await sleep(400);
  report.card = await evaluate(s, `(() => {
    const c = [...document.querySelectorAll('.card')].find((e) => (e.querySelector('.title') || {}).textContent === 'Звук входа плашки');
    if (!c) return null;
    const btn = c.querySelector('.sound-play');
    const audio = c.querySelector('audio');
    return { length: (c.querySelector('.sound-length') || {}).textContent || '', glyph: btn ? btn.textContent : '', src: audio ? audio.currentSrc || audio.src : '' };
  })()`);
  const box = await evaluate(s, `(() => {
    const c = [...document.querySelectorAll('.card')].find((e) => (e.querySelector('.title') || {}).textContent === 'Звук входа плашки');
    const b = c && c.querySelector('.sound-play');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
  })()`);
  report.buttonBox = box;
  if (box && box.w > 0) {
    await s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  }
  await sleep(500);
  report.afterPlay = await evaluate(s, `(() => {
    const c = [...document.querySelectorAll('.card')].find((e) => (e.querySelector('.title') || {}).textContent === 'Звук входа плашки');
    const a = c && c.querySelector('audio');
    const b = c && c.querySelector('.sound-play');
    return { glyph: b ? b.textContent : '', paused: a ? a.paused : null, time: a ? a.currentTime : null, error: a && a.error ? a.error.code + ' ' + a.error.message : '', form: !!document.querySelector('.form-head') };
  })()`);
  if (box && box.w > 0) {
    await s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  }
  await sleep(250);
  report.afterStop = await evaluate(s, `(() => {
    const c = [...document.querySelectorAll('.card')].find((e) => (e.querySelector('.title') || {}).textContent === 'Звук входа плашки');
    const a = c && c.querySelector('audio');
    const b = c && c.querySelector('.sound-play');
    return { glyph: b ? b.textContent : '', paused: a ? a.paused : null, time: a ? a.currentTime : null, form: !!document.querySelector('.form-head') };
  })()`);
  report.openedForm = await evaluate(s, `(() => { const c = [...document.querySelectorAll('.card')].find((e) => (e.querySelector('.title') || {}).textContent === 'Звук входа плашки'); if (!c) return false; c.click(); return true; })()`);
  await sleep(400);
  report.form = await evaluate(s, `(() => {
    const hero = document.querySelector('.hero .sound-play');
    const length = document.querySelector('.hero .sound-length');
    return { open: !!document.querySelector('.form-head'), glyph: hero ? hero.textContent : '', length: length ? length.textContent : '' };
  })()`);
  const formBox = await evaluate(s, `(() => {
    const b = document.querySelector('.hero .sound-play');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
  })()`);
  if (formBox && formBox.w > 0) {
    await s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: formBox.x, y: formBox.y, button: 'left', clickCount: 1 });
    await s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: formBox.x, y: formBox.y, button: 'left', clickCount: 1 });
    await sleep(400);
    report.formAfterPlay = await evaluate(s, `(() => {
      const a = document.querySelector('.hero audio');
      const b = document.querySelector('.hero .sound-play');
      return { glyph: b ? b.textContent : '', paused: a ? a.paused : null, time: a ? a.currentTime : null, error: a && a.error ? a.error.code + ' ' + a.error.message : '' };
    })()`);
  }
} catch (e) {
  report.error = String(e.message || e);
}
report.console = s.logs;
const out = path.resolve('docs/research/export', `sound-${port}.json`);
writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
s.close();
