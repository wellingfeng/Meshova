import { describe, it, expect } from "vitest";
import {
  scatterAlongCurve,
  scatterGrid,
  applyRules,
  ruleCadence,
  ruleWeightedFill,
  ruleScaleJitter,
  ruleJitterPosition,
  ruleYawJitter,
  ruleMask,
  ruleThin,
  pruneMasked,
  ruleDensityNoise,
  ruleNormalToDensity,
  ruleDensityPrune,
  ruleSelfPruning,
  ruleDistanceToNeighbors,
  ruleLookAt,
  ruleClipToPolygon,
  ruleClipToCurveBand,
  copyAssembliesToPoints,
  realizeAssembly,
  makePointCloud,
  polyline,
  pointCount,
  copyToPoints,
  pointAttribute,
  box,
  cylinder,
  triangleCount,
} from "../src/geometry/index.js";
import { vec3 } from "../src/math/vec3.js";

const line = polyline([vec3(0, 0, -12), vec3(0, 0, 12)]);

describe("scatterAlongCurve", () => {
  it("lays a regular row of points with along/side/yaw attributes", () => {
    const pc = scatterAlongCurve(line, { spacing: 3, offset: 2, bothSides: false });
    expect(pointCount(pc)).toBeGreaterThan(0);
    expect(pc.attributes.along).toBeDefined();
    expect(pc.attributes.side).toBeDefined();
    expect(pc.attributes.yaw).toBeDefined();
    // single-side offset: all points at x=+2
    for (const p of pc.points) expect(p.x).toBeCloseTo(2, 5);
  });

  it("emits mirrored points on both sides", () => {
    const one = scatterAlongCurve(line, { spacing: 3, offset: 2, bothSides: false });
    const two = scatterAlongCurve(line, { spacing: 3, offset: 2, bothSides: true });
    expect(pointCount(two)).toBe(pointCount(one) * 2);
  });

  it("is deterministic", () => {
    const a = scatterAlongCurve(line, { spacing: 2.5, offset: 3, bothSides: true });
    const b = scatterAlongCurve(line, { spacing: 2.5, offset: 3, bothSides: true });
    expect(a.points).toEqual(b.points);
  });
});

describe("scatterGrid", () => {
  it("produces cols*rows points with gx/gz", () => {
    const g = scatterGrid({ cols: 4, rows: 3, cellX: 2, cellZ: 2 });
    expect(pointCount(g)).toBe(12);
    expect(g.attributes.gx?.length).toBe(12);
  });
});

describe("scatter rules", () => {
  it("ruleCadence lands the feature on every Nth slot", () => {
    const pc = scatterAlongCurve(line, { spacing: 2, offset: 1 });
    const out = applyRules(pc, [ruleCadence(3, 0, -1)]);
    const v = out.attributes.variant!;
    for (let i = 0; i < v.length; i++) {
      if (i % 3 === 0) expect(v[i]).toBe(0);
      else expect(v[i]).toBe(-1);
    }
  });

  it("ruleWeightedFill only fills unassigned points and is deterministic", () => {
    const pc = scatterAlongCurve(line, { spacing: 2, offset: 1 });
    const rules = [ruleCadence(3, 0, -1), ruleWeightedFill([1, 2, 3], { seed: 7 })];
    const a = applyRules(pc, rules).attributes.variant!;
    const b = applyRules(pc, rules).attributes.variant!;
    expect(a).toEqual(b);
    for (let i = 0; i < a.length; i++) {
      if (i % 3 === 0) expect(a[i]).toBe(0);
      else expect([1, 2, 3]).toContain(a[i]);
    }
  });

  it("pruneMasked drops masked points and compacts attributes", () => {
    const pc = scatterAlongCurve(line, { spacing: 2, offset: 1 });
    const out = applyRules(pc, [
      ruleMask((ctx) => ctx.point.z >= 0),
      pruneMasked(),
    ]);
    expect(pointCount(out)).toBeLessThan(pointCount(pc));
    for (const p of out.points) expect(p.z).toBeGreaterThanOrEqual(0);
  });

  it("pruneMasked dropUnassigned removes variant<0", () => {
    const pc = scatterAlongCurve(line, { spacing: 2, offset: 1 });
    const out = applyRules(pc, [ruleCadence(3, 0, -1), pruneMasked({ dropUnassigned: true })]);
    for (const v of out.attributes.variant!) expect(v).toBe(0);
  });

  it("jitter rules stay deterministic per seed", () => {
    const pc = scatterAlongCurve(line, { spacing: 2, offset: 1 });
    const chain = [ruleScaleJitter(0.2, 5), ruleJitterPosition(0.3, 5), ruleYawJitter(0.4, 5)];
    const a = applyRules(pc, chain);
    const b = applyRules(pc, chain);
    expect(a.points).toEqual(b.points);
    expect(a.attributes.scale).toEqual(b.attributes.scale);
    expect(a.attributes.yaw).toEqual(b.attributes.yaw);
  });

  it("ruleThin reduces the count deterministically", () => {
    const pc = scatterGrid({ cols: 10, rows: 10 });
    const a = applyRules(pc, [ruleThin(0.4, 3), pruneMasked()]);
    const b = applyRules(pc, [ruleThin(0.4, 3), pruneMasked()]);
    expect(pointCount(a)).toBe(pointCount(b));
    expect(pointCount(a)).toBeLessThan(pointCount(pc));
  });
});

describe("scatter DSL -> copyToPoints", () => {
  it("realizes a mesh library by variant", () => {
    const pc = scatterAlongCurve(line, { spacing: 3, offset: 2, bothSides: true });
    const decorated = applyRules(pc, [
      ruleCadence(3, 0, -1),
      ruleWeightedFill([1], { seed: 1 }),
    ]);
    const lib = [cylinder(0.1, 2, 8), box(0.4, 0.4, 0.4)];
    const mesh = copyToPoints(decorated, lib, {
      variant: pointAttribute("variant"),
      yaw: pointAttribute("yaw"),
      alignToNormal: false,
    });
    expect(triangleCount(mesh)).toBeGreaterThan(0);
  });
});

describe("ruleDensityNoise", () => {
  it("writes density in [0,1] and is deterministic per seed", () => {
    const grid = scatterGrid({ cols: 10, rows: 10, cellX: 2, cellZ: 2 });
    const a = ruleDensityNoise({ frequency: 0.1, seed: 7 })(grid);
    const b = ruleDensityNoise({ frequency: 0.1, seed: 7 })(grid);
    expect(a.attributes.density).toEqual(b.attributes.density);
    for (const d of a.attributes.density!) {
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1);
    }
  });

  it("floor clears low-density patches to zero", () => {
    const grid = scatterGrid({ cols: 12, rows: 12, cellX: 3, cellZ: 3 });
    const withFloor = ruleDensityNoise({ frequency: 0.15, floor: 0.6, seed: 3 })(grid);
    const zeros = withFloor.attributes.density!.filter((d) => d === 0).length;
    expect(zeros).toBeGreaterThan(0);
  });
});

describe("ruleNormalToDensity", () => {
  it("keeps flat ground and rejects steep faces", () => {
    const pc = makePointCloud({
      points: [vec3(0, 0, 0), vec3(1, 0, 0), vec3(2, 0, 0)],
      normals: [
        vec3(0, 1, 0), // flat -> 1
        vec3(1, 0, 0), // vertical -> 0
        vec3(Math.sin(Math.PI / 6), Math.cos(Math.PI / 6), 0), // 30deg slope
      ],
    });
    const out = ruleNormalToDensity({
      startAngle: (20 * Math.PI) / 180,
      endAngle: (45 * Math.PI) / 180,
    })(pc);
    const d = out.attributes.density!;
    expect(d[0]).toBeCloseTo(1);
    expect(d[1]).toBeCloseTo(0);
    expect(d[2]!).toBeGreaterThan(0);
    expect(d[2]!).toBeLessThan(1);
  });
});

describe("ruleDensityPrune", () => {
  it("thins points roughly in proportion to density", () => {
    const grid = scatterGrid({ cols: 30, rows: 30, cellX: 1, cellZ: 1 });
    const dense = applyRules(grid, [
      (pc) => makePointCloud({ points: pc.points, attributes: { density: pc.points.map(() => 0.3) } }),
      ruleDensityPrune(11),
    ]);
    const kept = dense.attributes.mask!.filter((m) => m === 1).length;
    // ~30% of 900 = ~270; allow generous band
    expect(kept).toBeGreaterThan(150);
    expect(kept).toBeLessThan(400);
  });
});

describe("ruleSelfPruning", () => {
  it("enforces minimum spacing between kept points", () => {
    const grid = scatterGrid({ cols: 20, rows: 20, cellX: 1, cellZ: 1 });
    const pruned = pruneMasked()(ruleSelfPruning({ radius: 2.5 })(grid));
    // every kept pair must be >= radius apart
    const pts = pruned.points;
    let minPair = Infinity;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i]!.x - pts[j]!.x;
        const dz = pts[i]!.z - pts[j]!.z;
        minPair = Math.min(minPair, Math.hypot(dx, dz));
      }
    }
    expect(pts.length).toBeGreaterThan(0);
    expect(minPair).toBeGreaterThanOrEqual(2.5 - 1e-6);
  });
});

describe("ruleDistanceToNeighbors", () => {
  it("computes nearest-neighbor distance matching a unit grid", () => {
    const grid = scatterGrid({ cols: 6, rows: 6, cellX: 2, cellZ: 2 });
    const out = ruleDistanceToNeighbors({ maxDistance: 10 })(grid);
    const d = out.attributes.neighborDist!;
    // on a 2-unit grid, nearest neighbor is exactly 2 for interior points
    expect(Math.min(...d)).toBeCloseTo(2);
  });
});

describe("ruleLookAt", () => {
  it("yaws points toward a world target", () => {
    const pc = makePointCloud({ points: [vec3(0, 0, 0)] });
    const out = ruleLookAt({ target: vec3(0, 0, 5) })(pc);
    expect(out.attributes.yaw![0]).toBeCloseTo(0); // +Z target -> yaw 0
    const out2 = ruleLookAt({ target: vec3(5, 0, 0) })(pc);
    expect(out2.attributes.yaw![0]).toBeCloseTo(Math.PI / 2); // +X target
  });
});

describe("ruleClipToPolygon", () => {
  const square = polyline(
    [vec3(-5, 0, -5), vec3(5, 0, -5), vec3(5, 0, 5), vec3(-5, 0, 5)],
    true,
  );

  it("keep mode retains only points inside the boundary", () => {
    const grid = scatterGrid({ cols: 21, rows: 21, cellX: 1, cellZ: 1 }); // -10..10
    const kept = pruneMasked()(ruleClipToPolygon(square, { mode: "keep" })(grid));
    expect(pointCount(kept)).toBeGreaterThan(0);
    for (const p of kept.points) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(5);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(5);
    }
  });

  it("remove mode punches a hole (Difference)", () => {
    const grid = scatterGrid({ cols: 21, rows: 21, cellX: 1, cellZ: 1 });
    const removed = pruneMasked()(ruleClipToPolygon(square, { mode: "remove" })(grid));
    for (const p of removed.points) {
      const inside = Math.abs(p.x) < 5 && Math.abs(p.z) < 5;
      expect(inside).toBe(false);
    }
  });
});

describe("ruleClipToCurveBand", () => {
  it("remove mode clears a strip around the curve (road)", () => {
    const road = polyline([vec3(-10, 0, 0), vec3(10, 0, 0)]);
    const grid = scatterGrid({ cols: 21, rows: 21, cellX: 1, cellZ: 1 });
    const cleared = pruneMasked()(ruleClipToCurveBand(road, { width: 2, mode: "remove" })(grid));
    for (const p of cleared.points) {
      expect(Math.abs(p.z)).toBeGreaterThan(2 - 1e-6);
    }
  });

  it("keep mode plants only along the band (embankment)", () => {
    const road = polyline([vec3(-10, 0, 0), vec3(10, 0, 0)]);
    const grid = scatterGrid({ cols: 21, rows: 21, cellX: 1, cellZ: 1 });
    const band = pruneMasked()(ruleClipToCurveBand(road, { width: 2, mode: "keep" })(grid));
    expect(pointCount(band)).toBeGreaterThan(0);
    for (const p of band.points) {
      expect(Math.abs(p.z)).toBeLessThanOrEqual(2 + 1e-6);
    }
  });
});

describe("copyAssembliesToPoints (hierarchy)", () => {
  it("stamps a multi-part assembly at each point as one cluster", () => {
    const pile = {
      parts: [
        { mesh: box(1, 1, 1) },
        { mesh: box(0.6, 0.6, 0.6), offset: vec3(0.8, 0, 0.2) },
        { mesh: box(0.4, 0.4, 0.4), offset: vec3(-0.5, 0.5, 0), scale: 1.2 },
      ],
    };
    const single = realizeAssembly(pile);
    const grid = scatterGrid({ cols: 3, rows: 3, cellX: 4, cellZ: 4 });
    const mesh = copyAssembliesToPoints(grid, pile, { alignToNormal: false });
    // 9 points x 3 boxes => triangle count is 9x the single-assembly bake
    expect(triangleCount(mesh)).toBe(triangleCount(single) * 9);
  });

  it("is deterministic (same inputs, identical mesh)", () => {
    const clump = { parts: [{ mesh: cylinder(0.2, 1, 6) }, { mesh: box(0.3, 0.3, 0.3), offset: vec3(0.3, 0, 0) }] };
    const grid = scatterGrid({ cols: 2, rows: 2, cellX: 2, cellZ: 2 });
    const a = copyAssembliesToPoints(grid, clump, { alignToNormal: false });
    const b = copyAssembliesToPoints(grid, clump, { alignToNormal: false });
    expect(a.positions).toEqual(b.positions);
    expect(a.indices).toEqual(b.indices);
  });
});

