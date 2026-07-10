import { describe, it, expect } from "vitest";
import { deflateSync } from "node:zlib";
import {
  runMeshScript,
  runAgentLoop,
  runImageLoop,
  MockLlmClient,
  extractCode,
  SCRIPT_API_NAMES,
} from "../src/index.js";

/** Build a real RGBA PNG (centered colored square on light bg) for targets. */
function squarePng(size: number, sq: number, color: [number, number, number]): Uint8Array {
  const stride = size * 4;
  const raw = new Uint8Array((stride + 1) * size);
  const lo = (size - sq) / 2;
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const inside = x >= lo && x < lo + sq && y >= lo && y < lo + sq;
      const c = inside ? color : [240, 240, 240];
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

describe("script runner", () => {
  it("runs a valid script and returns parts + summary", () => {
    const src = `return [ part("body", box(1,2,1), [0.5,0.5,0.5]), part("head", sphere(0.5), [1,0,0]) ];`;
    const res = runMeshScript(src);
    expect(res.ok).toBe(true);
    expect(res.parts.length).toBe(2);
    expect(res.viewerModel).not.toBeNull();
    expect(res.summary).toContain("Parts: 2");
    expect(res.summary).toContain("body");
  });

  it("reports possibly floating parts in the assembly summary", () => {
    const src = `return [
      part("body", box(1,1,1)),
      part("floating_panel", transform(box(0.2,0.2,0.2), { translate: vec3(3,0,0) }))
    ];`;
    const res = runMeshScript(src);
    expect(res.ok).toBe(true);
    expect(res.summary).toContain("Assembly:");
    expect(res.summary).toContain("possibly floating");
    expect(res.summary).toContain("floating_panel");
  });

  it("accepts a single mesh return", () => {
    const res = runMeshScript(`return sphere(0.5);`);
    expect(res.ok).toBe(true);
    expect(res.parts.length).toBe(1);
  });

  it("reports an error for a throwing script", () => {
    const res = runMeshScript(`return nonexistentFn();`);
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it("reports empty when nothing usable returned", () => {
    const res = runMeshScript(`return 42;`);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("no usable");
  });

  it("blocks forbidden globals", () => {
    const res = runMeshScript(`return fetch ? part("x", box()) : null;`);
    // fetch is shadowed to undefined, so the ternary yields null -> empty
    expect(res.ok).toBe(false);
  });

  it("exposes a curated, non-trivial API surface", () => {
    expect(SCRIPT_API_NAMES).toContain("box");
    expect(SCRIPT_API_NAMES).toContain("union");
    expect(SCRIPT_API_NAMES).toContain("sweep");
    expect(SCRIPT_API_NAMES).toContain("weatheredColor");
    expect(SCRIPT_API_NAMES).toContain("coloredPart");
    // point-cloud query + rule-tree surface (RuleProcessor port)
    expect(SCRIPT_API_NAMES).toContain("partition");
    expect(SCRIPT_API_NAMES).toContain("groupBy");
    expect(SCRIPT_API_NAMES).toContain("aggregate");
    expect(SCRIPT_API_NAMES).toContain("filter");
    expect(SCRIPT_API_NAMES).toContain("iterate");
    expect(SCRIPT_API_NAMES).toContain("emitNode");
    expect(SCRIPT_API_NAMES).toContain("evalRuleTree");
    expect(SCRIPT_API_NAMES).not.toContain("require");
  });

  it("coloredPart bakes shape-aligned per-vertex colors", () => {
    const src = `return [ coloredPart("rock", sphere(1, 16, 12), weatheredColor({ topColor: vec3(1,1,1), base: vec3(0.3,0.25,0.2) })) ];`;
    const res = runMeshScript(src);
    expect(res.ok).toBe(true);
    const vp = res.viewerModel!.parts[0]!;
    expect(vp.colors).toBeDefined();
    expect(vp.colors!.length).toBe(vp.positions.length);
  });
});

describe("extractCode", () => {
  it("pulls a fenced code block", () => {
    expect(extractCode("blah\n```js\nreturn box();\n```\nthanks")).toBe("return box();");
  });
  it("returns trimmed text when no fence", () => {
    expect(extractCode("  return box();  ")).toBe("return box();");
  });
});

describe("agent loop (mock client, headless)", () => {
  it("generates and runs a model in one shot", async () => {
    const client = new MockLlmClient([
      "```js\nreturn [ part('cube', box(1,1,1), [0.6,0.6,0.6]) ];\n```",
    ]);
    const result = await runAgentLoop({ client, goal: "a simple cube", maxIterations: 1 });
    expect(result.success).toBe(true);
    expect(result.final?.run.ok).toBe(true);
    expect(result.steps.length).toBe(1);
  });

  it("recovers from a bad first script via the revise cycle", async () => {
    const client = new MockLlmClient([
      "```js\nreturn brokenCall();\n```", // fails
      "```js\nreturn [ part('ok', sphere(0.5), [1,1,1]) ];\n```", // fixes
    ]);
    const steps: number[] = [];
    const result = await runAgentLoop({
      client,
      goal: "a ball",
      maxIterations: 2,
      onStep: (s) => steps.push(s.iteration),
    });
    expect(result.steps[0]!.run.ok).toBe(false);
    expect(result.steps[1]!.run.ok).toBe(true);
    expect(result.success).toBe(true);
    expect(steps).toEqual([0, 1]);
  });

  it("invokes the render callback for successful runs", async () => {
    const client = new MockLlmClient([
      "```js\nreturn [ part('c', box(1,1,1)) ];\n```",
    ]);
    let rendered = 0;
    await runAgentLoop({
      client,
      goal: "box",
      maxIterations: 1,
      render: async () => {
        rendered += 1;
        return { imageBase64: "ZmFrZQ==", notes: "looks fine" };
      },
    });
    expect(rendered).toBe(1);
  });
});

describe("image-targeted loop", () => {
  it("scores renders against a reference and tracks the best", async () => {
    const refPng = squarePng(64, 32, [180, 120, 60]);
    const refB64 = Buffer.from(refPng).toString("base64");
    // Render that returns the reference itself => high silhouette IoU.
    const goodRender = squarePng(64, 32, [180, 120, 60]);
    const goodB64 = Buffer.from(goodRender).toString("base64");

    const client = new MockLlmClient([
      "```js\nreturn [ part('c', box(1,1,1)) ];\n```",
    ]);
    const result = await runImageLoop({
      client,
      referencePng: refPng,
      maxIterations: 1,
      render: async () => ({ imageBase64: goodB64 }),
      scoreOptions: { gridSize: 64 },
    });
    expect(result.success).toBe(true);
    expect(result.best?.score).toBeDefined();
    expect(result.best!.score!.silhouetteIoU).toBeGreaterThan(0.7);
    // sanity: reference base64 is a valid PNG the loop could decode
    expect(refB64.length).toBeGreaterThan(0);
  });

  it("early-stops once targetScore is reached", async () => {
    const refPng = squarePng(64, 32, [180, 120, 60]);
    const matchB64 = Buffer.from(squarePng(64, 32, [180, 120, 60])).toString("base64");
    let calls = 0;
    const client = new MockLlmClient([
      "```js\nreturn [ part('c', box(1,1,1)) ];\n```",
    ]);
    const result = await runImageLoop({
      client,
      referencePng: refPng,
      maxIterations: 5,
      targetScore: 0.6,
      render: async () => { calls += 1; return { imageBase64: matchB64 }; },
      scoreOptions: { gridSize: 64 },
    });
    // Should stop after the first good score rather than running all 5.
    expect(calls).toBe(1);
    expect(result.best!.score!.score).toBeGreaterThan(0.6);
  });
});
