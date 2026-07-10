import { describe, it, expect } from "vitest";
import {
  buildRootsParts,
  buildRootMesh,
  growRootStrands,
  buildRootPreset,
  ROOT_PRESETS,
  buildRockFormationParts,
  buildRockFormationMesh,
  buildRockPreset,
  ROCK_PRESETS,
  scatterGrid,
  applyRules,
  ruleSlopeFilter,
  pruneMasked,
  makePointCloud,
  pointCount,
  length,
  vec3,
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

describe("root generator", () => {
  it("produces a valid root mesh", () => {
    assertValid(buildRootMesh({ seed: 7 }));
  });

  it("is deterministic: same seed => identical geometry", () => {
    const a = buildRootMesh({ seed: 9, mode: "flare" });
    const b = buildRootMesh({ seed: 9, mode: "flare" });
    expect(b.positions).toEqual(a.positions);
    expect(b.indices).toEqual(a.indices);
  });

  it("different seeds diverge", () => {
    const a = buildRootMesh({ seed: 1 });
    const b = buildRootMesh({ seed: 2 });
    expect(b.positions).not.toEqual(a.positions);
  });

  it("all modes grow strands and mesh cleanly", () => {
    for (const mode of ["flare", "erosion", "taproot"] as const) {
      const strands = growRootStrands({ mode, seed: 4 });
      expect(strands.length).toBeGreaterThan(0);
      assertValid(buildRootMesh({ mode, seed: 4 }));
    }
  });

  it("roots grow downward: tips sit below the collar", () => {
    const strands = growRootStrands({ mode: "taproot", seed: 3 });
    // the deepest tip across all strands should be well below origin y=0
    let minY = Infinity;
    for (const s of strands) for (const p of s.curve.points) minY = Math.min(minY, p.y);
    expect(minY).toBeLessThan(-0.5);
  });

  it("named parts carry a wood surface", () => {
    const parts = buildRootsParts({ seed: 7 });
    expect(parts).toHaveLength(1);
    expect(parts[0]!.name).toBe("roots");
    expect(parts[0]!.surface?.type).toBe("wood");
    assertValid(parts[0]!.mesh);
  });

  it("presets all build", () => {
    for (const name of Object.keys(ROOT_PRESETS)) {
      const parts = buildRootPreset(name);
      assertValid(parts[0]!.mesh);
    }
  });
});

describe("rock formation generator", () => {
  it("produces a valid rock mesh", () => {
    assertValid(buildRockFormationMesh({ seed: 3 }));
  });

  it("is deterministic: same seed => identical geometry", () => {
    const a = buildRockFormationMesh({ seed: 5, mode: "boulder" });
    const b = buildRockFormationMesh({ seed: 5, mode: "boulder" });
    expect(b.positions).toEqual(a.positions);
    expect(b.indices).toEqual(a.indices);
  });

  it("all modes build valid geometry", () => {
    for (const mode of ["boulder", "shelf", "cliff"] as const) {
      assertValid(buildRockFormationMesh({ mode, seed: 6, resolution: 24 }));
    }
  });

  it("named parts carry a stone surface", () => {
    const parts = buildRockFormationParts({ seed: 3 });
    expect(parts).toHaveLength(1);
    expect(parts[0]!.name).toBe("rock");
    expect(parts[0]!.surface?.type).toBe("stone");
  });

  it("presets all build", () => {
    for (const name of Object.keys(ROCK_PRESETS)) {
      const parts = buildRockPreset(name, { resolution: 24 });
      assertValid(parts[0]!.mesh);
    }
  });
});

describe("ruleSlopeFilter", () => {
  it("keeps flat points, drops steep ones under a maxSlope gate", () => {
    // three points: flat-up normal, 30° tilt, 80° (near vertical)
    const pc = makePointCloud({
      points: [vec3(0, 0, 0), vec3(1, 0, 0), vec3(2, 0, 0)],
      normals: [
        vec3(0, 1, 0),
        vec3(Math.sin((30 * Math.PI) / 180), Math.cos((30 * Math.PI) / 180), 0),
        vec3(Math.sin((80 * Math.PI) / 180), Math.cos((80 * Math.PI) / 180), 0),
      ],
    });
    const out = applyRules(pc, [
      ruleSlopeFilter({ maxSlope: (45 * Math.PI) / 180 }),
      pruneMasked(),
    ]);
    // flat + 30° survive, 80° is dropped
    expect(pointCount(out)).toBe(2);
  });

  it("minSlope keeps only steep faces (cliff-cling)", () => {
    const pc = makePointCloud({
      points: [vec3(0, 0, 0), vec3(1, 0, 0)],
      normals: [vec3(0, 1, 0), vec3(1, 0, 0)],
    });
    const out = applyRules(pc, [
      ruleSlopeFilter({ minSlope: (60 * Math.PI) / 180 }),
      pruneMasked(),
    ]);
    // only the vertical (90°) face survives
    expect(pointCount(out)).toBe(1);
  });

  it("chains with a prior mask (never revives dropped points)", () => {
    const pc = scatterGrid({ cols: 4, rows: 4, cellX: 1, cellZ: 1 });
    // grid has upward normals => all flat; slope filter keeps all,
    // but a prior thin should still be respected
    const masked = makePointCloud({
      points: pc.points,
      normals: pc.normals,
      attributes: { mask: pc.points.map((_, i) => (i % 2 === 0 ? 1 : 0)) },
    });
    const out = applyRules(masked, [ruleSlopeFilter({}), pruneMasked()]);
    expect(pointCount(out)).toBe(8);
  });
});
