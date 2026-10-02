import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { readMogrt, matchControls, controlNames } from '../../tools/spike/mogrt.mjs';

const ui = (...names) => ({ strDB: names.map((str, i) => ({ localeString: i ? 'ru_RU' : 'en_US', str })) });

function makeMogrt(definition, { aegraphic = true, bom = false } = {}) {
  const zip = new AdmZip();
  const text = (bom ? '\uFEFF' : '') + JSON.stringify(definition);
  zip.addFile('definition.json', Buffer.from(text, 'utf8'));
  if (aegraphic) zip.addFile('project.aegraphic', Buffer.from('PK-not-checked'));
  zip.addFile('thumb.png', Buffer.from('png'));
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'bk-mogrt-')), 'CRT_Test.mogrt');
  zip.writeZip(file);
  return file;
}

const DEF = {
  capsuleID: '11111111-2222-3333-4444-555555555555',
  capsuleName: 'CRT_LowerThird_v1',
  clientControls: [
    { id: 'a', type: 6, uiName: ui('Имя') },
    { id: 'b', type: 1, uiName: ui('Показать должность') },
    { id: 'c', type: 2, uiName: ui('Длительность (служебное, не менять)') },
    { id: 'd', type: 8, uiName: ui('') },
    { id: 'e', type: 13, uiName: ui('Фото') },
  ],
};

describe('mogrt', () => {
  it('collects the distinct non-empty names of a control', () => {
    expect(controlNames({ uiName: ui('Text', 'Текст', 'Text') })).toEqual(['Text', 'Текст']);
    expect(controlNames({})).toEqual([]);
  });

  it('reads entries, capsule and controls of a MOGRT', () => {
    const m = readMogrt(makeMogrt(DEF, { bom: true }));
    expect(m.hasDefinition).toBe(true);
    expect(m.hasAegraphic).toBe(true);
    expect(m.capsuleID).toBe(DEF.capsuleID);
    expect(m.controls.map((c) => c.kind)).toEqual(['text', 'checkbox', 'slider', 'group', 'type13']);
    expect(m.controls[0].names).toEqual(['Имя']);
  });

  it('flags a MOGRT without project.aegraphic', () => {
    expect(readMogrt(makeMogrt(DEF, { aegraphic: false })).hasAegraphic).toBe(false);
  });

  it('matches expected labels and counts controls without groups', () => {
    const m = readMogrt(makeMogrt(DEF));
    expect(matchControls(m.controls, ['Имя', 'Фото', 'Стиль'])).toEqual({
      found: ['Имя', 'Фото'], missing: ['Стиль'], count: 4,
    });
  });
});
