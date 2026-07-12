import { describe, expect, it } from "vitest";
import {
  dihedralAngle,
  meshHinges,
  plane,
  solveCreases,
  type DihedralConstraint,
} from "../src/index.js";

describe("target-dihedral crease solver", () => {
  it("folds a sheet toward a target angle and preserves pinned ridge vertices", () => {
    const rest = plane(2, 2, 4, 4);
    const target = 0.9;
    const constraints: DihedralConstraint[] = meshHinges(rest)
      .filter((hinge) =>
        Math.abs(rest.positions[hinge.edgeA]!.x) < 1e-8 &&
        Math.abs(rest.positions[hinge.edgeB]!.x) < 1e-8)
      .map((hinge) => ({ ...hinge, targetAngle: target, stiffness: 0.95 }));
    expect(constraints.length).toBeGreaterThan(0);
    const solved = solveCreases(rest, constraints, {
      iterations: 18,
      passes: 3,
      fixed: (position) => Math.abs(position.x) < 1e-8,
    });
    const meanError = solved.positions.length === 0 ? Infinity : constraints.reduce(
      (sum, constraint) => sum + Math.abs(dihedralAngle(solved.positions, constraint) - target),
      0,
    ) / constraints.length;
    expect(meanError).toBeLessThan(target * 0.55);
    rest.positions.forEach((position, index) => {
      if (Math.abs(position.x) < 1e-8) expect(solved.positions[index]).toEqual(position);
    });
    expect(solved.positions).toEqual(solveCreases(rest, constraints, {
      iterations: 18,
      passes: 3,
      fixed: (position) => Math.abs(position.x) < 1e-8,
    }).positions);
  });
});
