// PROTOTYPE, not part of the panel (2026-10-07): effects of aescripts plugins rebuilt as a frame engine —
// ffmpeg decodes to raw RGB, JS processes each frame, ffmpeg encodes. Shows what is realistic outside AE and
// Premiere; frames of the run in docs/research/refs/engine/, conclusions in docs/research/refs/aescripts-2026-10-07.md.
//   node tools/fx/proto.mjs slitscan|pixelsort|gridwarp|track <in.mp4> <out.mp4>   (640x360 input)
import { spawn, spawnSync } from 'node:child_process';
const [,, effect, src, out] = process.argv;
const W = 640, H = 360, N = W * H * 3;
const dec = spawn('ffmpeg', ['-loglevel', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
const enc = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', '25', '-i', '-', '-pix_fmt', 'yuv420p', out]);
const lum = (f, o) => 0.2126 * f[o] + 0.7152 * f[o + 1] + 0.0722 * f[o + 2];
const ring = [];
let i = 0;
const fx = {
  // each row from an earlier frame: row y shows the frame y/8 frames ago
  slitscan(f) {
    ring.unshift(Buffer.from(f)); if (ring.length > 46) ring.pop();
    const o = Buffer.alloc(N);
    for (let y = 0; y < H; y++) { const s = ring[Math.min(ring.length - 1, Math.floor(y / 8))]; s.copy(o, y * W * 3, y * W * 3, (y + 1) * W * 3); }
    return o;
  },
  // sort runs of pixels brighter than a threshold by luminance, per row
  pixelsort(f) {
    const o = Buffer.from(f), th = 60 + 40 * Math.sin(i / 10);
    for (let y = 0; y < H; y++) {
      let x = 0;
      while (x < W) {
        while (x < W && lum(f, (y * W + x) * 3) < th) x++;
        const a = x; while (x < W && lum(f, (y * W + x) * 3) >= th) x++;
        if (x - a > 2) {
          const px = []; for (let k = a; k < x; k++) { const p = (y * W + k) * 3; px.push([f[p], f[p + 1], f[p + 2]]); }
          px.sort((p, q) => (p[0] + p[1] + p[2]) - (q[0] + q[1] + q[2]));
          px.forEach((p, k) => { const q = (y * W + a + k) * 3; o[q] = p[0]; o[q + 1] = p[1]; o[q + 2] = p[2]; });
        }
      }
    }
    return o;
  },
  // grid lines that move as a wave: piecewise linear remap between the lines, columns and rows
  gridwarp(f) {
    const cols = 6, rows = 4, t = i / 25;
    const lx = Array.from({ length: cols + 1 }, (_, k) => (k === 0 || k === cols ? k * W / cols : k * W / cols + 30 * Math.sin(t * 3 + k)));
    const ly = Array.from({ length: rows + 1 }, (_, k) => (k === 0 || k === rows ? k * H / rows : k * H / rows + 20 * Math.sin(t * 2 + k * 1.7)));
    const back = (v, lines, n, size) => { let k = 0; while (k < n - 1 && v >= lines[k + 1]) k++; const u = (v - lines[k]) / (lines[k + 1] - lines[k]); return Math.min(size - 1, Math.max(0, Math.round((k + u) * size / n))); };
    const mapX = Array.from({ length: W }, (_, x) => back(x, lx, cols, W)), mapY = Array.from({ length: H }, (_, y) => back(y, ly, rows, H));
    const o = Buffer.alloc(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const s = (mapY[y] * W + mapX[x]) * 3, d = (y * W + x) * 3; o[d] = f[s]; o[d + 1] = f[s + 1]; o[d + 2] = f[s + 2]; }
    for (const x of lx) for (let y = 0; y < H; y++) { const d = (y * W + Math.min(W - 1, Math.round(x))) * 3; o[d] = 38; o[d + 1] = 208; o[d + 2] = 124; }
    return o;
  },
  // colour tracking: the brand green blobs on a coarse grid, boxes and a label line
  track(f) {
    const o = Buffer.from(f), C = 8, gw = W / C, gh = H / C, cells = new Uint8Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) { const p = ((gy * C + 4) * W + gx * C + 4) * 3; cells[gy * gw + gx] = f[p + 1] > 150 && f[p] < 120 && f[p + 2] < 170 ? 1 : 0; }
    const seen = new Uint8Array(gw * gh), boxes = [];
    for (let s = 0; s < cells.length; s++) {
      if (!cells[s] || seen[s]) continue;
      const st = [s]; seen[s] = 1; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      while (st.length) { const c = st.pop(), cx = c % gw, cy = (c / gw) | 0; x0 = Math.min(x0, cx); y0 = Math.min(y0, cy); x1 = Math.max(x1, cx); y1 = Math.max(y1, cy);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy, n = ny * gw + nx; if (nx >= 0 && ny >= 0 && nx < gw && ny < gh && cells[n] && !seen[n]) { seen[n] = 1; st.push(n); } } }
      boxes.push([x0 * C, y0 * C, (x1 + 1) * C, (y1 + 1) * C]);
    }
    const dot = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) { const d = (y * W + x) * 3; o[d] = 255; o[d + 1] = 255; o[d + 2] = 255; } };
    for (const [a, b, c, d] of boxes) {
      for (let x = a - 4; x <= c + 4; x++) { dot(x, b - 4); dot(x, d + 4); }
      for (let y = b - 4; y <= d + 4; y++) { dot(a - 4, y); dot(c + 4, y); }
      for (let k = 0; k < 60; k++) dot(c + 4 + k, b - 4 - (k >> 1));
    }
    return o;
  },
};
let acc = Buffer.alloc(0);
dec.stdout.on('data', (d) => {
  acc = Buffer.concat([acc, d]);
  while (acc.length >= N) { const f = acc.subarray(0, N); acc = acc.subarray(N); enc.stdin.write(fx[effect](f)); i += 1; }
});
dec.on('close', () => enc.stdin.end());
enc.on('close', () => console.log(effect, i, 'frames'));
