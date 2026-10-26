// The parts of the package for the editors (user 2026-10-26): the Markdown of their guide as HTML, the documents
// «Как установить» and «Руководство монтажёра», and the unix modes patched into a zip made on Windows.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { describe, expect, it } from 'vitest';
import { zipFolder } from '../../tools/installer/build.mjs';
import { findChrome, guideHtml, howToInstallHtml, writeDocument } from '../../tools/installer/docs.mjs';
import { markdownToHtml } from '../../tools/installer/markdown.mjs';
import { listEntries, setUnixMode } from '../../tools/installer/zip-mode.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');
const tmp = (p) => mkdtempSync(path.join(os.tmpdir(), p));

describe('the Markdown of the guide', () => {
  it('headings, paragraphs, bold and code, escaped', () => {
    expect(markdownToHtml('# Заголовок\n\nТекст **жирный** и `код <x>`\nдальше.\n\n## Второй')).toBe(
      '<h1>Заголовок</h1>\n<p>Текст <strong>жирный</strong> и <code>код &lt;x&gt;</code> дальше.</p>\n<h2>Второй</h2>');
  });

  it('a numbered list with a nested one and a line that continues the item', () => {
    const md = '1. Один.\n2. Два:\n   - а;\n   - б.\n   Дальше про два.\n3. Три.';
    expect(markdownToHtml(md)).toBe('<ol><li>Один.</li><li>Два:<ul><li>а;</li><li>б.</li></ul>\n<p>Дальше про два.</p></li><li>Три.</li></ol>');
  });

  it('a table, its separator row dropped', () => {
    expect(markdownToHtml('| A | B |\n|---|---|\n| 1 | **2** |')).toBe('<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td><strong>2</strong></td></tr></tbody></table>');
  });

  it('the guide of the editors comes out whole: no Markdown left in the text', () => {
    const html = guideHtml(readFileSync(path.join(REPO, 'docs', 'guide', 'panel.md'), 'utf8'), { plugin: '0.1.30' });
    expect(html).toContain('<header><h1>Cloud.ru BrandKit: руководство монтажёра</h1><p>Панель 0.1.30</p></header>');
    expect(html).toContain('<h2>Установка</h2>');
    expect(html).not.toMatch(/\*\*|\|---|^#|\n- /m);
  });
});

describe('the documents', () => {
  const o = { plugin: '0.1.30', library: '2026.10.26.3', base: 2.4 * 1073741824, k4: 1.7 * 1073741824, music: 1.1 * 1073741824, shot: 'data:image/png;base64,AAAA' };

  it('«Как установить»: both systems, the sizes, the window, what comes after, for IT', () => {
    const html = howToInstallHtml(o);
    expect(html).toContain('<h1>Cloud.ru BrandKit 0.1.30 — как установить</h1>');
    for (const t of ['<h2>Windows</h2>', '<h2>Mac</h2>', '<h2>После установки</h2>', '<h2>Если что-то пошло не так</h2>', '<h2>Для IT</h2>']) expect(html).toContain(t);
    expect(html).toContain('Около 5,2 ГБ свободного места на диске (без 4K и стоковой музыки — 2,4 ГБ)');
    expect(html).toContain('<td>4K-фоны и клипы</td>');
    expect(html).toContain('<img class="shot" src="data:image/png;base64,AAAA"');
    expect(html).toContain('<code>C:\\ProgramData\\CloudRuBrandKit\\library\\items\\AME_Templates</code>');
    // without the options and the picture
    const plain = howToInstallHtml({ ...o, k4: 0, music: 0, shot: null });
    expect(plain).not.toContain('<td>4K-фоны и клипы</td>');
    expect(plain).not.toContain('<img');
  });

  it('written as HTML where there is no Chrome', () => {
    const dir = tmp('bk-doc-');
    expect(writeDocument('<p>x</p>', path.join(dir, 'Как установить'), { chrome: null })).toBe('Как установить.html');
    expect(readFileSync(path.join(dir, 'Как установить.html'), 'utf8')).toBe('<p>x</p>');
  });

  it.skipIf(!findChrome())('printed as PDF where Chrome is', () => {
    const dir = tmp('bk-doc-');
    expect(writeDocument(howToInstallHtml(o), path.join(dir, 'Как установить'))).toBe('Как установить.pdf');
    expect(readFileSync(path.join(dir, 'Как установить.pdf')).subarray(0, 5).toString()).toBe('%PDF-');
    expect(existsSync(path.join(dir, 'Как установить.html'))).toBe(false);
  }, 60000);
});

describe('unix modes in a zip made on Windows', () => {
  it('the launchers of macOS become executable, the other entries stay as they were, the zip still opens', () => {
    const parent = tmp('bk-zip-');
    const pkg = path.join(parent, 'Пакет');
    mkdirSync(path.join(pkg, 'files'), { recursive: true });
    writeFileSync(path.join(pkg, 'Установить (Mac).command'), '#!/bin/bash\necho hi\n');
    writeFileSync(path.join(pkg, 'files', 'install.command'), '#!/bin/bash\n');
    writeFileSync(path.join(pkg, 'Как установить.html'), '<p>x</p>');
    const zip = path.join(parent, 'p.zip');
    zipFolder(parent, 'Пакет', zip);
    const before = listEntries(zip);
    expect(before.filter((e) => /[^\x00-\x7f]/.test(e.name)).every((e) => e.utf8)).toBe(true);
    expect(setUnixMode(zip, (n) => n.endsWith('.command'), 0o100755).sort()).toEqual(['Пакет/files/install.command', 'Пакет/Установить (Mac).command']);
    const after = listEntries(zip);
    for (const e of after) {
      const was = before.find((b) => b.name === e.name);
      if (e.name.endsWith('.command')) expect([e.unix, e.mode]).toEqual([true, 0o100755]);
      else expect([e.unix, e.mode]).toEqual([was.unix, was.mode]);
    }
    const z = new AdmZip(zip);
    expect(z.readAsText('Пакет/Установить (Mac).command')).toBe('#!/bin/bash\necho hi\n');
  });
});
