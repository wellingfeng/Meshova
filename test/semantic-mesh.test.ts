import { describe, it, expect } from "vitest";
import {
  box,
  bounds,
  boundaryLoopsForFaceLabels,
  connectedComponentFaceLabels,
  deformSemanticMesh,
  inferSemanticPartLabels,
  icosphere,
  liftPartMasksToFaceLabels,
  merge,
  parseOBJ,
  segmentMeshByConnectivity,
  semanticSplitMesh,
  semanticModelFromParts,
  semanticModelToNamedParts,
  semanticPartBounds,
  splitMeshByAiMasks,
  splitByFaceLabels,
  translateMesh,
  toViewerModel,
  vec3,
  withInferredSemanticPartLabels,
  type Mesh,
} from "../src/index.js";

function assertValid(m: Mesh) {
  expect(m.normals.length).toBe(m.positions.length);
  expect(m.uvs.length).toBe(m.positions.length);
  expect(m.indices.length % 3).toBe(0);
  for (const idx of m.indices) {
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(m.positions.length);
  }
}

function assertClosed(m: Mesh) {
  const edges = new Map<string, number>();
  const addEdge = (a: number, b: number) => {
    const key = a < b ? `${a}/${b}` : `${b}/${a}`;
    edges.set(key, (edges.get(key) ?? 0) + 1);
  };
  for (let i = 0; i < m.indices.length; i += 3) {
    const a = m.indices[i]!;
    const b = m.indices[i + 1]!;
    const c = m.indices[i + 2]!;
    addEdge(a, b);
    addEdge(b, c);
    addEdge(c, a);
  }
  for (const count of edges.values()) expect(count).toBe(2);
}

function yFaceLabels(m: Mesh): string[] {
  const labels: string[] = [];
  for (let f = 0; f < m.indices.length / 3; f++) {
    const a = m.positions[m.indices[f * 3]!]!;
    const b = m.positions[m.indices[f * 3 + 1]!]!;
    const c = m.positions[m.indices[f * 3 + 2]!]!;
    labels.push((a.y + b.y + c.y) / 3 >= 0 ? "head" : "body");
  }
  return labels;
}

describe("semantic deformable mesh", () => {
  it("stretches one semantic part without moving another", () => {
    const model = semanticModelFromParts([
      { name: "arm", mesh: translateMesh(box(0.4, 1, 0.4), vec3(-1, 0, 0)) },
      { name: "body", mesh: box(1, 1, 1) },
    ]);
    const bodyBefore = semanticPartBounds(model, "body");
    const armBefore = semanticPartBounds(model, "arm");

    const out = deformSemanticMesh(model, [{
      part: "arm",
      mode: "stretch",
      axis: "y",
      factor: 1.8,
      pivot: "min",
    }]);

    const armAfter = semanticPartBounds(out, "arm");
    const bodyAfter = semanticPartBounds(out, "body");
    expect(armAfter.max.y - armAfter.min.y).toBeCloseTo((armBefore.max.y - armBefore.min.y) * 1.8, 5);
    expect(armAfter.min.y).toBeCloseTo(armBefore.min.y, 5);
    expect(bodyAfter).toEqual(bodyBefore);
    assertValid(out.mesh);
  });

  it("thickens a part perpendicular to its long axis", () => {
    const model = semanticModelFromParts([
      { name: "leg", mesh: box(0.4, 2, 0.4) },
    ]);
    const before = semanticPartBounds(model, "leg");
    const out = deformSemanticMesh(model, [{
      part: "leg",
      mode: "thicken",
      axis: "y",
      factor: 1.5,
    }]);
    const after = semanticPartBounds(out, "leg");
    expect(after.max.x - after.min.x).toBeCloseTo((before.max.x - before.min.x) * 1.5, 5);
    expect(after.max.z - after.min.z).toBeCloseTo((before.max.z - before.min.z) * 1.5, 5);
    expect(after.max.y - after.min.y).toBeCloseTo(before.max.y - before.min.y, 5);
  });

  it("segments disconnected islands into semantic parts", () => {
    const a = box(1, 1, 1);
    const b = translateMesh(box(1, 1, 1), vec3(3, 0, 0));
    const parts = segmentMeshByConnectivity(merge(a, b));
    expect(parts).toHaveLength(2);
    expect(parts[0]!.vertices.length).toBe(parts[1]!.vertices.length);
  });

  it("converts semantic model back to named parts", () => {
    const model = semanticModelFromParts([
      { name: "head", mesh: translateMesh(box(1, 1, 1), vec3(0, 1.5, 0)) },
      { name: "torso", mesh: box(1, 2, 0.6) },
    ]);
    const out = semanticModelToNamedParts(model);
    expect(out.map((p) => p.name)).toEqual(["head", "torso"]);
    expect(out[0]!.mesh.indices.length).toBe(box(1, 1, 1).indices.length);
    expect(bounds(out[1]!.mesh).max.y).toBeCloseTo(1, 5);
  });

  it("infers readable labels for raw generated part names", () => {
    const parts = withInferredSemanticPartLabels([
      { name: "root.0", mesh: box(1.2, 2, 0.6) },
      { name: "root.1", mesh: translateMesh(box(0.7, 0.7, 0.7), vec3(0, 1.55, 0)) },
      { name: "root.2", mesh: translateMesh(box(0.25, 1.2, 0.25), vec3(-0.9, 0.2, 0)) },
    ], { category: "character" });

    const labels = inferSemanticPartLabels(parts, { category: "character" });
    expect(labels.map((item) => item.label)).toEqual(["躯干", "头部", "左侧手臂"]);

    const viewer = toViewerModel(parts, "labeled");
    expect(viewer.parts[0]!.label).toBe("躯干");
    expect(viewer.parts[0]!.metadata?.role).toBe("body");
    expect(viewer.parts[0]!.metadata?.labelSource).toBe("explicit");
  });

  it("does not classify prompt substrings such as MOCARNA as car labels", () => {
    const parts = withInferredSemanticPartLabels([
      { name: "body", label: "车身", metadata: { labelSource: "heuristic" }, mesh: box(1, 2, 0.5) },
    ], { prompt: "MOCARNA RĘKAWICA", replaceExistingLabels: true });

    expect(parts[0]!.label).toBe("主体");
    expect(parts[0]!.metadata?.labelSource).toBe("generic");
  });

  it("uses AI object labels for single imported parts", () => {
    const parts = withInferredSemanticPartLabels([
      { name: "body", mesh: box(1, 2, 0.5) },
    ], {
      analysis: { object: "灭霸手套", category: "equipment", confidence: 0.92 },
    });

    expect(parts[0]!.label).toBe("灭霸手套");
    expect(parts[0]!.metadata?.labelSource).toBe("ai");
  });

  it("only uses vehicle labels when category is explicit", () => {
    const parts = withInferredSemanticPartLabels([
      { name: "root.0", mesh: box(2, 0.5, 4) },
    ], { category: "vehicle" });

    expect(parts[0]!.label).toBe("车身");
  });

  it("splits one mesh by face labels and caps the cut surface", () => {
    const mesh = icosphere(1, 2);
    const labels = yFaceLabels(mesh);
    const loops = boundaryLoopsForFaceLabels(mesh, labels, "head");
    expect(loops.length).toBeGreaterThan(0);
    expect(loops.every((loop) => loop.closed)).toBe(true);

    const parts = splitByFaceLabels(mesh, labels, { cap: true });
    expect(parts.map((part) => part.label).sort()).toEqual(["头部", "身体"]);
    for (const part of parts) {
      assertValid(part.mesh);
      assertClosed(part.mesh);
      expect(part.metadata?.source).toBe("faceLabels");
    }
  });

  it("uses connected components as the default split, not human labels", () => {
    const mesh = merge(box(1, 1, 1), translateMesh(box(1, 1, 1), vec3(3, 0, 0)));
    const labels = connectedComponentFaceLabels(mesh);
    expect(new Set(labels).size).toBe(2);

    const parts = semanticSplitMesh(mesh, { cap: true });
    expect(parts).toHaveLength(2);
    expect(parts.map((part) => part.label)).toEqual(["部件 1", "部件 2"]);
    expect(parts.map((part) => part.metadata?.faceLabel)).toEqual(["component_1", "component_2"]);
    for (const part of parts) assertValid(part.mesh);
  });

  it("does not invent body parts for one connected mesh without an explicit preset", () => {
    const parts = semanticSplitMesh(icosphere(1, 1), { cap: true });
    expect(parts).toHaveLength(1);
    expect(parts[0]!.label).toBe("部件 1");
    expect(parts[0]!.metadata?.faceLabel).toBe("component_1");
  });

  it("can seed a coarse semantic split for a single upright mesh", () => {
    const parts = semanticSplitMesh(icosphere(1, 1), {
      preset: "upright-character",
      cap: true,
      minTriangles: 1,
    });
    expect(parts.some((part) => part.label === "头部")).toBe(true);
    expect(parts.some((part) => part.label === "身体")).toBe(true);
    for (const part of parts) assertValid(part.mesh);
  });

  it("lifts AI part masks through face ids and splits by the AI labels", () => {
    const mesh = icosphere(1, 2);
    const sourceLabels = yFaceLabels(mesh);
    const tris = mesh.indices.length / 3;
    const view = {
      width: tris,
      height: 1,
      faceIds: Array.from({ length: tris }, (_, i) => i),
      backgroundFaceId: -1,
    };
    const topMask = sourceLabels.map((label) => (label === "head" ? 1 : 0));
    const bottomMask = sourceLabels.map((label) => (label === "body" ? 1 : 0));

    const lifted = liftPartMasksToFaceLabels(mesh, [
      { partKey: "gauntlet_top", label: "手背", confidence: 0.9, view, mask: topMask },
      { partKey: "gauntlet_body", label: "腕套", confidence: 0.9, view, mask: bottomMask },
    ], {
      plan: {
        objectLabel: "灭霸手套",
        confidence: 0.9,
        source: "ai",
        parts: [
          { key: "gauntlet_top", label: "手背", confidence: 0.9, method: "cut" },
          { key: "gauntlet_body", label: "腕套", confidence: 0.9, method: "cut" },
        ],
      },
    });

    expect(new Set(lifted.labels)).toEqual(new Set(["gauntlet_top", "gauntlet_body"]));
    expect(lifted.displayLabels.gauntlet_top).toBe("手背");

    const split = splitMeshByAiMasks(mesh, [
      { partKey: "gauntlet_top", label: "手背", confidence: 0.9, view, mask: topMask },
      {
        partKey: "gauntlet_body",
        label: "腕套",
        confidence: 0.9,
        method: "regenerate",
        generationPrompt: "重新生成腕套内侧接口",
        view,
        mask: bottomMask,
      },
    ], { cap: true });

    expect(split.ok).toBe(true);
    expect(split.parts.map((part) => part.label).sort()).toEqual(["手背", "腕套"]);
    expect(split.parts.every((part) => part.metadata?.source === "aiGuidedSplit")).toBe(true);
    expect(split.parts.find((part) => part.label === "腕套")?.metadata?.splitMethod).toBe("regenerate");
    expect(split.parts.find((part) => part.label === "腕套")?.metadata?.generationPrompt).toBe("重新生成腕套内侧接口");
    for (const part of split.parts) assertValid(part.mesh);
  });
});

describe("OBJ import", () => {
  it("imports OBJ objects as named Meshova parts", () => {
    const obj = `
o arm
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
vt 0 0
vt 1 0
vt 1 1
vt 0 1
f 1/1 2/2 3/3 4/4
o body
v 2 0 0
v 3 0 0
v 3 1 0
v 2 1 0
f 5/1 6/2 7/3 8/4
`;
    const parts = parseOBJ(obj, { groupBy: "object", normals: "recompute" });
    expect(parts.map((p) => p.name)).toEqual(["arm", "body"]);
    expect(parts[0]!.mesh.indices.length).toBe(6);
    expect(parts[1]!.mesh.positions.length).toBe(4);
    assertValid(parts[0]!.mesh);
    assertValid(parts[1]!.mesh);
  });
});
