import { describe, it, expect } from 'vitest';
import { readNames, decodeMacRoman } from '../../tools/fonts/opentype-name.mjs';
import { makeFont, makeTtc, win, mac } from '../helpers/make-font.mjs';

describe('opentype name table', () => {
  it('reads the PostScript name and the version from Windows records', () => {
    const r = readNames(makeFont({ names: [win(1, 'SB Sans Display Semibold'), win(5, 'Version 1.002'), win(6, 'SBSansDisplay-Semibold')] }));
    expect(r.postScriptName).toBe('SBSansDisplay-Semibold');
    expect(r.version).toBe('Version 1.002');
    expect(r.versionNumber).toBe('1.002');
    expect(r.family).toBe('SB Sans Display Semibold');
  });
  it('reads Mac Roman records when there is no Windows record', () => {
    const cafe = { platformID: 1, encodingID: 0, languageID: 0, nameID: 1, bytes: Buffer.from([0x43, 0x61, 0x66, 0x8e]) };
    const r = readNames(makeFont({ names: [mac(5, 'Version 1.000'), mac(6, 'SBSansText-Regular'), cafe] }));
    expect(r.postScriptName).toBe('SBSansText-Regular');
    expect(r.versionNumber).toBe('1.000');
    expect(r.family).toBe('Caf' + String.fromCharCode(0xe9));
  });
  it('prefers Windows English over other Windows languages and over Mac', () => {
    const r = readNames(makeFont({ names: [mac(6, 'FromMac'), win(6, 'FromRu', 0x0419), win(6, 'FromEn')] }));
    expect(r.postScriptName).toBe('FromEn');
  });
  it('accepts the TrueType header and a TTC collection', () => {
    expect(readNames(makeFont({ sfnt: 'truetype', names: [win(6, 'TT')] })).postScriptName).toBe('TT');
    expect(readNames(makeTtc(makeFont({ base: 16, names: [win(6, 'InTtc')] }))).postScriptName).toBe('InTtc');
  });
  it('returns null for names the font does not have', () => {
    const r = readNames(makeFont({ names: [win(6, 'OnlyPs')] }));
    expect(r.version).toBeNull();
    expect(r.versionNumber).toBeNull();
  });
  it('rejects files that are not fonts', () => {
    expect(() => readNames(Buffer.from('this is not a font file at all'))).toThrow(/not an sfnt/);
    expect(() => readNames(Buffer.from('tiny'))).toThrow(/too short/);
  });
  it('decodes Mac Roman high bytes', () => {
    expect(decodeMacRoman(Buffer.from([0x80, 0xa5, 0xdb]))).toBe(String.fromCharCode(0xc4, 0x2022, 0x20ac));
  });
});
