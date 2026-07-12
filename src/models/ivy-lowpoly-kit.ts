import { vec2 } from "../math/vec2.js";
import type { Vec3 } from "../math/vec3.js";
import { add, length, normalize, scale, sub, vec3 } from "../math/vec3.js";
import { makeRng, type Rng } from "../random/prng.js";
import { polyline, sweep } from "../geometry/curve.js";
import type { NamedPart } from "../geometry/export.js";
import { makeMesh, merge, type Mesh } from "../geometry/mesh.js";
import { transform, translateMesh } from "../geometry/transform.js";

export type LowPolyIvyForm = "wall" | "hanging" | "runner" | "curtain" | "sparse";

export interface LowPolyIvyOptions {
  seed?: number;
  form?: LowPolyIvyForm;
  width?: number;
  height?: number;
  depth?: number;
  strands?: number;
  branches?: number;
  stemRadius?: number;
  leafSize?: number;
  leafDensity?: number;
  lushness?: number;
  dryness?: number;
  lod?: number;
}

export interface LowPolyIvyKitOptions {
  seed?: number;
  variants?: number;
  columns?: number;
  scale?: number;
  lushness?: number;
  dryness?: number;
  lod?: number;
}

interface ResolvedIvyOptions {
  seed: number;
  form: LowPolyIvyForm;
  width: number;
  height: number;
  depth: number;
  strands: number;
  branches: number;
  stemRadius: number;
  leafSize: number;
  leafDensity: number;
  lushness: number;
  dryness: number;
  lod: number;
}

interface IvyStrand {
  points: Vec3[];
  radius: number;
  depth: number;
}

interface PathSpec {
  origin: Vec3;
  direction: Vec3;
  length: number;
  sag: number;
}

const LOD_DENSITY = [1, 0.68, 0.42, 0.22] as const;
const LOD_SIDES = [6, 5, 4, 3] as const;
const FORMS: LowPolyIvyForm[] = ["wall", "hanging", "curtain", "runner", "sparse"];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolveOptions(options: LowPolyIvyOptions): ResolvedIvyOptions {
  return {
    seed: Math.round(options.seed ?? 23),
    form: options.form ?? "wall",
    width: Math.max(0.3, options.width ?? 2.2),
    height: Math.max(0.3, options.height ?? 2.8),
    depth: Math.max(0, options.depth ?? 0.18),
    strands: Math.max(1, Math.round(options.strands ?? 4)),
    branches: Math.max(0, Math.round(options.branches ?? 2)),
    stemRadius: Math.max(0.004, options.stemRadius ?? 0.024),
    leafSize: Math.max(0.025, options.leafSize ?? 0.16),
    leafDensity: Math.max(0, options.leafDensity ?? 7.5),
    lushness: Math.max(0.1, options.lushness ?? 1),
    dryness: clamp(options.dryness ?? 0.08, 0, 1),
    lod: Math.round(clamp(options.lod ?? 0, 0, 3)),
  };
}

function ivyLeafMesh(): Mesh {
  const contour = [
    vec3(0, -0.54, 0),
    vec3(0.25, -0.2, 0),
    vec3(0.54, 0.02, 0),
    vec3(0.25, 0.1, 0),
    vec3(0.34, 0.34, 0),
    vec3(0, 0.6, 0.035),
    vec3(-0.34, 0.34, 0),
    vec3(-0.25, 0.1, 0),
    vec3(-0.54, 0.02, 0),
    vec3(-0.25, -0.2, 0),
  ];
  const positions = [...contour, vec3(0, 0.05, 0.025)];
  const normals = positions.map(() => vec3(0, 0, 1));
  const uvs = positions.map((point) => vec2(point.x / 1.08 + 0.5, point.y / 1.14 + 0.48));
  const indices: number[] = [];
  const center = contour.length;
  for (let index = 0; index < contour.length; index++) {
    indices.push(center, index, (index + 1) % contour.length);
  }
  return makeMesh({ positions, normals, uvs, indices });
}

const IVY_LEAF = ivyLeafMesh();

function wavyPath(
  rng: Rng,
  spec: PathSpec,
  steps: number,
  wander: number,
  depth: number,
): Vec3[] {
  const direction = normalize(spec.direction);
  const lateralRaw = vec3(-direction.y, direction.x, 0);
  const lateral = length(lateralRaw) > 1e-6 ? normalize(lateralRaw) : vec3(1, 0, 0);
  const phase = rng.range(0, Math.PI * 2);
  const depthPhase = rng.range(0, Math.PI * 2);
  const cycles = rng.range(1.2, 2.4);
  const points: Vec3[] = [];
  for (let index = 0; index <= steps; index++) {
    const t = index / steps;
    const envelope = Math.sin(Math.PI * t);
    const sideways = Math.sin(phase + t * Math.PI * cycles) * wander * envelope;
    const forward = scale(direction, spec.length * t);
    const sag = vec3(0, -spec.sag * spec.length * t * t, 0);
    const out = vec3(0, 0, Math.sin(depthPhase + t * Math.PI * 2.2) * depth * envelope);
    points.push(add(add(add(spec.origin, forward), scale(lateral, sideways)), add(sag, out)));
  }
  return points;
}

function baseSpecs(rng: Rng, options: ResolvedIvyOptions): PathSpec[] {
  const specs: PathSpec[] = [];
  const count = Math.max(1, Math.round(options.strands * options.lushness));
  for (let index = 0; index < count; index++) {
    const fraction = count === 1 ? 0.5 : index / (count - 1);
    const across = (fraction - 0.5) * options.width * 0.72 + rng.range(-0.08, 0.08) * options.width;
    if (options.form === "hanging" || options.form === "curtain") {
      const spread = options.form === "curtain" ? 0.94 : 0.62;
      specs.push({
        origin: vec3(across * spread, options.height, rng.range(-options.depth, options.depth) * 0.25),
        direction: vec3(rng.range(-0.22, 0.22), -1, 0),
        length: options.height * rng.range(options.form === "curtain" ? 0.78 : 0.58, 1.04),
        sag: 0.03,
      });
    } else if (options.form === "runner") {
      specs.push({
        origin: vec3(-options.width * 0.5, 0.12 + index * 0.025, rng.range(-options.depth, options.depth)),
        direction: vec3(1, rng.range(0.02, 0.12), rng.range(-0.08, 0.08)),
        length: options.width * rng.range(0.82, 1.08),
        sag: 0.035,
      });
    } else {
      const sparse = options.form === "sparse";
      specs.push({
        origin: vec3(across * (sparse ? 0.35 : 0.22), 0, rng.range(-options.depth, options.depth) * 0.25),
        direction: vec3(rng.range(-0.38, 0.38) + (fraction - 0.5) * 0.35, 1, 0),
        length: options.height * rng.range(sparse ? 0.88 : 0.72, 1.08),
        sag: sparse ? 0.015 : 0.035,
      });
    }
  }
  return specs;
}

function sampleStrand(strand: IvyStrand, t: number): { point: Vec3; tangent: Vec3 } {
  const maxIndex = strand.points.length - 1;
  const scaled = clamp(t, 0, 1) * maxIndex;
  const index = Math.min(maxIndex - 1, Math.floor(scaled));
  const fraction = scaled - index;
  const a = strand.points[index]!;
  const b = strand.points[index + 1]!;
  return {
    point: add(a, scale(sub(b, a), fraction)),
    tangent: normalize(sub(b, a)),
  };
}

function growStrands(rng: Rng, options: ResolvedIvyOptions): IvyStrand[] {
  const densityFactor = LOD_DENSITY[options.lod]!;
  const steps = Math.max(5, Math.round((10 + options.height * 3) * Math.sqrt(densityFactor)));
  const sparseFactor = options.form === "sparse" ? 0.58 : 1;
  const strands: IvyStrand[] = [];
  for (const spec of baseSpecs(rng, options)) {
    const main: IvyStrand = {
      points: wavyPath(rng, spec, steps, options.width * 0.11, options.depth),
      radius: options.stemRadius * rng.range(0.85, 1.18),
      depth: 0,
    };
    strands.push(main);
    const branchCount = Math.max(0, Math.round(options.branches * options.lushness * sparseFactor));
    for (let branchIndex = 0; branchIndex < branchCount; branchIndex++) {
      const t = rng.range(0.22, 0.78);
      const { point, tangent } = sampleStrand(main, t);
      const side = branchIndex % 2 === 0 ? 1 : -1;
      let direction: Vec3;
      if (options.form === "hanging" || options.form === "curtain") {
        direction = normalize(vec3(side * rng.range(0.45, 0.9), -rng.range(0.45, 0.9), rng.range(-0.16, 0.16)));
      } else if (options.form === "runner") {
        direction = normalize(vec3(tangent.x * 0.55 + side * 0.2, rng.range(0.45, 0.9), rng.range(-0.2, 0.2)));
      } else {
        direction = normalize(vec3(side * rng.range(0.55, 1), rng.range(0.28, 0.72), rng.range(-0.18, 0.18)));
      }
      const branchLength = spec.length * rng.range(0.24, 0.48);
      strands.push({
        points: wavyPath(
          rng,
          { origin: point, direction, length: branchLength, sag: options.form === "runner" ? 0.08 : 0.025 },
          Math.max(4, Math.round(steps * 0.55)),
          options.width * 0.065,
          options.depth * 0.72,
        ),
        radius: main.radius * rng.range(0.5, 0.68),
        depth: 1,
      });
    }
  }
  return strands;
}

function strandLength(strand: IvyStrand): number {
  let total = 0;
  for (let index = 1; index < strand.points.length; index++) {
    total += length(sub(strand.points[index]!, strand.points[index - 1]!));
  }
  return total;
}

function leafDirection(form: LowPolyIvyForm, side: number, rng: Rng): Vec3 {
  if (form === "hanging" || form === "curtain") {
    return normalize(vec3(side * rng.range(0.55, 1), rng.range(-0.18, 0.28), 0));
  }
  if (form === "runner") {
    return normalize(vec3(rng.range(-0.25, 0.25), rng.range(0.65, 1), 0));
  }
  return normalize(vec3(side * rng.range(0.5, 0.95), rng.range(0.28, 0.72), 0));
}

function buildLeafGroups(
  rng: Rng,
  strands: IvyStrand[],
  options: ResolvedIvyOptions,
): { mature: Mesh[]; young: Mesh[]; dry: Mesh[] } {
  const groups = { mature: [] as Mesh[], young: [] as Mesh[], dry: [] as Mesh[] };
  const density = options.leafDensity * options.lushness * LOD_DENSITY[options.lod]!
    * (options.form === "sparse" ? 0.42 : 1);
  let sequence = 0;
  for (const strand of strands) {
    const count = Math.max(0, Math.round(strandLength(strand) * density));
    for (let index = 0; index < count; index++) {
      const t = 0.08 + ((index + 0.5) / Math.max(1, count)) * 0.9;
      const { point } = sampleStrand(strand, t);
      const side = (sequence++ + strand.depth) % 2 === 0 ? 1 : -1;
      const direction = leafDirection(options.form, side, rng);
      const taper = 0.75 + Math.sin(Math.PI * t) * 0.28;
      const size = options.leafSize * taper * rng.range(0.76, 1.22);
      const angle = Math.atan2(-direction.x, direction.y);
      const center = add(
        add(point, scale(direction, size * 0.52)),
        vec3(0, 0, options.depth * rng.range(0.06, 0.42) + strand.radius * 0.7),
      );
      const leaf = transform(IVY_LEAF, {
        scale: vec3(size, size, size),
        rotate: vec3(rng.range(-0.32, 0.32), rng.range(-0.38, 0.38), angle),
        translate: center,
      });
      if (rng.next() < options.dryness) groups.dry.push(leaf);
      else if (rng.next() < 0.28) groups.young.push(leaf);
      else groups.mature.push(leaf);
    }
  }
  return groups;
}

function pushLeafPart(
  parts: NamedPart[],
  name: string,
  label: string,
  meshes: Mesh[],
  color: [number, number, number],
  seed: number,
): void {
  if (meshes.length === 0) return;
  const mesh = merge(...meshes);
  parts.push({
    name,
    label,
    mesh,
    color,
    surface: { type: "foliage", params: { color, seed, veinStrength: 0.22, translucency: 0.34 } },
    doubleSided: true,
    windWeight: mesh.positions.map(() => 1),
  });
}

export function buildLowPolyIvyParts(options: LowPolyIvyOptions = {}): NamedPart[] {
  const resolved = resolveOptions(options);
  const rng = makeRng(resolved.seed);
  const strands = growStrands(rng, resolved);
  const sides = LOD_SIDES[resolved.lod]!;
  const stems = strands.map((strand) => sweep(polyline(strand.points), {
    radius: strand.radius,
    sides,
    radiusAt: (t) => Math.max(0.16, 1 - t * (strand.depth === 0 ? 0.72 : 0.84)),
    caps: false,
  }));
  const stemMesh = merge(...stems);
  const parts: NamedPart[] = [{
    name: "stem",
    label: "木质藤茎",
    mesh: stemMesh,
    color: [0.28, 0.19, 0.1],
    surface: { type: "bark", params: { color: [0.28, 0.19, 0.1], roughness: 0.92, scale: 2.4 } },
    windWeight: stemMesh.positions.map((_, index) => (index % (sides + 1)) / Math.max(1, sides)),
    metadata: {
      form: resolved.form,
      lod: resolved.lod,
      sourceStudy: "UE5 VOL23 Ivy Low Poly",
      representation: "procedural geometry",
    },
  }];
  const leaves = buildLeafGroups(rng, strands, resolved);
  pushLeafPart(parts, "leaves_mature", "成熟常春藤叶", leaves.mature, [0.12, 0.38, 0.08], resolved.seed + 101);
  pushLeafPart(parts, "leaves_young", "嫩绿常春藤叶", leaves.young, [0.34, 0.58, 0.13], resolved.seed + 211);
  pushLeafPart(parts, "leaves_dry", "枯黄常春藤叶", leaves.dry, [0.46, 0.29, 0.08], resolved.seed + 307);
  return parts;
}

export function buildLowPolyIvyKitParts(options: LowPolyIvyKitOptions = {}): NamedPart[] {
  const seed = Math.round(options.seed ?? 23);
  const variants = Math.max(1, Math.round(options.variants ?? 10));
  const columns = Math.max(1, Math.round(options.columns ?? 5));
  const modelScale = Math.max(0.2, options.scale ?? 1);
  const buckets = new Map<string, { template: NamedPart; meshes: Mesh[]; wind: number[] }>();
  for (let index = 0; index < variants; index++) {
    const form = FORMS[index % FORMS.length]!;
    const localRng = makeRng(seed + index * 97);
    const width = localRng.range(1.4, 2.8) * modelScale;
    const height = localRng.range(1.8, 3.6) * modelScale;
    const parts = buildLowPolyIvyParts({
      seed: seed + index * 97,
      form,
      width,
      height,
      depth: localRng.range(0.08, 0.26) * modelScale,
      strands: localRng.int(form === "sparse" ? 1 : 3, form === "sparse" ? 3 : 6),
      branches: localRng.int(1, 3),
      stemRadius: localRng.range(0.016, 0.032) * modelScale,
      leafSize: localRng.range(0.11, 0.19) * modelScale,
      leafDensity: localRng.range(5.5, 9.5),
      lushness: options.lushness ?? 1,
      dryness: clamp((options.dryness ?? 0.12) + (index % 4 === 3 ? 0.25 : 0), 0, 1),
      lod: options.lod ?? 0,
    });
    const column = index % columns;
    const row = Math.floor(index / columns);
    const offset = vec3((column - (columns - 1) * 0.5) * 3.6 * modelScale, 0, row * 3.2 * modelScale);
    for (const part of parts) {
      const bucket = buckets.get(part.name) ?? { template: part, meshes: [], wind: [] };
      bucket.meshes.push(translateMesh(part.mesh, offset));
      if (part.windWeight) bucket.wind.push(...part.windWeight);
      buckets.set(part.name, bucket);
    }
  }
  return [...buckets.values()].map(({ template, meshes, wind }) => ({
    ...template,
    label: `套件·${template.label ?? template.name}`,
    mesh: merge(...meshes),
    windWeight: wind,
    metadata: {
      ...template.metadata,
      variants,
      kit: true,
    },
  }));
}
