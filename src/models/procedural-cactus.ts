/**
 * Procedural cactus inspired by the SideFX procedural cactus tutorial:
 * curve-driven stems, deterministic random branches, ramp-like taper profiles,
 * ribbed cross-sections, scattered spines, and optional flowers.
 */
import {
  cylinder,
  merge,
  makeMesh,
  recomputeNormals,
  smoothCurve,
  polyline,
  sphere,
  transform,
  translateMesh,
  type Curve,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import { parallelTransportFrames, type TransportFrame } from "../geometry/frame.js";
import { vec2 } from "../math/vec2.js";
import {
  vec3,
  add,
  scale as vscale,
  normalize,
  cross,
  makeBasis,
  type Vec3,
} from "../math/vec3.js";
import { clamp, smoothstep, TAU } from "../math/scalar.js";
import { makeRng, type Rng } from "../random/prng.js";

type RGB = [number, number, number];

const SKIN: RGB = [0.15, 0.48, 0.25];
const SPINE: RGB = [0.92, 0.86, 0.72];
const FLOWER: RGB = [0.95, 0.28, 0.48];
const FLOWER_CORE: RGB = [1.0, 0.76, 0.18];
const SAND: RGB = [0.68, 0.54, 0.34];

export interface ProceduralCactusParams {
  /** Main stem height. */
  height: number;
  /** Main stem base radius. */
  radius: number;
  /** Vertical ribs around each stem. */
  ribs: number;
  /** Rib groove depth, 0..1. */
  ribDepth: number;
  /** Side arms. */
  armCount: number;
  /** Outward arm length. */
  armLength: number;
  /** Upward arm lift. */
  armLift: number;
  /** Whole plant lean/bend. */
  bend: number;
  /** Spine rows per rib on the main stem. */
  spinesPerRib: number;
  /** Flower clusters on top/arm tips. */
  flowerCount: number;
  /** Add sandy base disk. */
  baseRadius: number;
  /** Global seed. */
  seed: number;
}

export const PROCEDURAL_CACTUS_DEFAULTS: ProceduralCactusParams = {
  height: 4.8,
  radius: 0.42,
  ribs: 12,
  ribDepth: 0.18,
  armCount: 5,
  armLength: 1.45,
  armLift: 1.55,
  bend: 0.18,
  spinesPerRib: 9,
  flowerCount: 5,
  baseRadius: 1.5,
  seed: 19,
};

interface StemOptions {
  radius: number;
  ribs: number;
  ribDepth: number;
  radialSegments: number;
  phase: number;
  twist: number;
  profileAt: (t: number) => number;
}

interface Stem {
  mesh: Mesh;
  sample: (t: number, rib: number, offset?: number) => { position: Vec3; normal: Vec3 };
  tip: () => { position: Vec3; normal: Vec3 };
}

function stemProfile(t: number, taper = 0.24): number {
  const baseRound = 0.72 + 0.28 * smoothstep(0, 0.08, t);
  const topRound = 1 - 0.88 * smoothstep(0.82, 1, t);
  const longTaper = 1 - taper * t;
  return clamp(baseRound * topRound * longTaper, 0.05, 1.2);
}

function armProfile(t: number): number {
  const base = 0.9 + 0.1 * smoothstep(0, 0.12, t);
  const tip = 1 - 0.8 * smoothstep(0.7, 1, t);
  return clamp(base * tip * (1 - 0.2 * t), 0.05, 1);
}

function ribRadius(opts: StemOptions, t: number, angle: number): number {
  const groove = (1 - Math.cos(angle * opts.ribs)) * 0.5;
  const rib = 1 - opts.ribDepth * groove;
  const organic = 1 + 0.025 * Math.sin(t * 9.7 + angle * 1.8 + opts.phase * 1.7);
  return opts.radius * opts.profileAt(t) * rib * organic;
}

function makeRibbedStem(curve: Curve, opts: StemOptions): Stem {
  const points = curve.points;
  const frames = parallelTransportFrames(points, { initialNormal: vec3(1, 0, 0) });
  const seg = Math.max(8, Math.floor(opts.radialSegments));
  const n = points.length;
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];

  const sampleAt = (tRaw: number, rib: number, offset = 0): { position: Vec3; normal: Vec3 } => {
    const t = clamp(tRaw, 0, 1);
    const i = Math.max(0, Math.min(n - 1, Math.round(t * (n - 1))));
    const f = frames[i]!;
    const angle = ((rib + offset) / opts.ribs) * TAU + opts.phase + opts.twist * t;
    const radial = radialDir(f, angle);
    return { position: add(f.position, vscale(radial, ribRadius(opts, t, angle))), normal: radial };
  };

  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    const f = frames[i]!;
    for (let j = 0; j <= seg; j++) {
      const u = j / seg;
      const angle = u * TAU + opts.phase + opts.twist * t;
      const radial = radialDir(f, angle);
      positions.push(add(f.position, vscale(radial, ribRadius(opts, t, angle))));
      normals.push(radial);
      uvs.push(vec2(u, t));
    }
  }

  const stride = seg + 1;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * stride + j;
      const b = a + stride;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }

  addStemCap(positions, normals, uvs, indices, frames[0]!, 0, seg, false);
  addStemCap(positions, normals, uvs, indices, frames[n - 1]!, (n - 1) * stride, seg, true);

  return {
    mesh: recomputeNormals(makeMesh({ positions, normals, uvs, indices })),
    sample: sampleAt,
    tip: () => sampleAt(1, 0, 0),
  };
}

function radialDir(frame: TransportFrame, angle: number): Vec3 {
  return normalize(add(vscale(frame.normal, Math.cos(angle)), vscale(frame.binormal, Math.sin(angle))));
}

function addStemCap(
  positions: Vec3[],
  normals: Vec3[],
  uvs: ReturnType<typeof vec2>[],
  indices: number[],
  frame: TransportFrame,
  ringStart: number,
  seg: number,
  end: boolean,
): void {
  const center = positions.length;
  positions.push(frame.position);
  normals.push(end ? frame.tangent : vscale(frame.tangent, -1));
  uvs.push(vec2(0.5, 0.5));
  for (let j = 0; j < seg; j++) {
    const a = ringStart + j;
    const b = ringStart + j + 1;
    if (end) indices.push(center, a, b);
    else indices.push(center, b, a);
  }
}

function mainCurve(p: ProceduralCactusParams, rng: Rng): Curve {
  const pts: Vec3[] = [];
  const swayAz = rng.range(0, TAU);
  const side = vec3(Math.cos(swayAz), 0, Math.sin(swayAz));
  for (let i = 0; i <= 7; i++) {
    const t = i / 7;
    const lean = p.bend * p.height * t * t;
    const wave = Math.sin(t * Math.PI * 1.7 + p.seed * 0.13) * p.radius * 0.12;
    pts.push(vec3(side.x * lean + side.z * wave, p.height * t, side.z * lean - side.x * wave));
  }
  return smoothCurve(polyline(pts), 5);
}

function armCurve(start: Vec3, dir: Vec3, p: ProceduralCactusParams, rng: Rng): Curve {
  const out = p.armLength * rng.range(0.65, 1.15);
  const lift = p.armLift * rng.range(0.7, 1.15);
  const droop = rng.range(-0.08, 0.12) * p.height;
  const side = normalize(cross(vec3(0, 1, 0), dir));
  const sideJitter = vscale(side, rng.range(-0.12, 0.12));
  const pts = [
    start,
    add(add(start, vscale(dir, out * 0.24)), vec3(0, 0.05 + droop * 0.1, 0)),
    add(add(add(start, vscale(dir, out * 0.72)), sideJitter), vec3(0, lift * 0.22, 0)),
    add(add(add(start, vscale(dir, out)), sideJitter), vec3(0, lift * 0.62, 0)),
    add(add(add(start, vscale(dir, out * 0.82)), sideJitter), vec3(0, lift, 0)),
  ];
  return smoothCurve(polyline(pts), 5);
}

function makeSpine(base: Vec3, dir: Vec3, length: number, radius: number, sides = 5): Mesh {
  const axis = normalize(dir);
  const basis = makeBasis(axis);
  const center = add(base, vscale(axis, radius * 0.8));
  const tip = add(base, vscale(axis, length));
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];

  for (let i = 0; i <= sides; i++) {
    const u = i / sides;
    const a = u * TAU;
    const radial = add(vscale(basis.x, Math.cos(a)), vscale(basis.y, Math.sin(a)));
    positions.push(add(center, vscale(radial, radius)));
    normals.push(normalize(add(radial, vscale(axis, 0.35))));
    uvs.push(vec2(u, 0));
  }
  const apex = positions.length;
  positions.push(tip);
  normals.push(axis);
  uvs.push(vec2(0.5, 1));
  for (let i = 0; i < sides; i++) indices.push(i, apex, i + 1);

  const cap = positions.length;
  positions.push(center);
  normals.push(vscale(axis, -1));
  uvs.push(vec2(0.5, 0.5));
  for (let i = 0; i < sides; i++) indices.push(cap, i + 1, i);

  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

function orientMesh(mesh: Mesh, center: Vec3, xAxis: Vec3, yAxis: Vec3, zAxis: Vec3): Mesh {
  return makeMesh({
    positions: mesh.positions.map((p) =>
      add(add(add(center, vscale(xAxis, p.x)), vscale(yAxis, p.y)), vscale(zAxis, p.z)),
    ),
    normals: mesh.normals.map((n) => normalize(add(add(vscale(xAxis, n.x), vscale(yAxis, n.y)), vscale(zAxis, n.z)))),
    uvs: mesh.uvs.map((uv) => ({ ...uv })),
    indices: mesh.indices.slice(),
  });
}

function makeFlower(center: Vec3, normal: Vec3, size: number, seed: number): Mesh {
  const base = sphere(1, 10, 6);
  const axis = normalize(normal);
  const basis = makeBasis(axis);
  const petals: Mesh[] = [];
  const petalsCount = 7;
  for (let i = 0; i < petalsCount; i++) {
    const a = (i / petalsCount) * TAU + seed * 0.17;
    const petalDir = normalize(add(vscale(basis.x, Math.cos(a)), vscale(basis.y, Math.sin(a))));
    const petalSide = normalize(cross(axis, petalDir));
    petals.push(
      orientMesh(
        base,
        add(add(center, vscale(axis, size * 0.08)), vscale(petalDir, size * 0.22)),
        vscale(petalDir, size * 0.22),
        vscale(axis, size * 0.08),
        vscale(petalSide, size * 0.1),
      ),
    );
  }
  return merge(...petals);
}

function addSpines(
  out: Mesh[],
  stem: Stem,
  rowsPerRib: number,
  ribs: number,
  rng: Rng,
  length: number,
  radius: number,
  keep = 0.72,
): void {
  const rows = Math.max(0, Math.floor(rowsPerRib));
  if (rows <= 0) return;
  for (let r = 0; r < ribs; r++) {
    for (let y = 0; y < rows; y++) {
      if (rng.next() > keep) continue;
      const t = (y + 1) / (rows + 1);
      const s = stem.sample(t, r, rng.range(-0.08, 0.08));
      out.push(makeSpine(add(s.position, vscale(s.normal, 0.01)), s.normal, length * rng.range(0.7, 1.25), radius, 5));
    }
  }
}

export function buildProceduralCactusParts(params: Partial<ProceduralCactusParams> = {}): NamedPart[] {
  const p: ProceduralCactusParams = { ...PROCEDURAL_CACTUS_DEFAULTS, ...params };
  const rng = makeRng(Math.round(p.seed) >>> 0);
  const ribs = Math.max(5, Math.round(p.ribs));
  const radialSegments = Math.max(ribs * 4, 24);

  const cactusMeshes: Mesh[] = [];
  const spineMeshes: Mesh[] = [];
  const flowerMeshes: Mesh[] = [];

  const trunk = makeRibbedStem(mainCurve(p, rng), {
    radius: p.radius,
    ribs,
    ribDepth: clamp(p.ribDepth, 0, 0.7),
    radialSegments,
    phase: rng.range(0, TAU),
    twist: rng.range(-0.25, 0.25),
    profileAt: (t) => stemProfile(t, 0.18),
  });
  cactusMeshes.push(trunk.mesh);
  addSpines(spineMeshes, trunk, p.spinesPerRib, ribs, rng, p.radius * 0.34, p.radius * 0.025, 0.72);

  const armCount = Math.max(0, Math.floor(p.armCount));
  const arms: Stem[] = [];
  const usedHeights: number[] = [];
  for (let i = 0; i < armCount; i++) {
    const baseT = 0.24 + ((i + 0.5) / Math.max(1, armCount)) * 0.55 + rng.range(-0.055, 0.055);
    const t = clamp(baseT, 0.22, 0.82);
    if (usedHeights.some((h) => Math.abs(h - t) < 0.075)) continue;
    usedHeights.push(t);
    const rib = Math.floor(rng.range(0, ribs));
    const socket = trunk.sample(t, rib, rng.range(-0.18, 0.18));
    const arm = makeRibbedStem(armCurve(add(socket.position, vscale(socket.normal, p.radius * 0.05)), socket.normal, p, rng), {
      radius: p.radius * rng.range(0.34, 0.52),
      ribs: Math.max(5, Math.round(ribs * rng.range(0.55, 0.75))),
      ribDepth: clamp(p.ribDepth * 0.9, 0, 0.65),
      radialSegments: Math.max(18, Math.round(radialSegments * 0.65)),
      phase: rng.range(0, TAU),
      twist: rng.range(-0.2, 0.35),
      profileAt: armProfile,
    });
    arms.push(arm);
    cactusMeshes.push(arm.mesh);
    if (p.spinesPerRib > 0) {
      addSpines(spineMeshes, arm, Math.max(1, Math.round(p.spinesPerRib * 0.6)), ribs, rng, p.radius * 0.24, p.radius * 0.018, 0.56);
    }
  }

  const flowerCount = Math.max(0, Math.floor(p.flowerCount));
  const tips = [trunk.tip(), ...arms.map((a) => a.tip())];
  for (let i = 0; i < Math.min(flowerCount, tips.length); i++) {
    const tip = tips[(i * 3) % tips.length]!;
    flowerMeshes.push(makeFlower(add(tip.position, vscale(tip.normal, p.radius * 0.05)), tip.normal, p.radius * rng.range(0.36, 0.52), p.seed + i * 11));
  }

  const parts: NamedPart[] = [
    {
      name: "cactus_skin",
      label: "仙人掌茎体",
      mesh: merge(...cactusMeshes),
      color: SKIN,
      surface: { type: "stylizedFoliage", params: { color: SKIN, seed: p.seed, bands: 4, grain: 0.12 } },
      metadata: { source: "SideFX procedural cactus tutorial reference", ribs },
    },
  ];

  if (spineMeshes.length > 0) {
    parts.push({
      name: "spines",
      label: "刺",
      mesh: merge(...spineMeshes),
      color: SPINE,
      surface: { type: "plastic", params: { color: SPINE, roughness: 0.82 } },
    });
  }

  if (flowerMeshes.length > 0) {
    parts.push({
      name: "flowers",
      label: "花",
      mesh: merge(...flowerMeshes),
      color: FLOWER,
      surface: { type: "leaf", params: { color: FLOWER, seed: p.seed + 37 } },
    });
    const cores = flowerMeshes.map((m, i) => {
      const tip = tips[(i * 3) % tips.length]!;
      return translateMesh(transform(sphere(1, 8, 5), { scale: p.radius * 0.07 }), add(tip.position, vscale(tip.normal, p.radius * 0.12)));
    });
    parts.push({
      name: "flower_centers",
      label: "花蕊",
      mesh: merge(...cores),
      color: FLOWER_CORE,
      surface: { type: "plastic", params: { color: FLOWER_CORE, roughness: 0.55 } },
    });
  }

  if (p.baseRadius > 0) {
    const base = transform(cylinder(p.baseRadius, 0.1, 48, true), { translate: vec3(0, -0.05, 0) });
    parts.push({
      name: "sand_base",
      label: "沙地底座",
      mesh: base,
      color: SAND,
      surface: { type: "sand", params: { color: SAND, seed: p.seed + 3 } },
    });
  }

  return parts.filter((part) => part.mesh.positions.length > 0);
}
