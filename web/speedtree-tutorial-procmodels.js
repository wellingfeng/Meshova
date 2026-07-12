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
  translateMesh,
  tree,
  treeGuideFromSilhouette,
  vec3,
  vec2,
  windChannels,
} from "/dist/index.js?v=cloth2";

const TUTORIAL_SCHEMA = [
  { key: "heightScale", label: "整体高度", min: 0.5, max: 1.8, step: 0.05, default: 1 },
  { key: "crownScale", label: "树冠/展开", min: 0.45, max: 1.8, step: 0.05, default: 1 },
  { key: "trunkScale", label: "枝干粗细", min: 0.45, max: 1.8, step: 0.05, default: 1 },
  { key: "foliageScale", label: "叶量/草量", min: 0, max: 1.8, step: 0.05, default: 1 },
  { key: "bend", label: "弯曲/力场", min: -1, max: 1, step: 0.05, default: 0 },
  { key: "seedOffset", label: "种子偏移", min: 0, max: 200, step: 1, default: 0 },
];

const LINEUP_SCHEMA = [
  { key: "heightScale", label: "整体高度", min: 0.5, max: 1.5, step: 0.05, default: 1 },
  { key: "crownScale", label: "树冠/展开", min: 0.6, max: 1.5, step: 0.05, default: 1 },
  { key: "foliageScale", label: "叶量/草量", min: 0, max: 1.5, step: 0.05, default: 0.85 },
  { key: "spacing", label: "间距", min: 2.6, max: 6.2, step: 0.1, default: 3.8 },
  { key: "seedOffset", label: "种子偏移", min: 0, max: 200, step: 1, default: 0 },
];

function surfPart(name, mesh, type, params) {
  return {
    name,
    mesh,
    color: (params && params.color) || (params && params.tint) || [0.8, 0.8, 0.8],
    surface: params ? { type, params } : { type },
  };
}

function speedTreePart(name, mesh, type, params, windKind, seed) {
  const sp = surfPart(name, mesh, type, params);
  sp.windWeight = windChannels(mesh, { kind: windKind, seed }).combined;
  return sp;
}

function seedOf(archetype, p) {
  return Math.round(archetype.seed + (p.seedOffset || 0));
}

function hs(base, p) {
  return base * (p.heightScale ?? 1);
}

function cs(base, p) {
  return base * (p.crownScale ?? 1);
}

function ts(base, p) {
  return Math.max(0.003, base * (p.trunkScale ?? 1));
}

function fs(base, p) {
  return Math.max(0, Math.round(base * (p.foliageScale ?? 1)));
}

function metadataFor(archetype, role) {
  return {
    source: "local SpeedTree tutorial study",
    sourceGroup: archetype.sourceGroup,
    archetype: archetype.id,
    role,
    method: "procedural Meshova approximation",
  };
}

function plantParts(archetype, plant, p, seed = seedOf(archetype, p)) {
  const parts = [];
  if (plant.wood.positions.length > 0) {
    const wood = speedTreePart("wood", plant.wood, "wood", { color: archetype.bark, roughness: 0.9 }, "wood", seed);
    wood.label = `${archetype.name} 枝干`;
    wood.metadata = metadataFor(archetype, "wood");
    parts.push(wood);
  }
  if (plant.leaves.positions.length > 0 && archetype.foliage && (p.foliageScale ?? 1) > 0) {
    const foliage = speedTreePart("foliage", plant.leaves, "fabric", { color: archetype.foliage, roughness: 0.72 }, "foliage", seed + 1);
    foliage.label = `${archetype.name} 叶冠`;
    foliage.metadata = metadataFor(archetype, "foliage");
    parts.push(foliage);
  }
  return parts;
}

function guidedPlant(archetype, p, guide, opts) {
  const seed = seedOf(archetype, p);
  const tunedGuide = {
    ...guide,
    height: hs(guide.height, p),
    crownWidth: cs(guide.crownWidth, p),
    crownDepth: cs(guide.crownDepth, p),
    trunkLean: (guide.trunkLean || 0) + (p.bend || 0) * 0.35,
  };
  const tunedOpts = {
    ...opts,
    seed,
    trunkRadius: ts(opts.trunkRadius || 0.2, p),
    branchCount: Math.max(1, Math.round((opts.branchCount || 7) * Math.max(0.35, p.crownScale ?? 1))),
    leafDensity: fs(opts.leafDensity || 0, p),
    gnarl: Math.max(0, (opts.gnarl || 0) + Math.abs(p.bend || 0) * 0.08),
    leaves: fs(opts.leafDensity || 0, p) > 0,
  };
  return plantParts(archetype, buildTreeFromGuide(treeGuideFromSilhouette(tunedGuide), tunedOpts), p, seed);
}

function treePlant(archetype, p, opts) {
  const seed = seedOf(archetype, p);
  return plantParts(archetype, tree({
    ...opts,
    seed,
    height: hs(opts.height, p),
    trunkRadius: ts(opts.trunkRadius || 0.2, p),
    branchCount: Math.max(1, Math.round((opts.branchCount || 7) * Math.max(0.35, p.crownScale ?? 1))),
    leafDensity: fs(opts.leafDensity || 0, p),
    gnarl: Math.max(0, (opts.gnarl || 0) + Math.abs(p.bend || 0) * 0.08),
    leaves: fs(opts.leafDensity || 0, p) > 0,
  }), p, seed);
}

function coniferPlant(archetype, p, opts) {
  const seed = seedOf(archetype, p);
  return plantParts(archetype, conifer({
    ...opts,
    seed,
    height: hs(opts.height, p),
    trunkRadius: ts(opts.trunkRadius || 0.16, p),
    whorls: Math.max(2, Math.round((opts.whorls || 9) * (p.heightScale ?? 1))),
    perWhorl: Math.max(2, Math.round((opts.perWhorl || 7) * Math.max(0.45, p.crownScale ?? 1))),
    needleDensity: Math.max(0, fs(opts.needleDensity || 5, p)),
  }), p, seed);
}

function shrubPlant(archetype, p, opts) {
  const seed = seedOf(archetype, p);
  return plantParts(archetype, shrub({
    ...opts,
    seed,
    height: hs(opts.height, p),
    spread: cs(opts.spread || 0.25, p),
    stemRadius: ts(opts.stemRadius || 0.04, p),
    stems: Math.max(1, Math.round((opts.stems || 6) * Math.max(0.45, p.crownScale ?? 1))),
    leafDensity: fs(opts.leafDensity || 8, p),
  }), p, seed);
}

function grassPlant(archetype, p, opts) {
  const seed = seedOf(archetype, p);
  return plantParts(archetype, grass({
    ...opts,
    seed,
    blades: Math.max(0, fs(opts.blades || 300, p)),
    area: cs(opts.area || 2.5, p),
    height: hs(opts.height || 0.5, p),
    bend: Math.max(0, (opts.bend || 0.2) + (p.bend || 0) * 0.12),
  }), p, seed);
}

function doubleSided(mesh) {
  const offset = mesh.positions.length;
  const indices = mesh.indices.slice();
  for (let i = 0; i < mesh.indices.length; i += 3) {
    indices.push(offset + mesh.indices[i], offset + mesh.indices[i + 2], offset + mesh.indices[i + 1]);
  }
  return {
    positions: [...mesh.positions, ...mesh.positions],
    normals: [...mesh.normals, ...mesh.normals.map((n) => scale(n, -1))],
    uvs: [...mesh.uvs, ...mesh.uvs],
    indices,
  };
}

function rootSystem(seed, count, radius, tubeRadius, lean = 0) {
  const rng = makeRng(seed);
  const roots = [];
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

function vineSystem(seed, count, height, tubeRadius) {
  const rng = makeRng(seed);
  const vines = [];
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

function bananaPlant(seed, p) {
  const rng = makeRng(seed);
  const height = hs(3.2, p);
  const trunk = sweep(bezier(
    vec3(0, 0, 0),
    vec3(0.06 + (p.bend || 0) * 0.12, height * 0.38, -0.03),
    vec3(0.18 + (p.bend || 0) * 0.18, height * 0.72, 0.06),
    vec3(0.16 + (p.bend || 0) * 0.24, height, 0.04),
    10,
  ), {
    sides: 9,
    radius: ts(0.19, p),
    radiusAt: (t) => (1 - 0.45 * t) * (1 + 0.05 * Math.sin(t * 34)),
    caps: true,
  });
  const crown = vec3(0.16 + (p.bend || 0) * 0.24, height, 0.04);
  const leaves = [];
  const frondCount = Math.max(0, fs(9, p));
  for (let i = 0; i < frondCount; i++) {
    const t = i / Math.max(1, frondCount);
    const a = t * Math.PI * 2 + rng.next() * 0.16;
    const dir = normalize(vec3(Math.cos(a), 0, Math.sin(a)));
    const base = add(add(crown, scale(dir, 0.18 + 0.035 * (i % 3))), vec3(0, 0.04 * (i % 4), 0));
    const lift = 0.28 + rng.next() * 0.08;
    const droop = 0.16 + t * 0.18 + rng.next() * 0.06;
    const length = hs(1.35 + rng.next() * 0.32, p);
    const width = cs(0.32 + rng.next() * 0.07, p);
    const petiole = sweep(bezier(
      crown,
      add(crown, vec3(dir.x * 0.08, 0.08, dir.z * 0.08)),
      add(base, vec3(-dir.x * 0.05, 0.03, -dir.z * 0.05)),
      base,
      4,
    ), { sides: 5, radius: ts(0.025, p), radiusAt: (u) => 1 - 0.55 * u, caps: false });
    leaves.push(petiole, doubleSided(bananaLeafMesh(base, dir, width, length, { lift, droop, fold: 0.22, segments: 14 })));
  }
  return { wood: trunk, leaves: leaves.length ? merge(...leaves) : merge(), branches: [] };
}

function bananaLeafMesh(base, dir, width, length, opts = {}) {
  const segments = Math.max(4, Math.floor(opts.segments ?? 12));
  const d = normalize(dir);
  const side = normalize(vec3(-d.z, 0, d.x));
  const lift = opts.lift ?? 0.28;
  const droop = opts.droop ?? 0.2;
  const fold = opts.fold ?? 0.2;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const profile = Math.max(0.025, Math.pow(Math.sin(Math.PI * t), 0.55) * (1 - t * 0.16));
    const hw = width * 0.5 * profile;
    const y = length * (lift * Math.sin(Math.PI * t) - droop * Math.pow(t, 1.65));
    const rib = add(add(base, scale(d, length * t)), vec3(0, y, 0));
    const nextY = length * (lift * Math.sin(Math.PI * Math.min(1, t + 1 / segments)) - droop * Math.pow(Math.min(1, t + 1 / segments), 1.65));
    const tangent = normalize(add(scale(d, length / segments), vec3(0, nextY - y, 0)));
    const n = normalize(crossVec(side, tangent));
    for (const sign of [-1, 1]) {
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

function crossVec(a, b) {
  return vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}

function makeRootVineTree(archetype, p) {
  const seed = seedOf(archetype, p);
  const base = tree({
    seed,
    height: hs(3.9, p),
    trunkRadius: ts(0.34, p),
    gnarl: 0.28 + Math.abs(p.bend || 0) * 0.1,
    branchCount: Math.max(3, Math.round(7 * Math.max(0.45, p.crownScale ?? 1))),
    depth: 2,
    branchAngle: 66,
    leafDensity: fs(4, p),
    leafSize: cs(0.13, p),
    leafShape: "oval",
    branchFlareScale: 2.2 * (p.trunkScale ?? 1),
    branchLengthProfile: [{ t: 0, value: 1.2 }, { t: 0.55, value: 0.9 }, { t: 1, value: 0.45 }],
    branchFeatures: { count: 18, kind: "mixed", size: 1.1 },
  });
  const roots = rootSystem(seed + 11, Math.max(3, fs(10, p)), cs(1.45, p), ts(0.095, p), p.bend || 0);
  const vines = vineSystem(seed + 17, Math.max(0, fs(7, p)), hs(3.0, p), ts(0.032, p));
  return plantParts(archetype, { ...base, wood: merge(base.wood, roots, vines) }, p, seed);
}

function makeRootForceTree(archetype, p) {
  const seed = seedOf(archetype, p);
  const parts = guidedPlant(archetype, p, {
    height: 4.2,
    crownWidth: 2.7,
    crownDepth: 1.9,
    trunkLean: 0.72,
    crownBasePct: 0.28,
    shape: "ellipsoid",
  }, {
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
    branchLengthProfile: { stops: [{ t: 0, value: 0.42 }, { t: 0.58, value: 1.25 }, { t: 1, value: 0.75 }], variance: 0.18, seed },
    branchFeatures: { count: 12, kind: "scar", size: 1.0 },
  });
  const wood = parts.find((part) => part.name === "wood");
  if (wood) {
    wood.mesh = merge(wood.mesh, rootSystem(seed + 19, Math.max(3, fs(9, p)), cs(1.65, p), ts(0.08, p), 0.55 + (p.bend || 0) * 0.5));
    wood.windWeight = windChannels(wood.mesh, { kind: "wood", seed }).combined;
  }
  return parts;
}

function makeBananaTree(archetype, p) {
  return plantParts(archetype, bananaPlant(seedOf(archetype, p), p), p);
}

function makeFernPlant(archetype, p) {
  const seed = seedOf(archetype, p);
  const rng = makeRng(seed);
  const stems = [];
  const blades = [];
  const count = Math.max(0, fs(12, p));
  for (let i = 0; i < count; i++) {
    const a = (i / Math.max(1, count)) * Math.PI * 2 + rng.next() * 0.3;
    const len = hs(0.9 + rng.next() * 0.45, p);
    const base = vec3(0, 0.05, 0);
    const dir = vec3(Math.cos(a), 0, Math.sin(a));
    const rachis = bezier(
      base,
      add(base, vec3(dir.x * len * 0.18, hs(0.28, p), dir.z * len * 0.18)),
      add(base, vec3(dir.x * len * 0.64, hs(0.38, p), dir.z * len * 0.64)),
      add(base, vec3(dir.x * cs(len, p), hs(0.16 + rng.next() * 0.18, p), dir.z * cs(len, p))),
      10,
    );
    const fern = frond(rachis, {
      seed: (rng.next() * 1e9) | 0,
      pairs: 18,
      leafletLength: cs(0.18, p),
      leafletWidth: cs(0.035, p),
      angle: 62,
      rachisRadius: ts(0.011, p),
      tipScale: 0.2,
    });
    stems.push(fern.stem);
    blades.push(fern.blades);
  }
  return plantParts(archetype, {
    wood: stems.length ? merge(...stems) : merge(),
    leaves: blades.length ? merge(...blades) : merge(),
    branches: [],
  }, p, seed);
}

function makeGrowthSequence(archetype, p) {
  const parts = [];
  const seed = seedOf(archetype, p);
  const stages = [0.25, 0.48, 0.74, 1.0];
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    const plant = tree({
      seed: seed + i * 17,
      height: hs(4.2 * s, p),
      trunkRadius: ts(0.27 * (0.55 + s * 0.45), p),
      gnarl: 0.12 + Math.abs(p.bend || 0) * 0.06,
      branchCount: Math.max(3, Math.round(8 * s * Math.max(0.45, p.crownScale ?? 1))),
      depth: s < 0.5 ? 1 : s < 0.75 ? 2 : 3,
      branchAngle: 52,
      leafDensity: fs(9 * s, p),
      leafSize: cs(0.16, p),
      leafShape: "oval",
      branchFlareScale: 1.7,
    });
    const x = (i - 1.5) * cs(1.35, p);
    for (const part of plantParts(archetype, plant, p, seed + i * 17)) {
      parts.push({
        ...part,
        name: `${part.name}_stage_${i + 1}`,
        label: `${archetype.name} ${i + 1}`,
        mesh: translateMesh(part.mesh, vec3(x, 0, 0)),
        metadata: { ...(part.metadata ?? {}), growthStage: s },
      });
    }
  }
  return parts;
}

const TUTORIAL_ARCHETYPES = [
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
    makeParts: (a, p) => guidedPlant(a, p, { height: 6.4, crownWidth: 1.15, crownDepth: 0.95, crownBasePct: 0.1, shape: "column" }, {
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
    }),
  },
  {
    id: "layered-pine",
    name: "层状松树",
    sourceGroup: "speedtree松树类制作",
    seed: 571,
    bark: [0.25, 0.16, 0.1],
    foliage: [0.08, 0.28, 0.14],
    makeParts: (a, p) => coniferPlant(a, p, { height: 5.8, trunkRadius: 0.18, whorls: 9, perWhorl: 7, needleDensity: 6 }),
  },
  {
    id: "narrow-spruce",
    name: "窄冠云杉",
    sourceGroup: "高级Speedtree教程 / 松柏类",
    seed: 593,
    bark: [0.22, 0.15, 0.1],
    foliage: [0.06, 0.21, 0.1],
    makeParts: (a, p) => coniferPlant(a, p, { height: 6.6, trunkRadius: 0.15, whorls: 13, perWhorl: 8, needleDensity: 7 }),
  },
  {
    id: "blossom-tree",
    name: "花树",
    sourceGroup: "SpeedTree花树制作",
    seed: 607,
    bark: [0.34, 0.22, 0.16],
    foliage: [0.98, 0.58, 0.74],
    makeParts: (a, p) => guidedPlant(a, p, { height: 3.7, crownWidth: 3.5, crownDepth: 3.1, trunkLean: 0.18, crownBasePct: 0.28, shape: "ellipsoid" }, {
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
    }),
  },
  {
    id: "card-blossom-tree",
    name: "插片花树",
    sourceGroup: "SpeedTree花树制作插片方式",
    seed: 631,
    bark: [0.32, 0.2, 0.15],
    foliage: [0.96, 0.5, 0.66],
    makeParts: (a, p) => guidedPlant(a, p, { height: 3.4, crownWidth: 3.7, crownDepth: 3.4, crownBasePct: 0.24, shape: "ellipsoid" }, {
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
    }),
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
    makeParts: (a, p) => shrubPlant(a, p, { height: 1.55, stems: 7, spread: 0.22, stemRadius: 0.045, leafDensity: 7, leafSize: 0.28, leafShape: "round", leafCurl: 0.16, leafFold: 0.22 }),
  },
  {
    id: "spherical-topiary",
    name: "球型树",
    sourceGroup: "刀刀系列 speedtree 案例教程",
    seed: 701,
    bark: [0.31, 0.21, 0.13],
    foliage: [0.12, 0.37, 0.12],
    makeParts: (a, p) => guidedPlant(a, p, { height: 3.2, crownWidth: 2.8, crownDepth: 2.8, crownBasePct: 0.38, shape: "ellipsoid" }, {
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
    }),
  },
  {
    id: "realistic-deciduous",
    name: "写实阔叶树",
    sourceGroup: "Digital Tutors - Modeling Realistic Trees",
    seed: 727,
    bark: [0.29, 0.2, 0.13],
    foliage: [0.15, 0.36, 0.12],
    makeParts: (a, p) => guidedPlant(a, p, { height: 4.9, crownWidth: 4.1, crownDepth: 3.2, trunkLean: -0.22, crownBasePct: 0.22, shape: "ellipsoid" }, {
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
    }),
  },
  {
    id: "cryengine-bush",
    name: "游戏灌木",
    sourceGroup: "3DMotive Cryengine Bush",
    seed: 751,
    bark: [0.23, 0.16, 0.1],
    foliage: [0.24, 0.5, 0.15],
    makeParts: (a, p) => shrubPlant(a, p, { height: 1.25, stems: 9, spread: 0.42, stemRadius: 0.035, leafDensity: 13, leafSize: 0.12, leafShape: "oval", leafFold: 0.08 }),
  },
  {
    id: "ground-grass",
    name: "地表草丛",
    sourceGroup: "3DMotive / fx phd 草地",
    seed: 773,
    bark: [0.2, 0.16, 0.1],
    foliage: [0.28, 0.54, 0.16],
    makeParts: (a, p) => grassPlant(a, p, { blades: 360, area: 2.5, height: 0.55, bend: 0.28, width: 0.01 }),
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

function makeTutorialModel(archetype) {
  return {
    id: `speedtree-tutorial-${archetype.id}`,
    name: `SpeedTree教程复刻 ${archetype.name}`,
    schema: TUTORIAL_SCHEMA,
    build(p) {
      return archetype.makeParts(archetype, p);
    },
  };
}

const speedtreeTutorialLineup = {
  id: "speedtree-tutorial-lineup",
  name: "SpeedTree教程复刻 树型合集",
  schema: LINEUP_SCHEMA,
  build(p) {
    const parts = [];
    for (const [i, archetype] of TUTORIAL_ARCHETYPES.entries()) {
      const one = archetype.makeParts(archetype, {
        heightScale: p.heightScale,
        crownScale: p.crownScale,
        trunkScale: 1,
        foliageScale: p.foliageScale,
        bend: 0,
        seedOffset: p.seedOffset,
      });
      const x = (i - (TUTORIAL_ARCHETYPES.length - 1) * 0.5) * p.spacing;
      for (const part of one) {
        parts.push({
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
    return parts;
  },
};

export const SPEEDTREE_TUTORIAL_MODELS = Object.fromEntries([
  ...TUTORIAL_ARCHETYPES.map((archetype) => [`speedtree-tutorial-${archetype.id}`, makeTutorialModel(archetype)]),
  ["speedtree-tutorial-lineup", speedtreeTutorialLineup],
]);
