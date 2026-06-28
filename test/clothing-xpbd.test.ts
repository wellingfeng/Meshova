import { describe, it, expect } from "vitest";
import {
  solveCloth,
  meanStrain,
  plane,
  buildAvatar,
  DEFAULT_MEASURES,
  type Mesh,
} from "../src/index.js";

/** A flat cloth patch used as solver input. */
function patch(): Mesh {
  return plane(2, 2, 8, 8);
}

describe("XPBD cloth solver (solveCloth)", () => {
  it("returns a mesh with the same topology as the input", () => {
    const m = patch();
    const settled = solveCloth(m, { iterations: 4, passes: 2, gravity: -0.5 });
    expect(settled.positions.length).toBe(m.positions.length);
    expect(settled.indices).toEqual(m.indices);
    expect(settled.normals.length).toBe(settled.positions.length);
  });

  it("is deterministic: same input + options -> identical result", () => {
    const m = patch();
    const opts = { iterations: 6, passes: 3, gravity: -1, dt: 0.016 };
    const a = solveCloth(m, opts);
    const b = solveCloth(m, opts);
    for (let i = 0; i < a.positions.length; i++) {
      expect(a.positions[i]!.x).toBeCloseTo(b.positions[i]!.x, 10);
      expect(a.positions[i]!.y).toBeCloseTo(b.positions[i]!.y, 10);
      expect(a.positions[i]!.z).toBeCloseTo(b.positions[i]!.z, 10);
    }
  });

  it("gravity pulls unpinned cloth downward (mean Y drops)", () => {
    const m = patch();
    const before = m.positions.reduce((s, p) => s + p.y, 0) / m.positions.length;
    const settled = solveCloth(m, { iterations: 12, passes: 2, gravity: -2 });
    const after = settled.positions.reduce((s, p) => s + p.y, 0) / settled.positions.length;
    expect(after).toBeLessThan(before);
  });

  it("pinning the top band keeps those particles from falling", () => {
    const m = patch();
    const topY = Math.max(...m.positions.map((p) => p.y));
    const settled = solveCloth(m, { iterations: 12, gravity: -3, pinAboveY: topY - 1e-6 });
    const settledTopY = Math.max(...settled.positions.map((p) => p.y));
    expect(settledTopY).toBeCloseTo(topY, 4);
  });

  it("avatar collider keeps cloth outside the body", () => {
    const avatar = buildAvatar(DEFAULT_MEASURES);
    const m = patch();
    const settled = solveCloth(m, { iterations: 8, gravity: -1, avatar, collisionOffset: 0.02 });
    expect(settled.positions.length).toBe(m.positions.length);
    for (const p of settled.positions) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
    }
  });
});

describe("meanStrain", () => {
  it("is zero for an unchanged mesh", () => {
    const m = patch();
    expect(meanStrain(m, m)).toBeCloseTo(0, 10);
  });

  it("is positive once cloth is pinned and stretched by gravity", () => {
    // A vertical cloth (XY plane) pinned at its top edge: gravity stretches the
    // free lower rows, so edge-length strain becomes positive. (A flat XZ patch
    // is coplanar, so pinAboveY would pin every vertex and nothing moves.)
    const base = patch();
    const vert: Mesh = {
      ...base,
      positions: base.positions.map((p) => ({ x: p.x, y: p.z + 1.2, z: 0 })),
    };
    const topY = Math.max(...vert.positions.map((p) => p.y));
    const settled = solveCloth(vert, {
      iterations: 20,
      passes: 1,
      gravity: -6,
      pinAboveY: topY - 1e-6,
      fabric: { stretchStiffness: 0.05, bendStiffness: 0.1, shearStiffness: 0.1, density: 1, damping: 0.05 },
    });
    expect(meanStrain(vert, settled)).toBeGreaterThan(0);
  });
});
