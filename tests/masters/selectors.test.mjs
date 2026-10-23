// Text selectors and animators of every master never measure text. A selector that reads sourceRectAtTime of its
// own layer, or of a layer whose selector reads it back, is a loop that AE breaks when it evaluates a frame of the
// hold first (Premiere, a scrub, a single render): the selector falls back to its static Start 0 and the line
// stays hidden under its plate or band. Rendering from the start hid it, so the goldens passed (2026-10-23: the
// last line of CRS_Cover and SMM_ShortsIntro missing in Premiere). Which lines are there comes from the source
// texts (rig-plate HAS_TEXT_JS). A shared head may still declare a measuring function, as long as the selector
// does not call it. Resolves from the dumps: the build machine only.
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HAS_DUMPS = existsSync('C:/CRBK/work/dumps/courses/oblozhka_1.json') && existsSync('C:/CRBK/work/dumps/smm/zastavka_9x16.json');
const MASTERS = readdirSync(path.join(REPO, 'masters')).filter((d) => existsSync(path.join(REPO, 'masters', d, 'resolve.mjs')));

// The calls of a selector expression that measure text: sourceRectAtTime itself, or a function the expression
// declares around it, outside the declarations.
export function measuringCalls(src) {
  const lines = src.split('\n');
  const decl = lines.filter((l) => /^\s*function\s+\w+\s*\(/.test(l));
  const measuring = decl.filter((l) => /sourceRectAtTime/.test(l)).map((l) => l.match(/function\s+(\w+)/)[1]);
  const body = lines.filter((l) => !/^\s*function\s+\w+\s*\(/.test(l)).join('\n');
  const calls = [];
  if (/sourceRectAtTime/.test(body)) calls.push('sourceRectAtTime');
  for (const f of measuring) if (new RegExp(`\\b${f}\\(`).test(body)) calls.push(f);
  return calls;
}

describe('measuringCalls', () => {
  it('finds direct reads and calls of declared measuring functions, not the declarations', () => {
    expect(measuringCalls('function ink(n) { return thisComp.layer(n).sourceRectAtTime(4, false); }\n100')).toEqual([]);
    expect(measuringCalls('function ink(n) { return thisComp.layer(n).sourceRectAtTime(4, false); }\nvar e = ink("A");\n100')).toEqual(['ink']);
    expect(measuringCalls('var w = thisComp.layer("A").sourceRectAtTime(0, false).width;\nw')).toEqual(['sourceRectAtTime']);
    expect(measuringCalls('function hasText(n) { return String(thisComp.layer(n).text.sourceText) !== ""; }\nhasText("A") ? 100 : 0')).toEqual([]);
  });
});

describe.skipIf(!HAS_DUMPS)('text selectors never measure text', () => {
  for (const id of MASTERS) {
    it(id, async () => {
      const { resolve } = await import(pathToFileURL(path.join(REPO, 'masters', id, 'resolve.mjs')).href);
      const p = resolve();
      const exprs = (p.spec && p.spec.expressions) || [];
      const bad = exprs.filter((e) => e.path[0] === 'selector' || e.path[0] === 'animator')
        .map((e) => ({ at: `${e.layer} ${e.path.join('/')}`, calls: measuringCalls(e.src) }))
        .filter((x) => x.calls.length);
      expect(bad).toEqual([]);
    });
  }
});
