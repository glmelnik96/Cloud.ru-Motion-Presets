// Full cover of a frame by a transition's rectangles (TRN_StepWipe, TRN_Bars): spec 5 wants the cut under at least four
// frames of full cover, and cutFrame (the first of them) is where the panel puts the cut.

// How axis-aligned rectangles { l, r, t, b } meet a window of the frame, exactly: full — every point of it covered
// with a pixel to spare (no half-covered edge pixel), shows — some rectangle reaches half a pixel into it.
export function coverOf(rects, win) {
  const g = { l: win.l - 1, r: win.r + 1, t: win.t - 1, b: win.b + 1 };
  const shows = rects.some((q) => Math.min(q.r, win.r) - Math.max(q.l, win.l) >= 0.5 && Math.min(q.b, win.b) - Math.max(q.t, win.t) >= 0.5);
  const xs = [...new Set([g.l, g.r, ...rects.flatMap((q) => [q.l, q.r]).filter((x) => x > g.l && x < g.r)])].sort((a, b) => a - b);
  let full = true;
  for (let i = 0; full && i < xs.length - 1; i += 1) {
    const mid = (xs[i] + xs[i + 1]) / 2;
    const spans = rects.filter((q) => q.l <= mid && q.r >= mid).map((q) => [q.t, q.b]).sort((a, b) => a[0] - b[0]);
    let reach = g.t;
    for (const [a, b] of spans) if (a <= reach + 1e-9) reach = Math.max(reach, b);
    full = reach >= g.b - 1e-9;
  }
  return { full, shows };
}

// The frames of a transition per window: where it shows and where it covers it all, for frames 0..n-1 at fps.
export function coverFrames(rectsAt, windows, n, fps) {
  const per = {};
  for (const [k, win] of Object.entries(windows)) {
    const shown = [];
    const full = [];
    for (let f = 0; f < n; f += 1) {
      const c = coverOf(rectsAt(f / fps), win);
      if (c.shows) shown.push(f);
      if (c.full) full.push(f);
    }
    per[k] = { shown, full };
  }
  return per;
}

// The master's timeline from the pack's frames of the widest window: its shown frames from the first, the first full
// frame held until `hold` frames cover; packTime(f) is the pack time of master frame f (the time remap's curve).
export function holdTimeline({ shown, full }, fps, hold) {
  const run = (fs) => fs.length > 0 && fs[fs.length - 1] - fs[0] === fs.length - 1;
  if (!run(shown) || !run(full)) throw new Error(`the transition shows on ${shown.join(',')}, covers on ${full.join(',')}: not one run each`);
  const head = shown[0];
  const extra = Math.max(0, hold - full.length);
  const cutFrame = full[0] - head;
  const frames = shown.length + extra;
  const r6 = (v) => Math.round(v * 1e6) / 1e6;
  const packTime = (f) => r6((f <= cutFrame ? f + head : f < cutFrame + extra ? cutFrame + head : f + head - extra) / fps);
  return { head, tail: shown[shown.length - 1], extra, cutFrame, frames, durationSec: r6(frames / fps), packTime };
}

// The time remap of the master's precomp: the pack's time from its first shown frame, held E seconds at the cut.
export function holdRemapJs({ head, cutFrame, extra }, fps) {
  const r6 = (v) => Math.round(v * 1e6) / 1e6;
  return `var A = ${r6(head / fps)}, C = ${r6(cutFrame / fps)}, E = ${r6(extra / fps)}, e = 1e-6;\ntime <= C + e ? time + A : (time < C + E - e ? C + A : time + A - E)`;
}
