import { describe, it, expect } from "vitest";
import {
  prism,
  regularPolygon,
  hexNut,
  hexPrism,
  boredPrism,
  gear,
  gearOutline,
  threadedRod,
  bolt,
  flange,
  boltHoleCircle,
  punchHoles,
  box,
  cylinder,
  bounds,
  triangleCount,
  toTopo,
  diagnose,
  subtractAll,
  unionAll,
  translateMesh,
  vec3,
  cleanMesh,
  length,
  type Mesh,
} from "../src/index.js";

function assertValid(m: Mesh) {
  expect(m.normals.length).toBe(m.positions.length);
  expect(m.uvs.length).toBe(m.positions.length);
  expect(m.indices.length % 3).toBe(0);
  expect(m.positions.length).toBeGreaterThan(0);
  for (const idx of m.indices) {
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(m.positions.length);
  }
  for (const n of m.normals) expect(length(n)).toBeCloseTo(1, 3);
}

describe("mech: prism + regular polygon", () => {
  it("regularPolygon by across-flats sizes hex correctly", () => {
    const hex = regularPolygon(6, 2, true);
    expect(hex.length).toBe(6);
    // across-flats = 2 -> the two flat-facing vertices span 2 in width
    const xs = hex.map((p) => p.x);
    const span = Math.max(...xs) - Math.min(...xs);
    // circumradius r = 1/cos(30deg); flat-to-flat across X = 2 (the spec)
    expect(span).toBeGreaterThan(1.9);
  });

  it("prism extrudes an outline into a solid along Y", () => {
    const m = prism(regularPolygon(6, 1, false), 2);
    assertValid(m);
    const b = bounds(m);
    expect(b.max.y - b.min.y).toBeCloseTo(2, 5);
  });
});

describe("mech: hex nut", () => {
  it("solid hex head has no bore", () => {
    const m = hexPrism(1, 0.8);
    assertValid(m);
    const topo = toTopo(m);
    // hex prism = 6 side quads + 2 hex caps -> closed manifold
    expect(diagnose(topo).isClosed).toBe(true);
  });

  it("nut with bore is watertight (outer + inner walls + annular caps)", () => {
    const m = hexNut({ acrossFlats: 1, height: 0.5, boreRadius: 0.3 });
    assertValid(m);
    const d = diagnose(toTopo(m));
    expect(d.nonManifoldEdges).toBe(0);
    expect(d.isClosed).toBe(true);
    // the bore actually removes the center: no vertices inside the hole radius on a cap
    const b = bounds(m);
    expect(b.max.y - b.min.y).toBeCloseTo(0.5, 5);
  });
});

describe("mech: gear", () => {
  it("gear outline has 4 points per tooth", () => {
    const out = gearOutline({ teeth: 12 });
    expect(out.length).toBe(12 * 4);
  });

  it("tip radius exceeds root radius (teeth stick out)", () => {
    const out = gearOutline({ teeth: 16, module: 0.1 });
    const radii = out.map((p) => Math.hypot(p.x, p.y));
    const rmax = Math.max(...radii);
    const rmin = Math.min(...radii);
    expect(rmax).toBeGreaterThan(rmin * 1.05);
  });

  it("solid gear is a valid mesh", () => {
    const m = gear({ teeth: 20, module: 0.1, thickness: 0.3 });
    assertValid(m);
    expect(triangleCount(m)).toBeGreaterThan(20);
  });

  it("bored gear is watertight", () => {
    const m = gear({ teeth: 18, module: 0.1, thickness: 0.3, boreRadius: 0.2 });
    assertValid(m);
    expect(diagnose(toTopo(m)).nonManifoldEdges).toBe(0);
  });
});

describe("mech: threaded rod + bolt", () => {
  it("threaded rod spans the requested length", () => {
    const m = threadedRod({ radius: 0.2, length: 1.5, pitch: 0.15 });
    assertValid(m);
    const b = bounds(m);
    const span = b.max.y - b.min.y;
    // core is exactly `length`; the helical ridge overshoots each end slightly
    expect(span).toBeGreaterThanOrEqual(1.5);
    expect(span).toBeLessThan(1.5 + 0.2);
    // thread ridge reaches out to the major radius
    const maxR = Math.max(...m.positions.map((p) => Math.hypot(p.x, p.z)));
    expect(maxR).toBeGreaterThan(0.19);
  });

  it("bolt = shaft + hex head, head sits above the shaft", () => {
    const m = bolt({ radius: 0.2, length: 1, headHeight: 0.3 });
    assertValid(m);
    const b = bounds(m);
    // total height ~ shaft length + head height
    expect(b.max.y - b.min.y).toBeGreaterThan(1.2);
  });
});

describe("mech: flange + bolt holes", () => {
  it("boltHoleCircle spaces holes evenly", () => {
    const pts = boltHoleCircle(4, 1, 0);
    expect(pts.length).toBe(4);
    for (const p of pts) expect(Math.hypot(p.x, p.z)).toBeCloseTo(1, 5);
  });

  it("plain flange (no holes) is watertight annulus", () => {
    const m = flange({ radius: 0.5, thickness: 0.1, boreRadius: 0.25, boltHoles: 0 });
    assertValid(m);
    expect(diagnose(toTopo(m)).nonManifoldEdges).toBe(0);
  });

  it("flange with bolt holes stays a valid mesh", () => {
    const m = flange({ radius: 0.6, thickness: 0.12, boreRadius: 0.25, boltHoles: 6, boltHoleRadius: 0.05 });
    assertValid(m);
    expect(triangleCount(m)).toBeGreaterThan(0);
  });

  it("punchHoles removes material via CSG subtract", () => {
    const solid = box(1, 0.2, 1);
    const punched = punchHoles(solid, [{ x: 0, y: 0, z: 0 }], 0.2, 0.2, 24);
    assertValid(punched);
    // a hole through the center means some cap vertices near origin are gone
    expect(triangleCount(punched)).toBeGreaterThan(triangleCount(solid));
  });
});

describe("mech: ring gear (internal / planetary housing)", () => {
  it("is a valid mesh with teeth cut into the bore", async () => {
    const { ringGear, bounds: b2 } = await import("../src/index.js");
    const m = ringGear({ teeth: 36, module: 0.05, thickness: 0.2 });
    assertValid(m);
    expect(triangleCount(m)).toBeGreaterThan(36);
    // Outer rim exceeds the pitch radius; the center is hollow (a bore exists).
    const bb = b2(m);
    expect(bb.max.y - bb.min.y).toBeCloseTo(0.2, 4);
    const radii = m.positions.map((p) => Math.hypot(p.x, p.z));
    const rmin = Math.min(...radii);
    const rmax = Math.max(...radii);
    const pitchR = (0.05 * 36) / 2; // 0.9
    // inner teeth sit near/under the pitch radius, rim reaches well beyond it
    expect(rmin).toBeLessThan(pitchR);
    expect(rmax).toBeGreaterThan(pitchR);
  });
});

describe("boolean robustness: subtractAll / unionAll", () => {
  it("subtractAll drills 4 holes where a chained subtract loop would crack", () => {
    const slab = box(2, 0.3, 2);
    const cutters = [
      translateMesh(cylinder(0.15, 1, 20), vec3(0.6, 0, 0.6)),
      translateMesh(cylinder(0.15, 1, 20), vec3(-0.6, 0, 0.6)),
      translateMesh(cylinder(0.15, 1, 20), vec3(0.6, 0, -0.6)),
      translateMesh(cylinder(0.15, 1, 20), vec3(-0.6, 0, -0.6)),
    ];
    const result = cleanMesh(subtractAll(slab, cutters));
    assertValid(result);
    expect(triangleCount(result)).toBeGreaterThan(triangleCount(slab));
  });

  it("subtractAll with no cutters returns the base unchanged", () => {
    const slab = box(1, 1, 1);
    expect(triangleCount(subtractAll(slab, []))).toBe(triangleCount(slab));
  });

  it("unionAll folds several solids into one valid mesh", () => {
    const parts = [
      box(1, 1, 1),
      translateMesh(box(1, 1, 1), vec3(0.8, 0, 0)),
      translateMesh(box(1, 1, 1), vec3(1.6, 0, 0)),
    ];
    const combined = unionAll(parts, (m) => cleanMesh(m));
    assertValid(combined);
    const b = bounds(combined);
    // three overlapping unit boxes marching in +x span > 2 in x
    expect(b.max.x - b.min.x).toBeGreaterThan(2);
  });

  it("unionAll of empty list is the empty mesh", () => {
    expect(triangleCount(unionAll([]))).toBe(0);
  });
});

