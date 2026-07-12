import { describe, expect, it } from "vitest";
import {
  bounds,
  buildBuickRiviera1965Parts,
  buildGmcCanyonAt4xParts,
  buildModularRescueRover,
  buildSportsCarParts,
  loftSurface,
  triangleCount,
  vec3,
} from "../src/index.js";

function section(z: number, halfWidth: number) {
  return [
    vec3(-halfWidth, 0, z),
    vec3(-halfWidth, 1, z),
    vec3(halfWidth, 1, z),
    vec3(halfWidth, 0, z),
  ];
}

describe("loft surface", () => {
  it("creates curved samples between sparse control rings", () => {
    const rings = [section(0, 1), section(1, 2), section(2, 1)];
    const curved = loftSurface(rings, {
      longitudinalSubdivisions: 4,
      crossSectionSubdivisions: 1,
      crossSectionInterpolation: "linear",
      caps: false,
    });
    const linear = loftSurface(rings, {
      longitudinalSubdivisions: 4,
      crossSectionSubdivisions: 1,
      longitudinalInterpolation: "linear",
      crossSectionInterpolation: "linear",
      caps: false,
    });

    const halfwayControlPoint = 2 * 4;
    expect(curved.positions[halfwayControlPoint]!.x).not.toBeCloseTo(linear.positions[halfwayControlPoint]!.x, 6);
    expect(curved.positions).toHaveLength(9 * 4);
    expect(curved.positions.every((point) => Number.isFinite(point.x + point.y + point.z))).toBe(true);
  });

  it("keeps patch masks tied to control spans after subdivision", () => {
    const mesh = loftSurface([section(0, 1), section(1, 1.5), section(2, 1)], {
      longitudinalSubdivisions: 4,
      crossSectionSubdivisions: 2,
      crossSectionInterpolation: "linear",
      caps: false,
      includePatch: (longitudinalSpan, crossSectionSpan) => (
        longitudinalSpan !== 0 || crossSectionSpan !== 1
      ),
    });
    expect(triangleCount(mesh)).toBe(112);
  });

  it("drives every standalone vehicle body through the curved loft", () => {
    const bodies = [
      buildSportsCarParts().find((part) => part.name === "wedge_body"),
      buildBuickRiviera1965Parts().find((part) => part.name === "razor_edge_lower_body"),
      buildGmcCanyonAt4xParts().find((part) => part.name === "lower_body_shell"),
      buildModularRescueRover().parts.find((part) => part.name === "body_shell"),
    ];
    expect(bodies.every(Boolean)).toBe(true);
    for (const body of bodies) expect(body!.mesh.positions.length).toBeGreaterThan(500);
  });

  it("keeps standalone vehicle roof panels broad and shallow", () => {
    const sportsRoof = bounds(buildSportsCarParts().find((part) => part.name === "t_top_roof_frame")!.mesh);
    const buickRoof = bounds(buildBuickRiviera1965Parts().find((part) => part.name === "razor_roof_edge")!.mesh);
    const pickupRoof = bounds(buildGmcCanyonAt4xParts().find((part) => part.name === "cab_black_roof")!.mesh);
    for (const roof of [sportsRoof, buickRoof, pickupRoof]) {
      const width = roof.max.x - roof.min.x;
      const crown = roof.max.y - roof.min.y;
      expect(crown / width).toBeLessThan(0.07);
    }
  });
});
