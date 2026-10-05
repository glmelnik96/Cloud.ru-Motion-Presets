// The panel UI in a headless Chromium on the demo host (panel/src/demo.ts), driven by the same page
// expressions tools/panel/ui-check.mjs uses on the real panel in AE and Premiere. Runs where a Chromium is
// installed (BRANDKIT_CHROMIUM, or the Playwright browsers of the cloud sessions); skipped elsewhere.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cdpSession, evaluate, page, waitFor } from '../../tools/panel/ui-check.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');
const CHROME = [process.env.BRANDKIT_CHROMIUM, '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'].find((p) => p && existsSync(p));
const PORT = 9333;

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

  beforeAll(async () => {
    server = await createServer({ configFile: path.join(REPO, 'panel', 'vite.config.mjs'), server: { port: 5299, strictPort: false }, logLevel: 'silent' });
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
});
