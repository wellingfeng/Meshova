import { describe, it, expect } from "vitest";
import {
  imageToGarment,
  buildSpec,
  parseGarmentHint,
  encodePNG,
  bytesToBase64,
  bounds,
  merge,
  type NamedPart,
  type GarmentSpec,
  MockLlmClient,
} from "../src/index.js";

/**
 * Deterministic orthographic silhouette renderer for tests: project garment
 * parts onto the XY plane (front view) and rasterize a white-on-bg mask to a
 * PNG. No GPU/Playwright — just enough for the optimizer to get a real gradient.
 */
const W = 96;
const H = 96;
const BG: [number, number, number] = [13, 17, 23];

function renderSilhouettePng(parts: NamedPart[]): Uint8Array {
  const merged = merge(...parts.map((p) => p.mesh));
  const px = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    px[i * 4] = BG[0];
    px[i * 4 + 1] = BG[1];
    px[i * 4 + 2] = BG[2];
    px[i * 4 + 3] = 255;
  }
  if (merged.positions.length === 0) return encodePNG(W, H, 4, px);

  const b = bounds(merged);
  const spanX = Math.max(1e-3, b.max.x - b.min.x);
  const spanY = Math.max(1e-3, b.max.y - b.min.y);
  const span = Math.max(spanX, spanY) * 1.15;
  const cx = (b.min.x + b.max.x) / 2;
  const cy = (b.min.y + b.max.y) / 2;
  // World -> pixel (Y up flips to row down).
  const toPx = (x: number, y: number): [number, number] => {
    const u = (x - cx) / span + 0.5;
    const v = (y - cy) / span + 0.5;
    return [Math.round(u * W), Math.round((1 - v) * H)];
  };

  const setFg = (x: number, y: number) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const i = (y * W + x) * 4;
    px[i] = 235; px[i + 1] = 235; px[i + 2] = 235; px[i + 3] = 255;
  };

  // Fill each triangle (scanline) so the silhouette is solid.
  const idx = merged.indices;
  for (let t = 0; t < idx.length; t += 3) {
    const p0 = toPx(merged.positions[idx[t]!]!.x, merged.positions[idx[t]!]!.y);
    const p1 = toPx(merged.positions[idx[t + 1]!]!.x, merged.positions[idx[t + 1]!]!.y);
    const p2 = toPx(merged.positions[idx[t + 2]!]!.x, merged.positions[idx[t + 2]!]!.y);
    const minY = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1])));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])));
    const minX = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0])));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])));
    const area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
    if (Math.abs(area) < 1e-6) continue;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const w0 = (p1[0] - x) * (p2[1] - y) - (p2[0] - x) * (p1[1] - y);
        const w1 = (p2[0] - x) * (p0[1] - y) - (p0[0] - x) * (p2[1] - y);
        const w2 = (p0[0] - x) * (p1[1] - y) - (p1[0] - x) * (p0[1] - y);
        const hasNeg = w0 < 0 || w1 < 0 || w2 < 0;
        const hasPos = w0 > 0 || w1 > 0 || w2 > 0;
        if (!(hasNeg && hasPos)) setFg(x, y);
      }
    }
  }
  return encodePNG(W, H, 4, px);
}

/** Build a reference photo by rendering a known-good target garment. */
function referenceOf(spec: GarmentSpec): Uint8Array {
  return renderSilhouettePng(buildSpec(spec));
}

describe("imageToGarment end-to-end closed loop (M6)", () => {
  it("fits continuous params toward a known target via silhouette score (offline)", async () => {
    // Target: a long A-line skirt. Start the loop from default params and let it
    // climb. No LLM client => offline keyword classifier picks "skirt".
    const targetSpec: GarmentSpec = { template: "skirt", fabric: "denim", params: { length: 0.9, flare: 0.4, hipEase: 0.04 } };
    const referencePng = referenceOf(targetSpec);

    const res = await imageToGarment({
      referencePng,
      hint: "牛仔A字长裙",
      rounds: 6,
      targetScore: 0.999,
      render: (parts) => ({ imageBase64: bytesToBase64(renderSilhouettePng(parts)) }),
    });

    expect(res.success).toBe(true);
    expect(res.spec.template).toBe("skirt");
    expect(res.score).not.toBeNull();
    // Optimized score should beat the starting score meaningfully.
    expect(res.score!.silhouetteIoU).toBeGreaterThan(0.75);
    // It should have pushed length + flare up toward the long A-line target.
    expect(res.spec.params.length).toBeGreaterThan(0.6);
    expect(res.spec.params.flare).toBeGreaterThan(0.2);
  });

  it("uses a VLM classification when a client is provided", async () => {
    const targetSpec: GarmentSpec = { template: "pants", fabric: "denim", params: { length: 1.0, legOpening: 0.16, thighEase: 0.1, hipEase: 0.05 } };
    const referencePng = referenceOf(targetSpec);
    const client = new MockLlmClient([
      '```json\n{"template":"pants","fabric":"denim","features":["wide-leg"],"confidence":0.92}\n```',
    ]);

    const res = await imageToGarment({
      client,
      referencePng,
      rounds: 4,
      render: (parts) => ({ imageBase64: bytesToBase64(renderSilhouettePng(parts)) }),
    });

    expect(res.classification.template).toBe("pants");
    expect(res.classification.confidence).toBeCloseTo(0.92, 5);
    expect(res.spec.template).toBe("pants");
    expect(res.parts.length).toBeGreaterThan(0);
  });

  it("is deterministic: same reference + same start -> same fit", async () => {
    const targetSpec = parseGarmentHint("白色短袖T恤");
    const referencePng = referenceOf({ ...targetSpec, params: { ...targetSpec.params, bodyLength: 1.2 } });
    const run = () => imageToGarment({
      referencePng,
      hint: "白色短袖T恤",
      rounds: 4,
      render: (parts) => ({ imageBase64: bytesToBase64(renderSilhouettePng(parts)) }),
    });
    const a = await run();
    const b = await run();
    expect(a.spec.params).toEqual(b.spec.params);
    expect(a.evaluations).toBe(b.evaluations);
  });

  it("falls back to the keyword parser when the VLM client throws", async () => {
    const failing = { complete: () => Promise.reject(new Error("no network")) };
    const referencePng = referenceOf(parseGarmentHint("半身裙"));
    const res = await imageToGarment({
      client: failing,
      referencePng,
      hint: "牛仔半身裙",
      rounds: 2,
      render: (parts) => ({ imageBase64: bytesToBase64(renderSilhouettePng(parts)) }),
    });
    expect(res.classification.template).toBe("skirt");
    expect(res.success).toBe(true);
  });
});

