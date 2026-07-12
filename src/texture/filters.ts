/**
 * Buffer-level filters (P11): the processing layer that turns raw generators
 * into finished maps. Covers Substance Designer's most-used filter/blend/
 * channel/normal nodes operating on TextureBuffer: blur, levels, curve,
 * histogram-scan, warp, slope-blur, blend modes, min/max, grayscale,
 * channel split/merge, gradient-map, normal invert/combine, curvature and
 * AO-from-height. Self-written from public algorithm knowledge.
 *
 * Convention: operate on TextureBuffer (row-major, see buffer.ts). All return
 * new buffers; inputs are never mutated (immutable-by-default like the
 * geometry core).
 */
import {
  makeTexture,
  sample,
  type TextureBuffer,
} from "./buffer.js";
import { clamp, smoothstep, lerp } from "../math/scalar.js";

/** Read channel c at (x,y) with clamped edge (local alias for speed). */
function px(tex: TextureBuffer, x: number, y: number, c: number): number {
  return sample(tex, x, y, c);
}

/** Duplicate a buffer (defensive copy). */
export function clone(tex: TextureBuffer): TextureBuffer {
  const out = makeTexture(tex.width, tex.height, tex.channels);
  out.data.set(tex.data);
  return out;
}

/** Per-channel value map helper (keeps channel count). */
export function mapAll(
  tex: TextureBuffer,
  fn: (v: number, c: number, x: number, y: number) => number,
): TextureBuffer {
  const out = makeTexture(tex.width, tex.height, tex.channels);
  const { width: w, height: h, channels: ch } = tex;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < ch; c++) {
        const idx = (y * w + x) * ch + c;
        out.data[idx] = fn(tex.data[idx]!, c, x, y);
      }
    }
  }
  return out;
}

export interface BlurOptions {
  /** Blur radius in pixels. */
  radius?: number;
  /** "box" = fast uniform, "gaussian" = weighted (smoother). */
  type?: "box" | "gaussian";
}

/**
 * Separable blur (box or gaussian) over all channels. Two 1D passes keep it
 * O(n*r) instead of O(n*r^2). SD's Blur / Blur HQ.
 */
export function blur(tex: TextureBuffer, opts: BlurOptions = {}): TextureBuffer {
  const radius = Math.max(0, Math.floor(opts.radius ?? 2));
  if (radius === 0) return clone(tex);
  const type = opts.type ?? "gaussian";
  const { width: w, height: h, channels: ch } = tex;

  const weights: number[] = [];
  let wsum = 0;
  for (let i = -radius; i <= radius; i++) {
    let weight = 1;
    if (type === "gaussian") {
      const sigma = radius / 2 || 1;
      weight = Math.exp(-(i * i) / (2 * sigma * sigma));
    }
    weights.push(weight);
    wsum += weight;
  }
  for (let i = 0; i < weights.length; i++) weights[i]! /= wsum;

  const tmp = makeTexture(w, h, ch);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < ch; c++) {
        let acc = 0;
        for (let i = -radius; i <= radius; i++) acc += px(tex, x + i, y, c) * weights[i + radius]!;
        tmp.data[(y * w + x) * ch + c] = acc;
      }
    }
  }
  const out = makeTexture(w, h, ch);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < ch; c++) {
        let acc = 0;
        for (let i = -radius; i <= radius; i++) acc += px(tmp, x, y + i, c) * weights[i + radius]!;
        out.data[(y * w + x) * ch + c] = acc;
      }
    }
  }
  return out;
}
export interface LevelsOptions {
  /** Input black point 0..1. */
  inLow?: number;
  /** Input white point 0..1. */
  inHigh?: number;
  /** Midtone gamma (1 = linear, <1 brighter, >1 darker). */
  gamma?: number;
  /** Output black point. */
  outLow?: number;
  /** Output white point. */
  outHigh?: number;
}

/**
 * Levels: remap input range to output range with a gamma midtone — SD's
 * Levels node. The everyday contrast/brightness tool. Applies per channel.
 */
export function levels(tex: TextureBuffer, opts: LevelsOptions = {}): TextureBuffer {
  const inLow = opts.inLow ?? 0;
  const inHigh = opts.inHigh ?? 1;
  const gamma = opts.gamma ?? 1;
  const outLow = opts.outLow ?? 0;
  const outHigh = opts.outHigh ?? 1;
  const span = inHigh - inLow || 1e-6;
  const invG = 1 / (gamma || 1e-6);
  return mapAll(tex, (v) => {
    let t = clamp((v - inLow) / span, 0, 1);
    t = Math.pow(t, invG);
    return outLow + (outHigh - outLow) * t;
  });
}

/**
 * Curve: remap values through a monotonic control-point curve with linear
 * interpolation between sorted points — SD's Curve node. Points are [x,y] in
 * [0,1]. Endpoints default to (0,0) and (1,1) if not supplied.
 */
export function curve(
  tex: TextureBuffer,
  points: Array<[number, number]>,
): TextureBuffer {
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  if (pts.length === 0 || pts[0]![0] > 0) pts.unshift([0, 0]);
  if (pts[pts.length - 1]![0] < 1) pts.push([1, 1]);
  return mapAll(tex, (v) => {
    const x = clamp(v, 0, 1);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      if (x >= a[0] && x <= b[0]) {
        const f = (x - a[0]) / (b[0] - a[0] || 1e-6);
        return clamp(lerp(a[1], b[1], f), 0, 1);
      }
    }
    return clamp(pts[pts.length - 1]![1], 0, 1);
  });
}

export interface HistogramScanOptions {
  /** Center position of the scan window 0..1. */
  position?: number;
  /** Contrast/width of the transition (0 = hard threshold, 1 = full ramp). */
  contrast?: number;
}

/**
 * Histogram Scan: a movable soft threshold that extracts a mask from a
 * grayscale field — SD's Histogram Scan, the go-to mask sculptor. position
 * slides the cutoff, contrast controls edge hardness.
 */
export function histogramScan(
  tex: TextureBuffer,
  opts: HistogramScanOptions = {},
): TextureBuffer {
  const pos = clamp(opts.position ?? 0.5, 0, 1);
  const contrast = clamp(opts.contrast ?? 0.5, 0, 1);
  const halfW = (1 - contrast) * 0.5 + 1e-4;
  return mapAll(tex, (v) => smoothstep(pos - halfW, pos + halfW, v));
}

/**
 * Histogram Range: rescale values so [low,high] map to [0,1], clamped. Quick
 * normalize / contrast stretch (SD's Histogram Range / Auto Levels lite).
 */
export function histogramRange(
  tex: TextureBuffer,
  low: number,
  high: number,
): TextureBuffer {
  const span = high - low || 1e-6;
  return mapAll(tex, (v) => clamp((v - low) / span, 0, 1));
}

export interface AutoLevelsOptions {
  /** Fraction clipped from the dark end. Default 0. */
  lowPercentile?: number;
  /** Fraction clipped from the bright end. Default 0. */
  highPercentile?: number;
  /** Normalize each channel independently. Default true. */
  perChannel?: boolean;
}

/** Analyze the buffer histogram and stretch its useful range to [0,1]. */
export function autoLevels(
  tex: TextureBuffer,
  options: AutoLevelsOptions = {},
): TextureBuffer {
  const lowPercentile = clamp(options.lowPercentile ?? 0, 0, 0.49);
  const highPercentile = clamp(options.highPercentile ?? 0, 0, 0.49);
  const groupCount = options.perChannel === false ? 1 : tex.channels;
  const values = Array.from({ length: groupCount }, () => [] as number[]);
  for (let index = 0; index < tex.data.length; index++) {
    values[options.perChannel === false ? 0 : index % tex.channels]!.push(tex.data[index]!);
  }
  const ranges = values.map((channelValues) => {
    channelValues.sort((first, second) => first - second);
    const last = channelValues.length - 1;
    const low = channelValues[Math.floor(last * lowPercentile)] ?? 0;
    const high = channelValues[Math.ceil(last * (1 - highPercentile))] ?? 1;
    return [low, high] as const;
  });
  return mapAll(tex, (value, channel) => {
    const range = ranges[options.perChannel === false ? 0 : channel]!;
    const span = range[1] - range[0];
    return span <= 1e-8 ? value : clamp((value - range[0]) / span, 0, 1);
  });
}

/** Invert per channel (1 - v). SD's Invert. */
export function invert(tex: TextureBuffer): TextureBuffer {
  return mapAll(tex, (v) => 1 - v);
}

/** Clamp every channel into [lo,hi]. SD's Clamp. */
export function clampTex(tex: TextureBuffer, lo = 0, hi = 1): TextureBuffer {
  return mapAll(tex, (v) => clamp(v, lo, hi));
}
export type BlendMode =
  | "copy"
  | "add"
  | "subtract"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "difference"
  | "softLight"
  | "linearDodge"
  | "linearBurn";

/** Apply a Photoshop/SD-style blend formula to a (foreground, background) pair. */
function blendOp(mode: BlendMode, fg: number, bg: number): number {
  switch (mode) {
    case "add":
    case "linearDodge":
      return bg + fg;
    case "subtract":
      return bg - fg;
    case "linearBurn":
      return bg + fg - 1;
    case "multiply":
      return bg * fg;
    case "screen":
      return 1 - (1 - bg) * (1 - fg);
    case "overlay":
      return bg < 0.5 ? 2 * bg * fg : 1 - 2 * (1 - bg) * (1 - fg);
    case "darken":
      return Math.min(bg, fg);
    case "lighten":
      return Math.max(bg, fg);
    case "difference":
      return Math.abs(bg - fg);
    case "softLight":
      return (1 - 2 * fg) * bg * bg + 2 * fg * bg;
    case "copy":
    default:
      return fg;
  }
}

export interface BlendOptions {
  mode?: BlendMode;
  /** Global foreground opacity 0..1. */
  opacity?: number;
  /** Optional per-pixel mask (single channel) gating the foreground. */
  mask?: TextureBuffer;
}

/**
 * Blend two buffers with a mode + opacity + optional mask — SD's Blend node,
 * the compositing hub. Both inputs must share dimensions and channel count;
 * the mask, if given, is sampled from channel 0.
 */
export function blendTex(
  fg: TextureBuffer,
  bg: TextureBuffer,
  opts: BlendOptions = {},
): TextureBuffer {
  const mode = opts.mode ?? "copy";
  const opacity = clamp(opts.opacity ?? 1, 0, 1);
  const mask = opts.mask;
  const { width: w, height: h, channels: ch } = bg;
  const out = makeTexture(w, h, ch);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const m = mask ? px(mask, x, y, 0) : 1;
      const a = opacity * m;
      for (let c = 0; c < ch; c++) {
        const f = px(fg, x, y, c);
        const b = px(bg, x, y, c);
        const blended = blendOp(mode, f, b);
        out.data[(y * w + x) * ch + c] = b + (blended - b) * a;
      }
    }
  }
  return out;
}

/** Per-pixel min of two buffers (SD's Min). */
export function minTex(a: TextureBuffer, b: TextureBuffer): TextureBuffer {
  return mapAll(a, (v, c, x, y) => Math.min(v, px(b, x, y, c)));
}

/** Per-pixel max of two buffers (SD's Max). */
export function maxTex(a: TextureBuffer, b: TextureBuffer): TextureBuffer {
  return mapAll(a, (v, c, x, y) => Math.max(v, px(b, x, y, c)));
}

export interface MorphologyOptions {
  radius?: number;
  shape?: "disc" | "square";
}

function morphology(
  tex: TextureBuffer,
  options: MorphologyOptions,
  operation: "min" | "max",
): TextureBuffer {
  const radius = Math.max(0, Math.floor(options.radius ?? 1));
  if (radius === 0) return clone(tex);
  const disc = (options.shape ?? "disc") === "disc";
  const out = makeTexture(tex.width, tex.height, tex.channels);
  for (let y = 0; y < tex.height; y++) {
    for (let x = 0; x < tex.width; x++) {
      for (let channel = 0; channel < tex.channels; channel++) {
        let result = operation === "max" ? -Infinity : Infinity;
        for (let offsetY = -radius; offsetY <= radius; offsetY++) {
          for (let offsetX = -radius; offsetX <= radius; offsetX++) {
            if (disc && offsetX * offsetX + offsetY * offsetY > radius * radius) continue;
            const value = px(tex, x + offsetX, y + offsetY, channel);
            result = operation === "max" ? Math.max(result, value) : Math.min(result, value);
          }
        }
        out.data[(y * tex.width + x) * tex.channels + channel] = result;
      }
    }
  }
  return out;
}

/** Expand bright regions of a mask or height field. */
export function dilateMask(tex: TextureBuffer, options: MorphologyOptions = {}): TextureBuffer {
  return morphology(tex, options, "max");
}

/** Contract bright regions of a mask or height field. */
export function erodeMask(tex: TextureBuffer, options: MorphologyOptions = {}): TextureBuffer {
  return morphology(tex, options, "min");
}
export interface WarpOptions {
  /** Displacement intensity in pixels. */
  intensity?: number;
  /** Fixed direction (radians). If omitted, uses the gradient of the field. */
  angle?: number;
}

/**
 * Directional Warp: push pixels along a direction by an amount read from an
 * intensity buffer (channel 0) — SD's Directional Warp. With no angle it warps
 * along the intensity gradient (general Warp). Bilinear resample.
 */
export function warp(
  tex: TextureBuffer,
  intensityMap: TextureBuffer,
  opts: WarpOptions = {},
): TextureBuffer {
  const intensity = opts.intensity ?? 8;
  const { width: w, height: h, channels: ch } = tex;
  const out = makeTexture(w, h, ch);
  const hasAngle = opts.angle !== undefined;
  const adx = hasAngle ? Math.cos(opts.angle!) : 0;
  const ady = hasAngle ? Math.sin(opts.angle!) : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let dirx = adx;
      let diry = ady;
      if (!hasAngle) {
        // gradient of intensity map = warp direction
        dirx = px(intensityMap, x + 1, y, 0) - px(intensityMap, x - 1, y, 0);
        diry = px(intensityMap, x, y + 1, 0) - px(intensityMap, x, y - 1, 0);
      }
      const amt = px(intensityMap, x, y, 0) * intensity;
      const sx = x + dirx * amt;
      const sy = y + diry * amt;
      for (let c = 0; c < ch; c++) {
        out.data[(y * w + x) * ch + c] = bilinear(tex, sx, sy, c);
      }
    }
  }
  return out;
}

/** Bilinear sample with clamped edges. */
function bilinear(tex: TextureBuffer, x: number, y: number, c: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const a = px(tex, x0, y0, c);
  const b = px(tex, x0 + 1, y0, c);
  const cc = px(tex, x0, y0 + 1, c);
  const d = px(tex, x0 + 1, y0 + 1, c);
  return lerp(lerp(a, b, fx), lerp(cc, d, fx), fy);
}

export interface SlopeBlurOptions {
  /** Blur amount in pixels. */
  intensity?: number;
  /** Iterations — more = stronger flow/erosion. */
  samples?: number;
  /** Blur averages samples; min erodes peaks; max expands peaks. */
  mode?: "blur" | "min" | "max";
}

/**
 * Slope Blur: repeatedly blurs toward the downhill direction of a height
 * field, the core of erosion, drips and melting effects — SD's Slope Blur.
 * Drags `tex` along the negative gradient of `slopeMap` (channel 0).
 */
export function slopeBlur(
  tex: TextureBuffer,
  slopeMap: TextureBuffer,
  opts: SlopeBlurOptions = {},
): TextureBuffer {
  const intensity = opts.intensity ?? 4;
  const samples = Math.max(1, Math.floor(opts.samples ?? 8));
  const mode = opts.mode ?? "blur";
  const { width: w, height: h, channels: ch } = tex;
  let cur = clone(tex);
  const step = intensity / samples;
  for (let s = 0; s < samples; s++) {
    const next = makeTexture(w, h, ch);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const gx = px(slopeMap, x + 1, y, 0) - px(slopeMap, x - 1, y, 0);
        const gy = px(slopeMap, x, y + 1, 0) - px(slopeMap, x, y - 1, 0);
        const sx = x - gx * step;
        const sy = y - gy * step;
        for (let c = 0; c < ch; c++) {
          const current = px(cur, x, y, c);
          const dragged = bilinear(cur, sx, sy, c);
          next.data[(y * w + x) * ch + c] = mode === "min"
            ? Math.min(current, dragged)
            : mode === "max"
              ? Math.max(current, dragged)
              : (current + dragged) * 0.5;
        }
      }
    }
    cur = next;
  }
  return cur;
}

/** Sharpen via unsharp mask: tex + amount*(tex - blur(tex)). */
export function sharpen(tex: TextureBuffer, amount = 1, radius = 1): TextureBuffer {
  const blurred = blur(tex, { radius, type: "gaussian" });
  return mapAll(tex, (v, c, x, y) => clamp(v + amount * (v - px(blurred, x, y, c)), 0, 1));
}

/**
 * Edge Detect (Sobel magnitude) on channel 0 -> single-channel mask. SD's
 * Edge Detect, for outlines and seams.
 */
export function edgeDetect(tex: TextureBuffer): TextureBuffer {
  const { width: w, height: h } = tex;
  const out = makeTexture(w, h, 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx =
        -px(tex, x - 1, y - 1, 0) - 2 * px(tex, x - 1, y, 0) - px(tex, x - 1, y + 1, 0) +
        px(tex, x + 1, y - 1, 0) + 2 * px(tex, x + 1, y, 0) + px(tex, x + 1, y + 1, 0);
      const gy =
        -px(tex, x - 1, y - 1, 0) - 2 * px(tex, x, y - 1, 0) - px(tex, x + 1, y - 1, 0) +
        px(tex, x - 1, y + 1, 0) + 2 * px(tex, x, y + 1, 0) + px(tex, x + 1, y + 1, 0);
      out.data[y * w + x] = clamp(Math.hypot(gx, gy), 0, 1);
    }
  }
  return out;
}
/**
 * Grayscale Conversion: RGB -> single channel using luminance weights — SD's
 * Grayscale Conversion. Default Rec.709 weights.
 */
export function grayscale(
  tex: TextureBuffer,
  weights: [number, number, number] = [0.2126, 0.7152, 0.0722],
): TextureBuffer {
  const { width: w, height: h } = tex;
  const out = makeTexture(w, h, 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = px(tex, x, y, 0);
      const g = px(tex, x, y, 1);
      const b = px(tex, x, y, 2);
      out.data[y * w + x] = r * weights[0] + g * weights[1] + b * weights[2];
    }
  }
  return out;
}

/** Extract one channel of a buffer into a new single-channel buffer (RGBA Split). */
export function splitChannel(tex: TextureBuffer, channel: number): TextureBuffer {
  const { width: w, height: h } = tex;
  const out = makeTexture(w, h, 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) out.data[y * w + x] = px(tex, x, y, channel);
  }
  return out;
}

/**
 * Merge single-channel buffers into one multi-channel buffer (RGBA Merge).
 * All inputs must share dimensions; missing channels filled with 0.
 */
export function mergeChannels(channels: TextureBuffer[]): TextureBuffer {
  const first = channels[0]!;
  const { width: w, height: h } = first;
  const ch = channels.length;
  const out = makeTexture(w, h, ch);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < ch; c++) out.data[(y * w + x) * ch + c] = px(channels[c]!, x, y, 0);
    }
  }
  return out;
}

/**
 * Gradient Map: colorize a grayscale buffer through a ramp function (value ->
 * RGB) — SD's Gradient Map. Pair with patterns.ramp().
 */
export function gradientMap(
  tex: TextureBuffer,
  rampFn: (t: number) => [number, number, number],
): TextureBuffer {
  const { width: w, height: h } = tex;
  const out = makeTexture(w, h, 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = rampFn(px(tex, x, y, 0));
      const base = (y * w + x) * 3;
      out.data[base] = c[0];
      out.data[base + 1] = c[1];
      out.data[base + 2] = c[2];
    }
  }
  return out;
}
/**
 * Normal Invert: flip the green (Y) channel of a normal map — the OpenGL <->
 * DirectX convention switch. SD's Normal Invert.
 */
export function normalInvert(normal: TextureBuffer): TextureBuffer {
  return mapAll(normal, (v, c) => (c === 1 ? 1 - v : v));
}

/**
 * Normal Combine: layer a detail normal on top of a base normal using the
 * "whiteout"/UDN blend so the detail's bumps ride on the base slope — SD's
 * Normal Combine. Both RGB normals encoded (n*0.5+0.5).
 */
export function normalCombine(base: TextureBuffer, detail: TextureBuffer): TextureBuffer {
  const { width: w, height: h } = base;
  const out = makeTexture(w, h, 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const bx = px(base, x, y, 0) * 2 - 1;
      const by = px(base, x, y, 1) * 2 - 1;
      const bz = px(base, x, y, 2) * 2 - 1;
      const dx = px(detail, x, y, 0) * 2 - 1;
      const dy = px(detail, x, y, 1) * 2 - 1;
      const dz = px(detail, x, y, 2) * 2 - 1;
      // UDN: add tangent components, multiply z
      let nx = bx + dx;
      let ny = by + dy;
      let nz = bz * dz;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      const base3 = (y * w + x) * 3;
      out.data[base3] = nx * 0.5 + 0.5;
      out.data[base3 + 1] = ny * 0.5 + 0.5;
      out.data[base3 + 2] = nz * 0.5 + 0.5;
    }
  }
  return out;
}

/** Scale tangent-space normal intensity while preserving unit length. */
export function scaleNormal(normal: TextureBuffer, strength: number): TextureBuffer {
  const out = makeTexture(normal.width, normal.height, 3);
  const amount = Math.max(0, strength);
  for (let y = 0; y < normal.height; y++) {
    for (let x = 0; x < normal.width; x++) {
      let nx = (px(normal, x, y, 0) * 2 - 1) * amount;
      let ny = (px(normal, x, y, 1) * 2 - 1) * amount;
      let nz = px(normal, x, y, 2) * 2 - 1;
      const length = Math.hypot(nx, ny, nz) || 1;
      nx /= length;
      ny /= length;
      nz /= length;
      const index = (y * normal.width + x) * 3;
      out.data[index] = nx * 0.5 + 0.5;
      out.data[index + 1] = ny * 0.5 + 0.5;
      out.data[index + 2] = nz * 0.5 + 0.5;
    }
  }
  return out;
}

export interface CurvatureOptions {
  /** Strength multiplier. */
  intensity?: number;
}

/**
 * Curvature from height: second derivative (Laplacian) of the height field,
 * remapped to [0,1] with 0.5 = flat. Convex edges > 0.5, concave < 0.5 — the
 * basis for edge-wear and cavity masks. SD's Curvature (from height).
 */
export function curvature(height: TextureBuffer, opts: CurvatureOptions = {}): TextureBuffer {
  const intensity = opts.intensity ?? 4;
  const { width: w, height: h } = height;
  const out = makeTexture(w, h, 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = px(height, x, y, 0);
      const lap =
        px(height, x - 1, y, 0) + px(height, x + 1, y, 0) +
        px(height, x, y - 1, 0) + px(height, x, y + 1, 0) - 4 * c;
      out.data[y * w + x] = clamp(0.5 + lap * intensity, 0, 1);
    }
  }
  return out;
}

export interface AOOptions {
  /** Sampling radius in pixels. */
  radius?: number;
  /** Strength of the occlusion darkening. */
  intensity?: number;
}

/**
 * Ambient Occlusion from height: compares each pixel to a ring of neighbors;
 * pixels lower than their surroundings get darkened — SD's Height to AO. Cheap
 * but effective for crevice shadowing.
 */
export function aoFromHeight(height: TextureBuffer, opts: AOOptions = {}): TextureBuffer {
  const radius = Math.max(1, Math.floor(opts.radius ?? 4));
  const intensity = opts.intensity ?? 1;
  const { width: w, height: h } = height;
  const out = makeTexture(w, h, 1);
  // 8 sampling directions
  const dirs: Array<[number, number]> = [
    [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1],
  ];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = px(height, x, y, 0);
      let occ = 0;
      for (const [dx, dy] of dirs) {
        const sampleH = px(height, x + dx * radius, y + dy * radius, 0);
        if (sampleH > c) occ += sampleH - c;
      }
      occ = (occ / dirs.length) * intensity;
      out.data[y * w + x] = clamp(1 - occ, 0, 1);
    }
  }
  return out;
}

export interface DistanceOptions {
  /** Max search distance in pixels (also the normalization range). */
  maxDistance?: number;
  /** Threshold above which a pixel is "source" (distance 0). */
  threshold?: number;
  /** Invert: measure distance inside the shape instead of outside. */
  inside?: boolean;
}

/**
 * Distance field: for each pixel, the (normalized) distance to the nearest
 * source pixel — SD's Distance node. Two-pass chamfer (3-4) approximation of
 * the Euclidean distance transform, fast and good enough for masks. Output is
 * 1 at the source and falls to 0 at maxDistance.
 */
export function distanceField(mask: TextureBuffer, opts: DistanceOptions = {}): TextureBuffer {
  const maxD = Math.max(1, opts.maxDistance ?? 32);
  const threshold = opts.threshold ?? 0.5;
  const inside = opts.inside ?? false;
  const { width: w, height: h } = mask;
  const INF = 1e9;
  const dist = new Float32Array(w * h);
  // seed: source pixels = 0, others = INF
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let isSrc = px(mask, x, y, 0) > threshold;
      if (inside) isSrc = !isSrc;
      dist[y * w + x] = isSrc ? 0 : INF;
    }
  }
  const D1 = 1; // orthogonal step
  const D2 = 1.41421356; // diagonal step
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= h ? INF : dist[y * w + x]!;
  // forward pass (top-left -> bottom-right)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let d = dist[y * w + x]!;
      d = Math.min(d, at(x - 1, y) + D1, at(x, y - 1) + D1);
      d = Math.min(d, at(x - 1, y - 1) + D2, at(x + 1, y - 1) + D2);
      dist[y * w + x] = d;
    }
  }
  // backward pass (bottom-right -> top-left)
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      let d = dist[y * w + x]!;
      d = Math.min(d, at(x + 1, y) + D1, at(x, y + 1) + D1);
      d = Math.min(d, at(x + 1, y + 1) + D2, at(x - 1, y + 1) + D2);
      dist[y * w + x] = d;
    }
  }
  const out = makeTexture(w, h, 1);
  for (let i = 0; i < dist.length; i++) out.data[i] = clamp(1 - dist[i]! / maxD, 0, 1);
  return out;
}

export interface BevelOptions {
  /** Bevel width in pixels (how far the slope extends from the edge). */
  width?: number;
  /** Threshold for the source shape. */
  threshold?: number;
  /** Smooth the result with a small blur (pixels). */
  smoothing?: number;
}

/**
 * Bevel: turn a flat mask into a height with sloped edges by taking the
 * distance field inside the shape and remapping — SD's Bevel. Gives bricks,
 * panels and engraved shapes their rounded/chamfered relief. Output height in
 * [0,1], flat-1 in the shape interior, falling to 0 at the outer edge.
 */
export function bevel(mask: TextureBuffer, opts: BevelOptions = {}): TextureBuffer {
  const width = Math.max(1, opts.width ?? 8);
  const threshold = opts.threshold ?? 0.5;
  const smoothing = opts.smoothing ?? 0;
  // inside-distance: 1 at the shape edge, falling toward 0 deeper inside.
  // Invert so the interior plateaus at 1 and the rim slopes down to the edge.
  const d = distanceField(mask, { maxDistance: width, threshold, inside: true });
  let out = mapAll(d, (v) => clamp(1 - v, 0, 1));
  if (smoothing > 0) out = blur(out, { radius: Math.floor(smoothing), type: "gaussian" });
  return out;
}

export interface EmbossOptions {
  /** Light direction angle (radians). */
  angle?: number;
  /** Relief intensity. */
  intensity?: number;
}

/**
 * Emboss: shade a height/grayscale field by a directional light to fake
 * relief — SD's Emboss. Output centered at 0.5 (flat), brighter on lit slopes.
 */
export function emboss(tex: TextureBuffer, opts: EmbossOptions = {}): TextureBuffer {
  const angle = opts.angle ?? Math.PI * 0.25;
  const intensity = opts.intensity ?? 4;
  const lx = Math.cos(angle);
  const ly = Math.sin(angle);
  const { width: w, height: h } = tex;
  const out = makeTexture(w, h, 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = (px(tex, x + 1, y, 0) - px(tex, x - 1, y, 0)) * intensity;
      const gy = (px(tex, x, y + 1, 0) - px(tex, x, y - 1, 0)) * intensity;
      // dot of surface slope with light direction
      out.data[y * w + x] = clamp(0.5 + (gx * lx + gy * ly), 0, 1);
    }
  }
  return out;
}
