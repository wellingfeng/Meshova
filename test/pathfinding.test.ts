import { describe, expect, it } from "vitest";
import { buildPcgPathfinding, makePointCloud, pathfind, sampleHeight, vec3 } from "../src/index.js";

function grid3x3(density = new Array<number>(9).fill(1)) {
  return makePointCloud({
    points: [
      vec3(0, 0, 0), vec3(1, 0, 0), vec3(2, 0, 0),
      vec3(0, 0, 1), vec3(1, 0, 1), vec3(2, 0, 1),
      vec3(0, 0, 2), vec3(1, 0, 2), vec3(2, 0, 2),
    ],
    attributes: { density },
  });
}

describe("pathfind", () => {
  it("finds the shortest route on a point grid", () => {
    const result = pathfind(grid3x3(), vec3(0, 0, 0), vec3(2, 0, 2), {
      searchDistance: 1.01,
      costMode: "distance",
    });

    expect(result.reachedGoal).toBe(true);
    expect(result.pointIndices).toHaveLength(5);
    expect(result.cost).toBeCloseTo(4, 6);
    expect(result.curve.points[0]).toEqual(vec3(0, 0, 0));
    expect(result.curve.points.at(-1)).toEqual(vec3(2, 0, 2));
  });

  it("keeps the smoothed display path draped over terrain", () => {
    const model = buildPcgPathfinding({ resolution: 41, pathLift: 0.4 });

    expect(model.route.reachedGoal).toBe(true);
    expect(model.parts.map((part) => part.label)).toEqual([
      "地形",
      "坡度偏好路径",
      "起点",
      "终点",
    ]);
    for (const point of model.displayCurve.points) {
      expect(point.y).toBeCloseTo(sampleHeight(model.terrain, point.x, point.z) + 0.4, 6);
    }
  });

  it("uses density as fitness and avoids low-fitness terrain", () => {
    const density = new Array<number>(9).fill(1);
    density[4] = 0.01;
    const result = pathfind(grid3x3(density), vec3(0, 0, 0), vec3(2, 0, 2), {
      searchDistance: 1.5,
      costMode: "fitness",
      costAttribute: "density",
      fitnessExponent: 2,
    });

    expect(result.reachedGoal).toBe(true);
    expect(result.pointIndices).not.toContain(4);
  });

  it("supports path-trace style edge rejection", () => {
    const cloud = makePointCloud({
      points: [vec3(0, 0, 0), vec3(1, 0, 1), vec3(2, 0, 0)],
    });
    const result = pathfind(cloud, vec3(0, 0, 0), vec3(2, 0, 0), {
      searchDistance: 2.1,
      canTraverse: ({ fromIndex, toIndex }) => !(fromIndex === 0 && toIndex === 2),
    });

    expect(result.reachedGoal).toBe(true);
    expect(result.pointIndices).toEqual([0, 1, 2]);
  });

  it("returns the closest explored point when partial paths are accepted", () => {
    const cloud = makePointCloud({
      points: [vec3(0, 0, 0), vec3(1, 0, 0), vec3(3, 0, 0)],
      attributes: { density: [1, 0, 1] },
    });
    const result = pathfind(cloud, vec3(0, 0, 0), vec3(3, 0, 0), {
      searchDistance: 1.1,
      costMode: "fitness",
      hardRejectBelow: 0.5,
      acceptPartialPath: true,
    });

    expect(result.reachedGoal).toBe(false);
    expect(result.pointIndices).toEqual([0]);
    expect(result.curve.points).toEqual([vec3(0, 0, 0)]);
  });

  it("rejects a missing fitness attribute", () => {
    const cloud = makePointCloud({ points: [vec3(0, 0, 0), vec3(1, 0, 0)] });
    expect(() => pathfind(cloud, cloud.points[0]!, cloud.points[1]!, {
      searchDistance: 2,
      costMode: "fitness",
    })).toThrow('cost attribute "density" does not exist');
  });
});
