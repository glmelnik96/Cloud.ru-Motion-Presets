#!/usr/bin/env node
// The caption style «CR Субтитры» (D25) into the build dir of the catalog: the Track Style saved once in
// Premiere (Track Style → Create Style, Save to Local styles) becomes <build>/CRS_SubtitleStyle/
// CRS_SubtitleStyle_style_v1.prtextstyle after a check of what the panel relies on: the PremiereData XML of a
// style item, the name of the style and the font SB Sans Text by its PostScript name (the file carries no
// font). The file stays out of git, like the rest of the build.
//   node tools/library/style-pack.mjs [--style "<work>/materials/premiere/CR Субтитры.prtextstyle"] [--build <work>/build] [--check]
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workPath } from '../lib/work.mjs';

export const STYLE = { id: 'CRS_SubtitleStyle', name: 'CR Субтитры', font: 'SBSansText-Regular' };
export const styleBuildName = () => `${STYLE.id}/${STYLE.id}_style_v1.prtextstyle`;

export function styleProblems(xml, style = STYLE) {
  const t = String(xml).replace(/^﻿/, '');
  const out = [];
  if (!/^<\?xml/.test(t.trimStart()) || !t.includes('<PremiereData')) out.push(`${style.id}: не XML PremiereData`);
  if (!t.includes('<StyleProjectItem')) out.push(`${style.id}: нет StyleProjectItem — это не стиль`);
  if (!t.includes(`<Name>${style.name}</Name>`)) out.push(`${style.id}: стиль называется не «${style.name}»`);
  // the font is named inside the base64 values (Source Text): decode them and look for its PostScript name
  const blobs = [...t.matchAll(/Encoding="base64"[^>]*>([A-Za-z0-9+/=\s]+)</g)].map((m) => Buffer.from(m[1].replace(/\s+/g, ''), 'base64').toString('latin1'));
  const named = t.includes(style.font) || blobs.some((b) => b.includes(style.font));
  if (!named) out.push(`${style.id}: нет шрифта ${style.font}`);
  return out;
}

export function stageStyle({ from = workPath('materials', 'premiere', `${STYLE.name}.prtextstyle`), buildDir = workPath('build'), check = false } = {}) {
  if (!existsSync(from)) return { ok: false, problems: [`${STYLE.id}: нет файла ${from}`], staged: [] };
  const problems = styleProblems(readFileSync(from, 'utf8'));
  if (problems.length || check) return { ok: problems.length === 0, problems, staged: [] };
  const dst = path.join(buildDir, styleBuildName());
  mkdirSync(path.dirname(dst), { recursive: true });
  copyFileSync(from, dst);
  return { ok: true, problems, staged: [styleBuildName()] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
  const r = stageStyle({ from: opt('--style'), buildDir: opt('--build'), check: argv.includes('--check') });
  for (const p of r.problems) console.error('FAIL ' + p);
  for (const s of r.staged) console.log('staged ' + s);
  console.log(r.ok ? `OK: «${STYLE.name}»` : `${r.problems.length} problem(s)`);
  process.exit(r.ok ? 0 : 1);
}
