import { describe, it, expect } from "vitest";
import { deflateSync } from "node:zlib";
import {
  textToModel,
  imageToModel,
  MockLlmClient,
  base64ToBytes,
  decodePNG,
  type LlmClient,
  type LlmMessage,
} from "../src/index.js";

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

describe("textToModel skill", () => {
  it("returns a working script and built parts from a prompt", async () => {
    const client = new MockLlmClient([
      "```js\nreturn [ part('body', box(1,1.5,1), [0.6,0.4,0.2]) ];\n```",
    ]);
    const res = await textToModel({ client, prompt: "a simple crate", iterations: 1 });
    expect(res.success).toBe(true);
    expect(res.parts.length).toBe(1);
    expect(res.script).toContain("box");
  });
});

/** A fake LLM that returns a script for code turns and JSON for classify turns. */
class ScriptAndClassifyClient implements LlmClient {
  readonly seenMaterialPatchSizes: Array<[number, number]> = [];

  constructor(private readonly category: string) {}
  async complete(messages: LlmMessage[]): Promise<string> {
    const sys = messages.find((m) => m.role === "system")?.content ?? "";
    if (sys.includes("material classifier")) {
      const b64 = messages.find((m) => m.imageBase64)?.imageBase64;
      if (b64) {
        const img = decodePNG(base64ToBytes(b64));
        this.seenMaterialPatchSizes.push([img.width, img.height]);
      }
      return `{"category":"${this.category}","confidence":0.92,"reason":"clear surface"}`;
    }
    return "```js\nreturn [ part('c', box(1,1,1), [0.5,0.35,0.2]) ];\n```";
  }
}

describe("imageToModel skill", () => {
  it("produces a shape script and a guarded material category", async () => {
    const refPng = squarePng(64, 32, [150, 100, 60]);
    const matchB64 = Buffer.from(squarePng(64, 32, [150, 100, 60])).toString("base64");
    const client = new ScriptAndClassifyClient("leather");

    const res = await imageToModel({
      client,
      referencePng: refPng,
      iterations: 1,
      targetScore: 0.6,
      scoreOptions: { gridSize: 64 },
      render: async () => ({ imageBase64: matchB64 }),
    });

    expect(res.success).toBe(true);
    expect(res.script).toContain("box");
    expect(res.score?.silhouetteIoU).toBeGreaterThan(0.7);
    expect(res.material?.category).toBe("leather");
    expect(res.material?.preset).toBe("leather");
    // Material now samples the canonicalized subject (256px canvas, subject
    // centered + background keyed out), so the patch is 256/3 ≈ 85px — a clean
    // subject sample, not a blind 64px center crop that could hit the backdrop.
    expect(client.seenMaterialPatchSizes).toEqual([[85, 85]]);
  });

  it("forces neutral material when the classifier is unsure (no wrong guess)", async () => {
    const refPng = squarePng(64, 32, [150, 100, 60]);
    const matchB64 = Buffer.from(squarePng(64, 32, [150, 100, 60])).toString("base64");
    // VLM returns metal but with low confidence => guard should neutralize.
    const client: LlmClient = {
      async complete(messages) {
        const sys = messages.find((m) => m.role === "system")?.content ?? "";
        if (sys.includes("material classifier")) {
          return `{"category":"metal","confidence":0.1,"reason":"unsure"}`;
        }
        return "```js\nreturn [ part('c', box(1,1,1)) ];\n```";
      },
    };
    const res = await imageToModel({
      client,
      referencePng: refPng,
      iterations: 1,
      targetScore: 0.6,
      scoreOptions: { gridSize: 64 },
      render: async () => ({ imageBase64: matchB64 }),
    });
    expect(res.material?.category).toBe("unknown");
    expect(res.material?.preset).toBeNull();
  });

  it("can skip material classification", async () => {
    const refPng = squarePng(64, 32, [150, 100, 60]);
    const matchB64 = Buffer.from(squarePng(64, 32, [150, 100, 60])).toString("base64");
    const client = new MockLlmClient(["```js\nreturn [ part('c', box(1,1,1)) ];\n```"]);
    const res = await imageToModel({
      client,
      referencePng: refPng,
      iterations: 1,
      targetScore: 0.6,
      classifyMaterial: false,
      scoreOptions: { gridSize: 64 },
      render: async () => ({ imageBase64: matchB64 }),
    });
    expect(res.material).toBeNull();
  });
});
