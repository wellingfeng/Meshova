import { describe, expect, it } from "vitest";
import {
  box,
  evalWorkflow,
  materializeWorkflow,
  parseWorkflowPreset,
  serializeWorkflowPreset,
  withWorkflowDefaults,
  workflowDefaults,
  type WorkflowPreset,
} from "../src/index.js";

const PRESET: WorkflowPreset = {
  schema: "meshova-workflow@1",
  id: "semantic-box",
  version: 1,
  metadata: { label: "语义盒体", tags: ["test"], scope: "model" },
  graph: {
    schema: "meshova-opplan@1",
    name: "semantic-box",
    nodes: [
      {
        id: "body",
        op: "box",
        args: [{ $param: "width" }, { $shared: "height" }, { $param: "depth" }],
        part: { name: "主体" },
      },
    ],
  },
  exposedParams: [
    { key: "width", label: "宽度", kind: "number", default: 2, min: 0.1, max: 10 },
    { key: "depth", label: "深度", kind: "number", default: 3, min: 0.1, max: 10 },
  ],
  sharedRefs: [{ key: "height", value: { $param: "width" }, label: "统一高度" }],
  execution: { seed: 7, debounceMs: 100 },
};

describe("WorkflowPreset v1", () => {
  it("把暴露参数与共享引用编译为 OpPlan", () => {
    const plan = materializeWorkflow(PRESET, { params: { width: 4 } });
    expect(plan.nodes[0]!.args).toEqual([{ $lit: 4 }, { $lit: 4 }, { $lit: 3 }]);
    const result = evalWorkflow(PRESET, { params: { width: 4 } });
    expect(result.ok).toBe(true);
    expect(result.parts[0]!.mesh.positions.some((point) => point.x === 2)).toBe(true);
  });

  it("解析资产槽与场景绑定", () => {
    const asset = box(1, 1, 1);
    const preset: WorkflowPreset = {
      ...PRESET,
      id: "bound-asset",
      graph: {
        schema: "meshova-opplan@1",
        name: "bound-asset",
        nodes: [{ id: "out", op: "pick", args: [{ $asset: "source" }, { $binding: "surface" }], part: { name: "资产" } }],
      },
      assetSlots: [{ key: "source", label: "源资产" }],
      bindings: [{ key: "surface", label: "承载面", kind: "surface" }],
    };
    const result = evalWorkflow(
      preset,
      { assets: { source: asset }, bindings: { surface: "ground" } },
      { pick: (mesh: unknown, binding: unknown) => binding === "ground" ? mesh : null },
    );
    expect(result.ok).toBe(true);
    expect(result.parts[0]!.mesh).toBe(asset);
  });

  it("默认值编辑保持输入不可变", () => {
    const edited = withWorkflowDefaults(PRESET, { width: 5 });
    expect(workflowDefaults(PRESET).width).toBe(2);
    expect(workflowDefaults(edited).width).toBe(5);
  });

  it("JSON 往返并校验参数", () => {
    const parsed = parseWorkflowPreset(serializeWorkflowPreset(PRESET));
    expect(parsed.id).toBe(PRESET.id);
    expect(() => materializeWorkflow(PRESET, { params: { width: 20 } })).toThrow(/above max/);
    expect(() => materializeWorkflow(PRESET, { params: { missing: 1 } })).toThrow(/unknown workflow param/);
  });
});
