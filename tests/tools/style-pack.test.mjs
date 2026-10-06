// The caption style into the build dir (tools/library/style-pack.mjs): checked on the sample of the build PC
// (docs/research/premiere/captions-style-sample.txt, the PremiereData of «CR Субтитры»), then copied.
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultStyleFile, stageStyle, styleBuildName, styleProblems } from '../../tools/library/style-pack.mjs';

const SAMPLE = readFileSync(new URL('../../docs/research/premiere/captions-style-sample.txt', import.meta.url), 'utf8');
const XML = SAMPLE.slice(SAMPLE.indexOf('<?xml'));

describe('caption style for the build', () => {
  it('the sample of the build PC passes: a style item named «CR Субтитры», SB Sans Text in its Source Text', () => {
    expect(styleProblems(XML)).toEqual([]);
  });

  it('another style, another font, not a style at all', () => {
    expect(styleProblems(XML.replace('<Name>CR Субтитры</Name>', '<Name>Default</Name>'))).toEqual(['CRS_SubtitleStyle: стиль называется не «CR Субтитры»']);
    expect(styleProblems(XML, { id: 'X', name: 'CR Субтитры', font: 'Arial-BoldMT' })).toEqual(['X: нет шрифта Arial-BoldMT']);
    expect(styleProblems('<?xml version="1.0"?><PremiereData Version="3"><Project/></PremiereData>')).toHaveLength(3);
  });

  it('copies into the build dir under the name of the catalog; --check copies nothing', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-style-'));
    const from = path.join(dir, 'CR Субтитры.prtextstyle');
    writeFileSync(from, XML, 'utf8');
    const build = path.join(dir, 'build');
    expect(stageStyle({ from, buildDir: build, check: true })).toEqual({ ok: true, problems: [], staged: [] });
    expect(existsSync(path.join(build, styleBuildName()))).toBe(false);
    expect(stageStyle({ from, buildDir: build })).toEqual({ ok: true, problems: [], staged: ['CRS_SubtitleStyle/CRS_SubtitleStyle_style_v1.prtextstyle'] });
    expect(readFileSync(path.join(build, styleBuildName()), 'utf8')).toBe(XML);
    expect(stageStyle({ from: path.join(dir, 'nope.prtextstyle'), buildDir: build }).problems[0]).toMatch(/нет файла/);
  });

  it('the default file of the build PC: a Cyrillic name under the ASCII work folder', () => {
    expect(defaultStyleFile()).toMatch(/\/materials\/premiere\/CR Субтитры\.prtextstyle$/);
  });
});
