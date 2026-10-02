// The master logo (spec D18: brand/logo/master-ae-motion-live.svg) as AE shape data for master builders:
// cube and wordmark subpaths scaled by `scale` and placed so the SVG point (0, 0) lands on `offset`.
import { masterParts } from '../dump/logo-diff.mjs';
import { bbox, samplePolyline, transformSubpath } from '../dump/geometry.mjs';

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const round = (sp) => ({
  closed: sp.closed,
  vertices: sp.vertices.map((p) => p.map(r6)),
  inTangents: sp.inTangents.map((p) => p.map(r6)),
  outTangents: sp.outTangents.map((p) => p.map(r6)),
});

export function masterBoxes(svg) {
  const { parts } = masterParts(svg);
  const box = (sps) => bbox(sps.flatMap((s) => samplePolyline(s)));
  return { parts, cube: box(parts.cube), wordmark: box(parts.wordmark), all: box(parts.cube.concat(parts.wordmark)) };
}

export function masterLockup(svg, { scale, offset = [0, 0] }) {
  const { parts, cube, wordmark, all } = masterBoxes(svg);
  const m = [scale, 0, 0, scale, offset[0], offset[1]];
  const placed = (sps) => sps.map((sp) => round(transformSubpath(sp, m)));
  const at = (b) => ({ x0: r6(b.x0 * scale + offset[0]), y0: r6(b.y0 * scale + offset[1]), x1: r6(b.x1 * scale + offset[0]), y1: r6(b.y1 * scale + offset[1]) });
  return { cube: placed(parts.cube), wordmark: placed(parts.wordmark), boxes: { cube: at(cube), wordmark: at(wordmark), all: at(all) } };
}

// Scale and offset that put the master cube exactly on a measured cube box.
export function fitCube(svg, cubeBox) {
  const { cube } = masterBoxes(svg);
  const scale = cubeBox.w / cube.w;
  return { scale: r6(scale), offset: [r6(cubeBox.x0 - cube.x0 * scale), r6(cubeBox.y0 - cube.y0 * scale)] };
}
