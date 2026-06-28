/**
 * Minimal zero-dependency PNG decoder (P7).
 *
 * The texture module already has an encoder; loading a *reference photo* needs
 * the reverse, and real PNGs are zlib/deflate compressed (not the stored-only
 * blocks our encoder emits). So this file carries a small INFLATE plus PNG
 * filter reconstruction. Self-written from RFC 1950/1951 and the PNG spec.
 *
 * Scope: 8-bit images, color types 0 (gray), 2 (RGB), 3 (palette), 4
 * (gray+alpha), 6 (RGBA), no interlace. That covers virtually every photo a
 * user would hand us as a modeling reference. Output is always RGBA8 Raster.
 */
import { makeRaster, type Raster } from "./raster.js";

/** Bit reader over a byte array, LSB-first as DEFLATE requires. */
class BitReader {
  private pos = 0;
  private bit = 0;
  constructor(private readonly buf: Uint8Array) {}

  readBit(): number {
    const b = (this.buf[this.pos]! >> this.bit) & 1;
    this.bit++;
    if (this.bit === 8) {
      this.bit = 0;
      this.pos++;
    }
    return b;
  }

  readBits(n: number): number {
    let v = 0;
    for (let i = 0; i < n; i++) v |= this.readBit() << i;
    return v;
  }

  alignByte(): void {
    if (this.bit !== 0) {
      this.bit = 0;
      this.pos++;
    }
  }

  readBytes(n: number): Uint8Array {
    const out = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
}

/** A canonical Huffman table built from per-symbol code lengths. */
interface Huffman {
  counts: Uint16Array; // number of codes of each length
  symbols: Uint16Array; // symbols sorted by code
}

function buildHuffman(lengths: number[]): Huffman {
  const maxBits = 15;
  const counts = new Uint16Array(maxBits + 1);
  for (const l of lengths) counts[l]!++;
  counts[0] = 0;
  const offsets = new Uint16Array(maxBits + 1);
  for (let i = 1; i <= maxBits; i++) offsets[i] = offsets[i - 1]! + counts[i - 1]!;
  const symbols = new Uint16Array(lengths.length);
  for (let s = 0; s < lengths.length; s++) {
    if (lengths[s] !== 0) symbols[offsets[lengths[s]!]!++] = s;
  }
  return { counts, symbols };
}

function decodeSymbol(br: BitReader, h: Huffman): number {
  let code = 0;
  let first = 0;
  let index = 0;
  for (let len = 1; len <= 15; len++) {
    code |= br.readBit();
    const count = h.counts[len]!;
    if (code - first < count) return h.symbols[index + (code - first)]!;
    index += count;
    first += count;
    first <<= 1;
    code <<= 1;
  }
  throw new Error("PNG inflate: bad Huffman code");
}

// Length/distance base tables and extra-bit counts (RFC 1951 §3.2.5).
const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CLEN_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

/** Fixed Huffman tables for block type 1. */
function fixedTables(): { lit: Huffman; dist: Huffman } {
  const litLens: number[] = [];
  for (let i = 0; i < 144; i++) litLens.push(8);
  for (let i = 144; i < 256; i++) litLens.push(9);
  for (let i = 256; i < 280; i++) litLens.push(7);
  for (let i = 280; i < 288; i++) litLens.push(8);
  const distLens = new Array(30).fill(5);
  return { lit: buildHuffman(litLens), dist: buildHuffman(distLens) };
}

/** Read the dynamic Huffman tables described at the start of a type-2 block. */
function dynamicTables(br: BitReader): { lit: Huffman; dist: Huffman } {
  const hlit = br.readBits(5) + 257;
  const hdist = br.readBits(5) + 1;
  const hclen = br.readBits(4) + 4;
  const clenLens = new Array(19).fill(0);
  for (let i = 0; i < hclen; i++) clenLens[CLEN_ORDER[i]!] = br.readBits(3);
  const clenTable = buildHuffman(clenLens);

  const lens: number[] = [];
  while (lens.length < hlit + hdist) {
    const sym = decodeSymbol(br, clenTable);
    if (sym < 16) {
      lens.push(sym);
    } else if (sym === 16) {
      const rep = br.readBits(2) + 3;
      const prev = lens[lens.length - 1]!;
      for (let i = 0; i < rep; i++) lens.push(prev);
    } else if (sym === 17) {
      const rep = br.readBits(3) + 3;
      for (let i = 0; i < rep; i++) lens.push(0);
    } else {
      const rep = br.readBits(7) + 11;
      for (let i = 0; i < rep; i++) lens.push(0);
    }
  }
  return {
    lit: buildHuffman(lens.slice(0, hlit)),
    dist: buildHuffman(lens.slice(hlit, hlit + hdist)),
  };
}

/** INFLATE a raw DEFLATE stream (no zlib header). */
function inflateRaw(br: BitReader): Uint8Array {
  const out: number[] = [];
  let final = 0;
  do {
    final = br.readBit();
    const type = br.readBits(2);
    if (type === 0) {
      br.alignByte();
      const lenBytes = br.readBytes(4);
      const len = lenBytes[0]! | (lenBytes[1]! << 8);
      const block = br.readBytes(len);
      for (let i = 0; i < len; i++) out.push(block[i]!);
    } else {
      const { lit, dist } = type === 1 ? fixedTables() : dynamicTables(br);
      for (;;) {
        const sym = decodeSymbol(br, lit);
        if (sym === 256) break;
        if (sym < 256) {
          out.push(sym);
        } else {
          const li = sym - 257;
          const length = LEN_BASE[li]! + br.readBits(LEN_EXTRA[li]!);
          const dsym = decodeSymbol(br, dist);
          const distance = DIST_BASE[dsym]! + br.readBits(DIST_EXTRA[dsym]!);
          const start = out.length - distance;
          for (let i = 0; i < length; i++) out.push(out[start + i]!);
        }
      }
    }
  } while (!final);
  return Uint8Array.from(out);
}

/** Strip the 2-byte zlib header and inflate the deflate body. */
function zlibInflate(buf: Uint8Array): Uint8Array {
  // buf[0]=CMF, buf[1]=FLG; skip them (and a preset dictionary if FDICT set).
  let offset = 2;
  if ((buf[1]! & 0x20) !== 0) offset += 4;
  return inflateRaw(new BitReader(buf.subarray(offset)));
}

const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];

interface IHDR {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
}

/** Channel count per PNG color type (0/2/3/4/6). */
function channelsOf(colorType: number): number {
  switch (colorType) {
    case 0: return 1; // grayscale
    case 2: return 3; // RGB
    case 3: return 1; // palette index
    case 4: return 2; // gray + alpha
    case 6: return 4; // RGBA
    default: throw new Error(`PNG: unsupported color type ${colorType}`);
  }
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** Undo the per-scanline PNG filters in place, returning unfiltered bytes. */
function unfilter(raw: Uint8Array, width: number, height: number, bpp: number): Uint8Array {
  const stride = width * bpp;
  const out = new Uint8Array(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++]!;
    const rowStart = y * stride;
    const prevStart = rowStart - stride;
    for (let x = 0; x < stride; x++) {
      const rawVal = raw[pos++]!;
      const a = x >= bpp ? out[rowStart + x - bpp]! : 0;
      const b = y > 0 ? out[prevStart + x]! : 0;
      const c = x >= bpp && y > 0 ? out[prevStart + x - bpp]! : 0;
      let v: number;
      switch (filter) {
        case 0: v = rawVal; break;
        case 1: v = rawVal + a; break;
        case 2: v = rawVal + b; break;
        case 3: v = rawVal + ((a + b) >> 1); break;
        case 4: v = rawVal + paeth(a, b, c); break;
        default: throw new Error(`PNG: bad filter ${filter}`);
      }
      out[rowStart + x] = v & 0xff;
    }
  }
  return out;
}

/**
 * Decode a PNG byte buffer into an RGBA8 Raster. Handles 8-bit grayscale,
 * RGB, palette, gray+alpha and RGBA, no interlace — the common photo cases.
 */
export function decodePNG(bytes: Uint8Array): Raster {
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== PNG_SIG[i]) throw new Error("Not a PNG file");
  }
  let pos = 8;
  let ihdr: IHDR | null = null;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: number[] = [];

  while (pos < bytes.length) {
    const len = (bytes[pos]! << 24) | (bytes[pos + 1]! << 16) | (bytes[pos + 2]! << 8) | bytes[pos + 3]!;
    const type = String.fromCharCode(bytes[pos + 4]!, bytes[pos + 5]!, bytes[pos + 6]!, bytes[pos + 7]!);
    const dataStart = pos + 8;
    if (type === "IHDR") {
      ihdr = {
        width: (bytes[dataStart]! << 24) | (bytes[dataStart + 1]! << 16) | (bytes[dataStart + 2]! << 8) | bytes[dataStart + 3]!,
        height: (bytes[dataStart + 4]! << 24) | (bytes[dataStart + 5]! << 16) | (bytes[dataStart + 6]! << 8) | bytes[dataStart + 7]!,
        bitDepth: bytes[dataStart + 8]!,
        colorType: bytes[dataStart + 9]!,
      };
      if (bytes[dataStart + 12] !== 0) throw new Error("PNG: interlace not supported");
      if (ihdr.bitDepth !== 8) throw new Error(`PNG: only 8-bit depth supported (got ${ihdr.bitDepth})`);
    } else if (type === "PLTE") {
      palette = bytes.subarray(dataStart, dataStart + len);
    } else if (type === "tRNS") {
      trns = bytes.subarray(dataStart, dataStart + len);
    } else if (type === "IDAT") {
      for (let i = 0; i < len; i++) idat.push(bytes[dataStart + i]!);
    } else if (type === "IEND") {
      break;
    }
    pos = dataStart + len + 4; // skip data + CRC
  }

  if (!ihdr) throw new Error("PNG: missing IHDR");
  const { width, height, colorType } = ihdr;
  const ch = channelsOf(colorType);
  const inflated = zlibInflate(Uint8Array.from(idat));
  const pixels = unfilter(inflated, width, height, ch);

  const out = makeRaster(width, height);
  const d = out.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * ch;
      const di = (y * width + x) * 4;
      if (colorType === 0) {
        const g = pixels[si]!;
        d[di] = g; d[di + 1] = g; d[di + 2] = g; d[di + 3] = 255;
      } else if (colorType === 2) {
        d[di] = pixels[si]!; d[di + 1] = pixels[si + 1]!; d[di + 2] = pixels[si + 2]!; d[di + 3] = 255;
      } else if (colorType === 3) {
        const idx = pixels[si]!;
        d[di] = palette![idx * 3]!; d[di + 1] = palette![idx * 3 + 1]!; d[di + 2] = palette![idx * 3 + 2]!;
        d[di + 3] = trns && idx < trns.length ? trns[idx]! : 255;
      } else if (colorType === 4) {
        const g = pixels[si]!;
        d[di] = g; d[di + 1] = g; d[di + 2] = g; d[di + 3] = pixels[si + 1]!;
      } else { // 6 RGBA
        d[di] = pixels[si]!; d[di + 1] = pixels[si + 1]!; d[di + 2] = pixels[si + 2]!; d[di + 3] = pixels[si + 3]!;
      }
    }
  }
  return out;
}




