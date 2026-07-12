import { box } from "../geometry/primitives.js";
import type { NamedPart } from "../geometry/export.js";
import { merge, type Mesh } from "../geometry/mesh.js";
import { transform } from "../geometry/transform.js";
import { vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import { buildLowPolyIvyParts, type LowPolyIvyForm } from "./ivy-lowpoly-kit.js";

type RGB = [number, number, number];

export interface CrazyIvyWallOptions {
  seed?: number;
  width?: number;
  height?: number;
  wallDepth?: number;
  coverage?: number;
  hanging?: number;
  branching?: number;
  leafSize?: number;
  leafDensity?: number;
  dryness?: number;
  autumn?: number;
  lod?: number;
}

interface ResolvedOptions {
  seed: number;
  width: number;
  height: number;
  wallDepth: number;
  coverage: number;
  hanging: number;
  branching: number;
  leafSize: number;
  leafDensity: number;
  dryness: number;
  autumn: number;
  lod: number;
}

interface PartBucket {
  template: NamedPart;
  meshes: Mesh[];
  windWeight: number[];
}

const WALL: RGB = [0.72, 0.7, 0.64];
const WALL_CAP: RGB = [0.58, 0.57, 0.53];
const STEM: RGB = [0.24, 0.14, 0.065];
const MATURE_GREEN: RGB = [0.075, 0.29, 0.035];
const YOUNG_GREEN: RGB = [0.25, 0.52, 0.075];
const MATURE_AUTUMN: RGB = [0.55, 0.035, 0.02];
const YOUNG_AUTUMN: RGB = [0.78, 0.16, 0.025];
const DRY: RGB = [0.43, 0.25, 0.065];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolveOptions(options: CrazyIvyWallOptions): ResolvedOptions {
  return {
    seed: Math.round(options.seed ?? 45),
    width: Math.max(2, options.width ?? 8),
    height: Math.max(1.5, options.height ?? 4.2),
    wallDepth: Math.max(0.12, options.wallDepth ?? 0.38),
    coverage: clamp(options.coverage ?? 0.82, 0.08, 1.4),
    hanging: clamp(options.hanging ?? 0.48, 0, 1),
    branching: clamp(options.branching ?? 0.62, 0, 1),
    leafSize: Math.max(0.04, options.leafSize ?? 0.18),
    leafDensity: Math.max(0, options.leafDensity ?? 8.5),
    dryness: clamp(options.dryness ?? 0.06, 0, 1),
    autumn: clamp(options.autumn ?? 0, 0, 1),
    lod: Math.round(clamp(options.lod ?? 1, 0, 3)),
  };
}

function mixColor(a: RGB, b: RGB, amount: number): RGB {
  return [
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
  ];
}

function ivyColor(name: string, autumn: number): RGB {
  if (name === "leaves_mature") return mixColor(MATURE_GREEN, MATURE_AUTUMN, autumn);
  if (name === "leaves_young") return mixColor(YOUNG_GREEN, YOUNG_AUTUMN, autumn);
  if (name === "leaves_dry") return DRY;
  return STEM;
}

function addIvyCluster(
  buckets: Map<string, PartBucket>,
  parts: NamedPart[],
  offsetX: number,
  offsetY: number,
  offsetZ: number,
): void {
  for (const part of parts) {
    const mesh = transform(part.mesh, { translate: vec3(offsetX, offsetY, offsetZ) });
    const bucket = buckets.get(part.name) ?? {
      template: part,
      meshes: [],
      windWeight: [],
    };
    bucket.meshes.push(mesh);
    if (part.windWeight?.length === part.mesh.positions.length) {
      bucket.windWeight.push(...part.windWeight);
    } else {
      bucket.windWeight.push(...new Array<number>(part.mesh.positions.length).fill(0));
    }
    buckets.set(part.name, bucket);
  }
}

function buildCluster(
  resolved: ResolvedOptions,
  seed: number,
  form: LowPolyIvyForm,
  width: number,
  height: number,
  strands: number,
): NamedPart[] {
  return buildLowPolyIvyParts({
    seed,
    form,
    width,
    height,
    depth: resolved.wallDepth * 0.34,
    strands,
    branches: 1 + Math.round(resolved.branching * 3),
    stemRadius: resolved.leafSize * 0.105,
    leafSize: resolved.leafSize,
    leafDensity: resolved.leafDensity,
    lushness: 0.72 + resolved.coverage * 0.46,
    dryness: resolved.dryness,
    lod: resolved.lod,
  });
}

function buildIvy(resolved: ResolvedOptions): NamedPart[] {
  const rng = makeRng(resolved.seed);
  const buckets = new Map<string, PartBucket>();
  const frontZ = resolved.wallDepth * 0.5 + 0.025;
  const climbingClusters = Math.max(2, Math.round(resolved.width * resolved.coverage / 1.3));
  const cellWidth = resolved.width / climbingClusters;

  for (let index = 0; index < climbingClusters; index++) {
    const x = -resolved.width * 0.5 + cellWidth * (index + 0.5)
      + rng.range(-0.18, 0.18) * cellWidth;
    const clusterWidth = cellWidth * rng.range(1.35, 1.85);
    const clusterHeight = resolved.height * rng.range(0.76, 1.08);
    const strands = Math.max(2, Math.round(2.4 + resolved.coverage * 3.3 + rng.range(-0.5, 0.5)));
    addIvyCluster(
      buckets,
      buildCluster(resolved, resolved.seed + index * 97, "wall", clusterWidth, clusterHeight, strands),
      x,
      0,
      frontZ,
    );
  }

  const curtainClusters = Math.max(0, Math.round(resolved.width * resolved.coverage * resolved.hanging / 1.7));
  if (curtainClusters > 0) {
    const curtainCell = resolved.width / curtainClusters;
    for (let index = 0; index < curtainClusters; index++) {
      const x = -resolved.width * 0.5 + curtainCell * (index + 0.5)
        + rng.range(-0.22, 0.22) * curtainCell;
      const curtainHeight = resolved.height * rng.range(0.32, 0.58) * (0.65 + resolved.hanging * 0.7);
      const form: LowPolyIvyForm = index % 3 === 0 ? "hanging" : "curtain";
      const strands = Math.max(2, Math.round(2 + resolved.coverage * 3));
      addIvyCluster(
        buckets,
        buildCluster(
          resolved,
          resolved.seed + 1000 + index * 131,
          form,
          curtainCell * rng.range(1.25, 1.8),
          curtainHeight,
          strands,
        ),
        x,
        resolved.height - curtainHeight,
        frontZ + resolved.wallDepth * 0.08,
      );
    }
  }

  return [...buckets.entries()].map(([name, bucket]) => {
    const color = ivyColor(name, resolved.autumn);
    const isLeaf = name.startsWith("leaves_");
    return {
      ...bucket.template,
      name: name === "stem" ? "ivy_stem" : `ivy_${name}`,
      label: name === "stem" ? "攀墙木质藤茎" : (bucket.template.label ?? "常春藤叶片"),
      mesh: merge(...bucket.meshes),
      color,
      surface: isLeaf
        ? { type: "foliage", params: { color, seed: resolved.seed, veinStrength: 0.3, translucency: 0.38 } }
        : { type: "bark", params: { color, roughness: 0.92, scale: 2.8 } },
      windWeight: bucket.windWeight,
      metadata: {
        ...(bucket.template.metadata ?? {}),
        sourceReference: "Bilibili BV1YL411r7Cg / Crazy Ivy",
        growthModel: "seeded surface coverage plus gravity-hanging edge growth",
      },
    };
  });
}

export function buildCrazyIvyWallParts(options: CrazyIvyWallOptions = {}): NamedPart[] {
  const resolved = resolveOptions(options);
  const wall = transform(box(resolved.width, resolved.height, resolved.wallDepth), {
    translate: vec3(0, resolved.height * 0.5, 0),
  });
  const cap = transform(box(resolved.width + 0.16, 0.14, resolved.wallDepth + 0.12), {
    translate: vec3(0, resolved.height + 0.07, 0),
  });

  return [
    {
      name: "wall_body",
      label: "灰泥墙体",
      mesh: wall,
      color: WALL,
      surface: { type: "concrete", params: { color: WALL, roughness: 0.96, seed: resolved.seed + 17 } },
    },
    {
      name: "wall_coping",
      label: "墙顶压条",
      mesh: cap,
      color: WALL_CAP,
      surface: { type: "stone", params: { color: WALL_CAP, roughness: 0.92, seed: resolved.seed + 29 } },
    },
    ...buildIvy(resolved),
  ];
}
