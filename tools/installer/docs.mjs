// The two documents of the package for the editors (user 2026-10-26): «Как установить» and «Руководство монтажёра»
// (docs/guide/panel.md), as PDF printed by headless Chrome — or as HTML where the build machine has no Chrome.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { inline, markdownToHtml } from './markdown.mjs';

const CSS = `
@page { size: A4; margin: 18mm 16mm 18mm 16mm; }
* { box-sizing: border-box; }
body { font-family: "Segoe UI", "SB Sans Text", -apple-system, "Helvetica Neue", Arial, sans-serif; color: #222222; font-size: 10.5pt; line-height: 1.45; margin: 0; }
header { background: #222222; color: #FFFFFF; padding: 14px 18px; border-radius: 6px; margin-bottom: 14px; }
header h1 { color: #26D07C; font-size: 19pt; margin: 0 0 4px; }
header p { margin: 0; color: #DDDDDD; }
h1 { font-size: 17pt; margin: 0 0 8px; }
h2 { font-size: 13pt; margin: 18px 0 6px; padding-bottom: 3px; border-bottom: 2px solid #26D07C; break-after: avoid; }
h3 { font-size: 11pt; margin: 12px 0 4px; break-after: avoid; }
p { margin: 5px 0; }
ul, ol { margin: 5px 0; padding-left: 22px; }
li { margin: 3px 0; }
code { font-family: Consolas, Menlo, monospace; font-size: 9.5pt; background: #F2F2F2; padding: 1px 4px; border-radius: 3px; white-space: nowrap; }
table { border-collapse: collapse; width: 100%; margin: 6px 0; font-size: 9.5pt; break-inside: avoid; }
th, td { border: 1px solid #D3D3D3; padding: 5px 7px; text-align: left; vertical-align: top; }
th { background: #F2F2F2; white-space: nowrap; }
.sizes td:last-child { white-space: nowrap; }
.shot { display: block; max-width: 70%; margin: 8px 0 4px; border: 1px solid #D3D3D3; border-radius: 4px; }
.note { background: #F2F2F2; border-left: 4px solid #26D07C; padding: 6px 10px; margin: 8px 0; }
.it { font-size: 9.5pt; color: #444444; }
`;

const page = (title, body) => `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${title}</title><style>${CSS}</style></head><body>${body}</body></html>`;

const gb = (b) => `${(b / 1073741824).toFixed(1).replace('.', ',')} ГБ`;

// «Как установить»: o = { plugin, library, base, k4, music (bytes), shot (a data: URI of the Windows window, or null) }
export function howToInstallHtml(o) {
  const all = o.base + (o.k4 || 0) + (o.music || 0);
  const rows = [
    ['Панель и библиотека — ставятся всегда', 'Панель BrandKit в After Effects и Premiere: шаблоны, фоны, переходы, звуки и музыка пакетов Cloud.ru.', gb(o.base)],
    ...(o.k4 ? [['4K-фоны и клипы', 'Фоны, фон экрана вебинара, дрейф рамки лекции, интро и аутро подкаста в 4K. Без них в 4K-проекте панель возьмёт версию FHD и впишет её в кадр.', gb(o.k4)]] : []),
    ...(o.music ? [['Стоковая музыка', 'Треки для роликов в категории «Музыка» панели.', gb(o.music)]] : []),
    ['Пресеты экспорта «CR&nbsp;…»', 'Брендовые пресеты в Media Encoder и в экспорте Premiere.', '—'],
  ];
  const table = (head, body, cls = '') => `<table${cls ? ` class="${cls}"` : ''}><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const body = `
<header><h1>Cloud.ru BrandKit ${o.plugin} — как установить</h1><p>Фирменная графика Cloud.ru для After Effects и Premiere · библиотека ${o.library}</p></header>

<h2>Что нужно</h2>
<ul>
<li>After Effects и Premiere Pro 2026, Windows 10/11 или macOS.</li>
<li>Шрифты SB Sans Display и SB Sans Text — их ставит IT.</li>
<li>Около ${gb(all)} свободного места на диске (без 4K и стоковой музыки — ${gb(o.base)}).</li>
<li>Права администратора не нужны. Установщик запускают в каждой учётной записи компьютера, где работают с панелью.</li>
</ul>

<h2>Windows</h2>
<ol>
<li>Распакуйте архив целиком: правый щелчок по архиву → «Извлечь все…» → «Извлечь».</li>
<li>Закройте After Effects, Premiere и Media Encoder.</li>
<li>В распакованной папке дважды щёлкните <strong>«Установить (Windows)»</strong>. Если Windows спросит, запускать ли файл, нажмите «Запустить» (или «Подробнее» → «Выполнить в любом случае»).</li>
<li>В окне отметьте, что поставить, и нажмите <strong>«Установить»</strong>.${o.shot ? `<img class="shot" src="${o.shot}" alt="Окно установщика">` : ''}</li>
<li>Через несколько минут окно скажет «Готово» и подскажет, что делать дальше.</li>
</ol>

<h2>Mac</h2>
<ol>
<li>Распакуйте архив двойным щелчком (Safari обычно распаковывает его сам).</li>
<li>Закройте After Effects, Premiere и Media Encoder.</li>
<li>Откройте Терминал: Finder → Программы → Утилиты → Терминал.</li>
<li>Наберите <code>bash</code> и пробел, перетащите в окно Терминала файл <strong>«Установить (Mac)»</strong> из распакованной папки и нажмите Return.</li>
<li>В окнах macOS выберите, что поставить, и нажмите <strong>«Установить»</strong>. Ход установки виден в Терминале, в конце окно скажет «Готово».</li>
</ol>
<p class="note">Двойной щелчок по «Установить (Mac)» сработает, только если архив пришёл не из браузера и не из мессенджера — например, с флешки. Скачанные файлы без подписи Apple macOS не открывает, поэтому установщик запускают через Терминал.</p>

<h2>Что ставится</h2>
${table(['Пункт', 'Что это', 'На диске'], rows, 'sizes')}

<h2>После установки</h2>
<ol>
<li>Откройте After Effects или Premiere → Window → Extensions → <strong>Cloud.ru BrandKit</strong>. В Premiere панели появляются при открытом проекте.</li>
<li>В After Effects <strong>один раз</strong> загрузите шаблоны экспорта: Edit → Templates → Output Module… → Load… → файл <code>AME_Templates_aom_v1.aom</code>. Он лежит в <code>C:\\ProgramData\\CloudRuBrandKit\\library\\items\\AME_Templates</code> на Windows и в <code>/Users/Shared/CloudRuBrandKit/library/items/AME_Templates</code> на Mac; окно установщика показывает его кнопкой «Шаблоны экспорта AE». Без них не работает экспорт из After Effects.</li>
<li>Пресеты «CR …» появятся в Media Encoder при его следующем запуске.</li>
<li>Как работать с панелью — в «Руководстве монтажёра» в этой же папке.</li>
</ol>

<h2>Обновление</h2>
<p>Новую версию ставят так же: распакуйте новый архив и запустите установщик. Панель и библиотека заменяются целиком. Отметки 4K и музыки установщик предложит такие же, как в прошлый раз.</p>

<h2>Если что-то пошло не так</h2>
${table(['Что видно', 'Что сделать'], [
    ['«Закройте After Effects…» или «Закройте Premiere…»', 'Закройте программы — проверьте, что они не остались в фоне, — и нажмите «Установить» ещё раз.'],
    ['«…занята…»', 'Подождите полминуты после закрытия программ и запустите установщик снова. Пока он не может заменить всё целиком, он ничего не меняет.'],
    ['«Установка прервалась на середине»', 'Установку остановил антивирус. Запустите ещё раз; если повторится, попросите IT добавить папку установщика в исключения антивируса.'],
    ['«Сначала распакуйте архив целиком»', 'Установщик запущен прямо из архива. Распакуйте архив и запустите его из распакованной папки.'],
    ['Mac: «…не удаётся открыть…»', 'Запускайте установщик через Терминал, как в шагах 3–4 для Mac.'],
    ['Панели нет в Window → Extensions', 'Перезапустите программу. Если панели нет и после этого, запустите установщик ещё раз и пришлите текст из его окна (Windows) или Терминала (Mac).'],
    ['Панель предупреждает о шрифтах SB Sans', 'Шрифты ставит IT.'],
  ])}

<h2>Для IT</h2>
<div class="it">
<p>Тихая установка без окна делает то же самое:</p>
<ul>
<li>Windows: <code>files\\install.cmd -With4K -WithMusic -WithAme</code> (без опции: <code>-No4K</code>, <code>-NoMusic</code>).</li>
<li>Mac: <code>bash files/install.command --with-4k --with-music --with-ame</code> (без опции: <code>--no-4k</code>, <code>--no-music</code>).</li>
</ul>
<p>Коды выхода: 0 — установлено; 2 — открыты After Effects или Premiere (с пресетами — и Media Encoder), ничего не изменено; 1 — ошибка. Панель ставится в папку расширений CEP пользователя, библиотека — в <code>C:\\ProgramData\\CloudRuBrandKit\\library</code> или <code>/Users/Shared/CloudRuBrandKit/library</code>, шаблоны MOGRT — в Local Templates пользователя, пресеты — в пользовательские пресеты Media Encoder. Подробности — <code>files/README.txt</code>.</p>
</div>`;
  return page(`Cloud.ru BrandKit ${o.plugin} — как установить`, body);
}

// «Руководство монтажёра» from docs/guide/panel.md: its first heading becomes the header of the page
export function guideHtml(md, { plugin }) {
  const text = md.replace(/^\uFEFF/, '');
  const first = /^# (.*)$/m.exec(text);
  const rest = first ? text.replace(first[0], '') : text;
  return page('Cloud.ru BrandKit — руководство монтажёра', `<header><h1>${inline(first ? first[1] : 'Cloud.ru BrandKit')}</h1><p>Панель ${plugin}</p></header>\n${markdownToHtml(rest)}`);
}

// Chrome or Chromium of the build machine: BRANDKIT_CHROMIUM first (the browser tests use it too)
export function findChrome(env = process.env, platform = process.platform) {
  const tries = [env.BRANDKIT_CHROMIUM,
    ...(platform === 'win32' ? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
      : platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'] : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'])];
  return tries.find((p) => p && existsSync(p)) ?? null;
}

// Writes the document: <file>.pdf when Chrome prints it, else <file>.html. Returns the name written.
export function writeDocument(html, file, { chrome = findChrome() } = {}) {
  if (chrome) {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'bk-doc-'));
    try {
      const src = path.join(tmp, 'doc.html');
      writeFileSync(src, html, 'utf8');
      const pdf = `${file}.pdf`;
      const r = spawnSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-pdf-header-footer', `--user-data-dir=${path.join(tmp, 'profile')}`, `--print-to-pdf=${pdf}`, pathToFileURL(src).href], { encoding: 'utf8', timeout: 120000, windowsHide: true });
      if (r.status === 0 && existsSync(pdf) && readFileSync(pdf).subarray(0, 4).toString() === '%PDF') return path.basename(pdf);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
  writeFileSync(`${file}.html`, html, 'utf8');
  return path.basename(`${file}.html`);
}
