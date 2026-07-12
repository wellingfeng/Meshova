/**
 * PBR material channels and the metal/roughness workflow.
 *
 * A Material is a set of texture buffers, one per PBR channel. The TA-relevant
 * job here is correctness: metallic/roughness clamped to physical ranges,
 * baseColor in sane reflectance bounds, normal derived from height so the AI
 * never has to author tangent-space vectors by hand.
 */
import {
  makeTexture,
  generate,
  sample,
  type TextureBuffer,
} from "./buffer.js";
import { clamp } from "../math/scalar.js";

export interface Material {
  /** RGB albedo, linear, 3 channels. */
  baseColor: TextureBuffer;
  /** Grayscale 0..1, 1 channel. */
  metallic: TextureBuffer;
  /** Grayscale 0..1, 1 channel. Clamped to [0.04,1] to avoid mirror artifacts. */
  roughness: TextureBuffer;
  /** Tangent-space normal, RGB encoded (0.5,0.5,1)=flat, 3 channels. */
  normal: TextureBuffer;
  /** Ambient occlusion 0..1, 1 channel. */
  ao: TextureBuffer;
  /** Height/displacement 0..1, 1 channel. */
  height: TextureBuffer;
  /** Emission RGB linear, 3 channels. */
  emission: TextureBuffer;
}

const ROUGHNESS_MIN = 0.04; // below this specular highlights alias badly

/** Build a baseColor buffer from a per-pixel RGB function. */
export function baseColorMap(
  size: number,
  fn: (u: number, v: number) => [number, number, number],
): TextureBuffer {
  return generate(size, size, 3, (u, v) => {
    const c = fn(u, v);
    return [clamp(c[0], 0, 1), clamp(c[1], 0, 1), clamp(c[2], 0, 1)];
  });
}

/** Build a grayscale scalar map (roughness/metallic/ao/height). */
export function scalarMap(
  size: number,
  fn: (u: number, v: number) => number,
  range: [number, number] = [0, 1],
): TextureBuffer {
  return generate(size, size, 1, (u, v) => clamp(fn(u, v), range[0], range[1]));
}

/**
 * Derive a tangent-space normal map from a height field via central
 * differences (Sobel-lite). strength scales the bump. Output RGB encodes the
 * unit normal as (n*0.5+0.5).
 */
export function heightToNormal(
  height: TextureBuffer,
  strength = 2,
  tileable = false,
): TextureBuffer {
  const w = height.width;
  const h = height.height;
  const out = makeTexture(w, h, 3);
  const read = tileable
    ? (sampleX: number, sampleY: number) => sample(
      height,
      ((sampleX % w) + w) % w,
      ((sampleY % h) + h) % h,
    )
    : (sampleX: number, sampleY: number) => sample(height, sampleX, sampleY);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = read(x - 1, y);
      const r = read(x + 1, y);
      const d = read(x, y - 1);
      const u = read(x, y + 1);
      // gradient; v axis points up so (u - d) is +Y slope
      const dx = (l - r) * strength;
      const dy = (d - u) * strength;
      const dz = 1;
      const len = Math.hypot(dx, dy, dz) || 1;
      const base = (y * w + x) * 3;
      out.data[base] = (dx / len) * 0.5 + 0.5;
      out.data[base + 1] = (dy / len) * 0.5 + 0.5;
      out.data[base + 2] = (dz / len) * 0.5 + 0.5;
    }
  }
  return out;
}

export interface MetalBaseOptions {
  size?: number;
  color?: [number, number, number];
  roughness?: number;
}

/** A flat metal base material (metallic=1). */
export function metalBase(opts: MetalBaseOptions = {}): Material {
  const size = opts.size ?? 256;
  const color = opts.color ?? [0.56, 0.57, 0.58]; // iron-ish
  const rough = clamp(opts.roughness ?? 0.3, ROUGHNESS_MIN, 1);
  return materialFromFields(size, {
    baseColor: () => color,
    metallic: () => 1,
    roughness: () => rough,
    height: () => 0.5,
  });
}

export interface DielectricBaseOptions {
  size?: number;
  color?: [number, number, number];
  roughness?: number;
}

/** A flat non-metal base material (metallic=0). */
export function dielectricBase(opts: DielectricBaseOptions = {}): Material {
  const size = opts.size ?? 256;
  const color = opts.color ?? [0.7, 0.7, 0.7];
  const rough = clamp(opts.roughness ?? 0.6, ROUGHNESS_MIN, 1);
  return materialFromFields(size, {
    baseColor: () => color,
    metallic: () => 0,
    roughness: () => rough,
    height: () => 0.5,
  });
}

export interface MaterialFields {
  baseColor?: (u: number, v: number) => [number, number, number];
  metallic?: (u: number, v: number) => number;
  roughness?: (u: number, v: number) => number;
  ao?: (u: number, v: number) => number;
  height?: (u: number, v: number) => number;
  emission?: (u: number, v: number) => [number, number, number];
  /** Normal bump strength when derived from height. */
  normalStrength?: number;
  /** Wrap height samples across opposite edges when deriving a tileable normal map. */
  tileable?: boolean;
}

/**
 * Assemble a full Material from per-channel field functions. Missing channels
 * get physically sensible defaults; normal is auto-derived from height.
 */
export function materialFromFields(size: number, fields: MaterialFields): Material {
  const baseColor = baseColorMap(size, fields.baseColor ?? (() => [0.8, 0.8, 0.8]));
  const metallic = scalarMap(size, fields.metallic ?? (() => 0));
  const roughness = scalarMap(
    size,
    fields.roughness ?? (() => 0.6),
    [ROUGHNESS_MIN, 1],
  );
  const ao = scalarMap(size, fields.ao ?? (() => 1));
  const height = scalarMap(size, fields.height ?? (() => 0.5));
  const emission = baseColorMap(size, fields.emission ?? (() => [0, 0, 0]));
  const normal = heightToNormal(height, fields.normalStrength ?? 2, fields.tileable ?? false);
  return { baseColor, metallic, roughness, normal, ao, height, emission };
}

/**
 * Validate physical ranges; returns a list of problems (empty = valid). Guards
 * against AI-authored illegal values, the TA correctness checkpoint.
 */
export function validateMaterial(mat: Material): string[] {
  const problems: string[] = [];
  const checkRange = (tex: TextureBuffer, name: string, lo: number, hi: number) => {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < tex.data.length; i++) {
      const v = tex.data[i]!;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (min < lo - 1e-4 || max > hi + 1e-4) {
      problems.push(`${name} out of [${lo},${hi}]: actual [${min.toFixed(3)},${max.toFixed(3)}]`);
    }
  };
  checkRange(mat.baseColor, "baseColor", 0, 1);
  checkRange(mat.metallic, "metallic", 0, 1);
  checkRange(mat.roughness, "roughness", ROUGHNESS_MIN, 1);
  checkRange(mat.ao, "ao", 0, 1);
  return problems;
}
