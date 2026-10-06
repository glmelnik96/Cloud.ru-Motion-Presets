#!/usr/bin/env node
// The brand export presets into the build dir of the catalog (decisions P18, P21):
//   <epr dir>/<id>.epr            the nine presets re-saved in Media Encoder at 25 fps, named by item id
//   <aom>                         the AE Output Module templates «CR …», saved with Templates → Save All
// become <build>/<id>/<id>_epr_v1.epr and <build>/AME_Templates/AME_Templates_aom_v1.aom, after each .epr is
// checked against the canon: frame, 25 fps (D2), High, level and the bitrate pair of the original preset
// (docs/research/export/epr-inventory.json), AAC 48 kHz stereo 320 kbps. The files stay out of git, like the
// rest of the build.
//   node tools/library/export-pack.mjs [--epr <work>/export/epr] [--aom <work>/export/CR_BrandKit.aom] [--build <work>/build] [--check]
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workPath } from '../lib/work.mjs';

const TICKS = 254016000000;

// The canon: the nine presets of the archive (7_Пресеты_Media_Encoder) with fps fixed to 25 by D2.
// level: H.264 level as Adobe stores it (42 = 4.2); bitrates in Mbps (target / max).
export const EXPORT_CANON = [
  { id: 'AME_4K', archive: '4K.epr', w: 3840, h: 2160, level: 52, target: 35, max: 40, omTemplate: 'CR 4K' },
  { id: 'AME_FullHD', archive: 'FullHD.epr', w: 1920, h: 1080, level: 42, target: 10, max: 20, omTemplate: 'CR FullHD' },
  { id: 'AME_SMM_4x3', archive: 'SMM_1440x1080.epr', w: 1440, h: 1080, level: 42, target: 5, max: 12, omTemplate: 'CR SMM 4x3' },
  { id: 'AME_SMM_16x9', archive: 'SMM_16x9.epr', w: 1920, h: 1080, level: 42, target: 5, max: 12, omTemplate: 'CR SMM 16x9' },
  { id: 'AME_SMM_1x1', archive: 'SMM_1x1.epr', w: 1080, h: 1080, level: 52, target: 5, max: 12, omTemplate: 'CR SMM 1x1' },
  { id: 'AME_SMM_9x16', archive: 'SMM_9x16.epr', w: 1080, h: 1920, level: 42, target: 5, max: 12, omTemplate: 'CR SMM 9x16' },
  { id: 'AME_WebinarFinal', archive: 'Webinar_Final render.epr', w: 1920, h: 1080, level: 42, target: 5, max: 10, omTemplate: 'CR Webinar Final' },
  { id: 'AME_WebinarTimer', archive: 'Webinar_Timer.epr', w: 1920, h: 1080, level: 42, target: 3, max: 5, omTemplate: 'CR Webinar Timer' },
  { id: 'AME_WebinarIntro', archive: 'Webinar_Zastavka.epr', w: 1920, h: 1080, level: 42, target: 15, max: 20, omTemplate: 'CR Webinar Intro' },
];
export const CANON_FPS = 25;
export const AOM_ID = 'AME_Templates';

function tag(block, name) {
  const m = new RegExp(`<${name}>([^<]*)</${name}>`).exec(block);
  return m ? m[1] : null;
}

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// The values of a .epr (the PremiereData XML of Media Encoder) the canon compares.
export function readEpr(xml) {
  const p = {};
  for (const block of xml.match(/<ExporterParam\b[\s\S]*?<\/ExporterParam>/g) || []) {
    const id = tag(block, 'ParamIdentifier');
    if (id) p[id] = tag(block, 'ParamValue');
  }
  const fpsTicks = num(p.ADBEVideoFPS);
  return {
    w: num(p.ADBEVideoWidth),
    h: num(p.ADBEVideoHeight),
    fps: fpsTicks ? Math.round((TICKS / fpsTicks) * 1000) / 1000 : null,
    profile: num(p.ADBEVideoMPEGProfile),
    level: num(p.ADBEVideoMPEGProfileLevel),
    target: num(p.ADBEVideoTargetBitrate),
    max: num(p.ADBEVideoMaxBitrate),
    audioRate: num(p.ADBEAudioRatePerSecond),
    audioKbps: num(p.ADBEAudioBitrate),
    audioChannels: num(p.ADBEAudioNumChannels),
  };
}

// What differs from the canon, as readable lines; [] for a good preset.
export function eprProblems(canon, e) {
  const out = [];
  const want = (what, have, need) => {
    if (have !== need) out.push(`${canon.id}: ${what} ${have ?? 'нет'}, нужно ${need}`);
  };
  want('кадр', e.w && e.h ? `${e.w}x${e.h}` : null, `${canon.w}x${canon.h}`);
  want('fps', e.fps, CANON_FPS);
  want('профиль (3 = High)', e.profile, 3);
  want('уровень', e.level, canon.level);
  want('битрейт, Мбит/с', e.target !== null && e.max !== null ? `${e.target}/${e.max}` : null, `${canon.target}/${canon.max}`);
  want('звук, Гц', e.audioRate, 48000);
  want('звук, кбит/с', e.audioKbps, 320);
  want('звук, каналы', e.audioChannels, 2);
  return out;
}

// The .aom keeps template names as ASCII text (docs/research/export/ae-aom.json): the brand ones must be there.
export function aomProblems(bytes) {
  const text = Buffer.from(bytes).toString('latin1');
  return EXPORT_CANON.filter((c) => !text.includes(c.omTemplate)).map((c) => `${AOM_ID}: в .aom нет шаблона «${c.omTemplate}»`);
}

export const eprBuildName = (id) => `${id}/${id}_epr_v1.epr`;
export const aomBuildName = () => `${AOM_ID}/${AOM_ID}_aom_v1.aom`;

// Checks the presets and the .aom, and copies them into the build dir unless check is set.
export function stageExport({ eprDir = workPath('export', 'epr'), aom = workPath('export', 'CR_BrandKit.aom'), buildDir = workPath('build'), check = false } = {}) {
  const problems = [];
  const staged = [];
  for (const c of EXPORT_CANON) {
    const src = path.join(eprDir, `${c.id}.epr`);
    if (!existsSync(src)) {
      problems.push(`${c.id}: нет файла ${src} (пересохранённый ${c.archive})`);
      continue;
    }
    const bad = eprProblems(c, readEpr(readFileSync(src, 'utf8')));
    problems.push(...bad);
    if (bad.length || check) continue;
    const dst = path.join(buildDir, eprBuildName(c.id));
    mkdirSync(path.dirname(dst), { recursive: true });
    copyFileSync(src, dst);
    staged.push(eprBuildName(c.id));
  }
  if (!existsSync(aom)) problems.push(`${AOM_ID}: нет файла ${aom}`);
  else {
    const bad = aomProblems(readFileSync(aom));
    problems.push(...bad);
    if (!bad.length && !check) {
      const dst = path.join(buildDir, aomBuildName());
      mkdirSync(path.dirname(dst), { recursive: true });
      copyFileSync(aom, dst);
      staged.push(aomBuildName());
    }
  }
  return { ok: problems.length === 0, problems, staged };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
  const r = stageExport({ eprDir: opt('--epr'), aom: opt('--aom'), buildDir: opt('--build'), check: argv.includes('--check') });
  for (const p of r.problems) console.error('FAIL ' + p);
  for (const s of r.staged) console.log('staged ' + s);
  console.log(r.ok ? `OK: ${EXPORT_CANON.length} presets and the .aom match the canon` : `${r.problems.length} problem(s)`);
  process.exit(r.ok ? 0 : 1);
}
