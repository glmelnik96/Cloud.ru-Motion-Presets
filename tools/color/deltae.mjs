// sRGB (8-bit) -> CIELAB (D65, 2 degree observer) and the CIEDE2000 colour difference.
// Compares rendered colour patches with brand colours (spec §4.4: dE2000 <= 2).
// References: IEC 61966-2-1 (sRGB), CIE 15:2004 (CIELAB), Sharma, Wu, Dalal 2005 (CIEDE2000).

const HEX_RE = /^#?([0-9a-f]{6})$/i;

export function hexToRgb(hex) {
  const m = HEX_RE.exec(String(hex).trim());
  if (!m) throw new Error('bad hex colour: ' + hex);
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return ('#' + c(r) + c(g) + c(b)).toUpperCase();
}

// IEC 61966-2-1 transfer function: 8-bit code value (fractions allowed) -> linear 0..1.
export function srgbToLinear(c8) {
  const c = c8 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// Linear sRGB -> XYZ (D65), matrix as tabulated by Lindbloom from IEC 61966-2-1.
const M = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.0721750],
  [0.0193339, 0.1191920, 0.9503041],
];

// The white of this matrix (row sums), so #FFFFFF lands exactly on L=100, a=b=0.
export const D65 = {
  x: M[0][0] + M[0][1] + M[0][2],
  y: M[1][0] + M[1][1] + M[1][2],
  z: M[2][0] + M[2][1] + M[2][2],
};

export function rgbToXyz({ r, g, b }) {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  return {
    x: M[0][0] * R + M[0][1] * G + M[0][2] * B,
    y: M[1][0] * R + M[1][1] * G + M[1][2] * B,
    z: M[2][0] * R + M[2][1] * G + M[2][2] * B,
  };
}

const EPS = 216 / 24389;
const KAPPA = 24389 / 27;
const f = (t) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116);

export function xyzToLab({ x, y, z }, white = D65) {
  const fx = f(x / white.x);
  const fy = f(y / white.y);
  const fz = f(z / white.z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export const rgbToLab = (rgb) => xyzToLab(rgbToXyz(rgb));
export const hexToLab = (hex) => rgbToLab(hexToRgb(hex));

const RAD = Math.PI / 180;
// atan2 in degrees, mapped to [0, 360).
const hueDeg = (b, a) => {
  if (a === 0 && b === 0) return 0;
  const d = Math.atan2(b, a) / RAD;
  return d < 0 ? d + 360 : d;
};

// CIEDE2000, equations (2)-(22) of Sharma et al. 2005.
export function deltaE2000(lab1, lab2, { kL = 1, kC = 1, kH = 1 } = {}) {
  const { L: L1, a: a1, b: b1 } = lab1;
  const { L: L2, a: a2, b: b2 } = lab2;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar7 = Math.pow((C1 + C2) / 2, 7);
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + Math.pow(25, 7))));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h1p = hueDeg(b1, a1p);
  const h2p = hueDeg(b2, a2p);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp;
  if (C1p * C2p === 0) dhp = 0;
  else if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p;
  else if (h2p - h1p > 180) dhp = h2p - h1p - 360;
  else dhp = h2p - h1p + 360;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * RAD);

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;
  let hbarp;
  if (C1p * C2p === 0) hbarp = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) hbarp = (h1p + h2p) / 2;
  else if (h1p + h2p < 360) hbarp = (h1p + h2p + 360) / 2;
  else hbarp = (h1p + h2p - 360) / 2;

  const T = 1
    - 0.17 * Math.cos((hbarp - 30) * RAD)
    + 0.24 * Math.cos(2 * hbarp * RAD)
    + 0.32 * Math.cos((3 * hbarp + 6) * RAD)
    - 0.20 * Math.cos((4 * hbarp - 63) * RAD);
  const dTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
  const Cbarp7 = Math.pow(Cbarp, 7);
  const RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + Math.pow(25, 7)));
  const L50 = Math.pow(Lbarp - 50, 2);
  const SL = 1 + (0.015 * L50) / Math.sqrt(20 + L50);
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;
  const RT = -Math.sin(2 * dTheta * RAD) * RC;

  const tL = dLp / (kL * SL);
  const tC = dCp / (kC * SC);
  const tH = dHp / (kH * SH);
  return Math.sqrt(tL * tL + tC * tC + tH * tH + RT * tC * tH);
}

export const deltaE2000Rgb = (rgb1, rgb2) => deltaE2000(rgbToLab(rgb1), rgbToLab(rgb2));
export const deltaE2000Hex = (hex1, hex2) => deltaE2000(hexToLab(hex1), hexToLab(hex2));
