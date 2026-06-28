import { describe, it, expect } from "vitest";
import { deflateSync } from "node:zlib";
import {
  decodePNG,
  encodePNG,
  makeRaster,
  resizeNearest,
  crop,
  maskFromBackground,
  maskFromPhoto,
  maskIoU,
  normalizeMask,
  makeReferenceTarget,
  scoreRenderRaster,
  scoreMultiView,
  scoreSolidity,
  applySolidity,
  hueHistogram,
  hueSimilarity,
  canonicalizeReference,
  estimateViewpoint,
  maskBounds,
  classifyByFeatures,
  resolveWithGuard,
  CATEGORY_TO_PRESET,
  bytesToBase64,
  base64ToBytes,
  type Raster,
} from "../src/index.js";

/** Build a real deflate-compressed RGBA PNG (Huffman path, not stored). */
function realPng(width: number, height: number, fill: (x: number, y: number) => [number, number, number, number]): Uint8Array {
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = fill(x, y);
      const o = y * (stride + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const idat = deflateSync(Buffer.from(raw));
  const u32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
  const crc32 = (buf: Uint8Array) => {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i]!;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (type: string, data: Uint8Array) => {
    const tb = new Uint8Array([...type].map((ch) => ch.charCodeAt(0)));
    const body = new Uint8Array(tb.length + data.length);
    body.set(tb, 0); body.set(data, tb.length);
    const out = new Uint8Array(4 + body.length + 4);
    out.set(u32(data.length), 0); out.set(body, 4); out.set(u32(crc32(body)), 4 + body.length);
    return out;
  };
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  ihdr.set(u32(width), 0); ihdr.set(u32(height), 4); ihdr[8] = 8; ihdr[9] = 6;
  const chunks = [sig, chunk("IHDR", ihdr), chunk("IDAT", new Uint8Array(idat)), chunk("IEND", new Uint8Array(0))];
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

describe("PNG decoder", () => {
  it("roundtrips a stored-block RGBA PNG from the encoder", () => {
    const w = 8, h = 6;
    const px = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      px[i * 4] = (i * 7) & 255; px[i * 4 + 1] = (i * 13) & 255;
      px[i * 4 + 2] = (i * 29) & 255; px[i * 4 + 3] = 255;
    }
    const png = encodePNG(w, h, 4, px);
    const img = decodePNG(png);
    expect(img.width).toBe(w);
    expect(img.height).toBe(h);
    expect(Array.from(img.data)).toEqual(Array.from(px));
  });

  it("decodes a real deflate-compressed PNG (Huffman path)", () => {
    const png = realPng(16, 16, (x, y) => [x * 16, y * 16, 128, 255]);
    const img = decodePNG(png);
    expect(img.width).toBe(16);
    // pixel (5,9) should be (80,144,128,255)
    const i = (9 * 16 + 5) * 4;
    expect([img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]).toEqual([80, 144, 128, 255]);
  });

  it("decodes grayscale (color type 0)", () => {
    const w = 4, h = 4;
    const px = new Uint8Array(w * h);
    for (let i = 0; i < px.length; i++) px[i] = i * 10;
    const png = encodePNG(w, h, 1, px);
    const img = decodePNG(png);
    const i = (1 * 4 + 2) * 4; // pixel (2,1) -> index 6 -> value 60
    expect(img.data[i]).toBe(60);
    expect(img.data[i + 3]).toBe(255);
  });
});

describe("silhouette", () => {
  /** A render: dark bg, a centered bright square = the object. */
  function squareRender(size: number, sq: number, bg: [number, number, number] = [13, 17, 23]): Raster {
    const img = makeRaster(size, size);
    const lo = (size - sq) / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const inside = x >= lo && x < lo + sq && y >= lo && y < lo + sq;
        const c = inside ? [220, 200, 180] : bg;
        img.data[i] = c[0]!; img.data[i + 1] = c[1]!; img.data[i + 2] = c[2]!; img.data[i + 3] = 255;
      }
    }
    return img;
  }

  it("extracts mask from known background and scores perfect IoU vs itself", () => {
    const r = squareRender(64, 32);
    const a = maskFromBackground(r);
    expect(maskIoU(a, a)).toBeCloseTo(1, 5);
  });

  it("normalized IoU is high for same shape at different scale", () => {
    const big = normalizeMask(maskFromBackground(squareRender(64, 40)));
    const small = normalizeMask(maskFromBackground(squareRender(64, 16)));
    expect(maskIoU(big, small)).toBeGreaterThan(0.85);
  });

  it("photo mask keys against corner background", () => {
    // bright corners (background), dark center (object)
    const size = 32;
    const img = makeRaster(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const center = Math.abs(x - 16) < 8 && Math.abs(y - 16) < 8;
        const v = center ? 20 : 240;
        img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
      }
    }
    const m = maskFromPhoto(img);
    // center should be foreground
    expect(m.data[16 * size + 16]).toBe(1);
    // corner should be background
    expect(m.data[0]).toBe(0);
  });
});

describe("scoring", () => {
  function squarePng(size: number, sq: number, color: [number, number, number]): Uint8Array {
    const lo = (size - sq) / 2;
    return realPng(size, size, (x, y) => {
      const inside = x >= lo && x < lo + sq && y >= lo && y < lo + sq;
      return inside ? [color[0], color[1], color[2], 255] : [240, 240, 240, 255];
    });
  }

  it("a render matching the reference shape scores higher than a mismatch", () => {
    // reference photo: centered square on light bg
    const refPng = squarePng(64, 32, [180, 120, 60]);
    const target = makeReferenceTarget(refPng, { gridSize: 64 });

    // matching render: same-ish square on dark viewer bg
    const matchRender = makeRaster(64, 64);
    const lo = 16;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const i = (y * 64 + x) * 4;
      const inside = x >= lo && x < lo + 32 && y >= lo && y < lo + 32;
      const c = inside ? [180, 120, 60] : [13, 17, 23];
      matchRender.data[i] = c[0]!; matchRender.data[i + 1] = c[1]!; matchRender.data[i + 2] = c[2]!; matchRender.data[i + 3] = 255;
    }

    // mismatch render: a thin tall bar — a genuinely different shape that
    // stays different even after silhouette normalization.
    const missRender = makeRaster(64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const i = (y * 64 + x) * 4;
      const inside = Math.abs(x - 32) < 3 && y >= 8 && y < 56;
      const c = inside ? [180, 120, 60] : [13, 17, 23];
      missRender.data[i] = c[0]!; missRender.data[i + 1] = c[1]!; missRender.data[i + 2] = c[2]!; missRender.data[i + 3] = 255;
    }

    const matchScore = scoreRenderRaster(target, matchRender);
    const missScore = scoreRenderRaster(target, missRender);
    expect(matchScore.score).toBeGreaterThan(missScore.score);
    expect(matchScore.silhouetteIoU).toBeGreaterThan(0.7);
  });
});

describe("material classifier guard", () => {
  it("maps categories to presets and never drops metal into a soft preset by accident", () => {
    expect(CATEGORY_TO_PRESET.metal).toBe("metal");
    expect(CATEGORY_TO_PRESET.leather).toBe("leather");
    expect(CATEGORY_TO_PRESET.animalCoat).toBe("shortCoat");
    expect(CATEGORY_TO_PRESET.unknown).toBeNull();
  });

  it("low-confidence classification falls back to neutral (no wrong guess)", () => {
    const lowConf = { category: "metal" as const, preset: "rustyMetal", confidence: 0.2, reason: "weak" };
    const resolved = resolveWithGuard(lowConf);
    expect(resolved.category).toBe("unknown");
    expect(resolved.preset).toBeNull();
  });

  it("feature classifier returns a choice with a tint", () => {
    const patch = makeRaster(8, 8);
    for (let i = 0; i < patch.data.length; i += 4) {
      patch.data[i] = 150; patch.data[i + 1] = 150; patch.data[i + 2] = 152; patch.data[i + 3] = 255;
    }
    const choice = classifyByFeatures(patch);
    expect(choice.tint).toBeDefined();
    expect(choice.confidence).toBeGreaterThan(0);
  });
});

describe("raster utils", () => {
  it("resize and crop preserve channel data shape", () => {
    const img = makeRaster(10, 10);
    const small = resizeNearest(img, 5, 5);
    expect(small.data.length).toBe(5 * 5 * 4);
    const c = crop(img, 2, 2, 4, 4);
    expect(c.width).toBe(4);
    expect(c.data.length).toBe(4 * 4 * 4);
  });

  it("base64 roundtrips bytes against node Buffer for all tail lengths", () => {
    for (const n of [0, 1, 2, 3, 7, 16, 255]) {
      const bytes = new Uint8Array(n);
      for (let i = 0; i < n; i++) bytes[i] = (i * 37 + 11) & 255;
      const b64 = bytesToBase64(bytes);
      expect(b64).toBe(Buffer.from(bytes).toString("base64"));
      expect(Array.from(base64ToBytes(b64))).toEqual(Array.from(bytes));
    }
  });
});

// Fill a solid-color square (object) on the viewer dark bg, ready to score.
function squareRenderRGB(size: number, side: number, rgb: [number, number, number]): Raster {
  const img = makeRaster(size, size);
  const lo = ((size - side) / 2) | 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const inside = x >= lo && x < lo + side && y >= lo && y < lo + side;
    const c = inside ? rgb : [13, 17, 23];
    img.data[i] = c[0]!; img.data[i + 1] = c[1]!; img.data[i + 2] = c[2]!; img.data[i + 3] = 255;
  }
  return img;
}

// A thin vertical bar — a genuinely different shape that stays different even
// after silhouette normalization (different aspect ratio than a square).
function barRenderRGB(size: number, halfW: number, rgb: [number, number, number]): Raster {
  const img = makeRaster(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const inside = Math.abs(x - size / 2) < halfW && y >= size * 0.15 && y < size * 0.85;
    const c = inside ? rgb : [13, 17, 23];
    img.data[i] = c[0]!; img.data[i + 1] = c[1]!; img.data[i + 2] = c[2]!; img.data[i + 3] = 255;
  }
  return img;
}

describe("hue histogram (lighting-robust color)", () => {
  it("ignores brightness: same hue at different value scores ~1", () => {
    const bright = squareRenderRGB(48, 24, [200, 60, 60]); // saturated red, bright
    const dark = squareRenderRGB(48, 24, [90, 27, 27]); // same red hue, much darker
    const hb = hueHistogram(bright, 12);
    const hd = hueHistogram(dark, 12);
    // Shading (brightness) differs hugely, hue is identical -> high similarity.
    expect(hueSimilarity(hb, hd)).toBeGreaterThan(0.85);
  });

  it("separates different hues", () => {
    const red = hueHistogram(squareRenderRGB(48, 24, [200, 40, 40]), 12);
    const blue = hueHistogram(squareRenderRGB(48, 24, [40, 40, 200]), 12);
    expect(hueSimilarity(red, blue)).toBeLessThan(0.3);
  });
});

describe("multi-view consistency penalty", () => {
  function refSquarePng(size: number, sq: number, color: [number, number, number]): Uint8Array {
    const lo = (size - sq) / 2;
    return realPng(size, size, (x, y) => {
      const inside = x >= lo && x < lo + sq && y >= lo && y < lo + sq;
      return inside ? [color[0], color[1], color[2], 255] : [240, 240, 240, 255];
    });
  }
  // A reference target shaped like a centered square.
  function squareTarget(): ReturnType<typeof makeReferenceTarget> {
    const refPng = refSquarePng(64, 32, [180, 120, 60]);
    return makeReferenceTarget(refPng, { gridSize: 64 });
  }

  it("penalizes a shape that matches one view but collapses in another", () => {
    const target = squareTarget();
    const good = squareRenderRGB(64, 32, [180, 120, 60]); // matches the square
    const collapsed = barRenderRGB(64, 3, [180, 120, 60]); // thin bar, wrong shape

    // Consistent: both views match -> low std-dev, no penalty.
    const consistent = scoreMultiView([
      { view: "front", target, render: good },
      { view: "side", target, render: good },
    ]);
    // Inconsistent: one view great, one view collapsed -> high std-dev, penalty.
    const inconsistent = scoreMultiView([
      { view: "front", target, render: good },
      { view: "side", target, render: collapsed },
    ]);

    expect(inconsistent.ioUStdDev).toBeGreaterThan(consistent.ioUStdDev);
    expect(consistent.score).toBeGreaterThan(inconsistent.score);
  });

  it("disabling the penalty leaves the blended score untouched", () => {
    const target = squareTarget();
    const good = squareRenderRGB(64, 32, [180, 120, 60]);
    const bad = barRenderRGB(64, 3, [180, 120, 60]);
    const pairs = [
      { view: "front", target, render: good },
      { view: "side", target, render: bad },
    ];
    const withPenalty = scoreMultiView(pairs, { consistencyPenalty: 0.6 });
    const noPenalty = scoreMultiView(pairs, { consistencyPenalty: 0 });
    expect(noPenalty.score).toBeGreaterThanOrEqual(withPenalty.score);
  });
});


describe("reference canonicalization (calibration)", () => {
  // A chromatic subject (so maskFromPhoto's saturation key fires) placed
  // off-center and small on a neutral light background.
  function offsetSubjectPng(size: number, sub: number, ox: number, oy: number): Uint8Array {
    return realPng(size, size, (x, y) => {
      const inside = x >= ox && x < ox + sub && y >= oy && y < oy + sub;
      return inside ? [210, 60, 50, 255] : [235, 235, 236, 255];
    });
  }

  it("recenters and unit-scales the subject regardless of source framing", () => {
    const small = decodePNG(offsetSubjectPng(96, 16, 8, 8));   // tiny, top-left
    const big = decodePNG(offsetSubjectPng(96, 48, 40, 36));   // large, lower-right
    const ca = canonicalizeReference(small, { size: 64 });
    const cb = canonicalizeReference(big, { size: 64 });
    // Both subjects should now fill ~the same fraction and sit centered.
    const ba = maskBounds(ca.mask);
    const bb = maskBounds(cb.mask);
    const fillA = (ba.x1 - ba.x0 + 1) / 64;
    const fillB = (bb.x1 - bb.x0 + 1) / 64;
    expect(fillA).toBeGreaterThan(0.8);
    expect(fillB).toBeGreaterThan(0.8);
    // Centers within a few px of the canvas middle.
    expect(Math.abs((ba.x0 + ba.x1) / 2 - 32)).toBeLessThan(4);
    expect(Math.abs((bb.y0 + bb.y1) / 2 - 32)).toBeLessThan(4);
  });

  it("preserves subject aspect ratio (no stretch)", () => {
    // A tall subject: 12 wide, 36 tall.
    const tall = decodePNG(realPng(80, 80, (x, y) => {
      const inside = Math.abs(x - 40) < 6 && y >= 22 && y < 58;
      return inside ? [60, 200, 90, 255] : [236, 236, 236, 255];
    }));
    const c = canonicalizeReference(tall, { size: 64 });
    expect(c.aspect).toBeLessThan(0.6); // clearly taller than wide
    const b = maskBounds(c.mask);
    const w = b.x1 - b.x0 + 1;
    const h = b.y1 - b.y0 + 1;
    expect(w / h).toBeLessThan(0.6); // aspect kept after canonicalization
  });

  it("estimates elevation sign from top/bottom mass imbalance", () => {
    // Top-heavy mask -> camera looking down -> positive elevation.
    const topHeavy = { width: 20, height: 20, data: new Uint8Array(400) };
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
      const w = y < 10 ? 9 : 3; // wide on top, narrow on bottom
      if (Math.abs(x - 10) < w) topHeavy.data[y * 20 + x] = 1;
    }
    expect(estimateViewpoint(topHeavy).elevationDeg).toBeGreaterThan(0);
  });

  it("flags a left/right symmetric silhouette", () => {
    const sym = { width: 20, height: 20, data: new Uint8Array(400) };
    for (let y = 4; y < 16; y++) for (let x = 5; x < 15; x++) sym.data[y * 20 + x] = 1;
    expect(estimateViewpoint(sym).symmetric).toBe(true);
  });
});

describe("solidity (reference-free flat-shape guard)", () => {
  it("a solid object keeps its footprint across views -> high solidity", () => {
    // Three views all showing a comparable chunky footprint.
    const a = squareRenderRGB(64, 30, [180, 120, 60]);
    const b = squareRenderRGB(64, 28, [180, 120, 60]);
    const c = squareRenderRGB(64, 32, [180, 120, 60]);
    const s = scoreSolidity([a, b, c]);
    expect(s.solidity).toBeGreaterThan(0.7);
  });

  it("a billboard collapses to a sliver edge-on -> low solidity", () => {
    const frontFace = squareRenderRGB(64, 32, [180, 120, 60]); // big footprint
    const edgeOn = barRenderRGB(64, 2, [180, 120, 60]);        // thin sliver
    const s = scoreSolidity([frontFace, edgeOn]);
    expect(s.solidity).toBeLessThan(0.4);
  });

  it("applySolidity drags down a flat shape but spares a solid one", () => {
    expect(applySolidity(0.9, 1.0, 0.5)).toBeCloseTo(0.9, 5);   // solid: untouched
    expect(applySolidity(0.9, 0.2, 0.5)).toBeLessThan(0.9);      // flat: penalized
    expect(applySolidity(0.9, 0.0, 0.5)).toBeCloseTo(0.45, 5);   // full collapse, penalty 0.5
  });

  it("returns solidity 1 with fewer than two views (no evidence)", () => {
    expect(scoreSolidity([squareRenderRGB(64, 30, [180, 120, 60])]).solidity).toBe(1);
    expect(scoreSolidity([]).solidity).toBe(1);
  });
});
