import { describe, it, expect } from "vitest";
import { buildIntersectionParts } from "../src/models/intersection.js";
import { zFightingReport } from "../src/critique/geometry-metrics.js";

const tris = (parts: ReturnType<typeof buildIntersectionParts>) =>
  parts.reduce((s, p) => s + p.mesh.indices.length, 0);

describe("road intersection", () => {
  it("builds a full four-arm crossroads with core parts", () => {
    const parts = buildIntersectionParts();
    const names = parts.map((p) => p.name);
    expect(names).toContain("asphalt");
    expect(names).toContain("lane_lines");
    expect(names).toContain("crosswalks");
    expect(names).toContain("sidewalks");
    expect(names).toContain("curbs");
  });

  it("is deterministic: same params -> identical geometry", () => {
    const a = buildIntersectionParts({ roadHalfWidth: 6, lanes: 3, seed: undefined } as never);
    const b = buildIntersectionParts({ roadHalfWidth: 6, lanes: 3 });
    expect(a.map((p) => p.name)).toEqual(b.map((p) => p.name));
    expect(tris(a)).toBe(tris(b));
  });

  it("omits an arm's asphalt when that arm is disabled (T-junction)", () => {
    const full = buildIntersectionParts();
    const tee = buildIntersectionParts({ arms: { north: true, south: true, east: true, west: false } });
    const asphaltTris = (parts: ReturnType<typeof buildIntersectionParts>) =>
      parts.find((p) => p.name === "asphalt")!.mesh.indices.length;
    expect(asphaltTris(tee)).toBeLessThan(asphaltTris(full));
  });

  it("joins the centre and all road arms without internal seam faces", () => {
    const hw = 5;
    const asphalt = buildIntersectionParts({ roadHalfWidth: hw })
      .find((part) => part.name === "asphalt")!.mesh;
    const seams = [
      { axis: "x" as const, value: -hw },
      { axis: "x" as const, value: hw },
      { axis: "z" as const, value: -hw },
      { axis: "z" as const, value: hw },
    ];
    let internalFaces = 0;
    for (let i = 0; i < asphalt.indices.length; i += 3) {
      const triangle = [
        asphalt.positions[asphalt.indices[i]!]!,
        asphalt.positions[asphalt.indices[i + 1]!]!,
        asphalt.positions[asphalt.indices[i + 2]!]!,
      ];
      for (const seam of seams) {
        const onPlane = triangle.every((point) => Math.abs(point[seam.axis] - seam.value) < 1e-8);
        const crossAxis = seam.axis === "x" ? "z" : "x";
        const insideMouth = triangle.every((point) => Math.abs(point[crossAxis]) <= hw + 1e-8);
        const vertical = Math.max(...triangle.map((point) => point.y)) - Math.min(...triangle.map((point) => point.y)) > 1e-8;
        if (onPlane && insideMouth && vertical) internalFaces++;
      }
    }
    expect(internalFaces).toBe(0);
  });

  it("adds more lane lines as lane count grows", () => {
    const two = buildIntersectionParts({ lanes: 2 });
    const four = buildIntersectionParts({ lanes: 4 });
    const laneTris = (parts: ReturnType<typeof buildIntersectionParts>) =>
      parts.find((p) => p.name === "lane_lines")!.mesh.indices.length;
    expect(laneTris(four)).toBeGreaterThan(laneTris(two));
  });

  it("can drop crosswalks and sidewalks", () => {
    const bare = buildIntersectionParts({ crosswalks: false, sidewalks: false });
    const names = bare.map((p) => p.name);
    expect(names).not.toContain("crosswalks");
    expect(names).not.toContain("sidewalks");
    expect(names).toContain("asphalt");
  });

  it("keeps curbs separated from sidewalk faces", () => {
    const report = zFightingReport(buildIntersectionParts(), {
      includeSamePart: false,
      maxTriangles: Number.POSITIVE_INFINITY,
    });
    expect(report.pairs).toBe(0);
  });

  it.each([
    ["斜十字", [0, 55, 180, 235]],
    ["Y 字", [90, 210, 330]],
    ["五岔", [0, 55, 130, 205, 285]],
  ])("builds a continuous arbitrary-angle %s junction", (_, angles) => {
    const parts = buildIntersectionParts({
      branches: angles.map((angleDegrees) => ({ angleDegrees })),
    });
    const asphalt = parts.find((part) => part.name === "asphalt")!.mesh;
    expect(asphalt.indices.length).toBe(angles.length * 4 * 4 * 3);
    for (let i = 0; i < asphalt.indices.length; i += 3) {
      const a = asphalt.positions[asphalt.indices[i]!]!;
      const b = asphalt.positions[asphalt.indices[i + 1]!]!;
      const c = asphalt.positions[asphalt.indices[i + 2]!]!;
      const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
      const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
      const cross = {
        x: ab.y * ac.z - ab.z * ac.y,
        y: ab.z * ac.x - ab.x * ac.z,
        z: ab.x * ac.y - ab.y * ac.x,
      };
      expect(Math.hypot(cross.x, cross.y, cross.z)).toBeGreaterThan(1e-7);
    }
    expect(parts.map((part) => part.name)).toEqual(expect.arrayContaining([
      "asphalt", "center_lines", "lane_lines", "crosswalks", "sidewalks", "curbs",
    ]));
  });

  it("supports per-branch width and length overrides", () => {
    const parts = buildIntersectionParts({
      branches: [
        { angleDegrees: 0, halfWidth: 3, length: 8 },
        { angleDegrees: 90, halfWidth: 5, length: 12 },
        { angleDegrees: 180, halfWidth: 4, length: 9 },
        { angleDegrees: 270, halfWidth: 6, length: 15 },
      ],
    });
    const asphalt = parts.find((part) => part.name === "asphalt")!.mesh;
    const maxDistance = Math.max(...asphalt.positions.map((point) => Math.hypot(point.x, point.z)));
    expect(maxDistance).toBeGreaterThan(20);
  });

  it("rejects arbitrary branches that cannot form a valid centre", () => {
    expect(() => buildIntersectionParts({
      branches: [{ angleDegrees: 0 }, { angleDegrees: 20 }, { angleDegrees: 40 }],
    })).toThrow(/surround/);
    expect(() => buildIntersectionParts({
      branches: [{ angleDegrees: 0 }, { angleDegrees: 0.5 }, { angleDegrees: 180 }],
    })).toThrow(/at least 1 degree/);
  });
});
