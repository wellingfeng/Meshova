/**
 * 风格化程序化树 — 复刻 Blender geometry-nodes 教程
 * "Procedural Tree.blend" + "Leaf.blend" 的做法。
 *
 * 原 blend 图的手法（已解析节点图后对应到 Meshova API）：
 *   - 主干 = 贝塞尔曲线 + Noise Texture 扭曲（"Distorted Line" 组） → gnarl
 *   - 沿样条按 Spline Parameter 用 Float Curve 锥化半径      → branchRadiusProfile
 *   - 4 级 quadratic-bezier 子枝，Random Value 概率放置，
 *     Align Euler to Vector 沿法线对齐，Float Curve 缩放      → authoring.levels + profiles
 *   - 末端 Instance on Points 放叶片网格（Resample count≈5）   → leafDensity + leafShape
 *   - 低分辨率圆截面 + Subdivision Surface 平滑（风格化多边感）→ 低 branchCount / 圆润叶法线
 *
 * 我们不 import/复制 blend 里的网格与贴图，只按公开算法自研重写。
 *
 * Run: pnpm tsx examples/stylized-tree.ts
 */
import {
  tree,
  toOBJScene,
  toViewerModel,
  translateMesh,
  vec3,
  windChannels,
  type NamedPart,
  type PlantResult,
  type TreeOptions,
} from "../src/index.js";

const fs = await import("node:fs");
const path = await import("node:path");

interface Variant {
  id: string;
  name: string;
  bark: [number, number, number];
  leaf: [number, number, number];
  tree: TreeOptions;
}

// 贴近 blend 参考树的 4 级子枝配方（level 0 = 主干上的一级枝）。
const stylizedLevels: NonNullable<TreeOptions["authoring"]>["levels"] = [
  { count: 6, children: 4, angle: 46, lengthScale: 0.72, radiusScale: 0.55 },
  { count: 4, children: 3, angle: 52, lengthScale: 0.7, radiusScale: 0.52 },
  { count: 3, children: 2, angle: 58, lengthScale: 0.66, radiusScale: 0.5 },
  { count: 2, children: 0, angle: 64, lengthScale: 0.6, radiusScale: 0.48 },
];

const variants: Variant[] = [
  {
    id: "reference",
    name: "参考树",
    bark: [0.4, 0.28, 0.18],
    leaf: [0.24, 0.5, 0.2],
    tree: {
      seed: 614,
      height: 4.4,
      trunkRadius: 0.26,
      gnarl: 0.18,
      branchAngle: 46,
      branchPhototropism: 0.42,
      branchGravity: 0.06,
      leafDensity: 5,
      leafSize: 0.2,
      leafShape: "teardrop",
      leafCurl: 0.16,
      leafFold: 0.08,
      roundedLeafNormals: true,
      branchFlareScale: 1.4,
      authoring: { levels: stylizedLevels },
      // Float-Curve 半径/长度锥化，对应原图 Set Curve Radius 上的 Float Curve
      branchRadiusProfile: [{ t: 0, value: 0.92 }, { t: 1, value: 0.4 }],
      branchLengthProfile: { stops: [{ t: 0, value: 0.7 }, { t: 0.5, value: 1.05 }, { t: 1, value: 0.6 }], smooth: true },
      // 末端叶更密，对应原图叶片放在末级枝上
      leafDensityProfile: [{ t: 0, value: 0.2 }, { t: 0.6, value: 1.1 }, { t: 1, value: 1.3 }],
    },
  },
  {
    id: "windswept",
    name: "扭曲变体",
    bark: [0.36, 0.25, 0.17],
    leaf: [0.28, 0.52, 0.22],
    tree: {
      seed: 733,
      height: 4.8,
      trunkRadius: 0.24,
      gnarl: 0.34,
      branchAngle: 56,
      branchPhototropism: 0.3,
      branchGravity: 0.12,
      leafDensity: 5,
      leafSize: 0.18,
      leafShape: "oval",
      leafCurl: 0.22,
      leafFold: 0.12,
      roundedLeafNormals: true,
      branchFlareScale: 1.5,
      authoring: { levels: stylizedLevels },
      branchRadiusProfile: [{ t: 0, value: 0.9 }, { t: 1, value: 0.36 }],
      branchLengthProfile: { stops: [{ t: 0, value: 0.65 }, { t: 0.45, value: 1.15 }, { t: 1, value: 0.5 }], variance: 0.14, seed: 733 },
      branchAngleProfile: { value: 1.1, variance: 0.14, seed: 733, min: 0.7, max: 1.4 },
      leafDensityProfile: [{ t: 0, value: 0.18 }, { t: 0.6, value: 1.15 }, { t: 1, value: 1.35 }],
    },
  },
  {
    id: "bushy",
    name: "蓬松变体",
    bark: [0.42, 0.3, 0.2],
    leaf: [0.3, 0.56, 0.24],
    tree: {
      seed: 918,
      height: 4.0,
      trunkRadius: 0.28,
      gnarl: 0.14,
      branchAngle: 50,
      branchPhototropism: 0.5,
      branchGravity: 0.05,
      leafDensity: 7,
      leafSize: 0.2,
      leafShape: "round",
      leafCurl: 0.12,
      leafFold: 0.06,
      roundedLeafNormals: true,
      branchFlareScale: 1.45,
      authoring: {
        levels: [
          { count: 8, children: 5, angle: 44, lengthScale: 0.72, radiusScale: 0.55 },
          { count: 5, children: 4, angle: 50, lengthScale: 0.7, radiusScale: 0.52 },
          { count: 4, children: 3, angle: 56, lengthScale: 0.66, radiusScale: 0.5 },
          { count: 3, children: 0, angle: 62, lengthScale: 0.6, radiusScale: 0.48 },
        ],
      },
      branchRadiusProfile: [{ t: 0, value: 0.94 }, { t: 1, value: 0.42 }],
      branchLengthProfile: { stops: [{ t: 0, value: 0.72 }, { t: 0.5, value: 1.1 }, { t: 1, value: 0.66 }], smooth: true },
      leafDensityProfile: [{ t: 0, value: 0.25 }, { t: 0.6, value: 1.2 }, { t: 1, value: 1.4 }],
    },
  },
];

interface Scene {
  id: string;
  name: string;
  parts: NamedPart[];
}

const scenes: Scene[] = [];
const lineupParts: NamedPart[] = [];

for (const [i, variant] of variants.entries()) {
  const plant = tree(variant.tree);
  const parts = treeParts(variant, plant);
  scenes.push({ id: `stylized-tree-${variant.id}`, name: `风格化树 ${variant.name}`, parts });

  const x = (i - (variants.length - 1) * 0.5) * 3.6;
  for (const part of parts) {
    lineupParts.push({
      ...part,
      name: `${variant.id}_${part.name}`,
      label: `${variant.name} ${part.label ?? part.name}`,
      mesh: translateMesh(part.mesh, vec3(x, 0, 0)),
      metadata: { ...(part.metadata ?? {}), variant: variant.id, lineupX: x },
    });
  }
}

scenes.push({ id: "stylized-tree-lineup", name: "风格化树对比", parts: lineupParts });

const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string; category?: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    manifest = { models: [] };
  }
}

for (const scene of scenes) {
  const model = toViewerModel(scene.parts, scene.name);
  const file = `${scene.id}.json`;
  fs.writeFileSync(path.join(outDir, file), JSON.stringify(model));

  const obj = toOBJScene(scene.parts, `${scene.id}.mtl`);
  fs.writeFileSync(path.join(outDir, `${scene.id}.obj`), obj.obj);
  fs.writeFileSync(path.join(outDir, `${scene.id}.mtl`), obj.mtl);

  manifest.models = manifest.models.filter((m) => m.id !== scene.id);
  manifest.models.push({ id: scene.id, name: scene.name, file, category: "风格化树" });
  console.log(`${scene.id}: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log("written: out/stylized-tree-*.json + .obj/.mtl + out/models.json");

function treeParts(variant: Variant, plant: PlantResult): NamedPart[] {
  const out: NamedPart[] = [
    {
      name: "wood",
      label: `${variant.name} 枝干`,
      mesh: plant.wood,
      color: variant.bark,
      windWeight: windChannels(plant.wood, { kind: "wood", seed: variant.tree.seed ?? 1 }).combined,
      metadata: { generator: "gnarl-trunk + 4-level-bezier-branches (blend repro)", variant: variant.id, branches: plant.branches.length },
    },
  ];
  if (plant.leaves.positions.length > 0) {
    out.push({
      name: "foliage",
      label: `${variant.name} 叶冠`,
      mesh: plant.leaves,
      color: variant.leaf,
      windWeight: windChannels(plant.leaves, { kind: "foliage", seed: (variant.tree.seed ?? 1) + 1 }).combined,
      metadata: { generator: "shaped-leaf-cards (blend Leaf repro)", variant: variant.id },
    });
  }
  return out;
}
