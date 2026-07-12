import { describe, expect, it } from "vitest";
import {
  buildDrawableFenceParts,
  buildPathLightsParts,
  buildRegionGroveParts,
  bounds,
  type WorkflowModelContext,
} from "../src/index.js";

describe("Workflow showcase models", () => {
  it("路径绑定改变围栏范围并保留语义标签", () => {
    const context: WorkflowModelContext = {
      bindings: {
        path: { kind: "curve", points: [[0, 0, 0], [8, 0, 0]] },
      },
    };
    const parts = buildDrawableFenceParts({ postSpacing: 1, postHeight: 1.2, railRadius: 0.05 }, context);
    const fenceBounds = bounds(parts[0]!.mesh);
    expect(fenceBounds.max.x - fenceBounds.min.x).toBeGreaterThan(7.8);
    expect(parts.map((part) => part.label)).toEqual(["围栏立柱", "围栏横杆"]);
  });

  it("路径绑定的插值类型驱动真实几何", () => {
    const points = [[0, 0, 0], [2, 0, 4], [4, 0, -4], [6, 0, 0]] as const;
    const params = { postSpacing: 0.5, postHeight: 1.2, railRadius: 0.05 };
    const catmull = buildDrawableFenceParts(params, {
      bindings: { path: { kind: "curve", points, curveType: "catmull-rom", subdivisions: 8 } },
    });
    const bezier = buildDrawableFenceParts(params, {
      bindings: { path: { kind: "curve", points, curveType: "bezier", subdivisions: 8 } },
    });
    expect(catmull[1]!.mesh.positions).not.toEqual(bezier[1]!.mesh.positions);
  });

  it("区域林地使用确定性散布", () => {
    const params = { density: 0.7, spacing: 0.7, treeScale: 1, seed: 42 };
    const first = buildRegionGroveParts(params);
    const second = buildRegionGroveParts(params);
    expect(first.map((part) => [part.name, part.mesh.positions.length])).toEqual(
      second.map((part) => [part.name, part.mesh.positions.length]),
    );
    expect(first.some((part) => part.name === "tree_crowns")).toBe(true);
    expect(first.some((part) => part.name === "grove_boundary")).toBe(true);
  });

  it("路径灯带生成语义设施组", () => {
    const parts = buildPathLightsParts({ pathWidth: 0.9, propSpacing: 1.2, propOffset: 0.8, seed: 7 });
    expect(parts[0]!.label).toBe("曲线路面");
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts.every((part) => !/^root\.|^component_/i.test(part.label ?? part.name))).toBe(true);
  });
});
