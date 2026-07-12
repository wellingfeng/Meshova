import { vec2 } from "../math/vec2.js";
import { vec3 } from "../math/vec3.js";
import { fbm2, makeNoise } from "../random/noise.js";
import { makeRng, type Rng } from "../random/prng.js";
import { box } from "../geometry/primitives.js";
import { computeNormals, makeMesh, merge, type Mesh } from "../geometry/mesh.js";
import { transform } from "../geometry/transform.js";
import type { NamedPart } from "../geometry/export.js";

export interface StylizedRockIslandOptions {
  seed?: number;
  size?: number;
  cliffHeight?: number;
  chunksPerSide?: number;
  terraces?: number;
  jaggedness?: number;
  grassInset?: number;
}

interface ResolvedStylizedRockIslandOptions {
  seed: number;
  size: number;
  cliffHeight: number;
  chunksPerSide: number;
  terraces: number;
  jaggedness: number;
  grassInset: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolveOptions(options: StylizedRockIslandOptions): ResolvedStylizedRockIslandOptions {
  return {
    seed: Math.round(options.seed ?? 18),
    size: clamp(options.size ?? 6.4, 2.5, 14),
    cliffHeight: clamp(options.cliffHeight ?? 3.8, 1.5, 9),
    chunksPerSide: Math.round(clamp(options.chunksPerSide ?? 8, 3, 16)),
    terraces: Math.round(clamp(options.terraces ?? 2, 0, 4)),
    jaggedness: clamp(options.jaggedness ?? 0.34, 0, 0.8),
    grassInset: clamp(options.grassInset ?? 0.12, 0.02, 0.35),
  };
}

function chunkColumn(
  width: number,
  depth: number,
  height: number,
  taper: number,
  jaggedness: number,
  rng: Rng,
): Mesh {
  const outline = [
    [-0.34, -0.5], [0.34, -0.5], [0.5, -0.32], [0.5, 0.32],
    [0.34, 0.5], [-0.34, 0.5], [-0.5, 0.32], [-0.5, -0.32],
  ] as const;
  const ringCount = 5;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices: number[] = [];
  const pointJitter = outline.map(() => ({ x: rng.range(-1, 1), z: rng.range(-1, 1) }));

  for (let ring = 0; ring < ringCount; ring++) {
    const t = ring / (ringCount - 1);
    const ringScale = 1 - taper * t + rng.range(-0.24, 0.24) * jaggedness;
    const offsetX = rng.range(-0.28, 0.28) * width * jaggedness * t;
    const offsetZ = rng.range(-0.28, 0.28) * depth * jaggedness * t;
    for (let point = 0; point < outline.length; point++) {
      const base = outline[point]!;
      const jitter = pointJitter[point]!;
      const edgeJitter = 1 + jitter.x * jaggedness * 0.28 + rng.range(-0.08, 0.08) * jaggedness;
      positions.push(vec3(
        base[0] * width * ringScale * edgeJitter + offsetX,
        -height * t + rng.range(-0.08, 0.08) * height * jaggedness,
        base[1] * depth * ringScale * (1 + jitter.z * jaggedness * 0.28 + rng.range(-0.08, 0.08) * jaggedness) + offsetZ,
      ));
      normals.push(vec3(0, 1, 0));
      uvs.push(vec2(point / outline.length, t));
    }
  }

  for (let ring = 0; ring < ringCount - 1; ring++) {
    const start = ring * outline.length;
    const nextStart = (ring + 1) * outline.length;
    for (let point = 0; point < outline.length; point++) {
      const next = (point + 1) % outline.length;
      const a = start + point;
      const b = start + next;
      const c = nextStart + next;
      const d = nextStart + point;
      indices.push(a, b, c, a, c, d);
    }
  }

  const topCenter = positions.length;
  positions.push(vec3(0, 0, 0));
  normals.push(vec3(0, 1, 0));
  uvs.push(vec2(0.5, 0.5));
  const bottomCenter = positions.length;
  positions.push(vec3(0, -height, 0));
  normals.push(vec3(0, -1, 0));
  uvs.push(vec2(0.5, 0.5));
  const bottomStart = (ringCount - 1) * outline.length;
  for (let point = 0; point < outline.length; point++) {
    const next = (point + 1) % outline.length;
    indices.push(topCenter, next, point);
    indices.push(bottomCenter, bottomStart + point, bottomStart + next);
  }

  return computeNormals(makeMesh({ positions, normals, uvs, indices }), 24);
}

function topPatch(
  width: number,
  depth: number,
  y: number,
  centerX: number,
  centerZ: number,
  seed: number,
  roughness: number,
): Mesh {
  const resolution = 10;
  const noise = makeNoise(seed);
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices: number[] = [];
  for (let zIndex = 0; zIndex <= resolution; zIndex++) {
    const v = zIndex / resolution;
    for (let xIndex = 0; xIndex <= resolution; xIndex++) {
      const u = xIndex / resolution;
      const edge = Math.min(u, v, 1 - u, 1 - v);
      const edgeDrop = Math.max(0, 0.12 - edge) * roughness * 0.8;
      const lift = fbm2(noise, u * 3.1, v * 3.1, { octaves: 3 }) * roughness * 0.12;
      positions.push(vec3(
        centerX + (u - 0.5) * width,
        y + lift - edgeDrop,
        centerZ + (v - 0.5) * depth,
      ));
      normals.push(vec3(0, 1, 0));
      uvs.push(vec2(u, v));
    }
  }
  const stride = resolution + 1;
  for (let zIndex = 0; zIndex < resolution; zIndex++) {
    for (let xIndex = 0; xIndex < resolution; xIndex++) {
      const a = zIndex * stride + xIndex;
      const b = a + 1;
      const d = a + stride;
      const c = d + 1;
      indices.push(a, c, b, a, d, c);
    }
  }
  return computeNormals(makeMesh({ positions, normals, uvs, indices }), 70);
}

function perimeterPosition(side: number, along: number, radius: number): { x: number; z: number; yaw: number } {
  if (side === 0) return { x: along, z: -radius, yaw: 0 };
  if (side === 1) return { x: radius, z: along, yaw: Math.PI / 2 };
  if (side === 2) return { x: -along, z: radius, yaw: Math.PI };
  return { x: -radius, z: -along, yaw: -Math.PI / 2 };
}

export function buildStylizedRockIslandParts(options: StylizedRockIslandOptions = {}): NamedPart[] {
  const resolved = resolveOptions(options);
  const rng = makeRng(resolved.seed);
  const topY = resolved.cliffHeight * 0.42;
  const chunkWidth = resolved.size / resolved.chunksPerSide;
  const cliffLight: Mesh[] = [];
  const cliffDark: Mesh[] = [];
  const underside: Mesh[] = [];
  const terraceRocks: Mesh[] = [];
  const grass: Mesh[] = [];
  const cracks: Mesh[] = [];

  const core = transform(box(resolved.size * 0.82, resolved.cliffHeight * 0.82, resolved.size * 0.82), {
    translate: vec3(0, topY - resolved.cliffHeight * 0.41, 0),
  });
  cliffDark.push(core);

  for (let side = 0; side < 4; side++) {
    for (let index = 0; index < resolved.chunksPerSide; index++) {
      const along = ((index + 0.5) / resolved.chunksPerSide - 0.5) * resolved.size * 0.94;
      const position = perimeterPosition(side, along, resolved.size * 0.46);
      const width = chunkWidth * rng.range(0.82, 1.18);
      const depth = chunkWidth * rng.range(0.75, 1.25);
      const height = resolved.cliffHeight * rng.range(0.72, 1.08);
      const column = transform(chunkColumn(
        width,
        depth,
        height,
        rng.range(0.08, 0.28),
        resolved.jaggedness,
        rng.fork(),
      ), {
        rotate: vec3(rng.range(-0.07, 0.07), position.yaw + rng.range(-0.12, 0.12), rng.range(-0.07, 0.07)),
        translate: vec3(position.x, topY + rng.range(-0.12, 0.1), position.z),
      });
      (rng.next() < 0.12 ? cliffDark : cliffLight).push(column);
    }
  }

  const undersideCount = resolved.chunksPerSide * 2 + 4;
  for (let index = 0; index < undersideCount; index++) {
    const angle = (index / undersideCount) * Math.PI * 2 + rng.range(-0.16, 0.16);
    const radius = resolved.size * rng.range(0.08, 0.34);
    const height = resolved.cliffHeight * rng.range(0.55, 1.02);
    underside.push(transform(chunkColumn(
      chunkWidth * rng.range(0.9, 1.55),
      chunkWidth * rng.range(0.8, 1.35),
      height,
      rng.range(0.42, 0.72),
      resolved.jaggedness,
      rng.fork(),
    ), {
      rotate: vec3(rng.range(-0.08, 0.08), angle, rng.range(-0.08, 0.08)),
      translate: vec3(Math.cos(angle) * radius, topY - resolved.cliffHeight * 0.56, Math.sin(angle) * radius),
    }));
  }

  const ledgeCount = Math.max(6, resolved.chunksPerSide);
  for (let index = 0; index < ledgeCount; index++) {
    const side = index % 4;
    const along = rng.range(-resolved.size * 0.36, resolved.size * 0.36);
    const position = perimeterPosition(side, along, resolved.size * 0.52);
    cliffLight.push(transform(chunkColumn(
      chunkWidth * rng.range(0.65, 1.15),
      chunkWidth * rng.range(0.45, 0.8),
      resolved.cliffHeight * rng.range(0.12, 0.22),
      0.08,
      resolved.jaggedness,
      rng.fork(),
    ), {
      rotate: vec3(0, position.yaw + rng.range(-0.12, 0.12), 0),
      translate: vec3(position.x, topY - resolved.cliffHeight * rng.range(0.28, 0.7), position.z),
    }));
  }

  const mainGrassSize = resolved.size * (1 - resolved.grassInset * 2);
  grass.push(topPatch(mainGrassSize, mainGrassSize, topY + 0.08, 0, 0, resolved.seed + 200, resolved.jaggedness));

  let terraceY = topY;
  let terraceSize = resolved.size * 0.42;
  let centerX = resolved.size * 0.06;
  let centerZ = resolved.size * 0.04;
  for (let level = 0; level < resolved.terraces; level++) {
    const height = resolved.cliffHeight * rng.range(0.1, 0.16);
    terraceY += height;
    const depth = terraceSize * rng.range(0.62, 0.82);
    terraceRocks.push(transform(chunkColumn(
      terraceSize,
      depth,
      height,
      0.05,
      resolved.jaggedness * 0.8,
      rng.fork(),
    ), {
      translate: vec3(centerX, terraceY, centerZ),
    }));
    grass.push(topPatch(
      terraceSize * (1 - resolved.grassInset),
      depth * (1 - resolved.grassInset),
      terraceY + 0.06,
      centerX,
      centerZ,
      resolved.seed + 300 + level,
      resolved.jaggedness * 0.8,
    ));
    terraceSize *= rng.range(0.48, 0.68);
    centerX += rng.range(-0.18, 0.22) * terraceSize;
    centerZ += rng.range(-0.18, 0.22) * terraceSize;
  }

  for (let index = 0; index < 5; index++) {
    const length = resolved.size * rng.range(0.12, 0.28);
    cracks.push(transform(box(length, 0.035, resolved.size * rng.range(0.012, 0.025)), {
      rotate: vec3(0, rng.range(0, Math.PI), 0),
      translate: vec3(
        rng.range(-resolved.size * 0.3, resolved.size * 0.3),
        topY + 0.085,
        rng.range(-resolved.size * 0.3, resolved.size * 0.3),
      ),
    }));
  }

  return [
    {
      name: "cliff_faces",
      label: "分块崖壁",
      mesh: merge(...cliffLight),
      color: [0.34, 0.38, 0.4],
      surface: { type: "plastic", params: { color: [0.34, 0.38, 0.4], roughness: 0.92 } },
    },
    {
      name: "recessed_rock",
      label: "岩缝暗面",
      mesh: merge(...cliffDark, ...cracks),
      color: [0.22, 0.27, 0.31],
      surface: { type: "plastic", params: { color: [0.22, 0.27, 0.31], roughness: 0.96 } },
    },
    {
      name: "underside_spires",
      label: "底部锥岩",
      mesh: merge(...underside),
      color: [0.28, 0.32, 0.35],
      surface: { type: "plastic", params: { color: [0.28, 0.32, 0.35], roughness: 0.94 } },
    },
    {
      name: "terrace_rocks",
      label: "阶梯岩台",
      mesh: terraceRocks.length > 0 ? merge(...terraceRocks) : box(0.001, 0.001, 0.001),
      color: [0.38, 0.41, 0.4],
      surface: { type: "plastic", params: { color: [0.38, 0.41, 0.4], roughness: 0.9 } },
    },
    {
      name: "grass_caps",
      label: "草地顶盖",
      mesh: merge(...grass),
      color: [0.56, 0.64, 0.18],
      surface: { type: "stylizedFoliage", params: { color: [0.56, 0.64, 0.18], seed: resolved.seed + 4 } },
    },
  ];
}
