// Version strings of the hosts and the plugin. AE reports "26.5x89" (build after the x), Premiere "26.5.2",
// the plugin semver "1.2.3". Only the leading dotted numbers count.

export function parseVersion(v: string | null | undefined): number[] {
  const m = /^\s*(\d+(?:\.\d+)*)/.exec(String(v ?? ''));
  return m ? m[1].split('.').map(Number) : [];
}

// -1, 0 or 1; missing parts count as 0 ("26" equals "26.0.0").
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a);
  const y = parseVersion(b);
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

export function atLeast(have: string, need: string): boolean {
  return parseVersion(have).length > 0 && compareVersions(have, need) >= 0;
}

// "26.5x89" -> "26.5": the part a user recognises in Help > About.
export function shortVersion(v: string): string {
  return parseVersion(v).join('.') || String(v);
}
