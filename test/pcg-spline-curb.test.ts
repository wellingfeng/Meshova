import { describe, expect, it } from "vitest";
import { buildPcgSplineCurb } from "../src/models/pcg-spline-curb.js";

describe("PCG spline curb and sidewalk", () => {
  it("builds semantic instanced road, curb, and sidewalk parts", () => {
    const result = buildPcgSplineCurb();
    const names = result.parts.map((part) => part.name);

    expect(names).toEqual([
      "road_surface",
      "sidewalk_bed",
      "curb_courses",
      "curb_caps",
      "sidewalk_pavers",
    ]);
    expect(result.parts.every((part) => Boolean(part.label))).toBe(true);
    expect(result.curbBlockCount).toBeGreaterThan(80);
    expect(result.sidewalkPaverCount).toBeGreaterThan(100);

    const courseInstances = result.parts.find((part) => part.name === "curb_courses")
      ?.renderInstances?.transforms.length ?? 0;
    const capInstances = result.parts.find((part) => part.name === "curb_caps")
      ?.renderInstances?.transforms.length ?? 0;
    const paverInstances = result.parts.find((part) => part.name === "sidewalk_pavers")
      ?.renderInstances?.transforms.length ?? 0;
    expect(courseInstances + capInstances).toBe(result.curbBlockCount);
    expect(paverInstances).toBe(result.sidewalkPaverCount);
  });

  it("is deterministic for the same seed and parameters", () => {
    const first = buildPcgSplineCurb({ seed: 77, bend: 9 });
    const second = buildPcgSplineCurb({ seed: 77, bend: 9 });
    const firstCurb = first.parts.find((part) => part.name === "curb_courses")!;
    const secondCurb = second.parts.find((part) => part.name === "curb_courses")!;

    expect(first.curbBlockCount).toBe(second.curbBlockCount);
    expect(first.sidewalkPaverCount).toBe(second.sidewalkPaverCount);
    expect(firstCurb.renderInstances?.transforms).toEqual(secondCurb.renderInstances?.transforms);
    expect(firstCurb.mesh.positions.slice(0, 36)).toEqual(secondCurb.mesh.positions.slice(0, 36));
  });

  it("duplicates the sampled construction on both road sides", () => {
    const oneSide = buildPcgSplineCurb({ bothSides: false, jitter: 0 });
    const bothSides = buildPcgSplineCurb({ bothSides: true, jitter: 0 });

    expect(bothSides.curbBlockCount).toBe(oneSide.curbBlockCount * 2);
    expect(bothSides.sidewalkPaverCount).toBe(oneSide.sidewalkPaverCount * 2);
  });

  it("accepts authored spline control points", () => {
    const result = buildPcgSplineCurb({
      controlPoints: [
        { x: -6, y: 0, z: 0 },
        { x: -2, y: 0.3, z: 0 },
        { x: 2, y: 0.6, z: 3 },
        { x: 7, y: 0.4, z: 3 },
      ],
    });

    expect(result.controlPoints).toHaveLength(4);
    expect(result.curve.points[0]).toEqual({ x: -6, y: 0, z: 0 });
    expect(result.curve.points.at(-1)).toEqual({ x: 7, y: 0.4, z: 3 });
  });
});
