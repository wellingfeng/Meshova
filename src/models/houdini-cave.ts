import { vec3, type Vec3 } from "../math/vec3.js";
import { fbm3, makeNoise } from "../random/noise.js";
import { makeRng } from "../random/prng.js";
import type { NamedPart } from "../geometry/export.js";
import { bounds, type Mesh } from "../geometry/mesh.js";
import { polygonizeField } from "../geometry/remesh.js";
import { rock } from "../geometry/rock.js";
import { transform } from "../geometry/transform.js";
import { normalizeUV, planarUV } from "../geometry/uv.js";
import { sdfEllipsoid, sdfToScalarGrid } from "../field/sdf.js";

export interface HoudiniCaveOptions {
  seed?: number;
  width?: number;
  height?: number;
  depth?: number;
  wallThickness?: number;
  entranceWidth?: number;
  entranceHeight?: number;
  entranceDepth?: number;
  entranceOffsetZ?: number;
  roughness?: number;
  surfaceDetail?: number;
  resolution?: number;
  entranceRocks?: number;
  color?: [number, number, number];
}

interface ResolvedCaveOptions extends Required<HoudiniCaveOptions> {}

function resolveOptions(options: HoudiniCaveOptions): ResolvedCaveOptions {
  const width = Math.max(2, options.width ?? 12);
  const height = Math.max(1.5, options.height ?? 4);
  const depth = Math.max(2, options.depth ?? 8);
  return {
    seed: (options.seed ?? 19) >>> 0,
    width,
    height,
    depth,
    wallThickness: Math.max(0.08, options.wallThickness ?? 0.34),
    entranceWidth: Math.max(0.5, options.entranceWidth ?? width * 0.232),
    entranceHeight: Math.max(0.7, options.entranceHeight ?? height * 0.83),
    entranceDepth: Math.max(0.5, options.entranceDepth ?? depth * 0.3),
    entranceOffsetZ: options.entranceOffsetZ ?? depth * 0.125,
    roughness: Math.max(0, options.roughness ?? 0.58),
    surfaceDetail: Math.max(0, options.surfaceDetail ?? 0.16),
    resolution: Math.max(20, Math.min(96, Math.floor(options.resolution ?? 56))),
    entranceRocks: Math.max(0, Math.min(3, Math.floor(options.entranceRocks ?? 3))),
    color: options.color ?? [0.34, 0.3, 0.25],
  };
}

function smoothMax(a: number, b: number, radius: number): number {
  if (radius <= 0) return Math.max(a, b);
  const h = Math.max(0, Math.min(1, 0.5 - 0.5 * (b - a) / radius));
  return b + (a - b) * h + radius * h * (1 - h);
}

export function buildHoudiniCaveMesh(options: HoudiniCaveOptions = {}): Mesh {
  const cave = resolveOptions(options);
  const radii = vec3(cave.width * 0.5, cave.height * 0.5, cave.depth * 0.5);
  const center = vec3(0, radii.y, 0);
  const entranceCenter = vec3(
    cave.entranceOffsetZ,
    cave.height * 0.375,
    cave.depth * 0.438,
  );
  const entranceRadii = vec3(
    cave.entranceWidth * 0.5,
    cave.entranceHeight * 0.5,
    cave.entranceDepth * 0.5,
  );
  const baseEllipsoid = sdfEllipsoid(radii, center);
  const entranceEllipsoid = sdfEllipsoid(entranceRadii, entranceCenter);
  const coarseNoise = makeNoise(cave.seed);
  const detailNoise = makeNoise(cave.seed + 101);
  const warpNoise = makeNoise(cave.seed + 211);
  const seamRadius = Math.min(cave.wallThickness * 0.8, cave.entranceWidth * 0.12);

  const field = (point: Vec3): number => {
    const coarse = fbm3(
      coarseNoise,
      point.x * 0.17,
      point.y * 0.3,
      point.z * 0.22,
      { octaves: 4, gain: 0.52 },
    );
    const chips = fbm3(
      detailNoise,
      point.x * 0.72,
      point.y * 0.9,
      point.z * 0.78,
      { octaves: 3, gain: 0.48 },
    );
    const mountain = coarse * cave.roughness + chips * cave.surfaceDetail;
    const directional = fbm3(
      warpNoise,
      point.x * 0.1,
      point.y * 0.8,
      point.z * 0.8,
      { octaves: 3, gain: 0.5 },
    );
    const rockyBody = baseEllipsoid(point) - mountain - directional * cave.surfaceDetail * 0.32;
    const shell = Math.max(-rockyBody, rockyBody - cave.wallThickness);
    return smoothMax(shell, -entranceEllipsoid(point), seamRadius);
  };

  const margin = cave.wallThickness + cave.roughness + cave.surfaceDetail + cave.width / cave.resolution * 2;
  const grid = sdfToScalarGrid(field, {
    min: vec3(center.x - radii.x - margin, center.y - radii.y - margin, center.z - radii.z - margin),
    max: vec3(center.x + radii.x + margin, center.y + radii.y + margin, center.z + radii.z + margin),
    resolution: cave.resolution,
  });
  return normalizeUV(planarUV(polygonizeField(grid), { axis: "z" }));
}

function groundedRock(seed: number, radius: number, stretch: Vec3, position: Vec3): Mesh {
  const mesh = rock({
    seed,
    radius,
    detail: 2,
    lumpiness: 0.34,
    roughness: 0.1,
    flatBase: 0.36,
    stretch,
    cusp: 26,
  });
  const minY = bounds(mesh).min.y;
  return transform(mesh, {
    rotate: vec3(0, (seed % 17) * 0.31, 0),
    translate: vec3(position.x, position.y - minY, position.z),
  });
}

export function buildHoudiniCaveParts(options: HoudiniCaveOptions = {}): NamedPart[] {
  const cave = resolveOptions(options);
  const parts: NamedPart[] = [{
    name: "caveShell",
    label: "山洞岩壁",
    mesh: buildHoudiniCaveMesh(cave),
    color: cave.color,
    surface: { type: "stone", params: { color: cave.color, roughness: 0.94, scale: 5.5 } },
    metadata: {
      sourceMethod: "ellipsoid-mountain-boolean-shell-vdb-displace",
      sourceScene: "Houdini 程序化生成山洞 以及 岩石.hip",
    },
  }];
  const rng = makeRng(cave.seed + 701);
  const rockPositions = [
    vec3(cave.entranceOffsetZ - cave.entranceWidth * 0.72, 0, cave.depth * 0.45),
    vec3(cave.entranceOffsetZ + cave.entranceWidth * 0.76, 0, cave.depth * 0.46),
    vec3(cave.entranceOffsetZ - cave.entranceWidth * 1.05, 0, cave.depth * 0.34),
  ];
  for (let index = 0; index < cave.entranceRocks; index++) {
    const radius = cave.height * (0.12 + rng.next() * 0.08);
    const mesh = groundedRock(
      cave.seed + 31 + index * 53,
      radius,
      vec3(0.85 + rng.next() * 0.45, 0.65 + rng.next() * 0.45, 0.8 + rng.next() * 0.4),
      rockPositions[index]!,
    );
    parts.push({
      name: `entranceRock${index + 1}`,
      label: `入口岩石 ${index + 1}`,
      mesh,
      color: cave.color,
      surface: { type: "stone", params: { color: cave.color, roughness: 0.96, scale: 1.9 } },
    });
  }
  return parts;
}
