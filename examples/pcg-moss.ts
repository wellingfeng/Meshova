/**
 * PCG 苔藓 — 复刻 UE PCG "魔法苔藓" 教程的节点链，用 Meshova 的散布/法线密度算子实现。
 *
 * 教程节点链: Mesh Sampler(泊松表面采样) -> Normal To Density(法线朝上 => 密度)
 *   -> Density Filter(密度阈值筛点) -> Transform Points(随机旋转/缩放) -> 网格实例。
 * 核心观察: 苔藓只长在岩石朝上的面，侧面/悬垂处裸露；斑块由噪声调制密度形成。
 *
 * 这里不照抄 UE，而是把同一套逻辑用代码直译:
 *   1) 取一块岩石作为基底 (rock)。
 *   2) 面积加权在表面撒采样点，同时记录每点的面法线。
 *   3) 每点密度 = clamp(dot(n, up))^k * fbm 噪声斑块，朝上且落在噪声高区才保留。
 *   4) 保留的点上放一个苔藓小簇 (低矮绒垫 + 几张交叉卡片)，随机偏航/缩放/微陷。
 * 全程 seeded，同 seed 同结果。
 *
 * Run: pnpm tsx examples/pcg-moss.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  rock, crossQuad, sphere, transform, merge, computeNormals, makeRng, makeNoise, fbm3,
  vec3, add, sub, scale, cross, dot, normalize,
  toOBJScene, toViewerModel,
  type Vec3, type Rng, type Mesh, type NamedPart,
} from "../src/index.js";

const ROCK_COL: [number, number, number] = [0.32, 0.30, 0.27];
const MOSS: [number, number, number] = [0.18, 0.36, 0.12];
const MOSS_LIGHT: [number, number, number] = [0.34, 0.52, 0.20];

const UP = vec3(0, 1, 0);
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

interface SamplePoint {
  pos: Vec3;
  normal: Vec3;
  density: number;
}

/**
 * Mesh Sampler + Normal To Density (直译).
 * 面积加权在 target 表面撒 count 个点，记录面法线，并按 dot(n, up) 与 fbm 噪声算密度。
 */
function sampleSurface(target: Mesh, count: number, seed: number): SamplePoint[] {
  const rng = makeRng(seed);
  const noise = makeNoise(seed ^ 0x9e3779b9);
  const triCount = target.indices.length / 3;

  // 面积权重表 (前缀和)，让分布在表面均匀。
  const cum: number[] = [];
  let total = 0;
  for (let t = 0; t < triCount; t++) {
    const a = target.positions[target.indices[t * 3]!]!;
    const b = target.positions[target.indices[t * 3 + 1]!]!;
    const c = target.positions[target.indices[t * 3 + 2]!]!;
    const area = 0.5 * length(cross(sub(b, a), sub(c, a)));
    total += area;
    cum.push(total);
  }

  const points: SamplePoint[] = [];
  for (let i = 0; i < count; i++) {
    // 按面积挑一个三角形。
    const r = rng.next() * total;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid]! < r) lo = mid + 1; else hi = mid; }
    const t = lo;
    const a = target.positions[target.indices[t * 3]!]!;
    const b = target.positions[target.indices[t * 3 + 1]!]!;
    const c = target.positions[target.indices[t * 3 + 2]!]!;
    // 三角形内均匀重心采样。
    let u = rng.next(), v = rng.next();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const pos = add(add(a, scale(sub(b, a), u)), scale(sub(c, a), v));
    const normal = normalize(cross(sub(b, a), sub(c, a)));

    // Normal To Density: 朝上度 (dot(n, up), clamp) 的幂次，锐化朝上/侧面对比。
    const upness = clamp01(dot(normal, UP));
    const facing = Math.pow(upness, 2.2);
    // 噪声斑块: fbm 采位置，映射到 0..1，做出苔藓的团块感。
    const n = fbm3(noise, pos.x * 1.6, pos.y * 1.6, pos.z * 1.6, { octaves: 4 });
    const patch = clamp01(n * 0.5 + 0.5);
    const density = facing * patch;
    points.push({ pos, normal, density });
  }
  return points;
}

function length(v: Vec3): number { return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z); }

/** 由法线求一个正交偏航基，用来把苔藓簇对齐到表面。 */
function alignRot(normal: Vec3): { rotate: Vec3 } {
  // 简化: 只用法线与 up 的夹角在 x/z 上倾斜，苔藓不需要精确对齐。
  const n = normalize(normal);
  const tiltX = Math.atan2(n.z, n.y);
  const tiltZ = -Math.atan2(n.x, n.y);
  return { rotate: vec3(tiltX * 0.6, 0, tiltZ * 0.6) };
}

/**
 * 一个苔藓小簇: 一个压扁的低矮绒垫 (半球压扁) + 几张随机偏航的短交叉卡片当苔丝。
 * scale 由密度调制 —— 密度越高簇越大越饱满。
 */
function buildMossClump(rng: Rng, density: number): Mesh {
  const parts: Mesh[] = [];
  // 绒垫: 压扁的半球，给苔藓一个连续的地被感。
  const pad = transform(sphere(0.09, 8, 5), { scale: vec3(1, 0.35, 1) });
  parts.push(pad);
  // 苔丝: 2..4 张短交叉卡片，随机偏航、轻微前倾。
  const strands = 2 + rng.int(0, 2);
  for (let i = 0; i < strands; i++) {
    const h = rng.range(0.06, 0.13) * (0.6 + density * 0.8);
    const w = rng.range(0.03, 0.06);
    const yaw = rng.range(0, Math.PI);
    const ox = rng.range(-0.05, 0.05);
    const oz = rng.range(-0.05, 0.05);
    let card = crossQuad(vec3(0, h / 2, 0), vec3(0, 0, 1), vec3(0, 1, 0), w, h);
    card = transform(card, {
      rotate: vec3(rng.range(-0.2, 0.2), yaw, rng.range(-0.2, 0.2)),
      translate: vec3(ox, 0.02, oz),
    });
    parts.push(card);
  }
  return merge(...parts);
}

// ---- 主装配 ----
const SEED = 7;
const rockMesh = computeNormals(
  rock({ seed: SEED, radius: 1.2, detail: 3, lumpiness: 0.35, roughness: 0.12, flatBase: 0.3 }),
  40,
);

// Mesh Sampler + Normal To Density.
const samples = sampleSurface(rockMesh, 1400, SEED);

// Density Filter: 阈值筛点 (只留朝上且在噪声斑块内的点)。
const THRESHOLD = 0.22;
const kept = samples.filter((s) => s.density >= THRESHOLD);

// Transform Points + 实例化: 每个保留点放一个苔藓簇。
const mossMeshes: Mesh[] = [];
const mossLightMeshes: Mesh[] = [];
const place = makeRng(SEED * 31 + 1);
kept.forEach((s, i) => {
  const clumpRng = makeRng(SEED * 1000 + i * 7);
  let clump = buildMossClump(clumpRng, s.density);
  // 随机整体缩放 (Transform Points 的 Scale Min/Max)。
  const us = place.range(0.7, 1.3);
  const rot = alignRot(s.normal);
  clump = transform(clump, {
    scale: vec3(us, us * place.range(0.8, 1.1), us),
    rotate: rot.rotate,
    // 微微陷入岩体，避免悬浮。
    translate: add(s.pos, scale(s.normal, -0.015)),
  });
  // 密度高的用深苔色，稀疏边缘用浅苔色，做出颜色渐变。
  if (s.density > 0.5) mossMeshes.push(clump);
  else mossLightMeshes.push(clump);
});

const parts: NamedPart[] = [
  { name: "rock", mesh: rockMesh, color: ROCK_COL },
];
if (mossMeshes.length > 0) {
  parts.push({ name: "moss", mesh: computeNormals(merge(...mossMeshes), 60), color: MOSS });
}
if (mossLightMeshes.length > 0) {
  parts.push({ name: "moss_light", mesh: computeNormals(merge(...mossLightMeshes), 60), color: MOSS_LIGHT });
}

const { obj, mtl } = toOBJScene(parts, "pcg-moss.mtl");
const model = toViewerModel(parts, "pcg-moss");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "pcg-moss.obj"), obj);
fs.writeFileSync(path.join(outDir, "pcg-moss.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "pcg-moss.json"), JSON.stringify(model));
const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) { try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { /* rebuild */ } }
const entry = { id: "pcg-moss", name: "PCG 苔藓", file: "pcg-moss.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(
  `pcg-moss: ${kept.length}/${samples.length} 点保留, ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`,
);
