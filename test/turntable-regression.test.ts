import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  box,
  sphere,
  cylinder,
  translateMesh,
  scaleMesh,
  turntableSignature,
  compareSignatures,
  buildSportsCarParts,
  buildCartoonMechPilotParts,
  buildBuildingParts,
  type Mesh,
  type NamedPart,
  type TurntableSignature,
} from "../src/index.js";

/**
 * Deterministic, render-free shape-regression baseline. Each fixture builds a
 * fixed model from primitives, computes a turntable footprint signature, and
 * checks it against a committed baseline (test/fixtures/turntable-baseline.json).
 *
 * First run (or when SET MESHOVA_UPDATE_BASELINE=1) writes the baseline. After
 * that, any geometry change that shifts a model's silhouette beyond tolerance
 * fails here — catching shape regressions in CI without a browser/GPU.
 */
const BASELINE_PATH = join(__dirname, "fixtures", "turntable-baseline.json");
const UPDATE = process.env.MESHOVA_UPDATE_BASELINE === "1";

// --- Fixtures: stable named models. Edit deliberately; updating changes the
// baseline meaning. Keep them simple and deterministic. ---
const partMeshes = (parts: NamedPart[]): Mesh[] => parts.map((p) => p.mesh);

function fixtureModels(): Record<string, Mesh[]> {
  return {
    // A chunky 3D assembly: body + head + two legs.
    figure: [
      box(0.8, 1.0, 0.5),
      translateMesh(sphere(0.35, 16, 12), { x: 0, y: 0.8, z: 0 }),
      translateMesh(box(0.2, 0.6, 0.2), { x: -0.25, y: -0.8, z: 0 }),
      translateMesh(box(0.2, 0.6, 0.2), { x: 0.25, y: -0.8, z: 0 }),
    ],
    // A rotationally near-symmetric solid (footprint stable across azimuth).
    pillar: [cylinder(0.4, 1.4, 24)],
    // A wide flat slab: low solidity by design (collapses edge-on). Guards the
    // solidity measure against silent drift.
    slab: [scaleMesh(box(1.2, 1.2, 0.08), 1)],
    // Real library models at their defaults — broader coverage so a regression
    // in any primitive/op/assembly they touch trips the baseline.
    sportsCar: partMeshes(buildSportsCarParts()),
    mechPilot: partMeshes(buildCartoonMechPilotParts()),
    building: partMeshes(buildBuildingParts()),
  };
}

function computeAll(): Record<string, TurntableSignature> {
  const models = fixtureModels();
  const out: Record<string, TurntableSignature> = {};
  for (const [name, meshes] of Object.entries(models)) {
    out[name] = turntableSignature(meshes, { views: 8, gridSize: 64 });
  }
  return out;
}

describe("turntable shape regression baseline", () => {
  const current = computeAll();

  if (UPDATE || !existsSync(BASELINE_PATH)) {
    it("writes the turntable baseline", () => {
      writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + "\n");
      expect(existsSync(BASELINE_PATH)).toBe(true);
    });
    return;
  }

  const baseline: Record<string, TurntableSignature> = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));

  for (const name of Object.keys(current)) {
    it(`${name}: silhouette signature matches baseline`, () => {
      const base = baseline[name];
      expect(base, `no baseline for "${name}" — run with MESHOVA_UPDATE_BASELINE=1`).toBeTruthy();
      const cmp = compareSignatures(base!, current[name]!, 0.02);
      expect(cmp.withinTolerance, `${name} footprint drifted by ${cmp.maxDelta.toFixed(4)} (>0.02)`).toBe(true);
    });
  }

  it("determinism: signatures are stable across recomputation", () => {
    const again = computeAll();
    for (const name of Object.keys(current)) {
      expect(again[name]!.footprints).toEqual(current[name]!.footprints);
    }
  });

  it("solidity sanity: chunky solids high, flat slab low", () => {
    expect(current.pillar!.solidity).toBeGreaterThan(0.6);
    expect(current.figure!.solidity).toBeGreaterThan(0.3);
    expect(current.slab!.solidity).toBeLessThan(0.4);
  });
});
