import { describe, expect, it } from "vitest";
import {
  buildBuildingParts,
  buildCityBlockParts,
  scoreBuilding,
  scoreCityBlock,
  box,
  bounds,
  merge,
  transform,
  triangleCount,
  vec3,
  vertexCount,
  zFightingReport,
  BUILDING_DEFAULTS,
  CITY_BLOCK_DEFAULTS,
  type NamedPart,
} from "../src/index.js";

function mergedMesh(parts: NamedPart[]) {
  return merge(...parts.map((p) => p.mesh));
}

describe("procedural building", () => {
  it("builds the expected named parts with matched surfaces", () => {
    const parts = buildBuildingParts();
    const names = parts.map((p) => p.name);
    expect(names).toContain("walls");
    expect(names).toContain("slabs");
    expect(names).toContain("window_frames");
    expect(names).toContain("windows");
    expect(names).toContain("door");
    expect(names).toContain("roof");
    // windows are glass, frames are metal
    const win = parts.find((p) => p.name === "windows")!;
    expect(win.surface?.type).toBe("glass");
    const frame = parts.find((p) => p.name === "window_frames")!;
    expect(frame.surface?.type).toBe("metal");
  });

  it("is deterministic: same params -> identical geometry", () => {
    const a = mergedMesh(buildBuildingParts({ floors: 8, seed: 13 }));
    const b = mergedMesh(buildBuildingParts({ floors: 8, seed: 13 }));
    expect(vertexCount(a)).toBe(vertexCount(b));
    expect(triangleCount(a)).toBe(triangleCount(b));
    expect(a.positions).toEqual(b.positions);
    expect(a.indices).toEqual(b.indices);
  });

  it("seed only changes lit-window variant, not vertex count", () => {
    const a = mergedMesh(buildBuildingParts({ seed: 1 }));
    const b = mergedMesh(buildBuildingParts({ seed: 99 }));
    expect(vertexCount(a)).toBe(vertexCount(b));
  });

  it("more floors -> taller bbox and more geometry", () => {
    const low = mergedMesh(buildBuildingParts({ floors: 3 }));
    const high = mergedMesh(buildBuildingParts({ floors: 12 }));
    const lowH = bounds(low).max.y - bounds(low).min.y;
    const highH = bounds(high).max.y - bounds(high).min.y;
    expect(highH).toBeGreaterThan(lowH);
    expect(triangleCount(high)).toBeGreaterThan(triangleCount(low));
  });

  it("footprint width/depth control the bbox extents", () => {
    const m = mergedMesh(buildBuildingParts({ width: 6, depth: 2, floors: 4 }));
    const bb = bounds(m);
    const ex = bb.max.x - bb.min.x;
    const ez = bb.max.z - bb.min.z;
    expect(ex).toBeGreaterThan(ez);
    // bbox spans roughly the footprint (plus slab/window proudness margins)
    expect(ex).toBeGreaterThan(5.5);
    expect(ex).toBeLessThan(7);
  });

  it("setback tapers the tower (top narrower than base)", () => {
    const parts = buildBuildingParts({ floors: 10, setback: 0.12, width: 5, depth: 5 });
    const walls = parts.find((p) => p.name === "walls")!.mesh;
    const bb = bounds(walls);
    // top-half x-extent should be narrower than bottom-half x-extent
    const midY = (bb.min.y + bb.max.y) / 2;
    let topMaxX = -Infinity, botMaxX = -Infinity;
    for (const p of walls.positions) {
      if (p.y > midY) topMaxX = Math.max(topMaxX, Math.abs(p.x));
      else botMaxX = Math.max(botMaxX, Math.abs(p.x));
    }
    expect(topMaxX).toBeLessThan(botMaxX);
  });

  it("supports flat / hip / gable roof styles", () => {
    for (const roof of ["flat", "hip", "gable"] as const) {
      const parts = buildBuildingParts({ roof });
      const roofPart = parts.find((p) => p.name === "roof");
      expect(roofPart).toBeDefined();
      expect(triangleCount(roofPart!.mesh)).toBeGreaterThan(0);
    }
    // flat roof adds a parapet ring; pitched roofs don't
    const flat = buildBuildingParts({ roof: "flat" }).map((p) => p.name);
    expect(flat).toContain("parapet");
    const hip = buildBuildingParts({ roof: "hip" }).map((p) => p.name);
    expect(hip).not.toContain("parapet");
  });

  it("gable roof overhangs the top cornice", () => {
    const width = 5;
    const depth = 4;
    const roof = buildBuildingParts({ roof: "gable", width, depth, floors: 2, setback: 0 })
      .find((p) => p.name === "roof")!;
    const b = bounds(roof.mesh);

    expect(b.max.x).toBeGreaterThan(width / 2 + 0.06);
    expect(-b.min.x).toBeGreaterThan(width / 2 + 0.06);
    expect(b.max.z).toBeGreaterThan(depth / 2 + 0.06);
    expect(-b.min.z).toBeGreaterThan(depth / 2 + 0.06);
  });

  it("building scorer accepts a roof that covers the cornice", () => {
    const score = scoreBuilding(buildBuildingParts({ roof: "gable", width: 5, depth: 4, floors: 3, setback: 0 }));
    expect(score.metrics.requiredParts).toBe(1);
    expect(score.metrics.roofCoverage).toBeGreaterThan(0.95);
    expect(score.metrics.roofAttachment).toBeGreaterThan(0.8);
    expect(score.score).toBeGreaterThan(0.85);
  });

  it("building scorer penalises undersized roofs", () => {
    const parts = buildBuildingParts({ roof: "gable", width: 5, depth: 4, floors: 3, setback: 0 });
    const roof = parts.find((p) => p.name === "roof")!;
    const rb = bounds(roof.mesh);
    const badRoof = transform(box(2.0, rb.max.y - rb.min.y, 1.5), {
      translate: vec3(0, (rb.min.y + rb.max.y) / 2, 0),
    });
    const badParts = parts.map((p) => p.name === "roof" ? { ...p, mesh: badRoof } : p);
    const score = scoreBuilding(badParts);

    expect(score.metrics.roofCoverage).toBeLessThan(0.5);
    expect(score.feedback).toMatch(/roof must cover/i);
  });

  it("requires base/crown hierarchy, deep openings, entrance, and roof finish", () => {
    const good = buildBuildingParts({ roof: "flat", floors: 6, canopy: true });
    const stripped = good.filter((part) => ![
      "ground_floor_base", "crown_band", "window_reveals", "entrance_recess",
      "entrance_frame", "entrance_threshold", "roof_coping", "rooftop_service",
    ].includes(part.name));
    const goodScore = scoreBuilding(good);
    const badScore = scoreBuilding(stripped);
    expect(badScore.metrics.massingHierarchy).toBe(0);
    expect(badScore.metrics.openingDepth).toBe(0);
    expect(badScore.metrics.entrance).toBe(0);
    expect(badScore.metrics.roofFinish).toBe(0);
    expect(badScore.score).toBeLessThan(goodScore.score);
    expect(zFightingReport(good, { includeSamePart: false, maxTriangles: Number.POSITIVE_INFINITY }).pairs).toBe(0);
  });

  it("exposes sane defaults", () => {
    expect(BUILDING_DEFAULTS.floors).toBeGreaterThan(0);
    expect(BUILDING_DEFAULTS.roof).toBe("flat");
  });

  it("corner pilasters toggle on/off", () => {
    const on = buildBuildingParts({ corners: true }).map((p) => p.name);
    expect(on).toContain("corner_pilasters");
    const off = buildBuildingParts({ corners: false }).map((p) => p.name);
    expect(off).not.toContain("corner_pilasters");
  });

  it("balconyEvery adds front balcony slabs + rails", () => {
    const none = buildBuildingParts({ floors: 10, balconyEvery: 0 }).map((p) => p.name);
    expect(none).not.toContain("balcony_slabs");
    const some = buildBuildingParts({ floors: 10, balconyEvery: 3 });
    const names = some.map((p) => p.name);
    expect(names).toContain("balcony_slabs");
    expect(names).toContain("balcony_rails");
    const rail = some.find((p) => p.name === "balcony_rails")!;
    expect(rail.surface?.type).toBe("metal");
  });

  it("canopy toggle adds an entrance awning past the facade", () => {
    const on = buildBuildingParts({ canopy: true });
    const canopy = on.find((p) => p.name === "canopy");
    expect(canopy).toBeDefined();
    // canopy projects out past the front wall (+Z beyond depth/2)
    const bb = bounds(canopy!.mesh);
    expect(bb.max.z).toBeGreaterThan(BUILDING_DEFAULTS.depth / 2);
    const off = buildBuildingParts({ canopy: false }).map((p) => p.name);
    expect(off).not.toContain("canopy");
  });

  it("balconies stay deterministic under fixed params", () => {
    const a = mergedMesh(buildBuildingParts({ floors: 9, balconyEvery: 2, seed: 5 }));
    const b = mergedMesh(buildBuildingParts({ floors: 9, balconyEvery: 2, seed: 5 }));
    expect(a.positions).toEqual(b.positions);
  });

  it("balcony layout varies by seed but window count stays fixed", () => {
    const a = buildBuildingParts({ floors: 9, balconyEvery: 2, seed: 1 });
    const b = buildBuildingParts({ floors: 9, balconyEvery: 2, seed: 42 });
    const balA = a.find((p) => p.name === "balcony_slabs")!.mesh;
    const balB = b.find((p) => p.name === "balcony_slabs")!.mesh;
    // seeded width/offset differ -> geometry differs
    expect(balA.positions).not.toEqual(balB.positions);
    // but the facade window count is independent of balcony seed stream
    const winA = vertexCount(a.find((p) => p.name === "windows")!.mesh);
    const winB = vertexCount(b.find((p) => p.name === "windows")!.mesh);
    expect(winA).toBe(winB);
  });

  it("canopy includes diagonal support brackets (slab + brackets span height)", () => {
    const canopy = buildBuildingParts({ canopy: true }).find((p) => p.name === "canopy")!.mesh;
    const bb = bounds(canopy);
    // brackets dip below the slab plane, so the canopy spans more than slab thickness
    expect(bb.max.y - bb.min.y).toBeGreaterThan(0.1);
    expect(bb.max.z).toBeGreaterThan(BUILDING_DEFAULTS.depth / 2);
  });
});

describe("procedural city block", () => {
  function merged(parts: NamedPart[]) {
    return merge(...parts.map((p) => p.mesh));
  }

  it("places a cols x rows grid wider/deeper than a single building", () => {
    const block = buildCityBlockParts({ cols: 4, rows: 2 });
    const bb = bounds(merged(block));
    const one = bounds(merged(buildBuildingParts()));
    expect(bb.max.x - bb.min.x).toBeGreaterThan(one.max.x - one.min.x);
    expect(bb.max.z - bb.min.z).toBeGreaterThan(one.max.z - one.min.z);
  });

  it("merges parts by name across buildings (compact material groups)", () => {
    const block = buildCityBlockParts({ cols: 3, rows: 3 });
    const names = block.map((p) => p.name);
    // one 'walls' group, not 9
    expect(names.filter((n) => n === "walls").length).toBe(1);
    expect(names).toContain("windows");
    // matched surfaces survive the merge
    const win = block.find((p) => p.name === "windows")!;
    expect(win.surface?.type).toBe("glass");
  });

  it("is deterministic: same master seed -> identical street", () => {
    const a = merged(buildCityBlockParts({ cols: 4, rows: 2, seed: 11 }));
    const b = merged(buildCityBlockParts({ cols: 4, rows: 2, seed: 11 }));
    expect(a.positions).toEqual(b.positions);
    expect(a.indices).toEqual(b.indices);
  });

  it("different master seed -> different street", () => {
    const a = merged(buildCityBlockParts({ cols: 4, rows: 2, seed: 1 }));
    const b = merged(buildCityBlockParts({ cols: 4, rows: 2, seed: 77 }));
    expect(a.positions).not.toEqual(b.positions);
  });

  it("ground toggle adds/removes a street slab", () => {
    const on = buildCityBlockParts({ ground: true }).map((p) => p.name);
    expect(on).toContain("ground");
    const off = buildCityBlockParts({ ground: false }).map((p) => p.name);
    expect(off).not.toContain("ground");
  });

  it("base params apply to every building", () => {
    const block = buildCityBlockParts({ cols: 2, rows: 1, base: { roof: "flat", floors: 4, canopy: false } });
    // canopy disabled for all -> no canopy group
    expect(block.map((p) => p.name)).not.toContain("canopy");
  });

  it("exposes sane defaults", () => {
    expect(CITY_BLOCK_DEFAULTS.cols).toBeGreaterThan(0);
    expect(CITY_BLOCK_DEFAULTS.maxFloors).toBeGreaterThanOrEqual(CITY_BLOCK_DEFAULTS.minFloors);
  });

  it("roads add carriageway + sidewalks + centre line when rows>=2", () => {
    const names = buildCityBlockParts({ rows: 2, roads: true }).map((p) => p.name);
    expect(names).toContain("road");
    expect(names).toContain("sidewalks");
    expect(names).toContain("road_lines");
  });

  it("road parts disappear when roads off or single row", () => {
    const off = buildCityBlockParts({ rows: 2, roads: false }).map((p) => p.name);
    expect(off).not.toContain("road");
    const oneRow = buildCityBlockParts({ rows: 1, roads: true }).map((p) => p.name);
    expect(oneRow).not.toContain("road");
  });

  it("road carriageway sits at the central z=0 corridor", () => {
    const road = buildCityBlockParts({ rows: 2, roads: true }).find((p) => p.name === "road")!.mesh;
    const bb = bounds(road);
    // centred on z=0
    expect(Math.abs((bb.min.z + bb.max.z) / 2)).toBeLessThan(0.01);
  });

  it("keeps ground and road layers free of z-fighting", () => {
    const report = zFightingReport(buildCityBlockParts(), {
      includeSamePart: false,
      maxTriangles: Number.POSITIVE_INFINITY,
    });
    expect(report.pairs).toBe(0);
  });

  it("faceStreet rotates the far band so both bands line the street", () => {
    // with roads, two bands sit either side of z=0; buildings should not
    // intrude into the central corridor regardless of orientation
    const block = buildCityBlockParts({ rows: 2, roads: true, roadWidth: 3, sidewalkWidth: 1, faceStreet: true });
    const walls = block.find((p) => p.name === "walls")!.mesh;
    const corridorHalf = 3 / 2 + 1; // roadWidth/2 + sidewalk
    let minAbsZ = Infinity;
    for (const v of walls.positions) minAbsZ = Math.min(minAbsZ, Math.abs(v.z));
    // nearest wall vertex should be at or beyond the corridor edge
    expect(minAbsZ).toBeGreaterThan(corridorHalf - 0.5);
  });

  it("faceStreet stays deterministic", () => {
    const a = merged(buildCityBlockParts({ rows: 2, faceStreet: true, seed: 11 }));
    const b = merged(buildCityBlockParts({ rows: 2, faceStreet: true, seed: 11 }));
    expect(a.positions).toEqual(b.positions);
  });

  it("waterTowers>0 adds rooftop tower groups above the buildings", () => {
    // Force flat roofs so every eligible lot can carry a tower.
    const block = buildCityBlockParts({
      cols: 4, rows: 2, minFloors: 5, maxFloors: 8,
      waterTowers: 1, base: { roof: "flat" }, seed: 11,
    });
    const towers = block.filter((p) => p.name.startsWith("tower_"));
    expect(towers.length, "has tower parts").toBeGreaterThan(0);
    // Towers sit on rooftops, so their base is well above ground level.
    const b = bounds(merge(...towers.map((p) => p.mesh)));
    expect(b.min.y).toBeGreaterThan(3);
  });

  it("waterTowers=0 produces no rooftop towers", () => {
    const block = buildCityBlockParts({ waterTowers: 0, base: { roof: "flat" }, seed: 11 });
    expect(block.some((p) => p.name.startsWith("tower_"))).toBe(false);
  });

  it("rooftop towers stay deterministic across runs", () => {
    const a = merged(buildCityBlockParts({ cols: 3, rows: 2, waterTowers: 0.6, seed: 4 }));
    const b = merged(buildCityBlockParts({ cols: 3, rows: 2, waterTowers: 0.6, seed: 4 }));
    expect(a.positions).toEqual(b.positions);
  });
});

describe("city block scorer", () => {
  it("scores a full block (buildings + roads + variety) highly", () => {
    const block = buildCityBlockParts({ cols: 5, rows: 2, roads: true, minFloors: 2, maxFloors: 14 });
    const s = scoreCityBlock(block);
    expect(s.score).toBeGreaterThan(0.6);
    expect(s.metrics.streetFurniture).toBe(1);
  });

  it("penalises a single building (not a block)", () => {
    const one = buildBuildingParts({ floors: 3 });
    const s = scoreCityBlock(one);
    expect(s.score).toBeLessThan(0.5);
    expect(s.metrics.streetFurniture).toBe(0);
    expect(s.feedback).toMatch(/road|block/i);
  });

  it("rewards street furniture when roads are present", () => {
    const withRoads = scoreCityBlock(buildCityBlockParts({ rows: 2, roads: true }));
    const noRoads = scoreCityBlock(buildCityBlockParts({ rows: 2, roads: false }));
    expect(withRoads.metrics.streetFurniture).toBeGreaterThan(noRoads.metrics.streetFurniture);
  });

  it("is deterministic and bounded 0..1", () => {
    const block = buildCityBlockParts({ seed: 11 });
    const a = scoreCityBlock(block).score;
    const b = scoreCityBlock(block).score;
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(1);
  });
});
