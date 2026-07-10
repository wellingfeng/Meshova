/**
 * Copy-to-points / instance plan layer. Point clouds remain inspectable until
 * the last step, then an InstancePlan is realized into one merged Mesh.
 */
import type { Vec3 } from "../math/vec3.js";
import { add, cross, dot, normalize, scale, vec3 } from "../math/vec3.js";
import type { Mesh } from "./mesh.js";
import { makeMesh, merge } from "./mesh.js";
import {
  evalPointScalar,
  makePointCloud,
  pointContext,
  type PointCloud,
  type PointScalar,
} from "./point-cloud.js";
import { transform, translateMesh } from "./transform.js";

export interface InstanceRecord {
  readonly mesh: Mesh;
  readonly position: Vec3;
  readonly normal: Vec3;
  readonly scale: number;
  readonly yaw: number;
  readonly variant: number;
  readonly alignToNormal: boolean;
}

export interface InstancePlan {
  readonly instances: ReadonlyArray<InstanceRecord>;
}

export interface InstancePlanOptions {
  readonly scale?: PointScalar;
  readonly yaw?: PointScalar;
  readonly variant?: PointScalar;
  readonly alignToNormal?: boolean;
}

export function instancePlanFromPoints(
  pc: PointCloud,
  library: Mesh | ReadonlyArray<Mesh>,
  opts: InstancePlanOptions = {},
): InstancePlan {
  const meshes = Array.isArray(library) ? library : [library];
  if (meshes.length === 0) throw new Error("instance library is empty");
  const alignToNormal = opts.alignToNormal ?? true;
  const instances: InstanceRecord[] = [];
  for (let i = 0; i < pc.points.length; i++) {
    const ctx = pointContext(pc, i);
    const variant = opts.variant === undefined ? 0 : evalPointScalar(opts.variant, ctx);
    const meshIndex = positiveModulo(Math.round(variant), meshes.length);
    const s = opts.scale === undefined ? 1 : evalPointScalar(opts.scale, ctx);
    const yaw = opts.yaw === undefined ? 0 : evalPointScalar(opts.yaw, ctx);
    instances.push({
      mesh: meshes[meshIndex]!,
      position: ctx.point,
      normal: ctx.normal,
      scale: finiteOr(s, 1),
      yaw: finiteOr(yaw, 0),
      variant: meshIndex,
      alignToNormal,
    });
  }
  return { instances };
}

export function instanceCount(plan: InstancePlan): number {
  return plan.instances.length;
}

export function realizeInstances(plan: InstancePlan): Mesh {
  if (plan.instances.length === 0) return merge();
  return merge(...plan.instances.map(placeInstance));
}

export function copyToPoints(
  pc: PointCloud,
  library: Mesh | ReadonlyArray<Mesh>,
  opts: InstancePlanOptions = {},
): Mesh {
  return realizeInstances(instancePlanFromPoints(pc, library, opts));
}

function placeInstance(inst: InstanceRecord): Mesh {
  let mesh = inst.mesh;
  if (inst.scale !== 1 || inst.yaw !== 0) {
    mesh = transform(mesh, { scale: inst.scale, rotate: vec3(0, inst.yaw, 0) });
  }
  if (inst.alignToNormal) mesh = alignYTo(mesh, inst.normal);
  return translateMesh(mesh, inst.position);
}

// ---------------------------------------------------------------------------
// Hierarchical assembly — UE PCG "ApplyHierarchy / CopyPointsWithHierarchy".
// A prefab is a small set of parts, each with a relative transform. Placing the
// prefab at a point stamps the whole cluster (a rock pile, a bush clump, a
// prop group) with one parent transform, so composed detail travels together.
// ---------------------------------------------------------------------------

export interface AssemblyPart {
  readonly mesh: Mesh;
  /** Local offset from the assembly origin. */
  readonly offset?: Vec3;
  /** Local Euler rotation (radians). */
  readonly rotate?: Vec3;
  /** Local uniform scale. */
  readonly scale?: number;
}

export interface Assembly {
  readonly parts: ReadonlyArray<AssemblyPart>;
}

/** Bake an assembly's parts into a single mesh in local (origin) space. */
export function realizeAssembly(assembly: Assembly): Mesh {
  if (assembly.parts.length === 0) return merge();
  return merge(
    ...assembly.parts.map((part) => {
      let mesh = part.mesh;
      const hasXform =
        (part.scale !== undefined && part.scale !== 1) ||
        (part.rotate !== undefined &&
          (part.rotate.x !== 0 || part.rotate.y !== 0 || part.rotate.z !== 0));
      if (hasXform) {
        mesh = transform(mesh, {
          ...(part.scale !== undefined ? { scale: part.scale } : {}),
          ...(part.rotate !== undefined ? { rotate: part.rotate } : {}),
        });
      }
      if (part.offset) mesh = translateMesh(mesh, part.offset);
      return mesh;
    }),
  );
}

/**
 * Copy hierarchical assemblies to points. Each assembly is pre-baked into a
 * local-space mesh, then treated as one library entry for copyToPoints — so
 * variant/scale/yaw/alignToNormal all apply to the whole cluster at once. This
 * is the cheap way to scatter rock piles / bush clumps as coherent units.
 */
export function copyAssembliesToPoints(
  pc: PointCloud,
  library: Assembly | ReadonlyArray<Assembly>,
  opts: InstancePlanOptions = {},
): Mesh {
  const assemblies = Array.isArray(library) ? library : [library];
  if (assemblies.length === 0) throw new Error("assembly library is empty");
  const baked = assemblies.map(realizeAssembly);
  return copyToPoints(pc, baked, opts);
}

function finiteOr(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback;
}

function positiveModulo(n: number, d: number): number {
  return ((n % d) + d) % d;
}

function alignYTo(mesh: Mesh, dir: Vec3): Mesh {
  const up = vec3(0, 1, 0);
  const d = normalize(dir);
  const c = dot(up, d);
  if (c > 0.9999) return mesh;
  if (c < -0.9999) {
    return makeMesh({
      positions: mesh.positions.map((p) => vec3(p.x, -p.y, p.z)),
      normals: mesh.normals.map((n) => vec3(n.x, -n.y, n.z)),
      uvs: mesh.uvs.map((uv) => ({ ...uv })),
      indices: mesh.indices.slice(),
    });
  }
  const axis = normalize(cross(up, d));
  const angle = Math.acos(c);
  const rot = (p: Vec3): Vec3 => {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    return add(
      add(scale(p, cosA), scale(cross(axis, p), sinA)),
      scale(axis, dot(axis, p) * (1 - cosA)),
    );
  };
  return makeMesh({
    positions: mesh.positions.map(rot),
    normals: mesh.normals.map(rot),
    uvs: mesh.uvs.map((uv) => ({ ...uv })),
    indices: mesh.indices.slice(),
  });
}

// ---------------------------------------------------------------------------
// Layered scatter — UE Asmbly organization (Stones / Roots / Foliage / Trees
// as separate layers built on the same ground). Split one scattered point
// cloud into per-layer sub-clouds by an integer attribute, so each layer can
// take its own instance library and material and be merged back coherently.
// ---------------------------------------------------------------------------

/**
 * Partition a point cloud into `count` sub-clouds keyed by the rounded integer
 * value of `attr` (e.g. "variant" or "layer"). Index i of the result holds all
 * points whose attribute rounds to i; out-of-range values are dropped. Each
 * sub-cloud carries all other attributes, compacted, so it feeds straight into
 * copyToPoints / copyAssembliesToPoints.
 */
export function partitionByAttribute(
  pc: PointCloud,
  attr: string,
  count: number,
): PointCloud[] {
  const n = Math.max(0, Math.floor(count));
  const values = pc.attributes[attr];
  const buckets: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < pc.points.length; i++) {
    const k = Math.round(values?.[i] ?? 0);
    if (k >= 0 && k < n) buckets[k]!.push(i);
  }
  return buckets.map((keep) => {
    const attributes: Record<string, number[]> = {};
    for (const [name, arr] of Object.entries(pc.attributes)) {
      attributes[name] = keep.map((i) => arr[i] ?? 0);
    }
    return makePointCloud({
      points: keep.map((i) => pc.points[i]!),
      normals: keep.map((i) => pc.normals[i]!),
      attributes,
    });
  });
}

export interface ScatterLayer {
  /** Layer name (becomes the emitted part name). */
  name: string;
  /** Instance library for this layer (meshes or hierarchical assemblies). */
  library: Assembly | ReadonlyArray<Assembly>;
  /** InstancePlan options (scale/yaw/variant/alignToNormal fields). */
  options?: InstancePlanOptions;
}

export interface LayeredPart {
  readonly name: string;
  readonly mesh: Mesh;
  readonly count: number;
}

/**
 * Realize a layered scatter: given a point cloud whose `attr` selects a layer
 * index, build each layer's assemblies on its own points and return one named
 * mesh per non-empty layer. This is the "Asmbly" pattern — carpet the same
 * ground with a stones layer, a roots layer, a foliage layer, each with its own
 * look — driven by a single scatter pass.
 */
export function scatterToLayers(
  pc: PointCloud,
  attr: string,
  layers: ReadonlyArray<ScatterLayer>,
): LayeredPart[] {
  const parts = partitionByAttribute(pc, attr, layers.length);
  const out: LayeredPart[] = [];
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i]!;
    const sub = parts[i]!;
    if (sub.points.length === 0) continue;
    out.push({
      name: layer.name,
      mesh: copyAssembliesToPoints(sub, layer.library, layer.options ?? {}),
      count: sub.points.length,
    });
  }
  return out;
}
