/**
 * Mix two complete PBR Materials by a mask (MaterialX `mix` for the whole
 * 7-channel material, not just one buffer). The classic use is a two-state
 * surface — clean metal vs rust, dry vs wet, paint vs bare — where a single
 * procedural mask drives ALL channels coherently so base color, roughness,
 * metallic, normal, ao and height stay aligned. Mixing channels independently
 * is what makes a material read as one surface instead of two decals.
 *
 * mask = 0 -> material `a`; mask = 1 -> material `b`.
 */
import type { TextureBuffer } from "./buffer.js";
import { makeTexture } from "./buffer.js";
import type { Material } from "./pbr.js";
import { heightBlendMask } from "./detailing.js";

function px(tex: TextureBuffer, x: number, y: number, c: number): number {
  const ch = Math.min(c, tex.channels - 1);
  return tex.data[(y * tex.width + x) * tex.channels + ch]!;
}

/** A mask is either a precomputed buffer (channel 0) or a (u,v)->0..1 fn. */
export type MaterialMask = TextureBuffer | ((u: number, v: number) => number);

function lerpBuffers(a: TextureBuffer, b: TextureBuffer, mask: MaterialMask): TextureBuffer {
  const { width: w, height: h, channels: ch } = a;
  const out = makeTexture(w, h, ch);
  const maskBuf = typeof mask === "function" ? null : mask;
  const maskFn = typeof mask === "function" ? mask : null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m: number;
      if (maskFn) {
        // Sample at pixel-center UV so it lines up with baseColorMap/scalarMap.
        m = maskFn((x + 0.5) / w, (y + 0.5) / h);
      } else {
        m = px(maskBuf!, x, y, 0);
      }
      m = m < 0 ? 0 : m > 1 ? 1 : m;
      for (let c = 0; c < ch; c++) {
        const av = px(a, x, y, c);
        const bv = px(b, x, y, c);
        out.data[(y * w + x) * ch + c] = av + (bv - av) * m;
      }
    }
  }
  return out;
}

/**
 * Per-channel linear mix of two materials by a shared mask. Both materials must
 * share texture dimensions (build them at the same `size`).
 */
export function mixMaterials(a: Material, b: Material, mask: MaterialMask): Material {
  return {
    baseColor: lerpBuffers(a.baseColor, b.baseColor, mask),
    metallic: lerpBuffers(a.metallic, b.metallic, mask),
    roughness: lerpBuffers(a.roughness, b.roughness, mask),
    normal: lerpBuffers(a.normal, b.normal, mask),
    ao: lerpBuffers(a.ao, b.ao, mask),
    height: lerpBuffers(a.height, b.height, mask),
    emission: lerpBuffers(a.emission, b.emission, mask),
  };
}

export interface HeightBlendMaterialsOptions {
  /** Blend position 0..1: how much of the raised/base surface layer B claims. */
  amount: number;
  /** Transition hardness 0..1 (1 = crisp seam, 0 = soft lerp). Default 0.6. */
  contrast?: number;
  /** Per-texel noise jitter on the height so the seam looks organic. */
  jitter?: number;
  /** Noise scale for the jitter. */
  jitterScale?: number;
  /** Seed for the jitter noise. */
  seed?: number;
  /**
   * Which material's height field drives the blend. "b" (default) lets layer B
   * settle into A's low spots (moss in crevices); "a" caps A's high spots.
   */
  heightFrom?: "a" | "b";
}

/** Read a TextureBuffer's channel 0 as a (u,v)->0..1 field (bilinear-free nearest). */
function bufferAsField(tex: TextureBuffer): (u: number, v: number) => number {
  return (u, v) => {
    const x = Math.min(tex.width - 1, Math.max(0, Math.floor(u * tex.width)));
    const y = Math.min(tex.height - 1, Math.max(0, Math.floor(v * tex.height)));
    return px(tex, x, y, 0);
  };
}

/**
 * Height-aware two-material blend (UE M_BlendMoss / MF_Blend_Through_Input):
 * instead of a flat crossfade, layer B wins where the driving height clears a
 * contrast-controlled threshold, so B nestles into crevices (or caps ledges)
 * with a crisp, natural seam. This is the realistic way to grow moss on rock,
 * snow on ledges, or blend worn edges. Both materials must share dimensions.
 */
export function heightBlendMaterials(
  a: Material,
  b: Material,
  opts: HeightBlendMaterialsOptions,
): Material {
  const amount = Math.min(1, Math.max(0, opts.amount));
  const contrast = Math.min(1, Math.max(0, opts.contrast ?? 0.6));
  const jitter = Math.min(1, Math.max(0, opts.jitter ?? 0));
  const jScale = opts.jitterScale ?? 12;
  const seed = (opts.seed ?? 0) >>> 0;
  const heightTex = opts.heightFrom === "a" ? a.height : b.height;
  const heightField = bufferAsField(heightTex);
  const mask = heightBlendMask(heightField, {
    amount,
    contrast,
    jitter,
    jitterScale: jScale,
    seed,
  });
  return mixMaterials(a, b, mask);
}
