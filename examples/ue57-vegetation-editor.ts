/**
 * UE 5.7 PCG Vegetation Editor-inspired modifier pipeline.
 *
 * Recreates the course workflow with Meshova-native code and no copied assets:
 * skeleton -> carve -> gravity/scale -> remove branches -> mesh builder ->
 * bone reduction -> foliage distribution -> wind channels.
 *
 * Run: pnpm tsx examples/ue57-vegetation-editor.ts
 */
import {
  applyBranchGravity,
  branchesToMesh,
  carveBranches,
  gnarlCurve,
  growBranches,
  merge,
  polyline,
  reduceBranchBones,
  removeBranches,
  scatterLeaves,
  shapeBranchesToEnvelope,
  sweepBarkTube,
  toOBJScene,
  toViewerModel,
  translateMesh,
  vec3,
  windChannels,
  type Curve,
  type NamedPart,
} from "../src/index.js";

const fs = await import("node:fs");
const path = await import("node:path");

interface PlantVariant {
  id: string;
  label: string;
  seed: number;
  height: number;
  formBottom: number;
  gravity: number;
  prune: number;
  x: number;
  bark: [number, number, number];
  foliage: [number, number, number];
}

const variants: PlantVariant[] = [
  {
    id: "upright",
    label: "直立青年树",
    seed: 5701,
    height: 4.8,
    formBottom: 0.03,
    gravity: 0.04,
    prune: 0.1,
    x: -3.2,
    bark: [0.28, 0.17, 0.09],
    foliage: [0.14, 0.4, 0.12],
  },
  {
    id: "drooping",
    label: "重力垂枝树",
    seed: 5719,
    height: 5.3,
    formBottom: 0.08,
    gravity: 0.2,
    prune: 0.16,
    x: 0,
    bark: [0.32, 0.2, 0.11],
    foliage: [0.2, 0.48, 0.14],
  },
  {
    id: "shrub",
    label: "低矮密枝灌木",
    seed: 5743,
    height: 4.1,
    formBottom: 0.48,
    gravity: 0.08,
    prune: 0.08,
    x: 3.2,
    bark: [0.3, 0.19, 0.1],
    foliage: [0.1, 0.34, 0.11],
  },
];

const parts = variants.flatMap(buildVariant);
const modelId = "ue57-vegetation-editor";
const modelName = "UE5.7 植被编辑器流程复刻";
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });

const viewerModel = toViewerModel(parts, modelName);
fs.writeFileSync(path.join(outDir, `${modelId}.json`), JSON.stringify(viewerModel));
const obj = toOBJScene(parts, `${modelId}.mtl`);
fs.writeFileSync(path.join(outDir, `${modelId}.obj`), obj.obj);
fs.writeFileSync(path.join(outDir, `${modelId}.mtl`), obj.mtl);

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string; category?: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    manifest = { models: [] };
  }
}
manifest.models = manifest.models.filter((entry) => entry.id !== modelId);
manifest.models.push({ id: modelId, name: modelName, file: `${modelId}.json`, category: "植被" });
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`${modelId}: ${viewerModel.meta.parts} parts, ${viewerModel.meta.verts} verts, ${viewerModel.meta.tris} tris`);
console.log(`written: out/${modelId}.json + .obj/.mtl`);

function buildVariant(variant: PlantVariant): NamedPart[] {
  const heightScale = 1 - variant.formBottom;
  const rawTrunk = polyline([
    vec3(0, 0, 0),
    vec3(0.05, variant.height * 0.3, -0.03),
    vec3(-0.08, variant.height * 0.68, 0.04),
    vec3(0.04, variant.height, 0),
  ]);
  const baseTrunk = gnarlCurve(rawTrunk, {
    seed: variant.seed,
    amount: variant.height * 0.025,
    frequency: 5,
  });
  const trunk = scaleCurveY(baseTrunk, heightScale);
  const trunkRadius = 0.19;

  let branches = growBranches(baseTrunk, trunkRadius, {
    seed: variant.seed + 1,
    placement: "stratified-shuffled",
    levels: [
      { children: 8, startPct: 0.24, endPct: 0.94, angle: 50, lengthScale: 0.46, radiusScale: 0.4, phototropism: 0.34 },
      { children: 4, startPct: 0.26, endPct: 0.96, angle: 46, lengthScale: 0.44, radiusScale: 0.43, phototropism: 0.44 },
      { children: 3, startPct: 0.34, endPct: 0.98, angle: 40, lengthScale: 0.4, radiusScale: 0.4, phototropism: 0.52 },
    ],
    gnarl: 0.12,
    segments: 8,
  });
  branches = carveBranches(branches, { mode: "form-bottom", amount: variant.formBottom });
  branches = carveBranches(branches, { mode: "radius", amount: 0.12 });
  branches = applyBranchGravity(branches, { strength: variant.gravity, direction: vec3(0, -1, 0) });
  branches = shapeBranchesToEnvelope(branches, {
    shape: variant.id === "shrub" ? "ellipsoid" : "column",
    baseY: variant.height * heightScale * 0.12,
    height: variant.height * heightScale * 0.92,
    radiusX: variant.id === "shrub" ? 1.45 : 1.35,
    radiusZ: variant.id === "shrub" ? 1.3 : 1.2,
    strength: 0.72,
  });
  branches = removeBranches(branches, {
    mode: "random",
    amount: variant.prune,
    seed: variant.seed + 2,
    minDepth: 2,
  });
  branches = reduceBranchBones(branches, { reduction: 0.35, minPoints: 4 });

  const trunkMesh = sweepBarkTube(trunk, {
    sides: 9,
    radius: trunkRadius,
    radiusAt: (t) => (1 - 0.82 * t) * (1 + 0.25 * Math.pow(1 - t, 4)),
    barkUv: { longitudinalScale: 0.8, radialScale: 0.35 },
  });
  const branchMesh = branchesToMesh(branches, {
    sides: 7,
    minSides: 3,
    flare: true,
    flareScale: 1.55,
    barkUv: { longitudinalScale: 0.65, radialScale: 0.25 },
  });
  const wood = translateMesh(merge(trunkMesh, branchMesh), vec3(variant.x, 0, 0));
  const leaves = translateMesh(scatterLeaves(branches, {
    seed: variant.seed + 3,
    perBranch: variant.id === "shrub" ? 18 : 14,
    size: variant.id === "shrub" ? 0.16 : 0.21,
    sizeJitter: 0.25,
    scaleProfile: [{ t: 0, value: 0.62 }, { t: 0.6, value: 1.15 }, { t: 1, value: 0.82 }],
    densityProfile: [{ t: 0, value: 0.55 }, { t: 0.55, value: 1.15 }, { t: 1, value: 0.9 }],
    placement: "stratified-shuffled",
    shapeVariants: ["oval", "lanceolate", "round"],
    angle: variant.id === "drooping" ? -18 : 10,
    angleJitter: 22,
    upBias: 0.48,
    roundedNormals: true,
    curl: 0.12,
    fold: 0.08,
  }), vec3(variant.x, 0, 0));

  return [
    {
      name: `${variant.id}_wood`,
      label: `${variant.label} 枝干`,
      mesh: wood,
      color: variant.bark,
      windWeight: windChannels(wood, { kind: "wood", seed: variant.seed }).combined,
      metadata: modifierMetadata(variant, branches.length, "wood"),
    },
    {
      name: `${variant.id}_foliage`,
      label: `${variant.label} 叶冠`,
      mesh: leaves,
      color: variant.foliage,
      windWeight: windChannels(leaves, { kind: "foliage", seed: variant.seed + 4 }).combined,
      metadata: modifierMetadata(variant, branches.length, "foliage"),
    },
  ];
}

function scaleCurveY(curve: Curve, factor: number): Curve {
  return {
    ...curve,
    points: curve.points.map((point) => ({ ...point, y: point.y * factor })),
  };
}

function modifierMetadata(variant: PlantVariant, branches: number, role: string) {
  return {
    source: "UE5.7 PCG Vegetation Editor public preview study",
    method: "Meshova-native procedural approximation",
    variant: variant.id,
    role,
    branches,
    modifiers: ["carve", "gravity", "removeBranches", "meshBuilder", "boneReduction", "foliageDistributor", "wind"],
  };
}
