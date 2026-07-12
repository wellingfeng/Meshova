import { describe, it, expect } from "vitest";
import {
  subdivideParcel,
  subdivideCity,
  cityBlocks,
  insetConvexRingXZ,
  insetRingXZ,
  ringToPlate,
  slicePolygonByLine,
  polygonAreaXZ,
  polygonPerimeterXZ,
  polygonCentroidXZ,
  polygonSignedAreaXZ,
  merge,
  triangleCount,
  vertexCount,
} from "../src/geometry/index.js";
import { vec3 } from "../src/math/vec3.js";
import { zFightingReport } from "../src/critique/geometry-metrics.js";

const square = [
  vec3(-50, 0, -50),
  vec3(50, 0, -50),
  vec3(50, 0, 50),
  vec3(-50, 0, 50),
];

describe("polygon metrics (XZ)", () => {
  it("computes area, perimeter, centroid of a 100x100 square", () => {
    expect(polygonAreaXZ(square)).toBeCloseTo(10000, 3);
    expect(polygonPerimeterXZ(square)).toBeCloseTo(400, 3);
    const c = polygonCentroidXZ(square);
    expect(c.x).toBeCloseTo(0, 6);
    expect(c.z).toBeCloseTo(0, 6);
  });
});

describe("subdivideParcel", () => {
  it("is deterministic for a given seed", () => {
    const a = subdivideParcel(square, { targetArea: 500, seed: 7 });
    const b = subdivideParcel(square, { targetArea: 500, seed: 7 });
    expect(a.length).toBe(b.length);
    expect(a[0]!.ring.length).toBe(b[0]!.ring.length);
    expect(a[0]!.area).toBeCloseTo(b[0]!.area, 9);
  });

  it("keeps total area conserved (cuts don't lose land)", () => {
    const parcels = subdivideParcel(square, { targetArea: 300, seed: 3, irregularity: 0 });
    const total = parcels.reduce((s, p) => s + p.area, 0);
    expect(total).toBeCloseTo(10000, 1);
  });

  it("every leaf is below the target area", () => {
    const parcels = subdivideParcel(square, { targetArea: 800, seed: 1, irregularity: 0 });
    for (const p of parcels) expect(p.area).toBeLessThanOrEqual(800 + 1e-6);
  });

  it("all parcels stay CCW and convex-ish (positive signed area)", () => {
    const parcels = subdivideParcel(square, { targetArea: 400, seed: 9 });
    for (const p of parcels) expect(polygonSignedAreaXZ(p.ring)).toBeGreaterThan(0);
  });

  it("minArea / minPerimeter drop slivers", () => {
    const all = subdivideParcel(square, { targetArea: 200, seed: 5 });
    const filtered = subdivideParcel(square, { targetArea: 200, seed: 5, minArea: 250 });
    expect(filtered.length).toBeLessThanOrEqual(all.length);
    for (const p of filtered) expect(p.area).toBeGreaterThanOrEqual(250);
  });
});

describe("insetConvexRingXZ", () => {
  it("shrinks a square inward by the given distance", () => {
    const inset = insetConvexRingXZ(square, 10);
    expect(inset).not.toBeNull();
    expect(polygonAreaXZ(inset!)).toBeCloseTo(80 * 80, 2);
  });

  it("returns null when the inset collapses the ring", () => {
    const tiny = [vec3(0, 0, 0), vec3(2, 0, 0), vec3(2, 0, 2), vec3(0, 0, 2)];
    expect(insetConvexRingXZ(tiny, 5)).toBeNull();
  });
});

describe("cityBlocks", () => {
  it("produces a non-empty renderable mesh with ground slab", () => {
    const { blocks, insetRings, mesh } = cityBlocks(square, {
      targetArea: 400,
      streetWidth: 6,
      seed: 42,
    });
    expect(blocks.length).toBeGreaterThan(0);
    expect(insetRings.length).toBe(blocks.length);
    expect(triangleCount(mesh)).toBeGreaterThan(0);
    expect(vertexCount(mesh)).toBeGreaterThan(0);
  });

  it("inset blocks are strictly smaller than their parcels", () => {
    const { blocks, insetRings } = cityBlocks(square, { targetArea: 400, streetWidth: 8, seed: 11 });
    for (let i = 0; i < blocks.length; i++) {
      expect(polygonAreaXZ(insetRings[i]!)).toBeLessThan(blocks[i]!.area);
    }
  });
});

describe("slicePolygonByLine (concave-capable)", () => {
  it("splits a convex square into two loops + one cut segment", () => {
    const sq = [vec3(-10, 0, -10), vec3(10, 0, -10), vec3(10, 0, 10), vec3(-10, 0, 10)];
    const { pos, neg, cuts } = slicePolygonByLine(sq, vec3(0, 0, 0), 1, 0);
    expect(pos.length).toBe(1);
    expect(neg.length).toBe(1);
    expect(cuts.length).toBe(1);
    expect(polygonAreaXZ(pos[0]!)).toBeCloseTo(200, 2);
    expect(polygonAreaXZ(neg[0]!)).toBeCloseTo(200, 2);
  });

  it("a vertical cut through a U-shape yields two loops on one side", () => {
    // U opening upward (+Z): removing the middle-top notch.
    const u = [
      vec3(-10, 0, -10), vec3(10, 0, -10), vec3(10, 0, 10),
      vec3(4, 0, 10), vec3(4, 0, -2), vec3(-4, 0, -2),
      vec3(-4, 0, 10), vec3(-10, 0, 10),
    ];
    // Horizontal line at z=5 cuts through both prongs -> +Z side has 2 loops.
    const { pos } = slicePolygonByLine(u, vec3(0, 0, 5), 0, 1);
    expect(pos.length).toBe(2);
  });
});

describe("subdivideCity streets", () => {
  const square = [vec3(-50, 0, -50), vec3(50, 0, -50), vec3(50, 0, 50), vec3(-50, 0, 50)];

  it("records street segments for every internal cut", () => {
    const { parcels, streets } = subdivideCity(square, { targetArea: 600, seed: 4, irregularity: 0 });
    expect(parcels.length).toBeGreaterThan(1);
    // A binary subdivision producing N leaves needs N-1 internal cuts.
    expect(streets.length).toBe(parcels.length - 1);
    for (const s of streets) {
      const len = Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z);
      expect(len).toBeGreaterThan(0);
    }
  });
});

describe("ringToPlate ear clipping", () => {
  it("triangulates a concave L-shape without leaking area", () => {
    const L = [
      vec3(0, 0, 0), vec3(10, 0, 0), vec3(10, 0, 4),
      vec3(4, 0, 4), vec3(4, 0, 10), vec3(0, 0, 10),
    ];
    const m = ringToPlate(L);
    // 6-gon -> 4 triangles.
    expect(triangleCount(m)).toBe(4);
    expect(vertexCount(m)).toBe(6);
  });
});

describe("insetRingXZ (general)", () => {
  it("insets a concave L-shape inward (smaller area, same winding)", () => {
    const L = [
      vec3(0, 0, 0), vec3(20, 0, 0), vec3(20, 0, 8),
      vec3(8, 0, 8), vec3(8, 0, 20), vec3(0, 0, 20),
    ];
    const inset = insetRingXZ(L, 1.5);
    expect(inset).not.toBeNull();
    expect(polygonAreaXZ(inset!)).toBeLessThan(polygonAreaXZ(L));
    expect(polygonSignedAreaXZ(inset!) > 0).toBe(polygonSignedAreaXZ(L) > 0);
  });

  it("rejects a concave inset that folds across itself", () => {
    const foldedParcel = [
      vec3(-64.10387594409352, 0, 53.28333611364884),
      vec3(-73.03798519183073, 0, 35.17323987722582),
      vec3(-84.19204782396555, 0, 0),
      vec3(-81.88653972879882, 0, -2.7647580949696557),
      vec3(-37.046130606322464, 0, 42.075651027506694),
    ];
    expect(insetRingXZ(foldedParcel, 4.25)).toBeNull();
  });
});

describe("cityBlocks real roads", () => {
  const square = [vec3(-60, 0, -60), vec3(60, 0, -60), vec3(60, 0, 60), vec3(-60, 0, 60)];

  it("emits a non-empty road mesh + streets when realRoads is on", () => {
    const r = cityBlocks(square, { targetArea: 700, streetWidth: 8, seed: 42, realRoads: true });
    expect(r.streets.length).toBeGreaterThan(0);
    expect(triangleCount(r.roadMesh)).toBeGreaterThan(0);
    expect(triangleCount(r.roadParts.asphaltMesh)).toBeGreaterThan(0);
    expect(triangleCount(r.roadParts.markingMesh)).toBeGreaterThan(0);
    expect(triangleCount(r.roadParts.sidewalkMesh)).toBeGreaterThan(0);
    expect(triangleCount(r.roadParts.curbMesh)).toBeGreaterThan(0);
    expect(triangleCount(r.roadParts.intersectionMesh)).toBeGreaterThan(0);
    expect(triangleCount(r.roadParts.crosswalkMesh)).toBeGreaterThan(0);
    expect(zFightingReport([
      { name: "land_and_blocks", mesh: r.baseMesh },
      { name: "road_asphalt", mesh: merge(r.roadParts.asphaltMesh, r.roadParts.intersectionMesh, r.roadParts.roundaboutMesh) },
      { name: "road_markings", mesh: merge(r.roadParts.markingMesh, r.roadParts.crosswalkMesh) },
      { name: "sidewalks", mesh: r.roadParts.sidewalkMesh },
      { name: "curbs", mesh: r.roadParts.curbMesh },
    ], {
      includeSamePart: false,
      maxTriangles: Number.POSITIVE_INFINITY,
    }).pairs).toBe(0);
  });

  it("omits road geometry when realRoads is off", () => {
    const r = cityBlocks(square, { targetArea: 700, streetWidth: 8, seed: 42, realRoads: false });
    expect(triangleCount(r.roadMesh)).toBe(0);
  });

  it("can promote multi-arm junctions to roundabouts", () => {
    const r = cityBlocks(square, {
      targetArea: 700,
      streetWidth: 8,
      seed: 42,
      realRoads: true,
      roundabouts: true,
      irregularity: 0,
    });
    expect(triangleCount(r.roadParts.roundaboutMesh)).toBeGreaterThan(0);
    expect(triangleCount(r.roadParts.islandMesh)).toBeGreaterThan(0);
    expect(zFightingReport([
      { name: "road_markings", mesh: merge(r.roadParts.markingMesh, r.roadParts.crosswalkMesh) },
      { name: "roundabout_islands", mesh: r.roadParts.islandMesh },
    ], {
      includeSamePart: false,
      maxTriangles: Number.POSITIVE_INFINITY,
    }).pairs).toBe(0);
  });
});
