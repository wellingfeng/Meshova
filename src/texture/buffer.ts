/**
 * Texture channel buffer — the material core's pixel store.
 *
 * A square (or rectangular) float buffer with N channels. PBR maps live here
 * before export: grayscale (1 ch) for roughness/metallic/height/ao, RGB (3)
 * for baseColor/normal/emission. Float keeps precision for height->normal
 * derivation; export quantizes to 8-bit PNG.
 *
 * Layout: row-major, pixel (x,y) channel c at index (y*width + x)*channels + c.
 * UV convention: u in [0,1] left->right, v in [0,1] bottom->top.
 */
export interface TextureBuffer {
  readonly width: number;
  readonly height: number;
  readonly channels: number;
  readonly data: Float32Array;
}

export function makeTexture(
  width: number,
  height: number,
  channels: number,
): TextureBuffer {
  return {
    width,
    height,
    channels,
    data: new Float32Array(width * height * channels),
  };
}

/** Index of pixel (x,y) channel 0 in the flat array. */
export function pixelIndex(tex: TextureBuffer, x: number, y: number): number {
  return (y * tex.width + x) * tex.channels;
}

/**
 * Fill a buffer by evaluating fn at each pixel's UV center. fn returns one
 * value per channel. This is the CPU procedural path: correct first, GPU later.
 */
export function generate(
  width: number,
  height: number,
  channels: number,
  fn: (u: number, v: number, x: number, y: number) => number[] | number,
): TextureBuffer {
  const tex = makeTexture(width, height, channels);
  const d = tex.data;
  for (let y = 0; y < height; y++) {
    // v flipped so row 0 is top of the image but v=1 is top of UV space.
    const v = 1 - (y + 0.5) / height;
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const out = fn(u, v, x, y);
      const base = (y * width + x) * channels;
      if (typeof out === "number") {
        for (let c = 0; c < channels; c++) d[base + c] = out;
      } else {
        for (let c = 0; c < channels; c++) d[base + c] = out[c] ?? 0;
      }
    }
  }
  return tex;
}

/** Sample a channel with clamped integer pixel lookup. */
export function sample(tex: TextureBuffer, x: number, y: number, c = 0): number {
  const xi = x < 0 ? 0 : x >= tex.width ? tex.width - 1 : x;
  const yi = y < 0 ? 0 : y >= tex.height ? tex.height - 1 : y;
  return tex.data[(yi * tex.width + xi) * tex.channels + c]!;
}

/** Map a scalar field through fn into a new buffer of the given channel count. */
export function mapTexture(
  tex: TextureBuffer,
  channels: number,
  fn: (value: number, x: number, y: number) => number[] | number,
): TextureBuffer {
  const out = makeTexture(tex.width, tex.height, channels);
  for (let y = 0; y < tex.height; y++) {
    for (let x = 0; x < tex.width; x++) {
      const v = tex.data[(y * tex.width + x) * tex.channels]!;
      const res = fn(v, x, y);
      const base = (y * tex.width + x) * channels;
      if (typeof res === "number") {
        for (let c = 0; c < channels; c++) out.data[base + c] = res;
      } else {
        for (let c = 0; c < channels; c++) out.data[base + c] = res[c] ?? 0;
      }
    }
  }
  return out;
}
