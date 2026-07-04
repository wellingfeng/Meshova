/**
 * Custom SpeedTree-lite tree archetypes.
 *
 * Uses guide spines, canopy envelopes, curve parameters, branch flares,
 * procedural leaf shapes, bark features, and wind channels.
 *
 * Run: pnpm tsx examples/speedtree-custom-trees.ts
 */
import {
  buildTreeFromGuide,
  toOBJScene,
  toViewerModel,
  translateMesh,
  treeGuideFromSilhouette,
  vec3,
  windChannels,
  type NamedPart,
  type PlantResult,
  type TreeOptions,
} from "../src/index.js";

const fs = await import("node:fs");
const path = await import("node:path");

interface Archetype {
  id: string;
  name: string;
  bark: [number, number, number];
  leaf?: [number, number, number];
  guide: Parameters<typeof treeGuideFromSilhouette>[0];
  tree: TreeOptions;
}

interface Scene {
  id: string;
  name: string;
  parts: NamedPart[];
}

const archetypes: Archetype[] = [
  {
    id: "column-cypress",
    name: "柱形柏树",
    bark: [0.36, 0.25, 0.16],
    leaf: [0.06, 0.25, 0.14],
    guide: { height: 6.2, crownWidth: 1.25, crownDepth: 1.05, crownBasePct: 0.12, shape: "column" },
    tree: {
      seed: 307,
      trunkRadius: 0.18,
      gnarl: 0.04,
      branchCount: 9,
      depth: 3,
      branchAngle: 26,
      leafDensity: 4,
      leafSize: 0.1,
      leafShape: "lanceolate",
      leafCurl: 0.12,
      branchFlareScale: 1.35,
      branchLengthProfile: { stops: [{ t: 0, value: 0.55 }, { t: 0.55, value: 0.72 }, { t: 1, value: 0.38 }], smooth: true },
      branchAngleProfile: { value: 0.72, variance: 0.08, seed: 307, min: 0.48, max: 0.92 },
      branchCountProfile: [{ t: 0, value: 1.25 }, { t: 0.8, value: 0.7 }, { t: 1, value: 0.35 }],
      leafDensityProfile: [{ t: 0, value: 0.45 }, { t: 0.45, value: 1.25 }, { t: 1, value: 0.95 }],
      branchFeatures: { count: 5, size: 0.7 },
    },
  },
  {
    id: "baobab",
    name: "猴面包树",
    bark: [0.53, 0.42, 0.29],
    leaf: [0.16, 0.42, 0.18],
    guide: { height: 4.8, crownWidth: 4.5, crownDepth: 3.6, crownBasePct: 0.48, shape: "umbrella" },
    tree: {
      seed: 331,
      trunkRadius: 0.62,
      gnarl: 0.09,
      branchCount: 8,
      depth: 3,
      branchAngle: 66,
      leafDensity: 5,
      leafSize: 0.16,
      leafShape: "round",
      leafFold: 0.08,
      branchFlareScale: 2.2,
      branchLengthProfile: [{ t: 0, value: 0.35 }, { t: 0.55, value: 1.3 }, { t: 1, value: 0.75 }],
      branchRadiusProfile: [{ t: 0, value: 1.35 }, { t: 1, value: 0.6 }],
      leafDensityProfile: [{ t: 0, value: 0.15 }, { t: 0.68, value: 0.8 }, { t: 1, value: 1.15 }],
      branchFeatures: { count: 22, size: 1.3, minBranchRadius: 0.05 },
    },
  },
  {
    id: "windswept-coastal-pine",
    name: "风吹海岸松",
    bark: [0.28, 0.19, 0.13],
    leaf: [0.08, 0.29, 0.17],
    guide: { height: 5.2, crownWidth: 3.4, crownDepth: 1.6, trunkLean: 1.15, crownBasePct: 0.34, shape: "ellipsoid" },
    tree: {
      seed: 353,
      trunkRadius: 0.28,
      gnarl: 0.2,
      branchCount: 8,
      depth: 3,
      branchAngle: 52,
      leafDensity: 5,
      leafSize: 0.14,
      leafShape: "lanceolate",
      leafCurl: 0.2,
      leafFold: 0.15,
      branchFlareScale: 1.75,
      branchLengthProfile: { stops: [{ t: 0, value: 0.25 }, { t: 0.52, value: 1.25 }, { t: 1, value: 0.85 }], variance: 0.18, seed: 353, min: 0.1 },
      branchAngleProfile: [{ t: 0, value: 0.65 }, { t: 0.65, value: 1.2 }, { t: 1, value: 0.82 }],
      leafDensityProfile: [{ t: 0, value: 0.2 }, { t: 0.55, value: 1.0 }, { t: 1, value: 0.65 }],
      branchFeatures: { count: 13, kind: "scar", size: 0.95 },
    },
  },
  {
    id: "dead-snag",
    name: "枯树残干",
    bark: [0.48, 0.43, 0.35],
    guide: { height: 4.3, crownWidth: 2.4, crownDepth: 1.7, trunkLean: -0.28, crownBasePct: 0.24, shape: "cone" },
    tree: {
      seed: 379,
      trunkRadius: 0.34,
      gnarl: 0.28,
      branchCount: 8,
      depth: 2,
      branchAngle: 58,
      leaves: false,
      branchFlareScale: 1.55,
      branchLengthProfile: { stops: [{ t: 0, value: 0.95 }, { t: 0.58, value: 0.72 }, { t: 1, value: 0.22 }], variance: 0.22, seed: 379, min: 0.12 },
      branchRadiusProfile: [{ t: 0, value: 0.9 }, { t: 1, value: 0.42 }],
      branchCountProfile: [{ t: 0, value: 0.85 }, { t: 1, value: 0.35 }],
      branchFeatures: { count: 26, kind: "mixed", size: 1.1, minBranchRadius: 0.035 },
    },
  },
  {
    id: "blossom-tree",
    name: "开花小乔木",
    bark: [0.36, 0.23, 0.18],
    leaf: [0.96, 0.56, 0.72],
    guide: { height: 3.6, crownWidth: 3.5, crownDepth: 3.0, trunkLean: 0.18, crownBasePct: 0.26, shape: "ellipsoid" },
    tree: {
      seed: 401,
      trunkRadius: 0.2,
      gnarl: 0.14,
      branchCount: 8,
      depth: 3,
      branchAngle: 54,
      leafDensity: 6,
      leafSize: 0.12,
      leafShape: "teardrop",
      leafCurl: 0.1,
      leafFold: 0.06,
      branchFlareScale: 1.6,
      branchLengthProfile: { stops: [{ t: 0, value: 0.7 }, { t: 0.55, value: 1.1 }, { t: 1, value: 0.72 }], variance: 0.1, seed: 401 },
      leafDensityProfile: [{ t: 0, value: 0.25 }, { t: 0.55, value: 1.2 }, { t: 1, value: 1.35 }],
      branchFeatures: { count: 7, kind: "knot", size: 0.85 },
    },
  },
  {
    id: "bonsai-pine",
    name: "盆景松",
    bark: [0.27, 0.18, 0.12],
    leaf: [0.06, 0.2, 0.12],
    guide: { height: 1.65, crownWidth: 2.1, crownDepth: 1.35, trunkLean: -0.42, crownBasePct: 0.18, shape: "umbrella" },
    tree: {
      seed: 433,
      trunkRadius: 0.18,
      gnarl: 0.36,
      branchCount: 7,
      depth: 3,
      branchAngle: 72,
      leafDensity: 6,
      leafSize: 0.08,
      leafShape: "lanceolate",
      leafCurl: 0.24,
      leafFold: 0.12,
      branchFlareScale: 1.9,
      branchLengthProfile: { stops: [{ t: 0, value: 0.65 }, { t: 0.42, value: 1.35 }, { t: 1, value: 0.5 }], variance: 0.18, seed: 433, min: 0.18 },
      branchAngleProfile: { value: 1.15, variance: 0.16, seed: 433, min: 0.72, max: 1.45 },
      branchCountProfile: [{ t: 0, value: 1.1 }, { t: 0.7, value: 0.82 }, { t: 1, value: 0.35 }],
      leafDensityProfile: [{ t: 0, value: 0.15 }, { t: 0.55, value: 1.05 }, { t: 1, value: 0.9 }],
      branchFeatures: { count: 10, kind: "burl", size: 0.9 },
    },
  },
];

const scenes: Scene[] = [];
const lineupParts: NamedPart[] = [];

for (const [i, archetype] of archetypes.entries()) {
  const plant = buildTreeFromGuide(treeGuideFromSilhouette(archetype.guide), archetype.tree);
  const parts = treeParts(archetype, plant);
  scenes.push({
    id: `speedtree-custom-${archetype.id}`,
    name: `SpeedTree-lite ${archetype.name}`,
    parts,
  });

  const x = (i - (archetypes.length - 1) * 0.5) * 3.4;
  for (const part of parts) {
    lineupParts.push({
      ...part,
      name: `${archetype.id}_${part.name}`,
      label: `${archetype.name} ${part.label ?? part.name}`,
      mesh: translateMesh(part.mesh, vec3(x, 0, 0)),
      metadata: {
        ...(part.metadata ?? {}),
        archetype: archetype.id,
        lineupX: x,
      },
    });
  }
}

scenes.push({
  id: "speedtree-custom-lineup",
  name: "SpeedTree-lite 新树型对比",
  parts: lineupParts,
});

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
  manifest.models.push({ id: scene.id, name: scene.name, file, category: "SpeedTree-lite 新树型" });
  console.log(`${scene.id}: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log("written: out/speedtree-custom-*.json + .obj/.mtl + out/models.json");

function treeParts(archetype: Archetype, plant: PlantResult): NamedPart[] {
  const out: NamedPart[] = [
    {
      name: "wood",
      label: `${archetype.name} 枝干`,
      mesh: plant.wood,
      color: archetype.bark,
      windWeight: windChannels(plant.wood, { kind: "wood", seed: archetype.tree.seed ?? 1 }).combined,
      metadata: {
        generator: "guided-spline-sweep-branch-flare",
        archetype: archetype.id,
        branchCount: plant.branches.length,
      },
    },
  ];

  if (plant.leaves.positions.length > 0 && archetype.leaf) {
    out.push({
      name: "foliage",
      label: `${archetype.name} 叶冠`,
      mesh: plant.leaves,
      color: archetype.leaf,
      windWeight: windChannels(plant.leaves, { kind: "foliage", seed: (archetype.tree.seed ?? 1) + 1 }).combined,
      metadata: {
        generator: "procedural-shaped-leaf",
        archetype: archetype.id,
      },
    });
  }

  return out;
}
