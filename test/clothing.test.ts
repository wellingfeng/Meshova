import { describe, it, expect } from "vitest";
import {
  buildAvatar,
  bodySectionAt,
  bodyPoint,
  limbById,
  DEFAULT_MEASURES,
  edge,
  curveEdge,
  sampleEdge,
  edgeLength,
  panelToPolygon,
  polygonArea,
  isClosedLoop,
  triangulatePolygon,
  triangulatePanel,
  type PanelDef,
  edgeRef,
  seam,
  validateSeams,
  seamsAreValid,
  type GarmentDef,
  torsoShell,
  limbSleeve,
  buildTShirt,
  buildSkirt,
  buildPants,
  buildDress,
  buildHoodie,
  buildGarment,
  triangleCount,
  vertexCount,
  solidify,
} from "../src/index.js";
import { vec2 } from "../src/math/vec2.js";

describe("avatar (M3 measures)", () => {
  it("derives ascending torso sections from measures", () => {
    const a = buildAvatar();
    for (let i = 1; i < a.sections.length; i++) {
      expect(a.sections[i]!.y).toBeGreaterThan(a.sections[i - 1]!.y);
    }
    expect(a.landmarks.crown).toBeCloseTo(DEFAULT_MEASURES.height, 6);
  });

  it("is deterministic: same measures -> identical body", () => {
    const a = buildAvatar({ chest: 1.1 });
    const b = buildAvatar({ chest: 1.1 });
    expect(a.sections).toEqual(b.sections);
    expect(a.limbs).toEqual(b.limbs);
  });

  it("bigger chest circumference widens the chest section", () => {
    const small = buildAvatar({ chest: 0.8 });
    const big = buildAvatar({ chest: 1.3 });
    const sSec = bodySectionAt(small, small.landmarks.chestLine);
    const bSec = bodySectionAt(big, big.landmarks.chestLine);
    expect(bSec.rx).toBeGreaterThan(sSec.rx);
  });

  it("bodySectionAt interpolates between rings", () => {
    const a = buildAvatar();
    const lo = a.sections[1]!;
    const hi = a.sections[2]!;
    const mid = bodySectionAt(a, (lo.y + hi.y) / 2);
    expect(mid.rx).toBeGreaterThanOrEqual(Math.min(lo.rx, hi.rx) - 1e-9);
    expect(mid.rx).toBeLessThanOrEqual(Math.max(lo.rx, hi.rx) + 1e-9);
  });

  it("bodyPoint with ease pushes outward", () => {
    const a = buildAvatar();
    const y = a.landmarks.chestLine;
    const tight = bodyPoint(a, y, 0, 0);
    const loose = bodyPoint(a, y, 0, 0.1);
    expect(loose.z).toBeGreaterThan(tight.z);
  });

  it("exposes named limbs", () => {
    const a = buildAvatar();
    expect(limbById(a, "arm_l")).toBeDefined();
    expect(limbById(a, "leg_r")).toBeDefined();
    expect(limbById(a, "nope")).toBeUndefined();
  });
});

describe("pattern (M1 panels)", () => {
  it("samples straight and curved edges", () => {
    const e = edge("e0", vec2(0, 0), vec2(2, 0));
    expect(sampleEdge(e, 0.5)).toEqual(vec2(1, 0));
    const c = curveEdge("e1", vec2(0, 0), vec2(1, 2), vec2(2, 0));
    const mid = sampleEdge(c, 0.5);
    expect(mid.x).toBeCloseTo(1, 6);
    expect(mid.y).toBeCloseTo(1, 6);
  });

  it("curved edge is longer than its chord", () => {
    const c = curveEdge("e1", vec2(0, 0), vec2(1, 2), vec2(2, 0));
    expect(edgeLength(c)).toBeGreaterThan(2);
  });

  it("triangulates a square into two triangles", () => {
    const square = [vec2(0, 0), vec2(1, 0), vec2(1, 1), vec2(0, 1)];
    const tris = triangulatePolygon(square);
    expect(tris.length).toBe(6);
  });

  it("triangulates an L-shape (concave) without leaving polygon", () => {
    const L = [
      vec2(0, 0), vec2(2, 0), vec2(2, 1), vec2(1, 1), vec2(1, 2), vec2(0, 2),
    ];
    const tris = triangulatePolygon(L);
    // 6 verts -> 4 triangles
    expect(tris.length).toBe(12);
  });

  it("panel polygon area is positive for CCW authoring", () => {
    const panel: PanelDef = {
      id: "p",
      edges: [
        edge("bottom", vec2(0, 0), vec2(1, 0)),
        edge("right", vec2(1, 0), vec2(1, 1)),
        edge("top", vec2(1, 1), vec2(0, 1)),
        edge("left", vec2(0, 1), vec2(0, 0)),
      ],
    };
    expect(isClosedLoop(panel)).toBe(true);
    const poly = panelToPolygon(panel);
    expect(polygonArea(poly.points)).toBeGreaterThan(0);
    const mesh = triangulatePanel(panel);
    expect(mesh.indices.length).toBeGreaterThan(0);
    expect(mesh.edgeOfPoint.length).toBe(mesh.points.length);
  });
});

describe("seam (M2 graph)", () => {
  const front: PanelDef = {
    id: "front",
    edges: [
      edge("hem", vec2(0, 0), vec2(1, 0)),
      edge("side_r", vec2(1, 0), vec2(1, 2)),
      edge("shoulder", vec2(1, 2), vec2(0, 2)),
      edge("side_l", vec2(0, 2), vec2(0, 0)),
    ],
  };
  const back: PanelDef = {
    id: "back",
    edges: [
      edge("hem", vec2(0, 0), vec2(1, 0)),
      edge("side_r", vec2(1, 0), vec2(1, 2)),
      edge("shoulder", vec2(1, 2), vec2(0, 2)),
      edge("side_l", vec2(0, 2), vec2(0, 0)),
    ],
  };

  it("validates a clean seam graph", () => {
    const g: GarmentDef = {
      id: "tee",
      panels: [front, back],
      seams: [
        seam(edgeRef("front", "side_r"), edgeRef("back", "side_l")),
        seam(edgeRef("front", "side_l"), edgeRef("back", "side_r")),
      ],
    };
    expect(validateSeams(g)).toEqual([]);
    expect(seamsAreValid(g)).toBe(true);
  });

  it("reports missing panel/edge as error", () => {
    const g: GarmentDef = {
      id: "bad",
      panels: [front],
      seams: [seam(edgeRef("front", "ghost"), edgeRef("missing", "x"))],
    };
    const diags = validateSeams(g);
    expect(diags.some((d) => d.severity === "error")).toBe(true);
    expect(seamsAreValid(g)).toBe(false);
  });

  it("warns on length mismatch beyond tolerance", () => {
    const longPanel: PanelDef = {
      id: "long",
      edges: [
        edge("hem", vec2(0, 0), vec2(1, 0)),
        edge("tall", vec2(1, 0), vec2(1, 5)),
        edge("top", vec2(1, 5), vec2(0, 5)),
        edge("left", vec2(0, 5), vec2(0, 0)),
      ],
    };
    const g: GarmentDef = {
      id: "mismatch",
      panels: [front, longPanel],
      seams: [seam(edgeRef("front", "side_r"), edgeRef("long", "tall"))],
    };
    const diags = validateSeams(g);
    expect(diags.some((d) => d.severity === "warn")).toBe(true);
  });
});

describe("drape (M4 shells)", () => {
  it("torsoShell builds a watertight-ish closed band", () => {
    const a = buildAvatar();
    const m = torsoShell(a, { yBottom: a.landmarks.waistLine, yTop: a.landmarks.chestLine, rings: 8, segments: 16 });
    expect(vertexCount(m)).toBeGreaterThan(0);
    expect(triangleCount(m)).toBeGreaterThan(0);
    for (const n of m.normals) {
      expect(Number.isFinite(n.x + n.y + n.z)).toBe(true);
    }
  });

  it("limbSleeve follows a tapered limb", () => {
    const a = buildAvatar();
    const arm = limbById(a, "arm_l")!;
    const m = limbSleeve(arm, { rings: 6, segments: 12 });
    expect(triangleCount(m)).toBeGreaterThan(0);
  });

  it("torsoShell wrinkles are deterministic", () => {
    const a = buildAvatar();
    const opts = { yBottom: 1, yTop: 1.3, rings: 6, segments: 12, wrinkle: { seed: 9, amount: 0.05 } };
    const m1 = torsoShell(a, opts);
    const m2 = torsoShell(a, opts);
    expect(m1.positions).toEqual(m2.positions);
  });
});

describe("templates", () => {
  it("buildTShirt yields body + 2 sleeves by default", () => {
    const parts = buildTShirt();
    const names = parts.map((p) => p.name);
    expect(names).toContain("tshirt_body");
    expect(names).toContain("tshirt_sleeve_l");
    expect(names).toContain("tshirt_sleeve_r");
    for (const part of parts) expect(part.surface).toBeDefined();
  });

  it("sleeveless T-shirt drops the sleeves", () => {
    const parts = buildTShirt({ sleeveLength: 0 });
    expect(parts.some((p) => p.name.includes("sleeve"))).toBe(false);
  });

  it("buildSkirt flare widens the hem", () => {
    const straight = buildSkirt({ flare: 0 })[0]!;
    const aLine = buildSkirt({ flare: 0.3 })[0]!;
    const hemWidth = (part: typeof straight): number => {
      const mesh = part.mesh;
      let maxX = -Infinity, minX = Infinity, minY = Infinity;
      for (const p of mesh.positions) minY = Math.min(minY, p.y);
      for (const p of mesh.positions) {
        if (Math.abs(p.y - minY) < 0.02) {
          maxX = Math.max(maxX, p.x);
          minX = Math.min(minX, p.x);
        }
      }
      return maxX - minX;
    };
    expect(hemWidth(aLine)).toBeGreaterThan(hemWidth(straight));
  });

  it("buildPants yields seat + 2 legs", () => {
    const parts = buildPants();
    const names = parts.map((p) => p.name);
    expect(names).toContain("pants_seat");
    expect(names).toContain("pants_leg_l");
    expect(names).toContain("pants_leg_r");
  });

  it("buildGarment dispatches by id and is deterministic", () => {
    const a = buildGarment("tshirt", { seed: 3 });
    const b = buildGarment("tshirt", { seed: 3 });
    expect(a.length).toBe(b.length);
    expect(a[0]!.mesh.positions).toEqual(b[0]!.mesh.positions);
  });

  it("measures flow through to garment size", () => {
    const small = buildTShirt({ measures: { chest: 0.8 } })[0]!;
    const big = buildTShirt({ measures: { chest: 1.4 } })[0]!;
    const maxX = (part: typeof small): number => Math.max(...part.mesh.positions.map((p) => p.x));
    expect(maxX(big)).toBeGreaterThan(maxX(small));
  });
});

describe("Tier2 templates", () => {
  const minY = (parts: ReturnType<typeof buildDress>): number =>
    Math.min(...parts.flatMap((p) => p.mesh.positions.map((v) => v.y)));

  it("buildDress yields bodice + skirt (+ optional sleeves)", () => {
    const parts = buildDress();
    const names = parts.map((p) => p.name);
    expect(names).toContain("dress_bodice");
    expect(names).toContain("dress_skirt");
    for (const p of parts) expect(p.surface).toBeDefined();
  });

  it("dress with sleeves adds two sleeve parts", () => {
    const sleeveless = buildDress({ sleeveLength: 0 });
    const sleeved = buildDress({ sleeveLength: 0.9 });
    expect(sleeveless.some((p) => p.name.includes("sleeve"))).toBe(false);
    expect(sleeved.filter((p) => p.name.includes("sleeve")).length).toBe(2);
  });

  it("longer dress reaches lower", () => {
    const short = buildDress({ skirtLength: 0.3 });
    const long = buildDress({ skirtLength: 0.9 });
    expect(minY(long)).toBeLessThan(minY(short));
  });

  it("buildHoodie yields body + sleeves + hood + pocket", () => {
    const parts = buildHoodie();
    const names = parts.map((p) => p.name);
    expect(names).toContain("hoodie_body");
    expect(names).toContain("hoodie_sleeve_l");
    expect(names).toContain("hoodie_sleeve_r");
    expect(names).toContain("hoodie_hood");
    expect(names).toContain("hoodie_pocket");
  });

  it("hoodie pocket toggles off", () => {
    expect(buildHoodie({ pocket: false }).some((p) => p.name === "hoodie_pocket")).toBe(false);
  });

  it("explicit solidify closes an open garment shell (inner surface + rim walls)", () => {
    // Garments are single-sided shells by default (see winding regression).
    // Solidify is opt-in: applying it to the open t-shirt body shell must
    // produce a closed shell with no open boundary edges. Weld by position
    // first since the mesh stores per-face (unwelded) indices.
    const open = buildTShirt().find((p) => p.name === "tshirt_body")!.mesh;
    const shirt = solidify(open, { thickness: 0.01, offset: 0.5 });
    const key = (p: { x: number; y: number; z: number }) =>
      `${p.x.toFixed(4)}_${p.y.toFixed(4)}_${p.z.toFixed(4)}`;
    const ids = shirt.positions.map(key);
    const ec = new Map<string, number>();
    const idx = shirt.indices;
    for (let t = 0; t < idx.length; t += 3) {
      const tri = [ids[idx[t]!]!, ids[idx[t + 1]!]!, ids[idx[t + 2]!]!];
      for (let e = 0; e < 3; e++) {
        const a = tri[e]!, b = tri[(e + 1) % 3]!;
        const k = a < b ? `${a}|${b}` : `${b}|${a}`;
        ec.set(k, (ec.get(k) ?? 0) + 1);
      }
    }
    expect([...ec.values()].filter((c) => c === 1).length).toBe(0);
  });

  it("hood is a sewn double layer (closed shell, no boundary edges)", () => {
    const hood = buildHoodie().find((p) => p.name === "hoodie_hood")!.mesh;
    // Count edges; a watertight shell has every edge shared by exactly 2 faces.
    const edgeCount = new Map<string, number>();
    const idx = hood.indices;
    for (let t = 0; t < idx.length; t += 3) {
      const tri = [idx[t]!, idx[t + 1]!, idx[t + 2]!];
      for (let e = 0; e < 3; e++) {
        const a = tri[e]!, b = tri[(e + 1) % 3]!;
        const key = a < b ? `${a}_${b}` : `${b}_${a}`;
        edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
      }
    }
    const boundary = [...edgeCount.values()].filter((c) => c === 1).length;
    expect(boundary).toBe(0); // sewn on all four borders -> closed
  });

  it("bigger hoodScale enlarges the hood", () => {
    const hoodOf = (s: number) => buildHoodie({ hoodScale: s }).find((p) => p.name === "hoodie_hood")!;
    const span = (part: ReturnType<typeof hoodOf>) => {
      const xs = part.mesh.positions.map((p) => p.x);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(span(hoodOf(1.3))).toBeGreaterThan(span(hoodOf(0.8)));
  });

  it("buildGarment dispatches dress + hoodie deterministically", () => {
    for (const id of ["dress", "hoodie"] as const) {
      const a = buildGarment(id, { seed: 7 });
      const b = buildGarment(id, { seed: 7 });
      expect(a.length).toBe(b.length);
      expect(a[0]!.mesh.positions).toEqual(b[0]!.mesh.positions);
    }
  });
});

