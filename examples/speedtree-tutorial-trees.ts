/**
 * SpeedTree tutorial-inspired vegetation set.
 *
 * Local study target:
 * E:\BaiduNetdiskDownload\speedtree教程软件树库\SpeedTree教程26部
 *
 * These are Meshova-native procedural approximations of tutorial outcomes:
 * roots/vines, banana, cypress, pine/spruce, blossom trees, card foliage,
 * spherical tree, shrubs, grass, fern, and growth stages. No SpeedTree assets
 * or tutorial textures are copied.
 *
 * Run: pnpm tsx examples/speedtree-tutorial-trees.ts
 */
import {
  add,
  bezier,
  buildTreeFromGuide,
  conifer,
  frond,
  grass,
  makeMesh,
  makeRng,
  merge,
  normalize,
  palm,
  scale,
  shrub,
  smoothCurve,
  sweep,
  toOBJScene,
  toViewerModel,
  translateMesh,
  tree,
  treeGuideFromSilhouette,
  vec3,
  vec2,
  windChannels,
  type Mesh,
  type NamedPart,
  type PlantResult,
} from "../src/index.js";

const fs = await import("node:fs");
const path = await import("node:path");

interface TutorialArchetype {
  id: string;
  name: string;
  sourceGroup: string;
  seed: number;
  bark: [number, number, number];
  foliage?: [number, number, number];
  makeParts: (archetype: TutorialArchetype) => NamedPart[];
}

interface Scene {
  id: string;
  name: string;
  parts: NamedPart[];
}

const archetypes: TutorialArchetype[] = [
  {
    id: "root-vine-tree",
    name: "树根藤蔓树",
    sourceGroup: "SPEEDTREE 树根藤蔓制作",
    seed: 501,
    bark: [0.3, 0.2, 0.12],
    foliage: [0.12, 0.36, 0.14],
    makeParts: makeRootVineTree,
  },
  {
    id: "banana-tree",
    name: "芭蕉类树",
    sourceGroup: "SpeedTree芭蕉类树制作",
    seed: 523,
    bark: [0.42, 0.32, 0.18],
    foliage: [0.2, 0.52, 0.16],
    makeParts: makeBananaTree,
  },
  {
    id: "column-cypress",
    name: "柱形柏松",
    sourceGroup: "speedtree柏松制作",
    seed: 547,
    bark: [0.32, 0.22, 0.14],
    foliage: [0.05, 0.22, 0.12],
    makeParts: (a) => plantParts(a, buildTreeFromGuide(treeGuideFromSilhouette({
      height: 6.4,
      crownWidth: 1.15,
      crownDepth: 0.95,
      crownBasePct: 0.1,
      shape: "column",
    }), {
      seed: a.seed,
      trunkRadius: 0.16,
      gnarl: 0.04,
      branchCount: 10,
      depth: 3,
      branchAngle: 24,
      leafDensity: 6,
      leafSize: 0.08,
      leafShape: "lanceolate",
      branchLengthProfile: [{ t: 0, value: 0.5 }, { t: 0.55, value: 0.72 }, { t: 1, value: 0.36 }],
      leafDensityProfile: [{ t: 0, value: 0.65 }, { t: 0.6, value: 1.25 }, { t: 1, value: 0.9 }],
      branchFeatures: { count: 5, size: 0.7 },
    })),
  },
  {
    id: "layered-pine",
    name: "层状松树",
    sourceGroup: "speedtree松树类制作",
    seed: 571,
    bark: [0.25, 0.16, 0.1],
    foliage: [0.08, 0.28, 0.14],
    makeParts: (a) => plantParts(a, conifer({
      seed: a.seed,
      height: 5.8,
      trunkRadius: 0.18,
      whorls: 9,
      perWhorl: 7,
      needleDensity: 6,
    })),
  },
  {
    id: "narrow-spruce",
    name: "窄冠云杉",
    sourceGroup: "高级Speedtree教程 / 松柏类",
    seed: 593,
    bark: [0.22, 0.15, 0.1],
    foliage: [0.06, 0.21, 0.1],
    makeParts: (a) => plantParts(a, conifer({
      seed: a.seed,
      height: 6.6,
      trunkRadius: 0.15,
      whorls: 13,
      perWhorl: 8,
      needleDensity: 7,
    })),
  },
  {
    id: "blossom-tree",
    name: "花树",
    sourceGroup: "SpeedTree花树制作",
    seed: 607,
    bark: [0.34, 0.22, 0.16],
    foliage: [0.98, 0.58, 0.74],
    makeParts: (a) => plantParts(a, buildTreeFromGuide(treeGuideFromSilhouette({
      height: 3.7,
      crownWidth: 3.5,
      crownDepth: 3.1,
      trunkLean: 0.18,
      crownBasePct: 0.28,
      shape: "ellipsoid",
    }), {
      seed: a.seed,
      trunkRadius: 0.2,
      gnarl: 0.15,
      branchCount: 9,
      depth: 3,
      branchAngle: 56,
      leafDensity: 8,
      leafSize: 0.11,
      leafShape: "teardrop",
      leafCurl: 0.1,
      branchFlareScale: 1.65,
      branchFeatures: { count: 7, kind: "knot", size: 0.85 },
    })),
  },
  {
    id: "card-blossom-tree",
    name: "插片花树",
    sourceGroup: "SpeedTree花树制作插片方式",
    seed: 631,
    bark: [0.32, 0.2, 0.15],
    foliage: [0.96, 0.5, 0.66],
    makeParts: (a) => plantParts(a, buildTreeFromGuide(treeGuideFromSilhouette({
      height: 3.4,
      crownWidth: 3.7,
      crownDepth: 3.4,
      crownBasePct: 0.24,
      shape: "ellipsoid",
    }), {
      seed: a.seed,
      trunkRadius: 0.18,
      gnarl: 0.1,
      branchCount: 10,
      depth: 3,
      branchAngle: 52,
      leafDensity: 12,
      leafSize: 0.13,
      leafShape: "round",
      leafFold: 0.08,
      branchLengthProfile: [{ t: 0, value: 0.75 }, { t: 0.55, value: 1.18 }, { t: 1, value: 0.7 }],
      leafDensityProfile: [{ t: 0, value: 0.25 }, { t: 0.65, value: 1.35 }, { t: 1, value: 1.25 }],
    })),
  },
  {
    id: "root-force-tree",
    name: "力场根系树",
    sourceGroup: "SPEEDTREE树根制作及力场演示",
    seed: 653,
    bark: [0.36, 0.25, 0.16],
    foliage: [0.14, 0.34, 0.12],
    makeParts: makeRootForceTree,
  },
  {
    id: "large-leaf-plant",
    name: "大叶植物",
    sourceGroup: "SPEEDTREE叶子植物制作",
    seed: 677,
    bark: [0.25, 0.18, 0.1],
    foliage: [0.18, 0.48, 0.16],
    makeParts: (a) => plantParts(a, shrub({
      seed: a.seed,
      height: 1.55,
      stems: 7,
      spread: 0.22,
      stemRadius: 0.045,
      leafDensity: 7,
      leafSize: 0.28,
      leafShape: "round",
      leafCurl: 0.16,
      leafFold: 0.22,
    })),
  },
  {
    id: "spherical-topiary",
    name: "球型树",
    sourceGroup: "刀刀系列 speedtree 案例教程",
    seed: 701,
    bark: [0.31, 0.21, 0.13],
    foliage: [0.12, 0.37, 0.12],
    makeParts: (a) => plantParts(a, buildTreeFromGuide(treeGuideFromSilhouette({
      height: 3.2,
      crownWidth: 2.8,
      crownDepth: 2.8,
      crownBasePct: 0.38,
      shape: "ellipsoid",
    }), {
      seed: a.seed,
      trunkRadius: 0.16,
      gnarl: 0.04,
      branchCount: 8,
      depth: 3,
      branchAngle: 38,
      leafDensity: 14,
      leafSize: 0.1,
      leafShape: "round",
      branchLengthProfile: [{ t: 0, value: 0.35 }, { t: 0.65, value: 0.95 }, { t: 1, value: 0.5 }],
      leafDensityProfile: [{ t: 0, value: 0.2 }, { t: 0.55, value: 1.3 }, { t: 1, value: 1.1 }],
    })),
  },
  {
    id: "realistic-deciduous",
    name: "写实阔叶树",
    sourceGroup: "Digital Tutors - Modeling Realistic Trees",
    seed: 727,
    bark: [0.29, 0.2, 0.13],
    foliage: [0.15, 0.36, 0.12],
    makeParts: (a) => plantParts(a, buildTreeFromGuide(treeGuideFromSilhouette({
      height: 4.9,
      crownWidth: 4.1,
      crownDepth: 3.2,
      trunkLean: -0.22,
      crownBasePct: 0.22,
      shape: "ellipsoid",
    }), {
      seed: a.seed,
      trunkRadius: 0.34,
      gnarl: 0.2,
      branchCount: 9,
      depth: 3,
      branchAngle: 58,
      leafDensity: 10,
      leafSize: 0.17,
      leafShape: "oval",
      leafFold: 0.12,
      branchFlareScale: 2.1,
      branchLengthProfile: [{ t: 0, value: 1.35 }, { t: 0.56, value: 1.05 }, { t: 1, value: 0.5 }],
      branchRadiusProfile: [{ t: 0, value: 1.25 }, { t: 1, value: 0.65 }],
      branchFeatures: { count: 14, kind: "mixed", size: 1.15 },
    })),
  },
  {
    id: "cryengine-bush",
    name: "游戏灌木",
    sourceGroup: "3DMotive Cryengine Bush",
    seed: 751,
    bark: [0.23, 0.16, 0.1],
    foliage: [0.24, 0.5, 0.15],
    makeParts: (a) => plantParts(a, shrub({
      seed: a.seed,
      height: 1.25,
      stems: 9,
      spread: 0.42,
      stemRadius: 0.035,
      leafDensity: 13,
      leafSize: 0.12,
      leafShape: "oval",
      leafFold: 0.08,
    })),
  },
  {
    id: "ground-grass",
    name: "地表草丛",
    sourceGroup: "3DMotive / fx phd 草地",
    seed: 773,
    bark: [0.2, 0.16, 0.1],
    foliage: [0.28, 0.54, 0.16],
    makeParts: (a) => plantParts(a, grass({
      seed: a.seed,
      blades: 360,
      area: 2.5,
      height: 0.55,
      bend: 0.28,
      width: 0.01,
    })),
  },
  {
    id: "fern-plant",
    name: "蕨类植物",
    sourceGroup: "fx phd fern / plant lessons",
    seed: 797,
    bark: [0.24, 0.18, 0.1],
    foliage: [0.16, 0.44, 0.14],
    makeParts: makeFernPlant,
  },
  {
    id: "growth-sequence",
    name: "生长动画阶段树",
    sourceGroup: "SpeedTree植物生长动画制作",
    seed: 821,
    bark: [0.31, 0.21, 0.13],
    foliage: [0.17, 0.4, 0.13],
    makeParts: makeGrowthSequence,
  },
];

const scenes: Scene[] = [];
const lineupParts: NamedPart[] = [];

for (const [i, archetype] of archetypes.entries()) {
  const parts = archetype.makeParts(archetype);
  scenes.push({
    id: `speedtree-tutorial-${archetype.id}`,
    name: `SpeedTree教程复刻 ${archetype.name}`,
    parts,
  });

  const x = (i - (archetypes.length - 1) * 0.5) * 3.8;
  for (const part of parts) {
    lineupParts.push({
      ...part,
      name: `${archetype.id}_${part.name}`,
      label: `${archetype.name} ${part.label ?? part.name}`,
      mesh: translateMesh(part.mesh, vec3(x, 0, 0)),
      metadata: {
        ...(part.metadata ?? {}),
        tutorialArchetype: archetype.id,
        lineupX: x,
      },
    });
  }
}

scenes.push({
  id: "speedtree-tutorial-lineup",
  name: "SpeedTree教程复刻 树型合集",
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
  manifest.models.push({ id: scene.id, name: scene.name, file, category: "SpeedTree教程复刻" });
  console.log(`${scene.id}: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log("written: out/speedtree-tutorial-*.json + .obj/.mtl + out/models.json");

function plantParts(archetype: TutorialArchetype, plant: PlantResult): NamedPart[] {
  const parts: NamedPart[] = [];
  if (plant.wood.positions.length > 0) {
    parts.push({
      name: "wood",
      label: `${archetype.name} 枝干`,
      mesh: plant.wood,
      color: archetype.bark,
      windWeight: windChannels(plant.wood, { kind: "wood", seed: archetype.seed }).combined,
      metadata: metadataFor(archetype, "wood"),
    });
  }
  if (plant.leaves.positions.length > 0 && archetype.foliage) {
    parts.push({
      name: "foliage",
      label: `${archetype.name} 叶冠`,
      mesh: plant.leaves,
      color: archetype.foliage,
      windWeight: windChannels(plant.leaves, { kind: "foliage", seed: archetype.seed + 1 }).combined,
      metadata: metadataFor(archetype, "foliage"),
    });
  }
  return parts;
}

function makeRootVineTree(archetype: TutorialArchetype): NamedPart[] {
  const base = tree({
    seed: archetype.seed,
    height: 3.9,
    trunkRadius: 0.34,
    gnarl: 0.28,
    branchCount: 7,
    depth: 2,
    branchAngle: 66,
    leafDensity: 4,
    leafSize: 0.13,
    leafShape: "oval",
    branchFlareScale: 2.2,
    branchLengthProfile: [{ t: 0, value: 1.2 }, { t: 0.55, value: 0.9 }, { t: 1, value: 0.45 }],
    branchFeatures: { count: 18, kind: "mixed", size: 1.1 },
  });
  const roots = rootSystem(archetype.seed + 11, 10, 1.45, 0.095);
  const vines = vineSystem(archetype.seed + 17, 7, 3.0, 0.032);
  return plantParts(archetype, {
    ...base,
    wood: merge(base.wood, roots, vines),
  });
}

function makeRootForceTree(archetype: TutorialArchetype): NamedPart[] {
  const base = buildTreeFromGuide(treeGuideFromSilhouette({
    height: 4.2,
    crownWidth: 2.7,
    crownDepth: 1.9,
    trunkLean: 0.72,
    crownBasePct: 0.28,
    shape: "ellipsoid",
  }), {
    seed: archetype.seed,
    trunkRadius: 0.28,
    gnarl: 0.32,
    branchCount: 7,
    depth: 3,
    branchAngle: 60,
    leafDensity: 6,
    leafSize: 0.13,
    leafShape: "lanceolate",
    leafCurl: 0.18,
    branchFlareScale: 2.1,
    branchLengthProfile: { stops: [{ t: 0, value: 0.42 }, { t: 0.58, value: 1.25 }, { t: 1, value: 0.75 }], variance: 0.18, seed: archetype.seed },
    branchFeatures: { count: 12, kind: "scar", size: 1.0 },
  });
  const windRoots = rootSystem(archetype.seed + 19, 9, 1.65, 0.08, 0.55);
  return plantParts(archetype, {
    ...base,
    wood: merge(base.wood, windRoots),
  });
}

function makeBananaTree(archetype: TutorialArchetype): NamedPart[] {
  const plant = bananaPlant(archetype.seed);
  return plantParts(archetype, plant);
}

function makeFernPlant(archetype: TutorialArchetype): NamedPart[] {
  const rng = makeRng(archetype.seed);
  const stems: Mesh[] = [];
  const blades: Mesh[] = [];
  const count = 12;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rng.next() * 0.3;
    const len = 0.9 + rng.next() * 0.45;
    const base = vec3(0, 0.05, 0);
    const dir = vec3(Math.cos(a), 0, Math.sin(a));
    const rachis = bezier(
      base,
      add(base, vec3(dir.x * len * 0.18, 0.28, dir.z * len * 0.18)),
      add(base, vec3(dir.x * len * 0.64, 0.38, dir.z * len * 0.64)),
      add(base, vec3(dir.x * len, 0.16 + rng.next() * 0.18, dir.z * len)),
      10,
    );
    const fern = frond(rachis, {
      seed: (rng.next() * 1e9) | 0,
      pairs: 18,
      leafletLength: 0.18,
      leafletWidth: 0.035,
      angle: 62,
      rachisRadius: 0.011,
      tipScale: 0.2,
    });
    stems.push(fern.stem);
    blades.push(fern.blades);
  }
  return plantParts(archetype, {
    wood: merge(...stems),
    leaves: merge(...blades),
    branches: [],
  });
}

function makeGrowthSequence(archetype: TutorialArchetype): NamedPart[] {
  const parts: NamedPart[] = [];
  const stages = [0.25, 0.48, 0.74, 1.0];
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i]!;
    const plant = tree({
      seed: archetype.seed + i * 17,
      height: 4.2 * s,
      trunkRadius: 0.27 * (0.55 + s * 0.45),
      gnarl: 0.12,
      branchCount: Math.max(3, Math.round(8 * s)),
      depth: s < 0.5 ? 1 : s < 0.75 ? 2 : 3,
      branchAngle: 52,
      leafDensity: Math.round(9 * s),
      leafSize: 0.16,
      leafShape: "oval",
      branchFlareScale: 1.7,
    });
    const x = (i - 1.5) * 1.35;
    for (const part of plantParts(archetype, plant)) {
      parts.push({
        ...part,
        name: `${part.name}_stage_${i + 1}`,
        label: `${archetype.name} ${i + 1}`,
        mesh: translateMesh(part.mesh, vec3(x, 0, 0)),
        metadata: {
          ...(part.metadata ?? {}),
          growthStage: s,
        },
      });
    }
  }
  return parts;
}

function bananaPlant(seed: number): PlantResult {
  const rng = makeRng(seed);
  const height = 3.2;
  const trunk = sweep(bezier(
    vec3(0, 0, 0),
    vec3(0.06, height * 0.38, -0.03),
    vec3(0.18, height * 0.72, 0.06),
    vec3(0.16, height, 0.04),
    10,
  ), {
    sides: 9,
    radius: 0.19,
    radiusAt: (t) => (1 - 0.45 * t) * (1 + 0.05 * Math.sin(t * 34)),
    caps: true,
  });

  const crown = vec3(0.16, height, 0.04);
  const leaves: Mesh[] = [];
  const frondCount = 9;
  for (let i = 0; i < frondCount; i++) {
    const t = i / frondCount;
    const a = t * Math.PI * 2 + rng.next() * 0.16;
    const dir = normalize(vec3(Math.cos(a), 0, Math.sin(a)));
    const base = add(add(crown, scale(dir, 0.18 + 0.035 * (i % 3))), vec3(0, 0.04 * (i % 4), 0));
    const lift = 0.28 + rng.next() * 0.08;
    const droop = 0.16 + t * 0.18 + rng.next() * 0.06;
    const length = 1.35 + rng.next() * 0.32;
    const width = 0.32 + rng.next() * 0.07;
    const petiole = sweep(bezier(
      crown,
      add(crown, vec3(dir.x * 0.08, 0.08, dir.z * 0.08)),
      add(base, vec3(-dir.x * 0.05, 0.03, -dir.z * 0.05)),
      base,
      4,
    ), { sides: 5, radius: 0.025, radiusAt: (u) => 1 - 0.55 * u, caps: false });
    leaves.push(petiole, doubleSided(bananaLeafMesh(base, dir, width, length, { lift, droop, fold: 0.22, segments: 14 })));
  }

  return {
    wood: trunk,
    leaves: merge(...leaves),
    branches: [],
  };
}

function bananaLeafMesh(
  base: ReturnType<typeof vec3>,
  dir: ReturnType<typeof vec3>,
  width: number,
  length: number,
  opts: { lift?: number; droop?: number; fold?: number; segments?: number } = {},
): Mesh {
  const segments = Math.max(4, Math.floor(opts.segments ?? 12));
  const d = normalize(dir);
  const side = normalize(vec3(-d.z, 0, d.x));
  const lift = opts.lift ?? 0.28;
  const droop = opts.droop ?? 0.2;
  const fold = opts.fold ?? 0.2;
  const positions: ReturnType<typeof vec3>[] = [];
  const normals: ReturnType<typeof vec3>[] = [];
  const uvs: ReturnType<typeof vec2>[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const profile = Math.max(0.025, Math.pow(Math.sin(Math.PI * t), 0.55) * (1 - t * 0.16));
    const hw = width * 0.5 * profile;
    const y = length * (lift * Math.sin(Math.PI * t) - droop * Math.pow(t, 1.65));
    const rib = add(add(base, scale(d, length * t)), vec3(0, y, 0));
    const nt = Math.min(1, t + 1 / segments);
    const nextY = length * (lift * Math.sin(Math.PI * nt) - droop * Math.pow(nt, 1.65));
    const tangent = normalize(add(scale(d, length / segments), vec3(0, nextY - y, 0)));
    const n = normalize(crossVec(side, tangent));
    for (const sign of [-1, 1] as const) {
      const edgeDroop = -fold * width * profile * profile;
      positions.push(add(add(rib, scale(side, sign * hw)), vec3(0, edgeDroop, 0)));
      normals.push(n);
      uvs.push(vec2(sign < 0 ? 0 : 1, t));
    }
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, c, b, d, c);
  }
  return makeMesh({ positions, normals, uvs, indices });
}

function crossVec(a: ReturnType<typeof vec3>, b: ReturnType<typeof vec3>): ReturnType<typeof vec3> {
  return vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}

function doubleSided(mesh: Mesh): Mesh {
  const offset = mesh.positions.length;
  const indices = mesh.indices.slice();
  for (let i = 0; i < mesh.indices.length; i += 3) {
    indices.push(offset + mesh.indices[i]!, offset + mesh.indices[i + 2]!, offset + mesh.indices[i + 1]!);
  }
  return {
    positions: [...mesh.positions, ...mesh.positions],
    normals: [...mesh.normals, ...mesh.normals.map((n) => scale(n, -1))],
    uvs: [...mesh.uvs, ...mesh.uvs],
    indices,
  };
}

function rootSystem(seed: number, count: number, radius: number, tubeRadius: number, lean = 0): Mesh {
  const rng = makeRng(seed);
  const roots: Mesh[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rng.next() * 0.25 + lean;
    const len = radius * (0.65 + rng.next() * 0.55);
    const yLift = 0.12 + rng.next() * 0.12;
    const curve = bezier(
      vec3(0, 0.14, 0),
      vec3(Math.cos(a) * len * 0.24, yLift, Math.sin(a) * len * 0.24),
      vec3(Math.cos(a) * len * 0.7, 0.05, Math.sin(a) * len * 0.7),
      vec3(Math.cos(a) * len, 0.02, Math.sin(a) * len),
      8,
    );
    roots.push(sweep(curve, {
      sides: 6,
      radius: tubeRadius * (0.8 + rng.next() * 0.5),
      radiusAt: (t) => 1 - 0.82 * t,
      caps: false,
    }));
  }
  return merge(...roots);
}

function vineSystem(seed: number, count: number, height: number, tubeRadius: number): Mesh {
  const rng = makeRng(seed);
  const vines: Mesh[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rng.next() * 0.35;
    const r = 0.32 + rng.next() * 0.22;
    const pts = [];
    for (let j = 0; j <= 9; j++) {
      const t = j / 9;
      const twist = a + t * Math.PI * (1.1 + rng.next() * 0.8);
      pts.push(vec3(Math.cos(twist) * r * (1 - t * 0.2), t * height, Math.sin(twist) * r * (1 - t * 0.2)));
    }
    vines.push(sweep(smoothCurve({ points: pts, closed: false }, 3), {
      sides: 5,
      radius: tubeRadius * (0.75 + rng.next() * 0.5),
      radiusAt: (t) => 1 - 0.5 * t,
      caps: false,
    }));
  }
  return merge(...vines);
}

function metadataFor(archetype: TutorialArchetype, role: string) {
  return {
    source: "local SpeedTree tutorial study",
    sourceGroup: archetype.sourceGroup,
    archetype: archetype.id,
    role,
    method: "procedural Meshova approximation",
  };
}
