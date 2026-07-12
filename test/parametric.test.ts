import { describe, expect, it } from "vitest";
import { superformulaRadius, superformulaSurface, triangleCount, vertexCount } from "../src/index.js";

describe("superformula parametric surface", () => {
  it("is periodic over one turn", () => {
    const options = { m: 7, n1: 0.4, n2: 1.2, n3: 1.2 };
    expect(superformulaRadius(0.37, options)).toBeCloseTo(
      superformulaRadius(0.37 + Math.PI * 2, options),
      10,
    );
  });

  it("builds deterministic closed tower topology", () => {
    const segments = 20;
    const rows = 8;
    const options = {
      angularSegments: segments,
      heightSegments: rows,
      height: 3,
      radiusBottom: 1,
      radiusTop: 0.5,
      m: 5,
      twist: 0.6,
      caps: true,
    };
    const a = superformulaSurface(options);
    const b = superformulaSurface(options);
    expect(a.positions).toEqual(b.positions);
    expect(vertexCount(a)).toBe((rows + 1) * segments + 2);
    expect(triangleCount(a)).toBe(rows * segments * 2 + segments * 2);
    expect(a.positions.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z))).toBe(true);
  });
});
