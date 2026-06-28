/**
 * Minimal zero-dependency PNG encoder (8-bit, RGBA or grayscale).
 *
 * Enough to export procedural PBR maps to viewable files. Uses uncompressed
 * (stored) zlib blocks so we need no deflate library; files are larger but
 * always valid. Self-written from the PNG/zlib specs.
 */

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function adler32(buf: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]!) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array([...type].map((c) => c.charCodeAt(0)));
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  const out = new Uint8Array(4 + body.length + 4);
  out.set(u32(data.length), 0);
  out.set(body, 4);
  out.set(u32(crc32(body)), 4 + body.length);
  return out;
}

/** Wrap raw bytes in stored (uncompressed) zlib blocks. */
function zlibStore(raw: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [];
  const MAX = 65535;
  let off = 0;
  while (off < raw.length) {
    const len = Math.min(MAX, raw.length - off);
    const last = off + len >= raw.length ? 1 : 0;
    const header = new Uint8Array(5);
    header[0] = last;
    header[1] = len & 255;
    header[2] = (len >>> 8) & 255;
    header[3] = ~len & 255;
    header[4] = (~len >>> 8) & 255;
    blocks.push(header, raw.subarray(off, off + len));
    off += len;
  }
  const bodyLen = blocks.reduce((s, b) => s + b.length, 0);
  const out = new Uint8Array(2 + bodyLen + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  let p = 2;
  for (const b of blocks) {
    out.set(b, p);
    p += b.length;
  }
  out.set(u32(adler32(raw)), p);
  return out;
}

/**
 * Encode 8-bit pixels to a PNG byte array.
 * @param pixels row-major, `channels` bytes per pixel (1=gray, 3=RGB, 4=RGBA)
 */
export function encodePNG(
  width: number,
  height: number,
  channels: 1 | 3 | 4,
  pixels: Uint8Array,
): Uint8Array {
  const colorType = channels === 1 ? 0 : channels === 3 ? 2 : 6;
  // raw scanlines with filter byte 0 prefix
  const stride = width * channels;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(pixels.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  ihdr.set(u32(width), 0);
  ihdr.set(u32(height), 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = colorType;
  // 10,11,12 = compression/filter/interlace = 0
  const idat = zlibStore(raw);

  const chunks = [sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))];
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

import type { TextureBuffer } from "./buffer.js";

function toByte(x: number): number {
  const v = Math.round(clamp01(x) * 255);
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Convert a texture buffer to a PNG byte array (1 or 3 channels). */
export function textureToPNG(tex: TextureBuffer): Uint8Array {
  const { width, height, channels, data } = tex;
  if (channels === 1) {
    const px = new Uint8Array(width * height);
    for (let i = 0; i < px.length; i++) px[i] = toByte(data[i]!);
    return encodePNG(width, height, 1, px);
  }
  // emit RGB
  const px = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    px[i * 3] = toByte(data[i * channels]!);
    px[i * 3 + 1] = toByte(data[i * channels + 1]!);
    px[i * 3 + 2] = toByte(data[i * channels + 2]!);
  }
  return encodePNG(width, height, 3, px);
}
