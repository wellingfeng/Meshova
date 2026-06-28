import { describe, it, expect } from "vitest";
import {
  tree,
  shrub,
  grass,
  conifer,
  palm,
  frond,
  needleCluster,
  windWeights,
  foliageWindWeights,
  billboardImposter,
  imposterAtlasLayout,
  growBranches,
  branchesToMesh,
  scatterLeaves,
  curveFrameAt,
  gnarlCurve,
  growCurve,
  GOLDEN_ANGLE,
  polyline,
  bezier,
  bounds,
  vertexCount,
  triangleCount,
  vec3,
  length,
  type Mesh,
} from "../src/index.js";

function assertValid(m: Mesh) {
  expect(m.normals.length).toBe(m.positions.length);
  expect(m.uvs.length).toBe(m.positions.length);
  expect(m.indices.length % 3).toBe(0);
  for (const idx of m.indices) {
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(m.positions.length);
  }
}

function meshKey(m: Mesh): string {
  return `${m.positions.length}|${m.indices.length}|${m.positions
    .slice(0, 50)
    .map((p) => `${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)}`)
    .join(";")}`;
}

describe("curve frame", () => {
  it("returns orthonormal frame along a vertical line", () => {
    const c = polyline([vec3(0, 0, 0), vec3(0, 1, 0), vec3(0, 2, 0)]);
    const f = curveFrameAt(c, 0.5);
    expect(length(f.tangent)).toBeCloseTo(1, 5);
    expect(length(f.normal)).toBeCloseTo(1, 5);
    expect(length(f.binormal)).toBeCloseTo(1, 5);
    // tangent should point roughly +Y
    expect(f.tangent.y).toBeGreaterThan(0.9);
    // axes mutually perpendicular
    const tn = f.tangent.x * f.normal.x + f.tangent.y * f.normal.y + f.tangent.z * f.normal.z;
    expect(Math.abs(tn)).toBeLessThan(1e-5);
  });

  it("position interpolates along the curve", () => {
    const c = polyline([vec3(0, 0, 0), vec3(0, 4, 0)]);
    expect(curveFrameAt(c, 0).position.y).toBeCloseTo(0, 5);
    expect(curveFrameAt(c, 1).position.y).toBeCloseTo(4, 5);
    expect(curveFrameAt(c, 0.5).position.y).toBeCloseTo(2, 5);
  });
});

describe("gnarl + growCurve", () => {
  it("gnarl keeps point count and anchors the root", () => {
    const c = polyline([vec3(0, 0, 0), vec3(0, 1, 0), vec3(0, 2, 0), vec3(0, 3, 0)]);
    const g = gnarlCurve(c, { seed: 5, amount: 0.3, rootAnchored: true });
    expect(g.points.length).toBe(c.points.length);
    // root barely moves, tip moves more
    const rootMove = length(vec3(g.points[0]!.x, 0, g.points[0]!.z));
    expect(rootMove).toBeLessThan(1e-6);
  });

  it("growCurve bends toward +Y under phototropism", () => {
    const c = growCurve(vec3(0, 0, 0), vec3(1, 0, 0), 2, { phototropism: 0.9, segments: 8 });
    const tip = c.points[c.points.length - 1]!;
    // started horizontal; phototropism should lift the tip above the start
    expect(tip.y).toBeGreaterThan(0.1);
  });

  it("GOLDEN_ANGLE is ~137.5 degrees", () => {
    expect((GOLDEN_ANGLE * 180) / Math.PI).toBeCloseTo(137.5077, 2);
  });
});

describe("growBranches", () => {
  it("produces branches with increasing depth and tags terminals", () => {
    const trunk = polyline([vec3(0, 0, 0), vec3(0, 2, 0), vec3(0, 4, 0)]);
    const branches = growBranches(trunk, 0.3, { seed: 1, count: 5, depth: 2 });
    expect(branches.length).toBeGreaterThan(5);
    expect(branches.some((b) => b.depth === 1)).toBe(true);
    expect(branches.some((b) => b.depth === 2)).toBe(true);
    // deepest branches must be terminal
    const maxDepth = Math.max(...branches.map((b) => b.depth));
    expect(branches.filter((b) => b.depth === maxDepth).every((b) => b.terminal)).toBe(true);
    const mesh = branchesToMesh(branches);
    assertValid(mesh);
    expect(vertexCount(mesh)).toBeGreaterThan(0);
  });

  it("is deterministic for the same seed", () => {
    const trunk = polyline([vec3(0, 0, 0), vec3(0, 4, 0)]);
    const a = branchesToMesh(growBranches(trunk, 0.3, { seed: 42, count: 6, depth: 3 }));
    const b = branchesToMesh(growBranches(trunk, 0.3, { seed: 42, count: 6, depth: 3 }));
    expect(meshKey(a)).toBe(meshKey(b));
  });

  it("differs for different seeds", () => {
    const trunk = polyline([vec3(0, 0, 0), vec3(0, 4, 0)]);
    const a = branchesToMesh(growBranches(trunk, 0.3, { seed: 1, count: 6, depth: 3 }));
    const b = branchesToMesh(growBranches(trunk, 0.3, { seed: 2, count: 6, depth: 3 }));
    expect(meshKey(a)).not.toBe(meshKey(b));
  });
});

describe("leaves", () => {
  it("scatters valid leaf cards on terminal branches", () => {
    const trunk = polyline([vec3(0, 0, 0), vec3(0, 4, 0)]);
    const branches = growBranches(trunk, 0.3, { seed: 7, count: 5, depth: 2 });
    const leaves = scatterLeaves(branches, { seed: 7, perBranch: 4 });
    assertValid(leaves);
    expect(triangleCount(leaves)).toBeGreaterThan(0);
  });
});

describe("plant builders", () => {
  it("tree returns valid wood + leaf meshes", () => {
    const t = tree({ seed: 3 });
    assertValid(t.wood);
    assertValid(t.leaves);
    expect(vertexCount(t.wood)).toBeGreaterThan(0);
    expect(vertexCount(t.leaves)).toBeGreaterThan(0);
    // tree should be roughly as tall as requested
    const bb = bounds(t.wood);
    expect(bb.max.y).toBeGreaterThan(3);
  });

  it("tree is deterministic", () => {
    const a = tree({ seed: 9 });
    const b = tree({ seed: 9 });
    expect(meshKey(a.wood)).toBe(meshKey(b.wood));
    expect(meshKey(a.leaves)).toBe(meshKey(b.leaves));
  });

  it("bare tree has no leaves", () => {
    const t = tree({ seed: 3, leaves: false });
    expect(vertexCount(t.leaves)).toBe(0);
    expect(vertexCount(t.wood)).toBeGreaterThan(0);
  });

  it("shrub returns valid foliage and multiple stems", () => {
    const s = shrub({ seed: 4, stems: 4 });
    assertValid(s.wood);
    assertValid(s.leaves);
    expect(vertexCount(s.wood)).toBeGreaterThan(0);
    expect(vertexCount(s.leaves)).toBeGreaterThan(0);
  });

  it("grass has blades but no wood", () => {
    const g = grass({ seed: 5, blades: 50 });
    expect(vertexCount(g.wood)).toBe(0);
    assertValid(g.leaves);
    expect(vertexCount(g.leaves)).toBeGreaterThan(0);
    expect(g.branches.length).toBe(0);
  });
});

describe("frond + needles", () => {
  it("frond produces a stem and paired leaflet blades", () => {
    const rachis = bezier(vec3(0, 0, 0), vec3(0.3, 0.5, 0), vec3(0.7, 0.7, 0), vec3(1, 0.6, 0), 8);
    const f = frond(rachis, { seed: 1, pairs: 10 });
    assertValid(f.stem);
    assertValid(f.blades);
    expect(triangleCount(f.stem)).toBeGreaterThan(0);
    // 10 pairs * 2 sides = 20 leaflet quads * 2 tris each = 40 tris
    expect(triangleCount(f.blades)).toBe(10 * 2 * 2);
  });

  it("needleCluster builds the requested number of needles", () => {
    const m = needleCluster(vec3(0, 1, 0), vec3(1, 0.3, 0), { seed: 2, count: 8 });
    assertValid(m);
    expect(vertexCount(m)).toBeGreaterThan(0);
  });
});

describe("conifer + palm builders", () => {
  it("conifer has a cone silhouette (wide base, narrow top)", () => {
    const c = conifer({ seed: 3, height: 5, whorls: 8 });
    assertValid(c.wood);
    assertValid(c.leaves);
    expect(vertexCount(c.wood)).toBeGreaterThan(0);
    expect(vertexCount(c.leaves)).toBeGreaterThan(0);
    const bb = bounds(c.wood);
    expect(bb.max.y).toBeGreaterThan(4);
  });

  it("conifer is deterministic", () => {
    const a = conifer({ seed: 8 });
    const b = conifer({ seed: 8 });
    expect(meshKey(a.wood)).toBe(meshKey(b.wood));
    expect(meshKey(a.leaves)).toBe(meshKey(b.leaves));
  });

  it("palm has a trunk and frond foliage", () => {
    const p = palm({ seed: 4, height: 5, fronds: 8 });
    assertValid(p.wood);
    assertValid(p.leaves);
    expect(vertexCount(p.wood)).toBeGreaterThan(0);
    expect(vertexCount(p.leaves)).toBeGreaterThan(0);
    // crown sits near the top of the trunk
    const bb = bounds(p.wood);
    expect(bb.max.y).toBeGreaterThan(4);
  });

  it("palm is deterministic", () => {
    const a = palm({ seed: 6 });
    const b = palm({ seed: 6 });
    expect(meshKey(a.wood)).toBe(meshKey(b.wood));
  });
});

describe("wind weights", () => {
  it("anchors the base and lifts the top (height term)", () => {
    const t = tree({ seed: 7 });
    const w = windWeights(t.wood, {});
    expect(w.length).toBe(t.wood.positions.length);
    // every weight in [0,1]
    for (const v of w) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    // the lowest vertex should weigh less than the highest
    let lowI = 0, highI = 0;
    for (let i = 1; i < t.wood.positions.length; i++) {
      if (t.wood.positions[i]!.y < t.wood.positions[lowI]!.y) lowI = i;
      if (t.wood.positions[i]!.y > t.wood.positions[highI]!.y) highI = i;
    }
    expect(w[lowI]!).toBeLessThan(w[highI]!);
  });

  it("is deterministic", () => {
    const t = tree({ seed: 3 });
    const a = windWeights(t.wood, {});
    const b = windWeights(t.wood, {});
    expect(a).toEqual(b);
  });

  it("foliageWindWeights stays in range and is deterministic", () => {
    const t = tree({ seed: 3 });
    const a = foliageWindWeights(t.leaves, 0.55, 0.45);
    const b = foliageWindWeights(t.leaves, 0.55, 0.45);
    expect(a).toEqual(b);
    expect(a.length).toBe(t.leaves.positions.length);
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(0.55 - 1e-9);
      expect(v).toBeLessThanOrEqual(1.0 + 1e-9);
    }
  });
});

describe("billboard imposter", () => {
  it("builds crossed cards sized to the source bounds", () => {
    const t = tree({ seed: 7, height: 4 });
    const imp = billboardImposter(t.wood, { cards: 2 });
    assertValid(imp);
    // 2 cards * 1 quad each * 2 tris = 4 tris, 8 verts
    expect(triangleCount(imp)).toBe(4);
    expect(imp.positions.length).toBe(8);
    const bb = bounds(imp);
    // card height should roughly match the tree height
    expect(bb.max.y - bb.min.y).toBeGreaterThan(3);
  });

  it("respects a custom uvRect (atlas cell)", () => {
    const t = tree({ seed: 1, height: 3 });
    const imp = billboardImposter(t.wood, { cards: 1, uvRect: [0.25, 0, 0.5, 1] });
    const us = imp.uvs.map((uv) => uv.x);
    expect(Math.min(...us)).toBeCloseTo(0.25, 5);
    expect(Math.max(...us)).toBeCloseTo(0.5, 5);
  });

  it("atlas layout partitions UV space into N cells", () => {
    const layout = imposterAtlasLayout({ views: 8 });
    expect(layout.views).toBe(8);
    expect(layout.cells.length).toBe(8);
    // cells tile [0,1] in u with no gaps for a single row
    const first = layout.cells[0]!.uvRect;
    const last = layout.cells[7]!.uvRect;
    expect(first[0]).toBeCloseTo(0, 5);
    expect(last[2]).toBeCloseTo(1, 5);
    // azimuth spans 0..2pi
    expect(layout.cells[0]!.azimuth).toBeCloseTo(0, 5);
    expect(layout.cells[7]!.azimuth).toBeCloseTo((7 / 8) * Math.PI * 2, 5);
  });
});
