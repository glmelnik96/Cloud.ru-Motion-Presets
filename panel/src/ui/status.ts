// The status bar as data (spec 7): the host and its version, the panel and library versions, and whether the fonts
// the library needs are there. Pure: no DOM.
import { formatVersion, parseHostVersion } from '../core/versions';
import type { FontStatus, HostKey } from '../core/types';

export interface FontsSummary {
  tone: 'ok' | 'warn' | 'error' | 'muted';
  text: string;
  missing: string[]; // PostScript names
}

export interface StatusInput {
  host: HostKey;
  hostVersion: string | null | undefined;
  plugin: string;
  library: string | null | undefined;
  fonts: FontsSummary;
}

export interface StatusModel {
  host: string;
  panel: string;
  library: string;
  fonts: FontsSummary;
}

const HOST_NAMES: Readonly<Record<HostKey, string>> = { ae: 'After Effects', pr: 'Premiere Pro' };

// '26.5x89' -> 'After Effects 26.5', '26.5.2' -> 'Premiere Pro 26.5.2'.
export function hostLabel(host: HostKey, version: string | null | undefined): string {
  const parsed = version ? parseHostVersion(version) : null;
  return parsed ? HOST_NAMES[host] + ' ' + formatVersion(parsed) : HOST_NAMES[host];
}

function statusOf(statuses: FontStatus[], ps: string): FontStatus | undefined {
  const lower = ps.toLowerCase();
  return statuses.find((s) => s.postScriptName === ps) ?? statuses.find((s) => String(s.postScriptName).toLowerCase() === lower);
}

// What the preflight would say about these fonts (missing: no status, not found, or a substitute; another build is
// only a warning), in one line. statuses: undefined while the check runs, null when it failed.
export function summarizeFonts(
  required: readonly { postScriptName: string; build?: string }[],
  statuses: FontStatus[] | null | undefined,
): FontsSummary {
  if (statuses === undefined) return { tone: 'muted', text: 'Шрифты: проверяются…', missing: [] };
  const wanted = new Map<string, string | undefined>();
  for (const f of required) if (!wanted.has(f.postScriptName)) wanted.set(f.postScriptName, f.build);
  if (wanted.size === 0) return { tone: 'ok', text: 'Шрифты: проверка не нужна', missing: [] };
  if (statuses === null) return { tone: 'warn', text: 'Шрифты: проверить не удалось', missing: [] };

  const missing: string[] = [];
  const other: string[] = [];
  for (const [name, build] of wanted) {
    const s = statusOf(statuses, name);
    if (!s || !s.found || s.substitute) missing.push(name);
    else if (build && s.build !== build) other.push(name);
  }
  if (missing.length) return { tone: 'error', text: 'Нет шрифтов: ' + missing.join(', '), missing };
  if (other.length) return { tone: 'warn', text: 'Шрифты: другая сборка у ' + other.join(', '), missing: [] };
  return { tone: 'ok', text: 'Шрифты: в порядке', missing: [] };
}

export function statusBar(input: StatusInput): StatusModel {
  return {
    host: hostLabel(input.host, input.hostVersion),
    panel: 'Панель ' + input.plugin,
    library: input.library ? 'Библиотека ' + input.library : 'Библиотека не загружена',
    fonts: input.fonts,
  };
}
