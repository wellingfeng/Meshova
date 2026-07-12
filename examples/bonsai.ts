/**
 * 盆景树 — 复刻常见程序化盆景教程的造型语言（B 站视频无法下载，
 * 这里按盆景的公开造型规律自研重写，不复制任何素材）。
 *
 * 盆景与普通树的差别全在“造型语言”，用 Meshova 现有植被内核即可表达：
 *   1. 矮、壮、弯 的主干     -> 低 height、大 trunkRadius、大 gnarl + 自定义弯曲 trunkCurve
 *   2. 分层的“云片”叶团(pad) -> 不用满树散叶，改在枝端手动放扁椭球叶垫(云片)
 *   3. 露根 (nebari)         -> 主干基部加放几段爬地浅根
 *   4. 浅口陶盆 + 土面        -> lathe 车一个矮盆 + 一个土饼
 *
 * 关键：叶片不满树乱撒，而是聚成几团 pad，这是盆景与野树最直观的区别。
 *
 * Run: pnpm tsx examples/bonsai.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  tree,
  icosphere,
  lathe,
  polyline,
  sweep,
  merge,
  transform,
  translateMesh,
  scaleMesh,
  computeNormals,
  recomputeNormals,
  makeRng,
  vec2,
  vec3,
  toOBJScene,
  toViewerModel,
  windChannels,
  type Mesh,
  type NamedPart,
  type Rng,
} from "../src/index.js";

// ---- 盆景造型参数 ----------------------------------------------------------
interface BonsaiStyle {
  id: string;
  name: string;
  seed: number;
  /** 主干总高（矮）。 */
  height: number;
  /** 主干基部半径（壮）。 */
  trunkRadius: number;
  /** 主干弯曲的水平位移比例（相对 height）。 */
  sway: number;
  /** 云片叶垫数量（bare 模式忽略）。 */
  pads: number;
  /** 忠实视频：落叶枯枝，无叶、深递归密枝。 */
  bare?: boolean;
  /** 一级枝数量（bare 模式用）。 */
  branches?: number;
  /** 递归深度（bare 模式用，视频是 4-5 级密枝）。 */
  depth?: number;
  bark: [number, number, number];
  leaf: [number, number, number];
  potColor: [number, number, number];
  soilColor: [number, number, number];
}

const STYLES: BonsaiStyle[] = [
  {
    // 忠实复刻视频成品：落叶阔叶枯枝盆景（棕干、无叶、细密递归分枝、圆浅盆）。
    id: "deciduous-bare",
    name: "枯枝落叶（视频复刻）",
    seed: 421,
    height: 2.4,
    trunkRadius: 0.26,
    sway: 0.34,
    pads: 0,
    bare: true,
    branches: 8,
    depth: 5,
    bark: [0.36, 0.26, 0.19],
    leaf: [0.24, 0.5, 0.2],
    potColor: [0.4, 0.26, 0.2],
    soilColor: [0.14, 0.11, 0.08],
  },
  {
    id: "informal-upright",
    name: "斜干直立",
    seed: 271,
    height: 2.2,
    trunkRadius: 0.24,
    sway: 0.28,
    pads: 5,
    bark: [0.34, 0.24, 0.16],
    leaf: [0.2, 0.46, 0.2],
    potColor: [0.42, 0.24, 0.18],
    soilColor: [0.16, 0.12, 0.09],
  },
  {
    id: "windswept",
    name: "风吹式",
    seed: 613,
    height: 2.0,
    trunkRadius: 0.2,
    sway: 0.52,
    pads: 4,
    bark: [0.3, 0.22, 0.15],
    leaf: [0.24, 0.5, 0.22],
    potColor: [0.36, 0.36, 0.34],
    soilColor: [0.15, 0.11, 0.08],
  },
  {
    id: "cascade",
    name: "悬崖式",
    seed: 907,
    height: 1.7,
    trunkRadius: 0.22,
    sway: 0.66,
    pads: 4,
    bark: [0.32, 0.2, 0.14],
    leaf: [0.22, 0.44, 0.24],
    potColor: [0.5, 0.42, 0.32],
    soilColor: [0.17, 0.12, 0.09],
  },
];

/**
 * 盆景主干：一条 S 形 / 弯折折线，比普通树更矮更歪。
 * 用 makeRng 决定每段的偏移方向，保证同 seed 完全可复现。
 */
function trunkSpine(style: BonsaiStyle, rng: Rng) {
  const h = style.height;
  const s = style.sway * h;
  const cascade = style.id === "cascade";
  const pts = [
    vec3(0, 0, 0),
    vec3(s * (0.3 + rng.range(-0.1, 0.1)), h * 0.28, s * 0.15),
    vec3(-s * (0.35 + rng.range(-0.1, 0.1)), h * 0.55, -s * 0.1),
    vec3(s * (0.25 + rng.range(-0.1, 0.1)), h * 0.78, s * 0.2),
    // 悬崖式：树梢反向下垂过盆沿
    cascade
      ? vec3(s * 1.1, h * 0.5, s * 0.4)
      : vec3(-s * 0.15 + rng.range(-0.05, 0.05), h, rng.range(-0.05, 0.05)),
  ];
  return polyline(pts);
}

/**
 * 云片叶垫：盆景标志性的分层扁平叶团。
 * 用压扁的 icosphere 表示一团修剪过的叶簇，比满树散叶更“盆景”。
 */
function cloudPad(rng: Rng, radius: number): Mesh {
  const base = icosphere(radius, 2);
  // 压扁成盘状 + 轻微不规则，得到修剪叶垫的手感
  const flat = scaleMesh(base, vec3(1, 0.42 + rng.range(-0.06, 0.06), 1));
  const jitter: Mesh = {
    positions: flat.positions.map((p) => {
      const n = 1 + rng.range(-0.08, 0.08);
      return vec3(p.x * n, p.y, p.z * (1 + rng.range(-0.08, 0.08)));
    }),
    normals: flat.normals.slice(),
    uvs: flat.uvs.slice(),
    indices: flat.indices.slice(),
  };
  return recomputeNormals(jitter);
}

/** 露根 nebari：主干基部向外爬地的几条浅根。 */
function nebari(style: BonsaiStyle, rng: Rng): Mesh {
  const roots: Mesh[] = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const len = style.trunkRadius * (2.4 + rng.range(-0.4, 0.6));
    const dir = vec3(Math.cos(a), 0, Math.sin(a));
    const curve = polyline([
      vec3(0, style.trunkRadius * 0.4, 0),
      vec3(dir.x * len * 0.5, style.trunkRadius * 0.15, dir.z * len * 0.5),
      vec3(dir.x * len, -0.02, dir.z * len),
    ]);
    roots.push(
      sweep(curve, {
        sides: 5,
        radius: style.trunkRadius * 0.5,
        radiusAt: (t) => 1 - 0.85 * t,
        caps: true,
      }),
    );
  }
  return merge(...roots);
}

/** 浅口陶盆（矩形感的矮盆用车削近似成圆浅盆）。 */
function bonsaiPot(style: BonsaiStyle): Mesh {
  const R = style.trunkRadius * 4.2;
  const wall = R * 0.08;
  const H = style.height * 0.16;
  const footR = R * 0.75;
  const profile = [
    vec2(0, -H),
    vec2(footR * 0.5, -H),       // 足底
    vec2(footR, -H * 0.6),
    vec2(R, -H * 0.05),          // 盆身外沿
    vec2(R + wall, 0),           // 盆口外唇
    vec2(R + wall, wall),        // 唇顶
    vec2(R - wall, wall),        // 唇内
    vec2(R - wall, -H * 0.6),    // 内壁
    vec2(footR * 0.5, -H * 0.75),// 内底
    vec2(0, -H * 0.75),
  ];
  return computeNormals(lathe(profile, { segments: 48 }), 45);
}

/** 盆里的土面：一个略低于盆口的扁圆饼。 */
function soil(style: BonsaiStyle, rng: Rng): Mesh {
  const R = style.trunkRadius * 4.2 - style.trunkRadius * 0.5;
  const disc = translateMesh(scaleMesh(icosphere(R, 2), vec3(1, 0.12, 1)), vec3(0, -0.02, 0));
  // 视频 p10：土面 scatter 苔藓/碎石。用一批小球点缀，聚成起伏苔面。
  const moss: Mesh[] = [];
  const n = 40;
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * R * 0.92;
    const px = Math.cos(a) * r;
    const pz = Math.sin(a) * r;
    const s = style.trunkRadius * rng.range(0.1, 0.24);
    const bump = scaleMesh(icosphere(s, 1), vec3(1, rng.range(0.4, 0.7), 1));
    moss.push(translateMesh(bump, vec3(px, R * 0.11 + s * 0.3, pz)));
  }
  return merge(disc, ...moss);
}

/** 组装一棵盆景的所有部件。 */
function buildBonsai(style: BonsaiStyle): NamedPart[] {
  const rng = makeRng(style.seed);
  const spine = trunkSpine(style, rng);

  // bare = 忠实视频：落叶枯枝，深递归密枝(4-5 级)、无叶。
  // 否则 = 云片式：稀疏枝 + 手放扁椭球叶垫。
  const levels = style.bare
    ? [
        { count: style.branches ?? 8, children: 4, angle: 38, lengthScale: 0.74, radiusScale: 0.6 },
        { count: 4, children: 4, angle: 44, lengthScale: 0.72, radiusScale: 0.56 },
        { count: 4, children: 3, angle: 50, lengthScale: 0.68, radiusScale: 0.52 },
        { count: 3, children: 3, angle: 56, lengthScale: 0.62, radiusScale: 0.48 },
        { count: 3, children: 0, angle: 62, lengthScale: 0.56, radiusScale: 0.44 },
      ].slice(0, style.depth ?? 5)
    : [
        { count: style.pads, children: 2, angle: 60, lengthScale: 0.6, radiusScale: 0.5 },
        { count: 2, children: 0, angle: 66, lengthScale: 0.55, radiusScale: 0.45 },
      ];

  const plant = tree({
    seed: style.seed,
    trunkCurve: spine,
    trunkRadius: style.trunkRadius,
    gnarl: style.bare ? 0.4 : 0.5,
    leaves: false, // 叶片(若有)用手放云片，不用满树散叶
    branchAngle: style.bare ? 42 : 62,
    branchPhototropism: style.bare ? 0.35 : 0.55,
    branchGravity: style.id === "cascade" ? 0.35 : style.bare ? 0.05 : 0.1,
    branchFlare: true,
    branchFlareScale: 1.6,
    authoring: { levels },
    branchRadiusProfile: [{ t: 0, value: 0.9 }, { t: 1, value: 0.28 }],
    // 泪滴状树冠轮廓（视频里主干上部展开成蓬冠）
    canopy: style.bare
      ? { shape: "ellipsoid", baseY: style.height * 0.35, height: style.height * 0.9, radiusX: style.height * 0.55, strength: 0.5 }
      : undefined,
  });

  const roots = nebari(style, rng);
  const wood = merge(plant.wood, roots);

  const parts: NamedPart[] = [
    {
      name: "wood",
      label: `${style.name} 干枝`,
      mesh: wood,
      color: style.bark,
      windWeight: windChannels(wood, { kind: "wood", seed: style.seed }).combined,
      metadata: {
        generator: style.bare ? "gnarled-trunk + deep-recursive-branches (video repro)" : "gnarled-trunk + nebari-roots",
        style: style.id,
        branches: plant.branches.length,
      },
    },
  ];

  // 云片模式才放叶垫；bare 枯枝不放叶。
  if (!style.bare) {
    const pads: Mesh[] = [];
    for (const b of plant.branches.filter((x) => x.terminal)) {
      const pts = b.curve.points;
      const tip = pts[pts.length - 1]!;
      const padR = style.trunkRadius * (2.0 + rng.range(-0.3, 0.5));
      let pad = cloudPad(rng, padR);
      pad = translateMesh(pad, vec3(tip.x, tip.y + padR * 0.25, tip.z));
      pads.push(pad);
    }
    const foliage = merge(...pads);
    parts.push({
      name: "foliage",
      label: `${style.name} 云片`,
      mesh: foliage,
      color: style.leaf,
      windWeight: windChannels(foliage, { kind: "foliage", seed: style.seed + 1 }).combined,
      metadata: { generator: "flattened-icosphere leaf pads", style: style.id, pads: pads.length },
    });
  }

  const dirt = soil(style, rng);
  const pot = bonsaiPot(style);
  parts.push({ name: "soil", label: "土面/苔点", mesh: dirt, color: style.soilColor });
  parts.push({ name: "pot", label: "陶盆", mesh: pot, color: style.potColor });
  return parts;
}

// ---- 输出 -------------------------------------------------------------------
interface Scene {
  id: string;
  name: string;
  parts: NamedPart[];
}

const scenes: Scene[] = [];
const lineupParts: NamedPart[] = [];

for (const [i, style] of STYLES.entries()) {
  const parts = buildBonsai(style);
  scenes.push({ id: `bonsai-${style.id}`, name: `盆景 ${style.name}`, parts });

  const x = (i - (STYLES.length - 1) * 0.5) * 2.6;
  for (const part of parts) {
    lineupParts.push({
      ...part,
      name: `${style.id}_${part.name}`,
      label: `${style.name} ${part.label ?? part.name}`,
      mesh: translateMesh(part.mesh, vec3(x, 0, 0)),
      metadata: { ...(part.metadata ?? {}), style: style.id, lineupX: x },
    });
  }
}

scenes.push({ id: "bonsai-lineup", name: "盆景对比", parts: lineupParts });

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
  manifest.models.push({ id: scene.id, name: scene.name, file, category: "盆景" });
  console.log(`${scene.id}: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log("written: out/bonsai-*.json + .obj/.mtl + out/models.json");
