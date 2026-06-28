import type { Vec3 } from "../math/vec3.js";
import { vec3, sub, dot, length, normalize } from "../math/vec3.js";
import { clamp } from "../math/scalar.js";
import type { Mesh } from "../geometry/mesh.js";
import { bounds } from "../geometry/mesh.js";
import { sampleField2DUV, type Field2D } from "./buffer.js";

export interface MeshField {
  readonly values: ReadonlyArray<number>;
}

export interface MeshFieldContext {
  index: number;
  position: Vec3;
  normal: Vec3;
  uv: { x: number; y: number };
}

export function makeMeshField(mesh: Mesh, fn: (ctx: MeshFieldContext) => number): MeshField {
  return {
    values: mesh.positions.map((position, index) =>
      fn({ index, position, normal: mesh.normals[index]!, uv: mesh.uvs[index]! }),
    ),
  };
}

export function sampleField2DOnMeshUV(mesh: Mesh, field: Field2D): MeshField {
  return makeMeshField(mesh, (ctx) => sampleField2DUV(field, ctx.uv.x, ctx.uv.y));
}

export function meshFieldToAttribute(field: MeshField): number[] {
  return field.values.slice();
}

export type MeshAxis = "x" | "y" | "z";

export function heightMeshField(mesh: Mesh, axis: MeshAxis = "y"): MeshField {
  const b = bounds(mesh);
  const lo = b.min[axis];
  const hi = b.max[axis];
  const span = hi - lo || 1e-6;
  return makeMeshField(mesh, (ctx) => clamp((ctx.position[axis] - lo) / span, 0, 1));
}

export function angleMeshField(mesh: Mesh, direction: Vec3 = vec3(0, 1, 0)): MeshField {
  const d = normalize(direction);
  return makeMeshField(mesh, (ctx) => clamp(dot(normalize(ctx.normal), d), 0, 1));
}

export interface CurvatureMeshFieldOptions {
  strength?: number;
  fuseTolerance?: number;
}

/**
 * Approximate curvature/edge mask from normal variation. It fuses coincident
 * positions so hard-edged meshes with duplicated face vertices still produce
 * edge masks.
 */
export function curvatureMeshField(mesh: Mesh, options: CurvatureMeshFieldOptions = {}): MeshField {
  const strength = options.strength ?? 1;
  const tol = Math.max(1e-12, options.fuseTolerance ?? 1e-5);
  const groups = new Map<string, number[]>();
  const keyOf = (p: Vec3) =>
    `${Math.round(p.x / tol)},${Math.round(p.y / tol)},${Math.round(p.z / tol)}`;

  for (let i = 0; i < mesh.positions.length; i++) {
    const k = keyOf(mesh.positions[i]!);
    const g = groups.get(k);
    if (g) g.push(i);
    else groups.set(k, [i]);
  }

  const neighbors: Array<Set<number>> = Array.from({ length: mesh.positions.length }, () => new Set<number>());
  const addEdge = (a: number, b: number) => {
    if (a === b) return;
    neighbors[a]!.add(b);
    neighbors[b]!.add(a);
  };

  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i]!;
    const b = mesh.indices[i + 1]!;
    const c = mesh.indices[i + 2]!;
    addEdge(a, b);
    addEdge(b, c);
    addEdge(c, a);
  }

  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) addEdge(group[i]!, group[j]!);
    }
  }

  const values = mesh.positions.map((_, i) => {
    const n = normalize(mesh.normals[i]!);
    let sum = 0;
    let count = 0;
    for (const j of neighbors[i]!) {
      const m = normalize(mesh.normals[j]!);
      sum += 1 - clamp(dot(n, m), -1, 1);
      count++;
    }
    return count === 0 ? 0 : clamp((sum / count) * strength, 0, 1);
  });
  return { values };
}

export interface ProtrusionMeshFieldOptions {
  strength?: number;
}

/**
 * Convex outwardness from center-to-vertex direction vs surface normal.
 * Good for edge wear and convex highlight masks; not a full AO replacement.
 */
export function protrusionMeshField(mesh: Mesh, options: ProtrusionMeshFieldOptions = {}): MeshField {
  const strength = options.strength ?? 1;
  const b = bounds(mesh);
  const center = vec3(
    (b.min.x + b.max.x) * 0.5,
    (b.min.y + b.max.y) * 0.5,
    (b.min.z + b.max.z) * 0.5,
  );
  return makeMeshField(mesh, (ctx) => {
    const dir = sub(ctx.position, center);
    if (length(dir) === 0) return 0;
    return clamp(dot(normalize(dir), normalize(ctx.normal)) * strength, 0, 1);
  });
}
