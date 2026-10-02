import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { footageRel, isInside, resolveFootage, acceptance, nameKey } from '../../tools/packs/relink-resolve.mjs';
import { sameProjectFile } from '../../tools/packs/ae-project.mjs';
import { composeJsx } from '../../tools/packs/jsx-call.mjs';
import { mergeSummary, summarize } from '../../tools/packs/relink.mjs';
import { KNOWN_MISSING } from '../../tools/packs/packs.mjs';

const PACK = 'C:/CRBK/packs/webinars';
const LONG = 'A_robotic_arm_performing_minimal,_precise_technological_movements._x_Jeffrey_Milstei.mp4';
const map = {
  ['(Footage)/Folder/Video/' + LONG]: PACK + '/(Footage)/Folder/Video/AI_robot_arm_A_1440p24.mp4',
  '(Footage)/Folder/Video/Seedance.mp4': PACK + '/(Footage)/Folder/Video/AI_robot_arm_B_1440p24.mp4',
  '(Footage)/Folder/Img/Group 2131327780.png': PACK + '/(Footage)/Folder/Img/Group 2131327780.png',
};
const files = Object.values(map);

describe('relink paths', () => {
  it('cuts the (Footage) part out of Mac and Windows paths', () => {
    expect(footageRel('/Volumes/T7_Black/_Video/2_Вебинары/(Footage)/Folder/Video/Seedance.mp4')).toBe('(Footage)/Folder/Video/Seedance.mp4');
    expect(footageRel('C:\\Users\\Глеб\\Documents\\Граф пакет Cloud.ru\\3_Обучающие_курсы\\3_Обучающие курсы\\(Footage)\\Folder\\Visuals\\Kubernetes.png'))
      .toBe('(Footage)/Folder/Visuals/Kubernetes.png');
    expect(footageRel('G:\\Продвижение Cloud.ru Advanced\\3D.png')).toBe(null);
  });
  it('tests "inside the pack" without caring about slashes or case', () => {
    expect(isInside('C:\\CRBK\\packs\\webinars\\(Footage)\\a.png', PACK)).toBe(true);
    expect(isInside('C:/CRBK/packs/webinars_old/a.png', PACK)).toBe(false);
  });
  it('compares base names in NFC with any space as a plain space', () => {
    expect(nameKey('/x/Дисклеймер.wav'.normalize('NFD'))).toBe(nameKey('C:\\y\\ДИСКЛЕЙМЕР.wav'));
    expect(nameKey('G:\\a\\Запись экрана 2026-09-01 в\u202f12.42.01.mov')).toBe(nameKey('Запись экрана 2026-09-01 в 12.42.01.mov'));
  });
  it('accepts the "(converted)" name AE gives an older project', () => {
    expect(sameProjectFile('C:\\CRBK\\packs\\logo\\logo (converted).aep', 'C:/CRBK/packs/logo/logo.aep')).toBe(true);
    expect(sameProjectFile('C:\\CRBK\\packs\\logo\\logo_relinked.aep', 'C:/CRBK/packs/logo/logo.aep')).toBe(false);
    expect(sameProjectFile(null, 'C:/CRBK/packs/logo/logo.aep')).toBe(false);
  });
});

describe('resolveFootage', () => {
  const row = (id, name, p, missing = true) => ({ id, name, missing, placeholder: false, path: p });
  it('relinks renamed, NFD, external and in-pack items, and reports the rest', () => {
    const footage = [
      row(1, LONG, '/Volumes/T7_Black/_Video/2_Вебинары/(Footage)/Folder/Video/' + LONG),
      row(2, 'Seedance.mp4', '/Users/gm/Downloads/Seedance.mp4'),
      row(3, 'Group 2131327780.png', 'C:\\Users\\Глеб\\Documents\\Граф пакет Cloud.ru\\2_Вебинары\\(Footage)\\Folder\\Img\\Group 2131327780.png', false),
      row(4, 'ok.png', 'C:\\CRBK\\packs\\webinars\\(Footage)\\Folder\\Img\\Group 2131327780.png', false),
      row(5, '3D.png', 'G:\\Продвижение Cloud.ru Advanced\\3D.png'),
      { id: 6, name: 'Placeholder', missing: true, placeholder: true, path: null },
    ];
    const r = resolveFootage(footage, { packDir: PACK, map, files });
    expect(r.replace).toEqual([
      { id: 1, name: LONG, path: PACK + '/(Footage)/Folder/Video/AI_robot_arm_A_1440p24.mp4', via: 'map', was: 'missing' },
      { id: 2, name: 'Seedance.mp4', path: PACK + '/(Footage)/Folder/Video/AI_robot_arm_B_1440p24.mp4', via: 'map-name', was: 'missing' },
      { id: 3, name: 'Group 2131327780.png', path: PACK + '/(Footage)/Folder/Img/Group 2131327780.png', via: 'map', was: 'external' },
    ]);
    expect(r.ok.map((x) => x.id)).toEqual([4]);
    expect(r.unresolved.map((x) => [x.id, x.reason])).toEqual([[5, 'missing: not in pack'], [6, 'placeholder']]);
  });
  it('finds a file by NFC name when the map does not know it, and refuses a name that is not unique', () => {
    const nfd = 'Дисклеймер.wav'.normalize('NFD');
    const pod = 'C:/CRBK/packs/podcast';
    const one = resolveFootage([row(7, nfd, '/Volumes/X/old/' + nfd)], { packDir: pod, map: {}, files: [pod + '/(Footage)/SFX/Дисклеймер.wav'] });
    expect(one.replace[0]).toMatchObject({ id: 7, path: pod + '/(Footage)/SFX/Дисклеймер.wav', via: 'name' });
    const two = resolveFootage([row(8, 'a.wav', '/X/a.wav')], { packDir: pod, map: {}, files: [pod + '/(Footage)/1/a.wav', pod + '/(Footage)/2/a.wav'] });
    expect(two.unresolved[0].reason).toBe('missing: ambiguous');
  });
});

describe('acceptance', () => {
  const font = (ps, extra = {}) => ({ postScriptName: ps, version: '1.002', location: 'C:\\Windows\\Fonts\\' + ps + '.otf', isSubstitute: false, ...extra });
  it('accepts a clean pack for golden renders', () => {
    const a = acceptance({ footage: [{ id: 1, name: 'x', missing: false, path: PACK + '/(Footage)/x.png' }],
      fonts: { used: [font('SBSansDisplay-Regular')], missingOrSubstituted: [] } }, { packDir: PACK });
    expect(a).toMatchObject({ relinkOk: true, goldenOk: true, missing: [], external: [] });
  });
  it('lets the known G: files of courses_conv pass the relink but never the golden gate', () => {
    const footage = ['Запись экрана 2026-09-01 в 12.42.01.mov', '3D.png', 'slide_01.png', 'slide_01.png']
      .map((n, i) => ({ id: i, name: n, missing: true, path: 'G:\\prod\\' + n }));
    const a = acceptance({ footage, fonts: { used: [], missingOrSubstituted: [] } },
      { packDir: 'C:/CRBK/packs/courses_conv', knownMissing: KNOWN_MISSING.courses_conv });
    expect(a.relinkOk).toBe(true);
    expect(a.goldenOk).toBe(false);
    expect(a.missing).toHaveLength(4);
  });
  it('blocks golden renders on a substituted or misplaced brand font', () => {
    const sub = acceptance({ footage: [], fonts: { used: [font('SBSansDisplay-Bold', { isSubstitute: true })], missingOrSubstituted: [] } }, { packDir: PACK });
    expect(sub.usedSubstitutes).toEqual(['SBSansDisplay-Bold']);
    expect(sub.goldenOk).toBe(false);
    const times = acceptance({ footage: [], fonts: { used: [font('SBSansDisplay-SemiBold', { location: 'C:\\Windows\\Fonts\\times.ttf' })], missingOrSubstituted: [] } }, { packDir: PACK });
    expect(times.suspiciousFonts).toEqual(['SBSansDisplay-SemiBold @ C:\\Windows\\Fonts\\times.ttf']);
    expect(times.goldenOk).toBe(false);
  });
});

describe('relink report helpers', () => {
  it('composes JSX with PARAMS first', () => {
    const src = composeJsx(['tools/packs/jsx/project-state.jsx'], { a: 'Глеб' });
    expect(src.startsWith('var PARAMS = {"a":"Глеб"};\n')).toBe(true);
    expect(src).toContain('app.project.dirty');
  });
  it('keeps one summary line per pack, sorted by slug', () => {
    const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'bk-sum-')), 'relink-summary.json');
    mergeSummary(file, 'webinars', { goldenOk: true });
    mergeSummary(file, 'logo', { goldenOk: true });
    mergeSummary(file, 'webinars', { goldenOk: false });
    expect(Object.keys(JSON.parse(readFileSync(file, 'utf8')))).toEqual(['logo', 'webinars']);
    expect(JSON.parse(readFileSync(file, 'utf8')).webinars.goldenOk).toBe(false);
  });
  it('summarises a report for the repo', () => {
    const report = {
      date: '2026-10-05', notes: ['dialog seen'],
      plan: { unresolved: [{ name: '3D.png', reason: 'missing: not in pack' }] },
      replaced: [{ ok: true }, { ok: false }],
      after: { version: '26.5x60', engine: 'extendscript',
        fonts: { used: [{ postScriptName: 'SBSansText-Regular', version: '1.003', isSubstitute: false }], missingOrSubstituted: [] } },
      acceptance: { missing: [{ name: '3D.png' }], external: [], relinkOk: true, goldenOk: false, suspiciousFonts: [] },
    };
    expect(summarize(report)).toMatchObject({
      replaced: 1, unresolvedBefore: ['3D.png (missing: not in pack)'], missingAfter: ['3D.png'],
      usedFonts: ['SBSansText-Regular 1.003'], expressionEngine: 'extendscript', notes: ['dialog seen'],
    });
  });
});
