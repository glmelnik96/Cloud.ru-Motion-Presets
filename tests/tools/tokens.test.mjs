import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { FORMATS } from '../../tools/library/estimate-weight.mjs';

const raw = readFileSync(new URL('../../brand/tokens.json', import.meta.url), 'utf8');
const tokens = JSON.parse(raw);
const data = (obj) => Object.fromEntries(Object.entries(obj).filter(([k]) => !k.startsWith('_')));

describe('brand/tokens.json', () => {
  it('is approved (A1, phase 0 closed 2026-10-05)', () => {
    expect(tokens.status).toBe('approved');
  });
  it('holds the D1 palette from brandbook page 18', () => {
    const hex = Object.values(tokens.color.base).map((c) => c.hex);
    expect(hex).toEqual(['#26D07C', '#222222', '#FFFFFF', '#F2F2F2', '#CFF500', '#A068FF', '#C0E0FC']);
  });
  it('writes every colour as #RRGGBB in upper case', () => {
    const all = raw.match(/#[0-9A-Fa-f]{3,8}\b/g);
    for (const h of all) expect(h).toMatch(/^#[0-9A-F]{6}$/);
  });
  it('maps replaced colours to base tokens', () => {
    for (const target of Object.values(data(tokens.color.replace))) expect(Object.keys(tokens.color.base)).toContain(target);
  });
  it('uses the exact PostScript names, Semibold with a lower-case b', () => {
    const names = Object.values(tokens.type.fonts).map((f) => f.postScriptName);
    expect(names).toEqual(['SBSansDisplay-Regular', 'SBSansDisplay-Semibold', 'SBSansDisplay-Bold', 'SBSansText-Regular']);
    expect(names.join()).not.toMatch(/SemiBold/);
  });
  it('keeps 25 fps and the formats of the weight estimate', () => {
    expect(tokens.video.fps.default).toBe(25);
    const formats = Object.fromEntries(Object.entries(data(tokens.video.formats)).map(([k, v]) => [k, [v.w, v.h]]));
    expect(formats).toEqual(FORMATS);
  });
});
