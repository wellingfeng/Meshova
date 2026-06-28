/**
 * Raster image type for the image-target pipeline (P7).
 *
 * A decoded RGBA8 image: the common currency between the PNG decoder, the
 * reference picture, and the rendered screenshot. Everything in the vision
 * module operates on this so scoring code never touches encoding details.
 *
 * Layout matches the texture buffer convention: row-major, top row first,
 * pixel (x,y) channel c at index (y*width + x)*4 + c. Channels are r,g,b,a.
 */
export interface Raster {
  readonly width: number;
  readonly height: number;
  /** RGBA8, length = width*height*4. */
  readonly data: Uint8Array;
}

export function makeRaster(width: number, height: number): Raster {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

/** Index of pixel (x,y) channel 0. */
export function rasterIndex(img: Raster, x: number, y: number): number {
  return (y * img.width + x) * 4;
}

const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Base64 encode/decode bytes without Node's Buffer or the DOM's atob/btoa, so
 * the core library stays environment-neutral (browser + Node + sandbox). Used
 * to move PNG bytes in and out of the LLM image channel.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += B64_CHARS[(n >> 18) & 63]! + B64_CHARS[(n >> 12) & 63]! + B64_CHARS[(n >> 6) & 63]! + B64_CHARS[n & 63]!;
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i]! << 16;
    out += B64_CHARS[(n >> 18) & 63]! + B64_CHARS[(n >> 12) & 63]! + "==";
  } else if (rem === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += B64_CHARS[(n >> 18) & 63]! + B64_CHARS[(n >> 12) & 63]! + B64_CHARS[(n >> 6) & 63]! + "=";
  }
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const lookup = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64_CHARS.length; i++) lookup[B64_CHARS.charCodeAt(i)] = i;
  const len = Math.floor((clean.length * 6) / 8);
  const out = new Uint8Array(len);
  let acc = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i++) {
    const v = lookup[clean.charCodeAt(i)]!;
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out;
}

/** Read a pixel as [r,g,b,a] in 0..255. */
export function getPixel(img: Raster, x: number, y: number): [number, number, number, number] {
  const i = rasterIndex(img, x, y);
  return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!, img.data[i + 3]!];
}

/**
 * Nearest-neighbour resize. Cheap and dependency-free; good enough because the
 * scoring metrics here are coarse (silhouette overlap, color histograms) and
 * do not need high-quality resampling. Both reference and render get resized
 * to the same comparison grid before any metric runs.
 */
export function resizeNearest(img: Raster, w: number, h: number): Raster {
  if (img.width === w && img.height === h) return img;
  const out = makeRaster(w, h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.height - 1, Math.floor((y / h) * img.height));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.floor((x / w) * img.width));
      const si = rasterIndex(img, sx, sy);
      const di = rasterIndex(out, x, y);
      out.data[di] = img.data[si]!;
      out.data[di + 1] = img.data[si + 1]!;
      out.data[di + 2] = img.data[si + 2]!;
      out.data[di + 3] = img.data[si + 3]!;
    }
  }
  return out;
}

/** Convert one pixel to perceived luminance (0..1), Rec.709 weights. */
export function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * Crop a sub-rectangle. Used to pull a material sample patch out of a
 * reference photo before classifying its surface category.
 */
export function crop(img: Raster, x: number, y: number, w: number, h: number): Raster {
  const out = makeRaster(w, h);
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const sx = Math.min(img.width - 1, Math.max(0, x + xx));
      const sy = Math.min(img.height - 1, Math.max(0, y + yy));
      const si = rasterIndex(img, sx, sy);
      const di = rasterIndex(out, xx, yy);
      out.data[di] = img.data[si]!;
      out.data[di + 1] = img.data[si + 1]!;
      out.data[di + 2] = img.data[si + 2]!;
      out.data[di + 3] = img.data[si + 3]!;
    }
  }
  return out;
}
