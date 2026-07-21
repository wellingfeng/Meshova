import { describe, it, expect } from "vitest";
import { deflateSync } from "node:zlib";
import {
  parseDecomposition,
  decompositionToPrompt,
  decomposeImage,
  MockLlmClient,
  makeReferenceTarget,
  scoreMultiView,
  formatMultiView,
} from "../src/index.js";

/** Encode an RGBA PNG from a per-pixel fill. */
function pngFromFill(size: number, fill: (x: number, y: number) => [number, number, number]): Uint8Array {
  const stride = size * 4;
  const raw = new Uint8Array((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const c = fill(x, y);
      const o = y * (stride + 1) + 1 + x * 4;
      raw[o] = c[0]!; raw[o + 1] = c[1]!; raw[o + 2] = c[2]!; raw[o + 3] = 255;
    }
  }
  const idat = deflateSync(Buffer.from(raw));
  const u32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
  const crc32 = (buf: Uint8Array) => {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) { c ^= buf[i]!; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
    return ~c >>> 0;
  };
  const chunk = (type: string, data: Uint8Array) => {
    const tb = new Uint8Array([...type].map((ch) => ch.charCodeAt(0)));
    const body = new Uint8Array(tb.length + data.length); body.set(tb, 0); body.set(data, tb.length);
    const out = new Uint8Array(4 + body.length + 4); out.set(u32(data.length), 0); out.set(body, 4); out.set(u32(crc32(body)), 4 + body.length);
    return out;
  };
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13); ihdr.set(u32(size), 0); ihdr.set(u32(size), 4); ihdr[8] = 8; ihdr[9] = 6;
  const chunks = [sig, chunk("IHDR", ihdr), chunk("IDAT", new Uint8Array(idat)), chunk("IEND", new Uint8Array(0))];
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total); let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

/** Centered colored square on a chosen bg. Photos use light bg; renders must
 * use the viewer's dark clear color so keying isolates the object cleanly. */
function squarePng(size: number, sq: number, color: [number, number, number], bg: [number, number, number] = [240, 240, 240]): Uint8Array {
  const lo = (size - sq) / 2;
  return pngFromFill(size, (x, y) => (x >= lo && x < lo + sq && y >= lo && y < lo + sq ? color : bg));
}

/** Centered thin vertical bar — a different aspect ratio than a square, so it
 * stays a shape mismatch even after silhouette normalization. */
function barPng(size: number, halfW: number, color: [number, number, number], bg: [number, number, number] = [13, 17, 23]): Uint8Array {
  return pngFromFill(size, (x, y) =>
    Math.abs(x - size / 2) < halfW && y >= size * 0.15 && y < size * 0.85 ? color : bg);
}

describe("VLM decomposition parsing", () => {
  const reply = [
    "Here is the breakdown:",
    "```json",
    JSON.stringify({
      object: "office chair",
      symmetry: "bilateral",
      parts: [
        { name: "seat", description: "flat cushion", primitive: "box",
          position: { x: 0.5, y: 0.45 }, size: { w: 0.6, h: 0.15 }, material: "fabric",
          depth: "middle", color: "warm charcoal", parent: "base", attachment: "socket", confidence: 0.95 },
        { name: "painted-stripe", description: "color band on backrest", primitive: "box",
          position: { x: 0.5, y: 0.7 }, size: { w: 0.5, h: 0.05 }, material: "fabric", confidence: 0.2 },
      ],
      notes: "tall backrest",
    }),
    "```",
  ].join("\n");

  it("parses object, symmetry, parts and notes", () => {
    const d = parseDecomposition(reply);
    expect(d.object).toBe("office chair");
    expect(d.symmetry).toBe("bilateral");
    expect(d.parts.length).toBe(2);
    expect(d.parts[0]!.name).toBe("seat");
    expect(d.parts[0]!.depth).toBe("middle");
    expect(d.parts[0]!.color).toBe("warm charcoal");
    expect(d.parts[0]!.parent).toBe("base");
    expect(d.parts[0]!.attachment).toBe("socket");
    expect(d.notes).toBe("tall backrest");
  });

  it("clamps coordinates/confidence and normalizes material", () => {
    const messy = "```json" + "\n" + JSON.stringify({
      object: "x", symmetry: "weird",
      parts: [{ name: "", description: "d", primitive: "sphere",
        position: { x: 5, y: -3 }, size: { w: 2, h: -1 }, material: "Velvet", confidence: 99 }],
    }) + "\n```";
    const d = parseDecomposition(messy);
    expect(d.symmetry).toBe("none");          // unknown -> none
    expect(d.parts[0]!.name).toBe("part-0");  // empty -> fallback
    expect(d.parts[0]!.position.x).toBe(1);   // clamped to [0,1]
    expect(d.parts[0]!.position.y).toBe(0);
    expect(d.parts[0]!.size.h).toBe(0);
    expect(d.parts[0]!.confidence).toBe(1);
    expect(d.parts[0]!.material).toBe("unknown"); // unrecognized -> unknown
  });

  it("throws on non-JSON replies", () => {
    expect(() => parseDecomposition("no json here")).toThrow();
  });

  it("flags low-confidence parts as possible surface detail in the prompt", () => {
    const d = parseDecomposition(reply);
    const text = decompositionToPrompt(d);
    expect(text).toContain("seat");
    expect(text).toContain("painted-stripe");
    expect(text).toContain("low-confidence");   // the 0.2-confidence part
    expect(text).toContain("symmetry: bilateral");
    expect(text).toContain("depth=middle");
    expect(text).toContain("parent=base attachment=socket");
  });

  it("runs end-to-end through a MockLlmClient", async () => {
    const client = new MockLlmClient([reply]);
    const d = await decomposeImage({
      client,
      images: { reference: "AAAA", normal: "BBBB", depth: "CCCC" },
      hint: "a chair",
      maxParts: 8,
    });
    expect(d.parts.length).toBe(2);
    expect(client.callCount).toBe(1);
  });
});

describe("multi-view scoring", () => {
  it("fuses per-view scores with worst-view emphasis", () => {
    const ref = squarePng(64, 32, [200, 40, 40]);
    const target = makeReferenceTarget(ref);
    // Renders come on the viewer's dark clear color, not the photo's bg.
    const front = squarePng(64, 32, [200, 40, 40], [13, 17, 23]);
    const side = barPng(64, 4, [200, 40, 40]); // thin bar: wrong shape after normalize
    const b = scoreMultiView([
      { view: "front", target, render: front },
      { view: "side", target, render: side },
    ]);
    expect(b.perView.length).toBe(2);
    expect(b.worstView.view).toBe("side");
    // Fused score sits between the worst and the mean, and below the best view.
    const best = Math.max(...b.perView.map((v) => v.score.score));
    expect(b.score).toBeLessThan(best);
    expect(b.score).toBeGreaterThan(0);
    expect(formatMultiView(b)).toContain("worst=side");
  });

  it("a perfect all-view match scores near 1", () => {
    const ref = squarePng(64, 30, [50, 160, 220]);
    const target = makeReferenceTarget(ref);
    const same = squarePng(64, 30, [50, 160, 220], [13, 17, 23]);
    const b = scoreMultiView([
      { view: "front", target, render: same },
      { view: "side", target, render: same },
      { view: "top", target, render: same },
    ]);
    expect(b.silhouetteIoU).toBeGreaterThan(0.95);
    expect(b.score).toBeGreaterThan(0.9);
  });

  it("throws on empty input", () => {
    expect(() => scoreMultiView([])).toThrow();
  });
});
