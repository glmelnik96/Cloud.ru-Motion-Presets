// Version strings the panel compares: host versions (AE app.version '26.5x89', Premiere '26.5.2', the library's
// minHostVersion '26.0'), the panel's semver against the library's minPluginVersion, and the library calver
// ('2026.10.05', or '2026.10.05.2' for a second build that day).

export type HostVersion = [number, number, number];

const HOST = /^\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?/;
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/;
const CALVER = /^\d+(?:\.\d+)*$/;

const sign = (d: number) => (d < 0 ? -1 : d > 0 ? 1 : 0);

// '26.5x89' -> [26, 5, 0] (AE puts its build after 'x'), '26.5.2' -> [26, 5, 2], '26.0' -> [26, 0, 0].
export function parseHostVersion(v: string): HostVersion | null {
  const m = HOST.exec(String(v));
  return m ? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)] : null;
}

// Part by part; a missing part counts as 0.
export function compareVersions(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const d = sign((a[i] ?? 0) - (b[i] ?? 0));
    if (d) return d;
  }
  return 0;
}

// False when either side is unreadable: an unknown host never passes a minimum.
export function hostVersionAtLeast(have: string, need: string): boolean {
  const h = parseHostVersion(have);
  const n = parseHostVersion(need);
  return !!h && !!n && compareVersions(h, n) >= 0;
}

// [26, 5, 0] -> '26.5', [26, 5, 2] -> '26.5.2': what people see in the app's About box.
export function formatVersion(v: readonly number[]): string {
  const parts = [...v];
  while (parts.length > 2 && parts[parts.length - 1] === 0) parts.pop();
  return parts.join('.');
}

export interface Semver {
  core: HostVersion;
  pre: (string | number)[];
}

export function parseSemver(v: string): Semver | null {
  const m = SEMVER.exec(String(v));
  if (!m) return null;
  const pre = m[4] ? m[4].split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p)) : [];
  return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre };
}

// semver 2.0 precedence: a pre-release sorts below its release; numeric identifiers sort numerically and below
// alphanumeric ones; build metadata is ignored. An unreadable version sorts below every readable one.
export function compareSemver(a: string, b: string): number {
  const x = parseSemver(a);
  const y = parseSemver(b);
  if (!x || !y) return x ? 1 : y ? -1 : 0;
  const core = compareVersions(x.core, y.core);
  if (core) return core;
  if (!x.pre.length || !y.pre.length) return sign(y.pre.length - x.pre.length);
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i += 1) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined || q === undefined) return p === undefined ? -1 : 1;
    if (p === q) continue;
    if (typeof p === 'number' && typeof q === 'number') return sign(p - q);
    if (typeof p === 'number' || typeof q === 'number') return typeof p === 'number' ? -1 : 1;
    return p < q ? -1 : 1;
  }
  return 0;
}

// False when either side is unreadable, so a broken version can never unlock a library.
export function pluginAtLeast(have: string, need: string): boolean {
  return !!parseSemver(have) && !!parseSemver(need) && compareSemver(have, need) >= 0;
}

// Library calver: numeric dotted parts, a missing part counts as 0. Unreadable sorts below readable.
export function compareCalver(a: string, b: string): number {
  const parse = (v: string) => (CALVER.test(String(v)) ? String(v).split('.').map(Number) : null);
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return x ? 1 : y ? -1 : 0;
  return compareVersions(x, y);
}
