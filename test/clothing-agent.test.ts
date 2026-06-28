import { describe, it, expect } from "vitest";
import {
  parseGarmentHint,
  parseClassification,
  classificationToSpec,
  classifyGarment,
  optimizeGarment,
  buildSpec,
  TEMPLATE_PARAM_BOUNDS,
  type GarmentSpec,
  type LlmMessage,
} from "../src/index.js";

describe("parseGarmentHint (text -> GarmentSpec heuristic)", () => {
  it("picks the pants template + denim for 'wide-leg jeans'", () => {
    const spec = parseGarmentHint("wide-leg jeans");
    expect(spec.template).toBe("pants");
    expect(spec.fabric).toBe("denim");
    expect(spec.params.legOpening).toBeGreaterThan(0);
  });

  it("maps 'sleeveless cotton top' to a tshirt with no sleeves", () => {
    const spec = parseGarmentHint("sleeveless cotton top");
    expect(spec.template).toBe("tshirt");
    expect(spec.params.sleeveLength).toBe(0);
  });

  it("understands Chinese hints ('长款 A字 半身裙')", () => {
    const spec = parseGarmentHint("长款 A字 半身裙");
    expect(spec.template).toBe("skirt");
    expect(spec.params.length).toBeGreaterThan(0.8);
    expect(spec.params.flare).toBeGreaterThan(0.2);
  });
});

describe("parseClassification (tolerant VLM reply parsing)", () => {
  it("reads a clean fenced json reply", () => {
    const reply = '```json\n{"template":"skirt","fabric":"silk","features":["a-line"],"confidence":0.9}\n```';
    const c = parseClassification(reply);
    expect(c.template).toBe("skirt");
    expect(c.fabric).toBe("silk");
    expect(c.features).toContain("a-line");
    expect(c.confidence).toBeCloseTo(0.9, 5);
  });

  it("falls back safely on garbage", () => {
    const c = parseClassification("the model refused");
    expect(c.template).toBe("tshirt");
    expect(c.fabric).toBe("cottonJersey");
    expect(c.confidence).toBe(0.5);
  });

  it("rejects unknown fabric/template and clamps confidence", () => {
    const reply = '{"template":"spacesuit","fabric":"unobtainium","confidence":5}';
    const c = parseClassification(reply);
    expect(c.template).toBe("tshirt");
    expect(c.fabric).toBe("cottonJersey");
    expect(c.confidence).toBe(1);
  });
});

describe("classificationToSpec", () => {
  it("seeds params from feature tags through the text heuristic", () => {
    const spec = classificationToSpec({
      template: "tshirt",
      fabric: "wool",
      features: ["long-sleeve"],
      confidence: 0.8,
    });
    expect(spec.template).toBe("tshirt");
    expect(spec.fabric).toBe("wool");
    expect(spec.params.sleeveLength).toBeGreaterThan(0.5);
  });
});

describe("classifyGarment (with a mock VLM client)", () => {
  it("returns the parsed classification from the client reply", async () => {
    const mock = {
      complete: async (_messages: LlmMessage[]) =>
        '```json\n{"template":"pants","fabric":"denim","features":["wide-leg"],"confidence":0.7}\n```',
    };
    const c = await classifyGarment(mock, "deadbeef");
    expect(c.template).toBe("pants");
    expect(c.fabric).toBe("denim");
  });
});

describe("optimizeGarment (deterministic coordinate descent)", () => {
  it("improves the score toward a synthetic target and is reproducible", async () => {
    const start: GarmentSpec = parseGarmentHint("skirt");
    // Target: flare near 0.35. Score = 1 - normalized distance.
    const bounds = TEMPLATE_PARAM_BOUNDS.skirt.find((b) => b.key === "flare")!;
    const evaluate = (spec: GarmentSpec) => {
      const flare = spec.params.flare ?? 0;
      return 1 - Math.abs(flare - 0.35) / (bounds.max - bounds.min);
    };
    const run = () => optimizeGarment(start, { evaluate, rounds: 6, initialStep: 0.5 });
    const a = await run();
    const b = await run();
    expect(a.score).toBeGreaterThan(evaluate(start));
    expect(a.spec.params.flare).toBeCloseTo(b.spec.params.flare!, 10);
    expect(a.evaluations).toBe(b.evaluations);
  });
});

describe("buildSpec", () => {
  it("builds renderable parts for an optimized spec", () => {
    const spec = parseGarmentHint("a-line silk skirt");
    const parts = buildSpec(spec);
    expect(parts.length).toBeGreaterThan(0);
    expect(parts[0]!.mesh.positions.length).toBeGreaterThan(0);
  });
});

describe("Tier2 template routing (dress + hoodie)", () => {
  it("routes hooded tops to hoodie and one-piece dresses to dress", () => {
    expect(parseGarmentHint("灰色连帽卫衣").template).toBe("hoodie");
    expect(parseGarmentHint("hoodie with big hood").template).toBe("hoodie");
    expect(parseGarmentHint("丝绸连衣裙").template).toBe("dress");
    expect(parseGarmentHint("evening gown").template).toBe("dress");
  });

  it("dress feature words set waistline/length/flare", () => {
    expect(parseGarmentHint("高腰连衣裙").params.waistline).toBeLessThan(0);
    expect(parseGarmentHint("及地礼服").params.skirtLength).toBeGreaterThan(0.8);
    expect(parseGarmentHint("a-line dress").params.flare).toBeGreaterThan(0.3);
  });

  it("hoodie feature words set ease/hood", () => {
    expect(parseGarmentHint("oversize 大帽 卫衣").params.chestEase).toBeGreaterThan(0.15);
    expect(parseGarmentHint("oversize 大帽 卫衣").params.hoodScale).toBeGreaterThan(1.1);
  });

  it("includes dress + hoodie in param bounds", () => {
    expect(TEMPLATE_PARAM_BOUNDS.dress.length).toBeGreaterThan(0);
    expect(TEMPLATE_PARAM_BOUNDS.hoodie.length).toBeGreaterThan(0);
  });
});
