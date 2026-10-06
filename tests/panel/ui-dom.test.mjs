// The panel UI in a headless Chromium on the demo host (panel/src/demo.ts), driven by the same page
// expressions tools/panel/ui-check.mjs uses on the real panel in AE and Premiere. Runs where a Chromium is
// installed (BRANDKIT_CHROMIUM, or the Playwright browsers of the cloud sessions); skipped elsewhere.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
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
      // the sounds of the example source, to listen to
      for (const [id, d] of [['SFX_WhooshIn', 0.8], ['SFX_WebinarBed', 3]]) {
        mkdirSync(path.join(media, 'items', id), { recursive: true });
        spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=600:duration=${d}`, '-c:a', 'pcm_s16le', path.join(media, 'items', id, `${id}_wav_v1.wav`)]);
      }
      // previews of the lower third per format and style
      for (const [stem, size] of [['16x9_style-1', '480x270'], ['16x9_style-2', '480x270'], ['9x16_style-1', '270x480']]) {
        spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=0x5A5A5A:s=${size}:r=12.5:d=1`, '-c:v', 'libvpx-vp9', path.join(media, `preview_${stem}.webm`)]);
        spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=0x5A5A5A:s=${size}`, '-frames:v', '1', path.join(media, `poster_${stem}.jpg`)]);
      }
    }
    server = await createServer({ configFile: path.join(REPO, 'panel', 'vite.config.mjs'), server: { port: 5299, strictPort: false, fs: { allow: [REPO, media] } }, logLevel: 'silent' });
    await server.listen();
    base = server.resolvedUrls.local[0];
    chrome = spawn(CHROME, ['--no-sandbox', '--headless', `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(path.join(os.tmpdir(), 'bk-chrome-'))}`, '--window-size=360,900', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
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

  it('«Цвета» in AE: a target, a swatch, the layers repainted; no such tab in Premiere', async () => {
    await go('?host=ae');
    expect(await evaluate(s, `[...document.querySelectorAll('.tab')].map((t) => t.textContent)`)).toEqual(['Каталог', 'Цвета', 'Экспорт']);
    await evaluate(s, `[...document.querySelectorAll('.tab')].find((t) => t.textContent === 'Цвета').click()`);
    await waitFor(s, `document.querySelectorAll('.swatch').length === 7`);
    expect(await evaluate(s, `[...document.querySelectorAll('.swatch-hex')].map((e) => e.textContent)`)).toEqual(['#26D07C', '#222222', '#FFFFFF', '#F2F2F2', '#CFF500', '#A068FF', '#C0E0FC']);
    await evaluate(s, `[...document.querySelectorAll('.colors .seg button')].find((b) => b.textContent === 'Обводка').click()`);
    expect(await evaluate(s, `document.querySelector('.colors .seg button.on').textContent`)).toBe('Обводка');
    expect(await evaluate(s, `[...document.querySelectorAll('.colors .seg button')].map((b) => b.textContent)`)).toEqual(['Заливка', 'Обводка', 'Текст', 'Эффект Fill']);
    await evaluate(s, `document.querySelector('.swatch-apply').click()`);
    await waitFor(s, `!!document.querySelector('.colors .done')`, { timeoutMs: 10000 });
    expect(await evaluate(s, `document.querySelector('.colors .done').textContent`)).toBe('Перекрашено: Плашка.');
    // the HEX copies, as in the old brandcolors panel
    await evaluate(s, `document.querySelectorAll('.swatch-hex')[1].click()`);
    expect(await evaluate(s, `document.querySelectorAll('.swatch-hex')[1].textContent`)).toBe('Скопировано');
    await go('?host=pr');
    expect(await evaluate(s, `[...document.querySelectorAll('.tab')].map((t) => t.textContent)`)).toEqual(['Каталог', 'Монтаж', 'Экспорт']);
  }, 60000);

  it('«Вписать в окно» in the form of a frame template, Premiere only', async () => {
    await go('?host=pr&open=WEB_Screen');
    await waitFor(s, `!!document.querySelector('.fit')`);
    expect(await evaluate(s, `[...document.querySelectorAll('.fit .seg button')].map((b) => b.textContent)`)).toEqual(['Экран', 'Спикер']);
    await evaluate(s, `[...document.querySelectorAll('.fit .seg button')].find((b) => b.textContent === 'Спикер').click()`);
    await waitFor(s, `!!document.querySelector('.actions .done')`, { timeoutMs: 10000 });
    expect(await evaluate(s, `document.querySelector('.actions .done').textContent`)).toBe('«Запись спикера.mp4» вписан в окно «Спикер»: масштаб 66,67 %, обрезка по бокам 35 %.');
    await go('?host=ae&open=WEB_Screen');
    await waitFor(s, `!!document.querySelector('.form-head')`);
    expect(await evaluate(s, `!!document.querySelector('.fit')`)).toBe(false);
  }, 60000);

  it('«Монтаж» in Premiere: the margins blurred on the selected clip, the caption style brought into the project', async () => {
    await go('?host=pr');
    await evaluate(s, `[...document.querySelectorAll('.tab')].find((t) => t.textContent === 'Монтаж').click()`);
    await waitFor(s, `document.querySelectorAll('.edit .tool').length === 2`);
    expect(await evaluate(s, `[...document.querySelectorAll('.edit .tool h3')].map((e) => e.textContent)`)).toEqual(['Размыть поля', 'Стиль субтитров']);
    await evaluate(s, `[...document.querySelectorAll('.edit button')].find((b) => b.textContent === 'Размыть поля выделенного клипа').click()`);
    await waitFor(s, `!!document.querySelector('.edit .done')`, { timeoutMs: 10000 });
    expect(await evaluate(s, `document.querySelector('.edit .done').textContent`)).toBe('Поля «Запись спикера.mp4» размыты: Fast Blur 20 на клипе, резкая копия с Crop — на V3.');
    // a second time: the clip is blurred already
    await evaluate(s, `[...document.querySelectorAll('.edit button')].find((b) => b.textContent === 'Размыть поля выделенного клипа').click()`);
    await waitFor(s, `/уже размыты/.test((document.querySelector('.edit .problems') || {}).textContent || '')`, { timeoutMs: 10000 });
    await evaluate(s, `[...document.querySelectorAll('.edit button')].find((b) => b.textContent === 'Добавить «CR Субтитры» в проект').click()`);
    await waitFor(s, `/добавлен в проект/.test((document.querySelector('.edit .done') || {}).textContent || '')`, { timeoutMs: 10000 });
    expect(await evaluate(s, `document.querySelector('.edit .done').textContent`)).toBe('Стиль «CR Субтитры» добавлен в проект, в папку «Cloud.ru BrandKit». Выделите дорожку субтитров и выберите его в Properties → Track Style.');
    // the style is no card of the catalog
    await evaluate(s, `[...document.querySelectorAll('.tab')].find((t) => t.textContent === 'Каталог').click()`);
    await waitFor(s, `document.querySelectorAll('.card').length > 0`);
    expect(await evaluate(s, `[...document.querySelectorAll('.card .title')].some((t) => /Стиль субтитров/.test(t.textContent))`)).toBe(false);
  }, 60000);

  it('«Экспорт» in Premiere: presets for the frame, the AME queue, the next file gets _2 (P19, P22, P23)', async () => {
    await go('?host=pr');
    await evaluate(s, `[...document.querySelectorAll('.tab')].find((t) => t.textContent === 'Экспорт').click()`);
    await waitFor(s, `document.querySelectorAll('.preset').length > 0`);
    expect(await evaluate(s, `[...document.querySelectorAll('.preset')].map((b) => b.querySelector('.preset-title').textContent + ' | ' + b.querySelector('.preset-meta').textContent)`)).toEqual([
      'Full HD — основной мастер | 1920×1080 · 25 к/с',
      'SMM 16:9 | 1920×1080 · 25 к/с',
      'Вебинар — финальный рендер | 1920×1080 · 25 к/с',
      'Вебинар — таймер | 1920×1080 · 25 к/с',
      'Вебинар — заставка | 1920×1080 · 25 к/с',
      '4K, 3840×2160 | 3840×2160 · 25 к/с · увеличение',
    ]);
    expect(await evaluate(s, `[...document.querySelectorAll('.export .seg button')].map((b) => b.textContent + (b.classList.contains('on') ? '*' : ''))`)).toEqual(['В очередь Media Encoder*', 'Сразу, без AME']);
    expect(await evaluate(s, `document.querySelector('.export .hint.path').textContent`)).toBe('C:/Projects/Export');
    await evaluate(s, `document.querySelector('.export .insert').click()`);
    await waitFor(s, `!!document.querySelector('.export .done')`, { timeoutMs: 10000 });
    expect(await evaluate(s, `document.querySelector('.export .done').textContent`)).toBe('В очереди Media Encoder: Монтаж_FullHD.mp4. Media Encoder закодирует файл сам.Показать в папке');
    await evaluate(s, `document.querySelector('.export .insert').click()`);
    await waitFor(s, `/_2\.mp4/.test(document.querySelector('.export .done')?.textContent ?? '')`, { timeoutMs: 10000 });
    // 4K warns about upscaling before the click
    await evaluate(s, `[...document.querySelectorAll('.preset')].find((b) => b.textContent.startsWith('4K')).click()`);
    await waitFor(s, `!!document.querySelector('.export .problems .warning')`);
    expect(await evaluate(s, `document.querySelector('.export .problems .warning').textContent`)).toBe('Кадр 1920×1080 меньше пресета 3840×2160: картинка будет увеличена и потеряет резкость.');
    // a vertical sequence: SMM 9:16 only
    await go('?host=pr&frame=1080x1920');
    await evaluate(s, `[...document.querySelectorAll('.tab')].find((t) => t.textContent === 'Экспорт').click()`);
    await waitFor(s, `document.querySelectorAll('.preset').length > 0`);
    expect(await evaluate(s, `[...document.querySelectorAll('.preset-title')].map((e) => e.textContent)`)).toEqual(['SMM 9:16, вертикаль']);
  }, 60000);

  it('«Экспорт» in AE: the instruction without the brand template; in the background the job ends «Готово» (P20, P21)', async () => {
    await go('?host=ae&templates=0');
    await evaluate(s, `[...document.querySelectorAll('.tab')].find((t) => t.textContent === 'Экспорт').click()`);
    await waitFor(s, `document.querySelectorAll('.preset').length > 0`);
    expect(await evaluate(s, `document.querySelector('.export .insert').textContent`)).toBe('Рендерить');
    await evaluate(s, `document.querySelector('.export .insert').click()`);
    await waitFor(s, `!!document.querySelector('.export .problems .error')`, { timeoutMs: 10000 });
    expect(await evaluate(s, `document.querySelector('.export .problems .error').textContent`)).toBe(
      'В After Effects нет шаблона вывода «CR FullHD». Загрузите брендовые шаблоны один раз: Edit → Templates → Output Module → Load… и выберите файл C:/ProgramData/CloudRuBrandKit/library/items/AME_Templates/AME_Templates_aom_v1.aom. Затем повторите экспорт.');
    await go('?host=ae');
    await evaluate(s, `[...document.querySelectorAll('.tab')].find((t) => t.textContent === 'Экспорт').click()`);
    await waitFor(s, `document.querySelectorAll('.preset').length > 0`);
    await evaluate(s, `[...document.querySelectorAll('.export .seg button')].find((b) => b.textContent === 'В фоне (aerender)').click()`);
    expect(await evaluate(s, `document.querySelector('.export .insert').textContent`)).toBe('Сохранить проект и рендерить в фоне');
    await evaluate(s, `document.querySelector('.export .insert').click()`);
    await waitFor(s, `!!document.querySelector('.jobs li.running')`, { timeoutMs: 10000 });
    expect(await evaluate(s, `document.querySelector('.export .done').textContent`)).toBe('Рендер в фоне: Монтаж_FullHD.mp4. Можно работать дальше.Показать в папке');
    await waitFor(s, `!!document.querySelector('.jobs li.done')`, { timeoutMs: 10000 });
    expect(await evaluate(s, `document.querySelector('.jobs li.done span').textContent`)).toBe('Готово: Монтаж_FullHD.mp4');
  }, 60000);

  it.skipIf(!HAS_FFMPEG)('a sound plays in its card, one at a time, without opening the form', async () => {
    const mediaUrl = encodeURIComponent('/@fs/' + media.replace(/\\/g, '/').replace(/^\//, '') + '/');
    await go(`?host=pr&media=${mediaUrl}`);
    const card = (title) => `[...document.querySelectorAll('.card')].find((c) => c.querySelector('.title').textContent === ${JSON.stringify(title)})`;
    await waitFor(s, `!!${card('Звук входа плашки')}.querySelector('.sound-length')`, { timeoutMs: 10000 });
    expect(await evaluate(s, `${card('Звук входа плашки')}.querySelector('.sound-length').textContent`)).toBe('0,8 с');
    await evaluate(s, `${card('Подложка вебинара')}.querySelector('.sound-play').click()`);
    await waitFor(s, `!${card('Подложка вебинара')}.querySelector('audio').paused`, { timeoutMs: 5000 });
    await evaluate(s, `${card('Звук входа плашки')}.querySelector('.sound-play').click()`);
    await waitFor(s, `!${card('Звук входа плашки')}.querySelector('audio').paused`, { timeoutMs: 5000 });
    expect(await evaluate(s, `${card('Подложка вебинара')}.querySelector('audio').paused`)).toBe(true);
    expect(await evaluate(s, `!!document.querySelector('.form-head')`)).toBe(false);
  }, 60000);
});

