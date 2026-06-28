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
