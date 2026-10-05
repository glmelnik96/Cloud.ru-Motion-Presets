// The panel UI in a headless Chromium on the demo host (panel/src/demo.ts), driven by the same page
// expressions tools/panel/ui-check.mjs uses on the real panel in AE and Premiere. Runs where a Chromium is
// installed (BRANDKIT_CHROMIUM, or the Playwright browsers of the cloud sessions); skipped elsewhere.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cdpSession, evaluate, page, waitFor } from '../../tools/panel/ui-check.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');
const CHROME = [process.env.BRANDKIT_CHROMIUM, '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'].find((p) => p && existsSync(p));
const PORT = 9333;
const HAS_FFMPEG = spawnSync('ffmpeg', ['-version']).status === 0;

async function pageTarget() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const p = list.find((t) => t.type === 'page');
      if (p) return p;
    } catch {
      // the browser is still starting
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('no page target');
}

describe.skipIf(!CHROME)('panel UI in Chromium (demo host)', () => {
  let server;
  let chrome;
  let s;
  let base;
  let media;

  beforeAll(async () => {
    media = mkdtempSync(path.join(os.tmpdir(), 'bk-media-'));
    if (HAS_FFMPEG) {
      // A moving green square: VP9, which a Chromium without H.264 plays as well; the poster is a still.
      const src = ['-f', 'lavfi', '-i', 'color=c=0x222222:s=480x270:r=12.5:d=2', '-vf', 'drawbox=x=t*100:y=100:w=60:h=60:color=0x26D07C:t=fill'];
      spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...src, '-c:v', 'libvpx-vp9', '-b:v', '200k', path.join(media, 'preview.webm')]);
      spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0xF2F2F2:s=480x270', '-frames:v', '1', path.join(media, 'poster.jpg')]);
      // previews of the lower third per format and style
      for (const [stem, size] of [['16x9_style-1', '480x270'], ['16x9_style-2', '480x270'], ['9x16_style-1', '270x480']]) {
        spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=0x5A5A5A:s=${size}:r=12.5:d=1`, '-c:v', 'libvpx-vp9', path.join(media, `preview_${stem}.webm`)]);
        spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=0x5A5A5A:s=${size}`, '-frames:v', '1', path.join(media, `poster_${stem}.jpg`)]);
      }
    }
    server = await createServer({ configFile: path.join(REPO, 'panel', 'vite.config.mjs'), server: { port: 5299, strictPort: false, fs: { allow: [REPO, media] } }, logLevel: 'silent' });
    await server.listen();
    base = server.resolvedUrls.local[0];
    chrome = spawn(CHROME, ['--no-sandbox', '--headless', `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(path.join(os.tmpdir(), 'bk-chrome-'))}`, '--window-size=360,900', 'about:blank'], { stdio: 'ignore' });
    s = await cdpSession((await pageTarget()).webSocketDebuggerUrl);
    await s.send('Runtime.enable');
    await s.send('Page.enable');
  }, 60000);

  afterAll(async () => {
    s?.close();
    chrome?.kill();
    await server?.close();
  });

  const go = async (query) => {
    await s.send('Page.navigate', { url: `${base}${query}` });
    await waitFor(s, page.ready, { timeoutMs: 30000 });
  };

  it('leaves «Загрузка библиотеки…» even when the start-up ends before the UI subscribes', async () => {
    // Premiere 2026-10-05: the panel stayed on the loading line until the pointer entered it. The start-up
    // finished before useEffect subscribed the UI, so its state changes were lost.
    await go('?host=pr&instant=1');
    expect(await evaluate(s, `document.querySelectorAll('.card').length > 0 && !document.querySelector('.empty')`)).toBe(true);
  }, 60000);

  it('opens a card, takes a name and a style, inserts on the playhead', async () => {
    await go('?host=pr');
    expect(await evaluate(s, page.text('.status'))).toMatch(/^Шрифты SB Sans на месте · Pr 26\.5\.2 · панель \d+\.\d+\.\d+ · библиотека 2026\.10\.05/);
    expect(await evaluate(s, page.openCard('Подпись спикера'))).toBe(true);
    await waitFor(s, `!!document.getElementById('f-name')`);
    expect(await evaluate(s, page.text('.chip-format'))).toBe('Авто 16:9 · 1920×1080 · 25p');
    expect(await evaluate(s, page.type('f-name', 'Анна Проверкина'))).toBe(true);
    expect(await evaluate(s, page.pressSeg('Подкаст'))).toBe(true);
    expect(await evaluate(s, `document.querySelector('.seg button.on').textContent`)).toBe('Подкаст');
    expect(await evaluate(s, page.insert)).toBe(true);
    expect(await waitFor(s, page.outcome)).toBe('done: Вставлено: клип выделен на таймлайне.');
  }, 60000);

  it.skipIf(!HAS_FFMPEG)('shows the poster, plays the preview only under the cursor, and brings the poster back', async () => {
    await go(`?host=pr&media=${encodeURIComponent('/@fs/' + media.replace(/\\/g, '/').replace(/^\//, '') + '/')}`);
    const state = `(() => { const c = document.querySelector('.card'); const v = c.querySelector('video'); const p = c.querySelector('.poster');
      return { poster: !!p && !p.classList.contains('off') && p.naturalWidth > 0, playing: !!v && !v.paused && v.currentTime > 0, time: v ? v.currentTime : -1 }; })()`;
    await waitFor(s, `(${state}).poster`);
    expect(await evaluate(s, state)).toMatchObject({ poster: true, playing: false });
    await evaluate(s, `document.querySelector('.card').dispatchEvent(new MouseEvent('mouseenter'))`);
    await waitFor(s, `(() => { const r = ${state}; return r.playing && !r.poster; })()`, { timeoutMs: 10000 });
    await evaluate(s, `document.querySelector('.card').dispatchEvent(new MouseEvent('mouseleave'))`);
    await waitFor(s, `(() => { const r = ${state}; return r.poster && !r.playing && r.time === 0; })()`, { timeoutMs: 5000 });
    // the other cards have no preview and keep their placeholders
    expect(await evaluate(s, `document.querySelectorAll('.card video').length`)).toBe(1);
  }, 60000);

  it('refuses a name that is too long before the host is called', async () => {
    await go('?host=pr&open=TTL_LowerThird');
    await waitFor(s, `!!document.getElementById('f-name')`);
    await evaluate(s, page.type('f-name', 'Я'.repeat(41)));
    expect(await evaluate(s, page.problems)).toEqual(['error: Имя: не длиннее 40 знаков.']);
    expect(await evaluate(s, `document.querySelector('.insert').disabled`)).toBe(true);
  }, 60000);

  it('asks before the nearest variant and inserts it after the yes', async () => {
    await go('?host=pr&frame=2560x1440&open=TTL_LowerThird');
    await waitFor(s, `!!document.getElementById('f-name')`);
    expect(await evaluate(s, page.insert)).toBe(true);
    await waitFor(s, `!!document.querySelector('.consent')`);
    expect(await evaluate(s, page.text('.consent'))).toContain('16:9 · 3840×2160 · 25p');
    await evaluate(s, `document.querySelector('.consent button').click()`);
    expect(await waitFor(s, page.outcome)).toMatch(/^done/);
  }, 60000);

  it('greys out the minutes until the timer is on and offers file slots in AE', async () => {
    await go('?host=ae&open=WEB_Screen');
    await waitFor(s, `!!document.getElementById('f-title')`);
    expect(await evaluate(s, `document.getElementById('f-minutes').disabled`)).toBe(true);
    await evaluate(s, `[...document.querySelectorAll('.check')].find((e) => e.textContent === 'Таймер').querySelector('input').click()`);
    expect(await evaluate(s, `document.getElementById('f-minutes').disabled`)).toBe(false);
    expect(await evaluate(s, `[...document.querySelectorAll('.media button')].length`)).toBe(2);
    expect(await evaluate(s, `document.getElementById('f-length').placeholder`)).toBe('305');
  }, 60000);

  it('a background loop offers the length and the #222222 backdrop and goes in; a sound has no length', async () => {
    await go('?host=pr&open=BG_Arrows');
    await waitFor(s, `!!document.getElementById('f-length')`);
    const backdrop = `[...document.querySelectorAll('.check')].find((e) => e.textContent === 'Подложка #222222')`;
    expect(await evaluate(s, `${backdrop}.querySelector('input').checked`)).toBe(true);
    expect(await evaluate(s, `document.getElementById('f-length').placeholder`)).toBe('12');
    expect(await evaluate(s, `[...document.getElementById('f-format').options].map((o) => o.value)`)).toEqual(['', '16x9', '9x16']);
    expect(await evaluate(s, page.insert)).toBe(true);
    expect(await waitFor(s, page.outcome)).toBe('done: Вставлено: клип выделен на таймлайне.');
    await go('?host=pr&open=SFX_WhooshIn');
    await waitFor(s, `!!document.querySelector('.insert')`);
    expect(await evaluate(s, `document.getElementById('f-length') === null && document.querySelectorAll('.check').length === 0`)).toBe(true);
  }, 60000);

  it('the webinar screen shows the music checkbox, off by default', async () => {
    await go('?host=pr&open=WEB_Screen');
    await waitFor(s, `!!document.getElementById('f-title')`);
    const music = `[...document.querySelectorAll('.check')].find((e) => e.textContent === 'Музыка')`;
    expect(await evaluate(s, `${music}.querySelector('input').checked`)).toBe(false);
  }, 60000);

  it('an AE effect applies to the selected layers, without format or length, and is not in Premiere', async () => {
    await go('?host=ae&open=FX_TextRise');
    await waitFor(s, `!!document.querySelector('.insert')`);
    expect(await evaluate(s, `[document.getElementById('f-format'), document.getElementById('f-length')].every((e) => e === null)`)).toBe(true);
    expect(await evaluate(s, `document.querySelector('.insert').textContent`)).toBe('Применить к выделенным');
    expect(await evaluate(s, page.insert)).toBe(true);
    expect(await waitFor(s, page.outcome)).toBe('done: Применено к слоям: Имя.');
    await go('?host=pr');
    expect(await evaluate(s, `[...document.querySelectorAll('.card')].some((c) => c.textContent.includes('Подъём текста по словам'))`)).toBe(false);
  }, 60000);

  it.skipIf(!HAS_FFMPEG)('the preview of the form follows the style and the format', async () => {
    // user 2026-10-05: «Превью должно отображать все варианты»
    const mediaUrl = encodeURIComponent('/@fs/' + media.replace(/\\/g, '/').replace(/^\//, '') + '/');
    await go(`?host=pr&open=TTL_LowerThird&media=${mediaUrl}`);
    const hero = `(() => { const p = document.querySelector('.hero .poster'); const v = document.querySelector('.hero video'); return (p ? p.getAttribute('src').split('/').pop() : '-') + ' ' + (v ? v.getAttribute('src').split('/').pop() : '-'); })()`;
    await waitFor(s, `!!document.querySelector('.hero .poster')`);
    expect(await evaluate(s, hero)).toBe('poster_16x9_style-1.jpg preview_16x9_style-1.webm');
    expect(await evaluate(s, page.pressSeg('Подкаст'))).toBe(true);
    await waitFor(s, `${hero}.startsWith('poster_16x9_style-2')`);
    expect(await evaluate(s, page.pressSeg('Титры'))).toBe(true);
    await evaluate(s, `(() => { const f = document.getElementById('f-format'); f.value = '9x16'; f.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await waitFor(s, `${hero} === 'poster_9x16_style-1.jpg preview_9x16_style-1.webm'`);
    // no preview of 9:16 in «Подкаст»: the card preview, not the wrong format
    expect(await evaluate(s, page.pressSeg('Подкаст'))).toBe(true);
    await waitFor(s, `${hero} === '- -'`);
  }, 60000);
});

