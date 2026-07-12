import { vec2 } from "../math/vec2.js";
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import { makeNoise } from "../random/noise.js";
import { icosphere } from "../geometry/primitives2.js";
import { makeMesh, merge, recomputeNormals, type Mesh } from "../geometry/mesh.js";
import { transform } from "../geometry/transform.js";
import type { NamedPart, PartInstanceTransform } from "../geometry/export.js";

export interface WaterfallOptions {
  controlPoints?: ReadonlyArray<Vec3>;
  seed?: number;
  width?: number;
  height?: number;
  depth?: number;
  sheetCount?: number;
  pathSegments?: number;
  turbulence?: number;
  flowSpeed?: number;
  rockCount?: number;
  particleCount?: number;
  mistCount?: number;
  foamCount?: number;
  poolRadius?: number;
}

interface ResolvedWaterfallOptions {
  controlPoints?: ReadonlyArray<Vec3>;
  seed: number;
  width: number;
  height: number;
  depth: number;
  sheetCount: number;
  pathSegments: number;
  turbulence: number;
  flowSpeed: number;
  rockCount: number;
  particleCount: number;
  mistCount: number;
  foamCount: number;
  poolRadius: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolveOptions(options: WaterfallOptions): ResolvedWaterfallOptions {
  return {
    ...(options.controlPoints && options.controlPoints.length >= 2
      ? { controlPoints: options.controlPoints.map((point) => vec3(point.x, point.y, point.z)) }
      : {}),
    seed: Math.floor(options.seed ?? 17),
    width: clamp(options.width ?? 6.8, 1.5, 24),
    height: clamp(options.height ?? 8.5, 2, 30),
    depth: clamp(options.depth ?? 3.4, 0.5, 12),
    sheetCount: Math.floor(clamp(options.sheetCount ?? 4, 1, 8)),
    pathSegments: Math.floor(clamp(options.pathSegments ?? 44, 8, 128)),
    turbulence: clamp(options.turbulence ?? 0.42, 0, 1.5),
    flowSpeed: clamp(options.flowSpeed ?? 1.25, 0.1, 4),
    rockCount: Math.floor(clamp(options.rockCount ?? 34, 4, 160)),
    particleCount: Math.floor(clamp(options.particleCount ?? 180, 0, 800)),
    mistCount: Math.floor(clamp(options.mistCount ?? 72, 0, 320)),
    foamCount: Math.floor(clamp(options.foamCount ?? 96, 0, 400)),
    poolRadius: clamp(options.poolRadius ?? 5.2, 1.5, 16),
  };
}

function pathPoint(t: number, opts: ResolvedWaterfallOptions): Vec3 {
  if (opts.controlPoints && opts.controlPoints.length >= 2) {
    const position = t * (opts.controlPoints.length - 1);
    const index = Math.min(opts.controlPoints.length - 2, Math.floor(position));
    const local = position - index;
    const start = opts.controlPoints[index]!;
    const end = opts.controlPoints[index + 1]!;
    return vec3(
      start.x + (end.x - start.x) * local,
      start.y + (end.y - start.y) * local,
      start.z + (end.z - start.z) * local,
    );
  }
  const plunge = t * t;
  const lipCurl = Math.sin(Math.min(1, t * 3.2) * Math.PI) * opts.depth * 0.12;
  return vec3(
    Math.sin(t * Math.PI * 1.35 + opts.seed * 0.17) * opts.width * 0.025,
    0.22 + opts.height * (1 - t),
    -opts.depth * 0.28 + plunge * opts.depth * 0.6 + lipCurl,
  );
}

function buildSheetMesh(
  opts: ResolvedWaterfallOptions,
  sheetIndex: number,
  centerX: number,
  sheetWidth: number,
): Mesh {
  const noise = makeNoise(opts.seed * 97 + sheetIndex * 31 + 5);
  const rows = opts.pathSegments;
  const cols = Math.max(5, Math.round(5 + sheetWidth * 1.6));
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices: number[] = [];

  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    const center = pathPoint(t, opts);
    const spread = 0.92 + Math.sin(t * Math.PI) * 0.13;
    for (let col = 0; col <= cols; col++) {
      const u = col / cols;
      const across = (u - 0.5) * sheetWidth * spread;
      const edge = Math.abs(u - 0.5) * 2;
      const coarse = noise.noise2(u * 2.7 + sheetIndex * 3.1, t * 3.4);
      const fine = noise.noise2(u * 11 + 13.7, t * 13 + sheetIndex);
      const breakup = opts.turbulence * (0.07 + t * 0.16);
      const x = center.x + centerX + across + coarse * sheetWidth * breakup * (0.35 + edge * 0.65);
      const z = center.z + fine * opts.turbulence * 0.16 + Math.sin(t * 19 + u * 7) * 0.035;
      const y = center.y + coarse * opts.turbulence * 0.045;
      positions.push(vec3(x, y, z));
      normals.push(vec3(0, 0, 1));
      uvs.push(vec2(u, t * 4));
    }
  }

  const stride = cols + 1;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const a = row * stride + col;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

function buildPoolMesh(opts: ResolvedWaterfallOptions, inner = 0): Mesh {
  const segments = 64;
  const rings = inner > 0 ? 1 : 8;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices: number[] = [];

  if (inner === 0) {
    positions.push(vec3(0, 0.14, opts.depth * 0.24));
    normals.push(vec3(0, 1, 0));
    uvs.push(vec2(0.5, 0.5));
  }

  for (let ring = inner > 0 ? 0 : 1; ring <= rings; ring++) {
    const radialT = inner > 0 ? ring : ring / rings;
    const radius = inner > 0 ? inner + ring * opts.poolRadius * 0.22 : radialT * opts.poolRadius;
    for (let segment = 0; segment < segments; segment++) {
      const angle = (segment / segments) * Math.PI * 2;
      const wobble = 1 + Math.sin(angle * 5 + opts.seed) * 0.025;
      const x = Math.cos(angle) * radius * wobble;
      const z = opts.depth * 0.24 + Math.sin(angle) * radius * 0.72 * wobble;
      positions.push(vec3(x, 0.14 + Math.sin(angle * 3) * 0.012, z));
      normals.push(vec3(0, 1, 0));
      uvs.push(vec2(0.5 + Math.cos(angle) * radialT * 0.5, 0.5 + Math.sin(angle) * radialT * 0.5));
    }
  }

  if (inner === 0) {
    for (let segment = 0; segment < segments; segment++) {
      const next = (segment + 1) % segments;
      indices.push(0, 1 + next, 1 + segment);
    }
  }
  const firstRingOffset = inner === 0 ? 1 : 0;
  const ringCount = inner === 0 ? rings : 1;
  for (let ring = inner === 0 ? 1 : 0; ring < ringCount; ring++) {
    const current = firstRingOffset + (inner === 0 ? ring - 1 : ring) * segments;
    const outer = current + segments;
    for (let segment = 0; segment < segments; segment++) {
      const next = (segment + 1) % segments;
      const a = current + segment;
      const b = current + next;
      const c = outer + segment;
      const d = outer + next;
      indices.push(a, b, c, c, b, d);
    }
  }
  return makeMesh({ positions, normals, uvs, indices });
}

function buildRockMesh(opts: ResolvedWaterfallOptions): Mesh {
  const rng = makeRng(opts.seed * 13 + 9);
  const wallNoise = makeNoise(opts.seed * 43 + 11);
  const wallPositions = [];
  const wallNormals = [];
  const wallUvs = [];
  const wallIndices: number[] = [];
  const wallCols = 18;
  const wallRows = 20;
  for (let row = 0; row <= wallRows; row++) {
    const v = row / wallRows;
    for (let col = 0; col <= wallCols; col++) {
      const u = col / wallCols;
      const x = (u - 0.5) * opts.width * 1.22;
      const y = 0.08 + v * (opts.height + 1.1);
      const z = -opts.depth * 0.66
        + wallNoise.noise2(u * 4.2, v * 4.8) * 0.42
        - Math.abs(u - 0.5) * 0.38;
      wallPositions.push(vec3(x, y, z));
      wallNormals.push(vec3(0, 0, 1));
      wallUvs.push(vec2(u * 2, v * 2));
    }
  }
  const wallStride = wallCols + 1;
  for (let row = 0; row < wallRows; row++) {
    for (let col = 0; col < wallCols; col++) {
      const a = row * wallStride + col;
      const b = a + 1;
      const c = a + wallStride;
      const d = c + 1;
      wallIndices.push(a, b, c, b, d, c);
    }
  }
  const wall = recomputeNormals(makeMesh({
    positions: wallPositions,
    normals: wallNormals,
    uvs: wallUvs,
    indices: wallIndices,
  }));
  const rocks: Mesh[] = [wall, ...[-1, 1].map((side) => transform(icosphere(0.72, 2), {
    translate: vec3(side * opts.width * 0.58, opts.height * 0.5, -opts.depth * 0.42),
    scale: vec3(opts.width * 0.3, opts.height / 1.42, opts.depth * 0.72),
  }))];
  for (let i = 0; i < opts.rockCount; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const y = rng.range(0.25, opts.height + 0.9);
    const sideBias = Math.pow(rng.next(), 0.7);
    const x = side * (opts.width * (0.46 + sideBias * 0.34));
    const z = -opts.depth * 0.42 + rng.range(-0.75, 0.2) + y / opts.height * -0.2;
    const scale = rng.range(0.55, 1.45) * (0.75 + y / opts.height * 0.25);
    rocks.push(transform(icosphere(0.72, 1), {
      translate: vec3(x, y, z),
      rotate: vec3(rng.range(-0.5, 0.5), rng.range(-Math.PI, Math.PI), rng.range(-0.35, 0.35)),
      scale: vec3(scale * rng.range(0.75, 1.35), scale * rng.range(0.8, 1.4), scale * rng.range(0.7, 1.2)),
    }));
  }
  return merge(...rocks);
}

function makeStaticFallback(base: Mesh, transforms: PartInstanceTransform[], limit: number): Mesh {
  const meshes = transforms.slice(0, limit).map((item) => transform(base, {
    translate: vec3(...item.position),
    ...(item.rotation ? { rotate: vec3(...item.rotation) } : {}),
    ...(item.scale ? { scale: vec3(...item.scale) } : {}),
  }));
  return meshes.length ? merge(...meshes) : base;
}

function particleTransforms(
  opts: ResolvedWaterfallOptions,
  kind: "spray" | "mist" | "foam",
  count: number,
): PartInstanceTransform[] {
  const rng = makeRng(opts.seed * 101 + (kind === "spray" ? 1 : kind === "mist" ? 2 : 3));
  const transforms: PartInstanceTransform[] = [];
  for (let i = 0; i < count; i++) {
    const angle = rng.range(0, Math.PI * 2);
    const radial = kind === "foam"
      ? rng.range(opts.poolRadius * 0.12, opts.poolRadius * 0.88)
      : rng.range(0.05, opts.width * (kind === "mist" ? 0.48 : 0.36));
    const x = Math.cos(angle) * radial;
    const z = opts.depth * 0.3 + Math.sin(angle) * radial * (kind === "foam" ? 0.68 : 0.3);
    const y = kind === "mist" ? rng.range(0.15, opts.height * 0.22) : rng.range(0.12, 0.34);
    const size = kind === "spray"
      ? rng.range(0.035, 0.12)
      : kind === "mist"
        ? rng.range(0.3, 0.85)
        : rng.range(0.08, 0.26);
    transforms.push({
      position: [x, y, z],
      rotation: [rng.range(0, Math.PI), rng.range(0, Math.PI), rng.range(0, Math.PI)],
      scale: kind === "mist" ? [size * 1.8, size, size * 1.4] : [size, size * (kind === "spray" ? 2.2 : 0.3), size],
    });
  }
  return transforms;
}

function buildParticlePart(
  opts: ResolvedWaterfallOptions,
  kind: "spray" | "mist" | "foam",
  count: number,
): NamedPart | null {
  if (count <= 0) return null;
  const base = icosphere(kind === "mist" ? 0.5 : 1, kind === "foam" ? 1 : 0);
  const transforms = particleTransforms(opts, kind, count);
  const labels = { spray: "落点飞沫", mist: "瀑布水雾", foam: "水潭漂泡" } as const;
  const colors: Record<typeof kind, [number, number, number]> = {
    spray: [0.82, 0.94, 1],
    mist: [0.86, 0.95, 1],
    foam: [0.9, 0.97, 1],
  };
  return {
    name: `waterfall_${kind}`,
    label: labels[kind],
    mesh: makeStaticFallback(base, transforms, kind === "mist" ? 12 : 28),
    color: colors[kind],
    doubleSided: true,
    renderInstances: { mesh: base, transforms },
    metadata: {
      renderFx: `waterfall-${kind}`,
      seed: opts.seed,
      flowSpeed: opts.flowSpeed,
      width: opts.width,
      height: opts.height,
      depth: opts.depth,
      poolRadius: opts.poolRadius,
    },
  };
}

export function buildWaterfallParts(options: WaterfallOptions = {}): NamedPart[] {
  const opts = resolveOptions(options);
  const rng = makeRng(opts.seed * 19 + 3);
  const parts: NamedPart[] = [
    {
      name: "waterfall_cliff",
      label: "瀑布岩壁",
      mesh: buildRockMesh(opts),
      color: [0.22, 0.25, 0.27],
      surface: { type: "rock", params: { color: [0.2, 0.23, 0.25], roughness: 0.92, seed: opts.seed } },
    },
    {
      name: "waterfall_pool",
      label: "瀑布水潭",
      mesh: buildPoolMesh(opts),
      color: [0.08, 0.34, 0.43],
      surface: {
        type: "water",
        params: {
          body: "pond",
          tint: [0.08, 0.34, 0.43],
          deepColor: [0.018, 0.1, 0.13],
          waveAmplitude: 0.018,
          flowSpeed: opts.flowSpeed * 0.24,
          foamStrength: 0.32,
          seed: opts.seed,
        },
      },
      doubleSided: true,
      metadata: { renderFx: "waterfall-pool", seed: opts.seed, flowSpeed: opts.flowSpeed },
    },
    {
      name: "waterfall_impact_foam",
      label: "落点白水环",
      mesh: transform(buildPoolMesh(opts, opts.poolRadius * 0.12), { translate: vec3(0, 0.018, 0) }),
      color: [0.86, 0.95, 1],
      surface: {
        type: "water",
        params: {
          body: "pond",
          tint: [0.72, 0.9, 0.95],
          deepColor: [0.16, 0.42, 0.48],
          roughness: 0.2,
          waveAmplitude: 0.006,
          foamStrength: 0.9,
          seed: opts.seed + 1,
        },
      },
      doubleSided: true,
      metadata: { renderFx: "waterfall-foam-ring", seed: opts.seed, flowSpeed: opts.flowSpeed },
    },
  ];

  const slotWidth = opts.width / opts.sheetCount;
  for (let i = 0; i < opts.sheetCount; i++) {
    const center = -opts.width * 0.5 + slotWidth * (i + 0.5) + rng.range(-slotWidth * 0.08, slotWidth * 0.08);
    const width = slotWidth * rng.range(0.72, 0.94);
    parts.push({
      name: `waterfall_sheet_${i + 1}`,
      label: `主水帘 ${i + 1}`,
      mesh: buildSheetMesh(opts, i, center, width),
      color: [0.45, 0.78, 0.94],
      surface: {
        type: "water",
        params: {
          body: "river",
          tint: [0.34, 0.7, 0.86],
          deepColor: [0.04, 0.2, 0.28],
          roughness: 0.08,
          transmission: 0.52,
          waveAmplitude: 0,
          flowSpeed: opts.flowSpeed,
          foamStrength: 0.44,
          seed: opts.seed + i * 37,
        },
      },
      doubleSided: true,
      metadata: {
        renderFx: "waterfall-sheet",
        seed: opts.seed + i * 37,
        flowSpeed: opts.flowSpeed * rng.range(0.88, 1.15),
        turbulence: opts.turbulence,
        opacity: rng.range(0.58, 0.78),
      },
    });
  }

  const spray = buildParticlePart(opts, "spray", opts.particleCount);
  const mist = buildParticlePart(opts, "mist", opts.mistCount);
  const foam = buildParticlePart(opts, "foam", opts.foamCount);
  if (spray) parts.push(spray);
  if (mist) parts.push(mist);
  if (foam) parts.push(foam);
  return parts;
}

export function scoreWaterfall(parts: NamedPart[]): {
  sheets: number;
  fxLayers: number;
  verts: number;
  tris: number;
} {
  let sheets = 0;
  let fxLayers = 0;
  let verts = 0;
  let tris = 0;
  for (const part of parts) {
    const fx = String(part.metadata?.renderFx ?? "");
    if (fx === "waterfall-sheet") sheets++;
    if (fx.startsWith("waterfall-")) fxLayers++;
    verts += part.mesh.positions.length;
    tris += part.mesh.indices.length / 3;
  }
  return { sheets, fxLayers, verts, tris };
}
