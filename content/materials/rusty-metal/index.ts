import { defineMaterial, corrodedMetalFields, type ContentParams } from "meshova/pcg";

export type RustyMetalParams = ContentParams & {
  seed: number;
  rust: number;
  scale: number;
  roughness: number;
};

export const rustyMetalMaterial = defineMaterial({
  kind: "material",
  id: "rustyMetal",
  version: "1.0.0",
  metadata: {
    name: "锈蚀金属",
    category: "metal-industrial",
    categoryLabel: "金属与工业",
    tags: ["金属", "锈蚀", "风化"],
    description: "金属底层、点蚀、锈层和粗糙度联动的程序化 PBR 材质。",
  },
  params: [
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 7 },
    { key: "rust", label: "锈蚀覆盖", min: -0.5, max: 0.45, step: 0.01, default: 0.15 },
    { key: "scale", label: "斑驳尺度", min: 1, max: 12, step: 0.1, default: 4 },
    { key: "roughness", label: "粗糙度偏移", min: -0.25, max: 0.25, step: 0.01, default: 0 },
  ],
  defaultParams: { seed: 7, rust: 0.15, scale: 4, roughness: 0 } satisfies RustyMetalParams,
  preview: { camera: "persp", background: "studio" },
  build(params) {
    return corrodedMetalFields(params);
  },
});

export default rustyMetalMaterial;
