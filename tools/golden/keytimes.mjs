// Key times of a golden render (Plan 2, Task 4): every 0.25 s for the first 15 s, then every 5 s up
// to 60 s, every marker (and the end of a marker with a duration), and the last 2 s in 0.25 s steps
// counted back from the end, plus the very last frame. Frame-aligned (frame = round(t * fps)),
// deduplicated, sorted, never past the last frame: saveFrameToPng past the end silently returns
// the last frame (ae-quirks #56). ms = round(frame / fps * 1000) names the PNG: t<ms>.png.
export const RULE = '0.25 s to 15 s; 5 s to 60 s; markers; last 2 s by 0.25 s; last frame';

export function keyFrames({ duration, fps, markers = [] }) {
  if (!(fps > 0) || !(duration > 0)) throw new Error(`bad comp timing: ${duration} s at ${fps} fps`);
  const last = Math.max(0, Math.round(duration * fps) - 1);
  const times = [];
  for (let k = 0; k * 0.25 < Math.min(15, duration); k += 1) times.push(k * 0.25);
  for (let s = 15; s <= 60 && s < duration; s += 5) times.push(s);
  for (const m of markers) {
    times.push(m.time);
    if (m.duration > 0) times.push(m.time + m.duration);
  }
  for (let k = 0; k <= 8; k += 1) times.push(duration - 2 + k * 0.25);
  const frames = new Set([last]);
  for (const t of times) {
    if (t < 0 || t > duration + 1e-9) continue;
    frames.add(Math.min(Math.round(t * fps), last));
  }
  return [...frames].sort((a, b) => a - b).map((f) => ({ f, ms: Math.round((f / fps) * 1000) }));
}
