// Checks before an insert (spec 6.1 step 2 and 8.2): every refusal and warning at once, errors first, so the form
// can list them all. Nothing here asks the host: the context, the font statuses and the variant choice come in.
import type { FontStatus, HostContext, Issue, Item } from './types';
import { minLen } from './duration';
import { validateValues, type Values } from './fields';
import { frameLabel, templateName, type VariantChoice } from './variant';
import { formatVersion, hostVersionAtLeast, parseHostVersion, pluginAtLeast } from './versions';

export interface PreflightInput {
  ctx: HostContext;
  item: Item;
  choice: VariantChoice;
  values: Values;
  lenSec: number;
  // Statuses of item.requiredFonts (AE: host checkFonts, Premiere: the Node font service), or null when that check
  // did not run or failed: then a text template is refused with FONT_CHECK_FAILED, never let through and never
  // called "not installed". A required font the check did not report counts as missing.
  fonts: FontStatus[] | null;
  pluginVersion: string;
  minPluginVersion?: string; // library.minPluginVersion; parseLibrary already refuses a library that is too new
}

// Windows MAX_PATH is 260 with the terminating NUL. Premiere unpacks a MOGRT into
// <project dir>\Motion Graphics Template Media\<capsule GUID>\<template>.aegraphic and reports a longer path as
// 'Motion Graphics Template is corrupt' (spec 6.1).
export const MAX_PATH = 259;
const MGT_MEDIA = 'Motion Graphics Template Media';
const CAPSULE_ID = 36; // a GUID with dashes
const AEGRAPHIC = '.aegraphic';
const LEN_EPS = 1e-6;

function dirname(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i >= 0 ? p.slice(0, i) : '';
}

export function mogrtMediaPathLength(projectPath: string, template: string): number {
  return dirname(projectPath).length + 1 + MGT_MEDIA.length + 1 + CAPSULE_ID + 1 + template.length + AEGRAPHIC.length;
}

// Media slots, companions and T2/T3 files are copied into Cloud.ru BrandKit/<id>@<version>/ next to the project
// (spec 6.1), so they need a saved project. Pack 1 needs none of it.
export function needsProjectFolder(item: Item): boolean {
  if (item.tier !== 'T1') return true;
  if ((item.fields ?? []).some((f) => f.type === 'media')) return true;
  const companions = (item as Item & { companions?: unknown }).companions;
  return Array.isArray(companions) && companions.length > 0;
}

function statusOf(fonts: FontStatus[], ps: string): FontStatus | undefined {
  const lower = ps.toLowerCase();
  return fonts.find((s) => s.postScriptName === ps) ?? fonts.find((s) => String(s.postScriptName).toLowerCase() === lower);
}

export function preflight(input: PreflightInput): Issue[] {
  const { ctx, item, choice, values, lenSec } = input;
  const issues: Issue[] = [];
  const add = (code: string, level: Issue['level'], params?: Issue['params']) => {
    issues.push(params ? { code, level, params } : { code, level });
  };
  const target = ctx.target;
  const variant = choice.variant;

  if (!target) add('NO_TARGET', 'error');
  if (input.minPluginVersion && !pluginAtLeast(input.pluginVersion, input.minPluginVersion)) {
    add('PLUGIN_TOO_OLD', 'error', { need: input.minPluginVersion, have: input.pluginVersion });
  }
  const needHost = variant?.minHostVersion?.[ctx.host];
  if (needHost && !hostVersionAtLeast(ctx.hostVersion, needHost)) {
    const have = parseHostVersion(ctx.hostVersion);
    add('HOST_TOO_OLD', 'error', { need: needHost, have: have ? formatVersion(have) : String(ctx.hostVersion) });
  }
  if (target && choice.match === 'none') {
    const frame = frameLabel(target.w, target.h);
    add('NO_VARIANT', 'error', choice.nearest ? { frame, nearest: choice.nearest.key } : { frame });
  }

  // Premiere always unpacks the MOGRT next to the project; AE needs the folder only for copied files.
  const path = ctx.project.path;
  if (!path && (ctx.host === 'pr' || needsProjectFolder(item))) add('PROJECT_NOT_SAVED', 'error');
  if (path && ctx.host === 'pr' && variant) {
    const length = mogrtMediaPathLength(path, templateName(variant));
    if (length > MAX_PATH) add('PATH_TOO_LONG', 'error', { length, max: MAX_PATH });
  }

  // A missing font is a refusal, another build only a warning (spec 8.1). No statuses (a JS caller may also leave
  // fonts out) means nothing is known about any font.
  const required = item.requiredFonts ?? [];
  const fonts = input.fonts;
  if (!Array.isArray(fonts)) {
    if (required.length) add('FONT_CHECK_FAILED', 'error');
  } else {
    for (const f of required) {
      const s = statusOf(fonts, f.postScriptName);
      if (!s || !s.found || s.substitute) {
        add('FONT_MISSING', 'error', { font: f.postScriptName });
      } else if (f.build && s.build !== f.build) {
        add('FONT_BUILD', 'warning', { font: f.postScriptName, need: f.build, have: s.build ?? '?' });
      }
    }
  }

  const min = minLen(item);
  if (!Number.isFinite(lenSec) || lenSec <= 0 || lenSec + LEN_EPS < min) add('LENGTH_TOO_SHORT', 'error', { min });

  issues.push(...validateValues(item, values));

  // P2: another fps is only a warning, RDT plays on any fps. Premiere fps comes from the timebase (29.97002997...),
  // so fps are compared to 3 decimals.
  const fps3 = (fps: number) => Math.round(fps * 1000);
  if (target && variant && typeof variant.fps === 'number' && fps3(variant.fps) !== fps3(target.fps)) {
    add('FPS_MISMATCH', 'warning', { template: variant.fps, target: target.fps });
  }

  return [...issues.filter((i) => i.level === 'error'), ...issues.filter((i) => i.level !== 'error')];
}
