#!/usr/bin/env node
// Finds SB Sans font files and reads their PostScript names and builds from the name table.
//   node tools/fonts/scan-fonts.mjs [--all] [--out docs/decisions/fonts-this-pc.json]
// By default only files whose name contains "SBSans" / "SB Sans" are parsed. --all parses every
// font file and keeps faces whose PostScript name starts with SBSans (slower; for renamed files).
// The file name is not trusted: SBSansDisplay-SemiBold.otf holds SBSansDisplay-Semibold (quirk 187).
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFontNames } from './opentype-name.mjs';

const FONT_EXT = /\.(otf|ttf|ttc)$/i;
const SB_FILE = /sb[\s_-]?sans/i;
const slash = (p) => String(p).replace(/\\/g, '/');

export function fontDirs(platform = process.platform, env = process.env) {
  if (platform === 'win32') {
    const dirs = [slash(env.WINDIR || 'C:/Windows') + '/Fonts'];
    if (env.LOCALAPPDATA) dirs.push(slash(env.LOCALAPPDATA) + '/Microsoft/Windows/Fonts');
    dirs.push(slash(env.CommonProgramFiles || 'C:/Program Files/Common Files') + '/Adobe/Fonts');
    return dirs;
  }
  const home = env.HOME || os.homedir();
  if (platform === 'darwin') {
    return ['/Library/Fonts', home + '/Library/Fonts', '/Library/Application Support/Adobe/Fonts'];
  }
  return ['/usr/share/fonts', '/usr/local/share/fonts', home + '/.local/share/fonts'];
}

// Adobe's font folder keeps faces in subfolders; system folders are flat.
function listFiles(dir) {
  for (const opts of [{ recursive: true }, {}]) {
    try {
      return readdirSync(dir, opts).map((n) => path.join(dir, String(n)));
    } catch {
      // fall through to a flat listing, then to nothing
    }
  }
  return [];
}

export function findConflicts(fonts) {
  const byName = new Map();
  for (const f of fonts) {
    if (!byName.has(f.postScriptName)) byName.set(f.postScriptName, []);
    byName.get(f.postScriptName).push(f);
  }
  const out = [];
  for (const [postScriptName, list] of byName) {
    if (list.length > 1) {
      out.push({ postScriptName, versions: [...new Set(list.map((f) => f.version))], files: list.map((f) => f.file) });
    }
  }
  return out;
}

export function scanFonts({ dirs = fontDirs(), all = false } = {}) {
  const fonts = [];
  const errors = [];
  const dirInfo = dirs.map((d) => ({ dir: slash(d), exists: existsSync(d) }));
  for (const { dir, exists } of dirInfo) {
    if (!exists) continue;
    for (const file of listFiles(dir)) {
      if (!FONT_EXT.test(file) || (!all && !SB_FILE.test(path.basename(file)))) continue;
      try {
        if (!statSync(file).isFile()) continue;
        const n = readFontNames(file);
        if (all && !/^SBSans/.test(n.postScriptName || '')) continue;
        fonts.push({
          file: slash(file),
          postScriptName: n.postScriptName,
          version: n.versionNumber,
          versionString: n.version,
          family: n.typoFamily || n.family,
          style: n.typoSubfamily || n.subfamily,
        });
      } catch (e) {
        errors.push({ file: slash(file), error: e.message });
      }
    }
  }
  fonts.sort((a, b) => String(a.postScriptName).localeCompare(String(b.postScriptName)) || a.file.localeCompare(b.file));
  return { platform: process.platform, scannedAt: new Date().toISOString(), dirs: dirInfo, fonts, conflicts: findConflicts(fonts), errors };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf('--out');
  const r = scanFonts({ all: argv.includes('--all') });
  const json = JSON.stringify(r, null, 2) + '\n';
  if (outIdx !== -1) {
    writeFileSync(argv[outIdx + 1], json, 'utf8');
    console.error(`written ${argv[outIdx + 1]}`);
  } else {
    process.stdout.write(json);
  }
  console.error(`${r.fonts.length} SB Sans faces, ${r.conflicts.length} conflicts, ${r.errors.length} unreadable files`);
}
