/**
 * Color-space conversions — VEX parity (hsvtorgb, rgbtohsv, blackbody,
 * luminance, gamma). Colors are linear [r,g,b] tuples in 0..1 unless noted.
 *
 * Self-rewritten from standard color-science formulae. Useful for the AI to
 * author hue-driven palettes and physically-plausible emission without
 * hand-tuning RGB triples.
 */
export type RGB = [number, number, number];

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** VEX `hsvtorgb`: h,s,v in 0..1 -> linear RGB 0..1. */
export function hsvToRgb(h: number, s: number, v: number): RGB {
  h = ((h % 1) + 1) % 1; // wrap hue
  s = clamp01(s);
  v = clamp01(v);
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    default:
      return [v, p, q];
  }
}

/** VEX `rgbtohsv`: linear RGB 0..1 -> [h,s,v] each 0..1. */
export function rgbToHsv(r: number, g: number, b: number): RGB {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

/** Rec.709 relative luminance of a linear RGB color (0..1 in, 0..1 out). */
export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Linear -> sRGB gamma encode (per channel). */
export function linearToSrgb(c: number): number {
  c = clamp01(c);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** sRGB -> linear decode (per channel). */
export function srgbToLinear(c: number): number {
  c = clamp01(c);
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * VEX `blackbody`: approximate linear RGB of a black-body emitter at the given
 * temperature in Kelvin (~1000K..40000K). Normalized so the brightest channel
 * is 1; scale by intensity afterward. Based on Tanner Helland's approximation.
 */
export function blackbody(kelvin: number): RGB {
  const t = Math.max(1000, Math.min(40000, kelvin)) / 100;
  let r: number;
  let g: number;
  let b: number;

  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  }

  if (t >= 66) {
    b = 255;
  } else if (t <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  }

  // 0..255 sRGB-ish -> 0..1 then to linear so it composes with linear pipeline.
  return [
    srgbToLinear(clamp01(r / 255)),
    srgbToLinear(clamp01(g / 255)),
    srgbToLinear(clamp01(b / 255)),
  ];
}

/** Per-channel lerp between two colors. */
export function lerpColor(a: RGB, b: RGB, t: number): RGB {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/** Shift hue of a linear RGB color by `delta` turns (0..1) in HSV space. */
export function hueShift(color: RGB, delta: number): RGB {
  const [h, s, v] = rgbToHsv(color[0], color[1], color[2]);
  return hsvToRgb(h + delta, s, v);
}

/** Adjust saturation (mul) and value (mul) in HSV space. */
export function adjustHsv(color: RGB, satMul: number, valMul: number): RGB {
  const [h, s, v] = rgbToHsv(color[0], color[1], color[2]);
  return hsvToRgb(h, clamp01(s * satMul), clamp01(v * valMul));
}
