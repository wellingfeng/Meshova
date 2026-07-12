import { describe, expect, it } from "vitest";
import {
  joinedRoadJunctionMesh,
  roadJunctionPadMesh,
  roadJunctionRadius,
  triangleCount,
  type RoadJunctionBranch,
} from "../src/index.js";

describe("shared arbitrary-angle road junction geometry", () => {
  const skewedBranches: RoadJunctionBranch[] = [
    { angleRadians: 0, halfWidth: 3, length: 8 },
    { angleRadians: 70 * Math.PI / 180, halfWidth: 5, length: 11 },
    { angleRadians: 190 * Math.PI / 180, halfWidth: 4, length: 9 },
    { angleRadians: 265 * Math.PI / 180, halfWidth: 6, length: 13 },
  ];

  it("matches each trimmed road mouth with one pad edge", () => {
    const radius = roadJunctionRadius(skewedBranches);
    const pad = roadJunctionPadMesh(skewedBranches, { radius, top: 0.04 });
    expect(triangleCount(pad)).toBe(skewedBranches.length * 2);
    expect(pad.positions[1]!.x).toBeCloseTo(radius);
    expect(pad.positions[1]!.z).toBeCloseTo(-3);
    expect(pad.positions[2]!.x).toBeCloseTo(radius);
    expect(pad.positions[2]!.z).toBeCloseTo(3);
    expect(pad.positions.every((position) => position.y === 0.04)).toBe(true);
  });

  it("builds centre and branches as one closed contour", () => {
    const mesh = joinedRoadJunctionMesh(skewedBranches);
    expect(triangleCount(mesh)).toBe(skewedBranches.length * 16);
    for (let index = 0; index < mesh.indices.length; index += 3) {
      const a = mesh.positions[mesh.indices[index]!]!;
      const b = mesh.positions[mesh.indices[index + 1]!]!;
      const c = mesh.positions[mesh.indices[index + 2]!]!;
      const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
      const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
      const area2 = Math.hypot(
        ab.y * ac.z - ab.z * ac.y,
        ab.z * ac.x - ab.x * ac.z,
        ab.x * ac.y - ab.y * ac.x,
      );
      expect(area2).toBeGreaterThan(1e-7);
    }
  });

  it("expands acute junctions until adjacent mouths clear", () => {
    const rightAngleRadius = roadJunctionRadius([0, 90, 180, 270].map((degrees) => ({
      angleRadians: degrees * Math.PI / 180,
      halfWidth: 5,
    })));
    const acuteRadius = roadJunctionRadius([0, 30, 180, 210].map((degrees) => ({
      angleRadians: degrees * Math.PI / 180,
      halfWidth: 5,
    })));
    expect(acuteRadius).toBeGreaterThan(rightAngleRadius);
  });

  it("rejects branches that cannot enclose a centre", () => {
    expect(() => roadJunctionRadius([0, 20, 40].map((degrees) => ({
      angleRadians: degrees * Math.PI / 180,
      halfWidth: 5,
    })))).toThrow(/surround/);
  });
});
