/** Scalar helpers shared by geometry and texture cores. */
export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Maps x from [inMin,inMax] to [outMin,outMax] without clamping. */
export function remap(
  x: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  const t = (x - inMin) / (inMax - inMin);
  return outMin + (outMax - outMin) * t;
}

/** Smoothstep — Hermite interpolation, returns 0..1. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export const TAU = Math.PI * 2;
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

// --- VEX-parity scalar helpers ---------------------------------------------

/** VEX `fit`: map x from [omin,omax] to [nmin,nmax], clamped to the range. */
export function fit(
  x: number,
  omin: number,
  omax: number,
  nmin: number,
  nmax: number,
): number {
  if (omin === omax) return nmin;
  let t = (x - omin) / (omax - omin);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return nmin + (nmax - nmin) * t;
}

/** VEX `fit01`: map x from [0,1] to [nmin,nmax], clamped. */
export function fit01(x: number, nmin: number, nmax: number): number {
  return fit(x, 0, 1, nmin, nmax);
}

/** VEX `fit10`: map x from [1,0] to [nmin,nmax], clamped. */
export function fit10(x: number, nmin: number, nmax: number): number {
  return fit(x, 1, 0, nmin, nmax);
}

/** VEX `fit11`: map x from [-1,1] to [nmin,nmax], clamped. */
export function fit11(x: number, nmin: number, nmax: number): number {
  return fit(x, -1, 1, nmin, nmax);
}

/** VEX `efit`: like fit but never clamps (extrapolates). Alias of remap. */
export function efit(
  x: number,
  omin: number,
  omax: number,
  nmin: number,
  nmax: number,
): number {
  return remap(x, omin, omax, nmin, nmax);
}

/** VEX `invlerp`: inverse of lerp — where does v sit in [a,b]? Unclamped. */
export function invlerp(a: number, b: number, v: number): number {
  return a === b ? 0 : (v - a) / (b - a);
}

/** VEX `frac`: fractional part, always in [0,1) for negatives too. */
export function frac(x: number): number {
  return x - Math.floor(x);
}

/** VEX `sign`: -1, 0, or 1. */
export function sign(x: number): number {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
}

/**
 * Schlick bias: warps t in [0,1] toward 0 or 1.
 * b=0.5 is identity; b<0.5 darkens, b>0.5 brightens.
 */
export function bias(t: number, b: number): number {
  if (b <= 0) return 0;
  return t / ((1 / b - 2) * (1 - t) + 1);
}

/** Schlick gain: S-curve / inverse-S contrast control around 0.5. */
export function gain(t: number, g: number): number {
  return t < 0.5
    ? bias(2 * t, 1 - g) / 2
    : 1 - bias(2 - 2 * t, 1 - g) / 2;
}

/**
 * VEX `pulse`: 1 inside (lo,hi) with smooth falloff width on both edges,
 * 0 outside. Useful for masking bands.
 */
export function pulse(lo: number, hi: number, x: number, width = 0): number {
  if (width <= 0) return x >= lo && x <= hi ? 1 : 0;
  return smoothstep(lo - width, lo + width, x) *
    (1 - smoothstep(hi - width, hi + width, x));
}

/**
 * VEX `smooth`: like smoothstep but optional rolloff exponent shapes the
 * Hermite curve. rolloff=1 matches smoothstep.
 */
export function smooth(
  edge0: number,
  edge1: number,
  x: number,
  rolloff = 1,
): number {
  const s = smoothstep(edge0, edge1, x);
  return rolloff === 1 ? s : Math.pow(s, rolloff);
}

/** Round half to even-ish — JS Math.round rounds half up; expose rint=round. */
export function rint(x: number): number {
  return Math.round(x);
}

/** VEX `radians` / `degrees`. */
export function radians(deg: number): number {
  return deg * DEG2RAD;
}
export function degrees(rad: number): number {
  return rad * RAD2DEG;
}

/**
 * VEX `solvequadratic`: roots of a*x^2 + b*x + c = 0.
 * Returns ascending real roots (0, 1, or 2 entries).
 */
export function solvequadratic(a: number, b: number, c: number): number[] {
  if (a === 0) {
    if (b === 0) return [];
    return [-c / b];
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  if (disc === 0) return [-b / (2 * a)];
  const sq = Math.sqrt(disc);
  const r0 = (-b - sq) / (2 * a);
  const r1 = (-b + sq) / (2 * a);
  return r0 <= r1 ? [r0, r1] : [r1, r0];
}

/**
 * VEX `solvecubic`: real roots of a*x^3 + b*x^2 + c*x + d = 0.
 * Returns ascending real roots (1, 2, or 3 entries). Falls back to the
 * quadratic solver when a≈0. Uses the trigonometric / Cardano method.
 */
export function solvecubic(
  a: number,
  b: number,
  c: number,
  d: number,
): number[] {
  if (Math.abs(a) < 1e-12) return solvequadratic(b, c, d);
  // normalize to x^3 + px^2 + qx + r
  const p = b / a;
  const q = c / a;
  const r = d / a;
  // depressed cubic t^3 + Pt + Q via x = t - p/3
  const P = q - (p * p) / 3;
  const Q = (2 * p * p * p) / 27 - (p * q) / 3 + r;
  const shift = -p / 3;
  const disc = (Q * Q) / 4 + (P * P * P) / 27;
  const roots: number[] = [];

  if (disc > 1e-12) {
    // one real root
    const sq = Math.sqrt(disc);
    const u = Math.cbrt(-Q / 2 + sq);
    const v = Math.cbrt(-Q / 2 - sq);
    roots.push(u + v + shift);
  } else if (disc < -1e-12) {
    // three distinct real roots (trigonometric)
    const m = 2 * Math.sqrt(-P / 3);
    const theta = Math.acos((3 * Q) / (P * m)) / 3;
    const t = (2 * Math.PI) / 3;
    roots.push(m * Math.cos(theta) + shift);
    roots.push(m * Math.cos(theta - t) + shift);
    roots.push(m * Math.cos(theta - 2 * t) + shift);
  } else {
    // repeated roots
    const u = Math.cbrt(-Q / 2);
    roots.push(2 * u + shift);
    roots.push(-u + shift);
  }
  return roots.sort((x, y) => x - y);
}
