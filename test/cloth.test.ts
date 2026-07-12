import { describe, it, expect } from "vitest";
import { plane } from "../src/geometry/primitives.js";
import { translateMesh } from "../src/geometry/transform.js";
import { simulateCloth, clothStrain, type ClothCollider } from "../src/geometry/cloth.js";
import { buildTitanClothMesh } from "../src/models/titan-cloth.js";

/** Min/max Y of a mesh. */
function yRange(positions: ReadonlyArray<{ y: number }>): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const p of positions) {
    if (p.y < min) min = p.y;
    if (p.y > max) max = p.y;
  }
  return { min, max };
}

describe("simulateCloth (generic XPBD)", () => {
  it("gravity pulls an unpinned cloth downward", () => {
    const flat = translateMesh(plane(4, 4, 12, 12), { x: 0, y: 3, z: 0 });
    const settled = simulateCloth(flat, { iterations: 40, gravity: 0.02, damping: 0.1 });
    const before = yRange(flat.positions);
    const after = yRange(settled.positions);
    expect(after.max).toBeLessThan(before.max); // whole sheet fell
    expect(settled.positions.length).toBe(flat.positions.length);
  });

  it("is deterministic — same mesh + params => identical settle", () => {
    const flat = translateMesh(plane(4, 4, 10, 10), { x: 0, y: 3, z: 0 });
    const a = simulateCloth(flat, { iterations: 30, gravity: 0.015 });
    const b = simulateCloth(flat, { iterations: 30, gravity: 0.015 });
    expect(a.positions).toEqual(b.positions);
  });

  it("pinned verts stay put while the rest sags", () => {
    const flat = translateMesh(plane(4, 4, 12, 12), { x: 0, y: 3, z: 0 });
    // pin the top edge (max Z), let the rest hang like a hanging banner
    let maxZ = -Infinity;
    for (const p of flat.positions) if (p.z > maxZ) maxZ = p.z;
    // record which indices are pinned from the REST mesh (they move in-sim otherwise)
    const pinnedIdx = flat.positions
      .map((p, i) => (p.z >= maxZ - 1e-6 ? i : -1))
      .filter((i) => i >= 0);
    const settled = simulateCloth(flat, {
      iterations: 60,
      gravity: 0.02,
      pin: (p) => p.z >= maxZ - 1e-6,
    });
    // pinned verts never moved: exact rest position preserved
    for (const i of pinnedIdx) {
      expect(settled.positions[i]!.y).toBeCloseTo(3, 5);
      expect(settled.positions[i]!.z).toBeCloseTo(flat.positions[i]!.z, 5);
    }
    // some free verts dropped well below rest height
    expect(yRange(settled.positions).min).toBeLessThan(2.9);
  });

  it("ground collider stops the cloth from sinking through the floor", () => {
    const flat = translateMesh(plane(3, 3, 10, 10), { x: 0, y: 2, z: 0 });
    const colliders: ClothCollider[] = [{ kind: "ground", y: 0 }];
    const settled = simulateCloth(flat, {
      iterations: 80,
      gravity: 0.03,
      colliders,
      collisionOffset: 0.01,
    });
    // nothing goes below the ground (minus a tiny epsilon)
    expect(yRange(settled.positions).min).toBeGreaterThanOrEqual(0 - 1e-6);
  });

  it("sphere collider keeps every vertex outside the ball", () => {
    const flat = translateMesh(plane(3, 3, 14, 14), { x: 0, y: 2, z: 0 });
    const center = { x: 0, y: 1, z: 0 };
    const radius = 0.8;
    const offset = 0.01;
    const colliders: ClothCollider[] = [
      { kind: "sphere", center, radius },
      { kind: "ground", y: 0 },
    ];
    const settled = simulateCloth(flat, { iterations: 100, gravity: 0.03, colliders });
    // no vertex penetrates the sphere (respecting the skin offset)
    for (const p of settled.positions) {
      const d = Math.hypot(p.x - center.x, p.y - center.y, p.z - center.z);
      expect(d).toBeGreaterThanOrEqual(radius + offset - 1e-3);
    }
    // and nothing sinks through the ground
    expect(yRange(settled.positions).min).toBeGreaterThanOrEqual(0 - 1e-6);
  });

  it("stiff cloth stretches less than a limp one under gravity", () => {
    const flat = translateMesh(plane(4, 4, 12, 12), { x: 0, y: 3, z: 0 });
    let maxZ = -Infinity;
    for (const p of flat.positions) if (p.z > maxZ) maxZ = p.z;
    const pin = (p: { z: number }) => p.z >= maxZ - 1e-6;
    const stiff = simulateCloth(flat, { iterations: 60, gravity: 0.02, stretchStiffness: 0.98, pin });
    const limp = simulateCloth(flat, { iterations: 60, gravity: 0.02, stretchStiffness: 0.4, pin });
    expect(clothStrain(flat, stiff)).toBeLessThan(clothStrain(flat, limp));
  });

  it("wind pushes cloth sideways", () => {
    const flat = translateMesh(plane(3, 3, 10, 10), { x: 0, y: 3, z: 0 });
    let maxZ = -Infinity;
    for (const p of flat.positions) if (p.z > maxZ) maxZ = p.z;
    const pin = (p: { z: number }) => p.z >= maxZ - 1e-6;
    const still = simulateCloth(flat, { iterations: 50, gravity: 0.01, pin });
    const windy = simulateCloth(flat, { iterations: 50, gravity: 0.01, wind: { x: 0.02, y: 0, z: 0 }, pin });
    const avgX = (m: typeof still) => m.positions.reduce((s, p) => s + p.x, 0) / m.positions.length;
    expect(avgX(windy)).toBeGreaterThan(avgX(still));
  });

  it("strain limit sharply reduces rubber-band stretch under a heavy fall", () => {
    // Corner-pinned cloth under strong gravity rubber-bands its long pin-to-pin
    // chains into spikes. The strain limiter, run every solver step, must keep
    // the worst edge far tighter than the unlimited solve.
    const flat = translateMesh(plane(4, 4, 20, 20), { x: 0, y: 4, z: 0 });
    const pin = (p: { x: number; z: number }) =>
      (Math.abs(p.x) >= 2 - 1e-6) && (Math.abs(p.z) >= 2 - 1e-6);
    const rest = 0.2;
    const stride = 21;
    const worstEdge = (m: { positions: ReadonlyArray<{ x: number; y: number; z: number }> }) => {
      let worst = 0;
      for (let iz = 0; iz < 20; iz++) for (let ix = 0; ix < 20; ix++) {
        const a = iz * stride + ix;
        for (const b of [a + 1, a + stride]) {
          const pa = m.positions[a]!;
          const pb = m.positions[b]!;
          worst = Math.max(worst, Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z) / rest);
        }
      }
      return worst;
    };
    const opts = { iterations: 80, gravity: 0.04, stretchStiffness: 0.6, pin } as const;
    const limited = worstEdge(simulateCloth(flat, { ...opts, maxStretch: 1.1 }));
    const unlimited = worstEdge(simulateCloth(flat, { ...opts, maxStretch: 0 }));
    // limiter holds stretch well under the unlimited case, and near the cap.
    // (Absolute cap is soft: Gauss-Seidel can't fully converge a 20-cell chain
    // at 4x gravity, but it keeps the worst edge from spiking.)
    expect(limited).toBeLessThan(unlimited * 0.75);
    expect(limited).toBeLessThan(1.35);
  });

  it("strain limit is deterministic", () => {
    const flat = translateMesh(plane(4, 4, 16, 16), { x: 0, y: 3, z: 0 });
    const pin = (p: { z: number }) => p.z <= -2 + 1e-6;
    const a = simulateCloth(flat, { iterations: 40, gravity: 0.02, maxStretch: 1.1, pin });
    const b = simulateCloth(flat, { iterations: 40, gravity: 0.02, maxStretch: 1.1, pin });
    expect(a.positions).toEqual(b.positions);
  });
});

describe("titan-cloth physics mode", () => {
  it("physics path produces a settled mesh distinct from the analytic drape", () => {
    const analytic = buildTitanClothMesh({ physics: false });
    const solved = buildTitanClothMesh({ physics: true, simSteps: 40 });
    expect(solved.positions.length).toBe(analytic.positions.length);
    expect(solved.positions).not.toEqual(analytic.positions);
  });

  it("physics solve is deterministic", () => {
    const a = buildTitanClothMesh({ physics: true, simSteps: 40, stiffness: 0.9 });
    const b = buildTitanClothMesh({ physics: true, simSteps: 40, stiffness: 0.9 });
    expect(a.positions).toEqual(b.positions);
  });

  it("corner-pinned cloth keeps its top corners near rest height", () => {
    const solved = buildTitanClothMesh({
      physics: true,
      pinMode: "corners",
      simSteps: 60,
      restHeight: 3,
    });
    // the four pinned corners should stay high; belly sags below
    const { min, max } = yRange(solved.positions);
    expect(max).toBeCloseTo(3, 1);
    expect(min).toBeLessThan(3);
  });
});
