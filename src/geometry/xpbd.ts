/** Deterministic XPBD-style constraint solve for explicit mesh crease angles. */
import { clamp } from "../math/scalar.js";
import { cross, dot, length, normalize, sub, vec3, type Vec3 } from "../math/vec3.js";
import { makeMesh, recomputeNormals, type Mesh } from "./mesh.js";

export interface MeshHinge {
  readonly edgeA: number;
  readonly edgeB: number;
  readonly oppositeA: number;
  readonly oppositeB: number;
}

export interface DihedralConstraint extends MeshHinge {
  /** Target signed angle in radians. Flat = 0. */
  readonly targetAngle: number;
  readonly stiffness?: number;
}

export interface CreaseSolveOptions {
  readonly iterations?: number;
  readonly passes?: number;
  readonly distanceStiffness?: number;
  readonly fixed?: (position: Vec3, index: number) => boolean;
  readonly finiteDifference?: number;
}

interface EdgeUse {
  a: number;
  b: number;
  opposite: number;
}

interface DistanceConstraint {
  a: number;
  b: number;
  rest: number;
}

/** Enumerate manifold interior edges and their opposite triangle vertices. */
export function meshHinges(mesh: Mesh): MeshHinge[] {
  const firstUse = new Map<string, EdgeUse>();
  const completed = new Set<string>();
  const hinges: MeshHinge[] = [];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const triangle = [mesh.indices[i]!, mesh.indices[i + 1]!, mesh.indices[i + 2]!];
    for (let edge = 0; edge < 3; edge++) {
      const a = triangle[edge]!;
      const b = triangle[(edge + 1) % 3]!;
      const opposite = triangle[(edge + 2) % 3]!;
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const first = firstUse.get(key);
      if (!first) firstUse.set(key, { a, b, opposite });
      else if (!completed.has(key)) {
        hinges.push({
          edgeA: first.a,
          edgeB: first.b,
          oppositeA: first.opposite,
          oppositeB: opposite,
        });
        completed.add(key);
      }
    }
  }
  return hinges;
}

/** Signed angle between two faces around a consistently oriented shared edge. */
export function dihedralAngle(positions: ReadonlyArray<Vec3>, hinge: MeshHinge): number {
  const a = positions[hinge.edgeA]!;
  const b = positions[hinge.edgeB]!;
  const c = positions[hinge.oppositeA]!;
  const d = positions[hinge.oppositeB]!;
  const edge = normalize(sub(b, a));
  const n1 = normalize(cross(sub(b, a), sub(c, a)));
  const n2 = normalize(cross(sub(d, a), sub(b, a)));
  if (length(edge) === 0 || length(n1) === 0 || length(n2) === 0) return 0;
  return Math.atan2(dot(edge, cross(n1, n2)), clamp(dot(n1, n2), -1, 1));
}

/** Fold a mesh toward one or more target crease angles while preserving edges. */
export function solveCreases(
  mesh: Mesh,
  constraints: ReadonlyArray<DihedralConstraint>,
  options: CreaseSolveOptions = {},
): Mesh {
  if (mesh.positions.length === 0 || constraints.length === 0) return mesh;
  const positions = mesh.positions.map((p) => vec3(p.x, p.y, p.z));
  const inverseMass = positions.map((p, i) => options.fixed?.(p, i) ? 0 : 1);
  const distances = meshEdges(mesh).map(([a, b]) => ({
    a,
    b,
    rest: pointDistance(positions[a]!, positions[b]!),
  }));
  const iterations = Math.max(1, Math.round(options.iterations ?? 24));
  const passes = Math.max(1, Math.round(options.passes ?? 3));
  const distanceStiffness = clamp(options.distanceStiffness ?? 0.96, 0, 1);
  const epsilon = Math.max(1e-7, options.finiteDifference ?? 1e-5);

  for (let iteration = 0; iteration < iterations; iteration++) {
    for (let pass = 0; pass < passes; pass++) {
      for (const constraint of constraints) projectDihedral(positions, inverseMass, constraint, epsilon);
      for (const constraint of distances) projectDistance(positions, inverseMass, constraint, distanceStiffness);
    }
  }

  return recomputeNormals(makeMesh({
    positions,
    normals: mesh.normals.slice(),
    uvs: mesh.uvs.slice(),
    indices: mesh.indices.slice(),
  }));
}

function projectDihedral(
  positions: Vec3[],
  inverseMass: ReadonlyArray<number>,
  constraint: DihedralConstraint,
  epsilon: number,
): void {
  const indices = [constraint.edgeA, constraint.edgeB, constraint.oppositeA, constraint.oppositeB];
  const error = angleDelta(dihedralAngle(positions, constraint), constraint.targetAngle);
  if (Math.abs(error) < 1e-6) return;
  const gradients: Vec3[] = [];
  let denominator = 0;
  for (const index of indices) {
    const original = positions[index]!;
    const components: number[] = [];
    for (const axis of ["x", "y", "z"] as const) {
      positions[index] = { ...original, [axis]: original[axis] + epsilon };
      const plus = dihedralAngle(positions, constraint);
      positions[index] = { ...original, [axis]: original[axis] - epsilon };
      const minus = dihedralAngle(positions, constraint);
      positions[index] = original;
      components.push(angleDelta(plus, minus) / (2 * epsilon));
    }
    const gradient = vec3(components[0]!, components[1]!, components[2]!);
    gradients.push(gradient);
    denominator += inverseMass[index]! * dot(gradient, gradient);
  }
  const stiffness = clamp(constraint.stiffness ?? 0.9, 0, 1);
  const compliance = (1 - stiffness) * 0.01 + 1e-8;
  if (denominator + compliance < 1e-12) return;
  const lambda = clamp(-error / (denominator + compliance), -0.25, 0.25);
  for (let i = 0; i < indices.length; i++) {
    const index = indices[i]!;
    const weight = inverseMass[index]!;
    if (weight === 0) continue;
    const p = positions[index]!;
    const g = gradients[i]!;
    positions[index] = vec3(p.x + g.x * lambda * weight, p.y + g.y * lambda * weight, p.z + g.z * lambda * weight);
  }
}

function projectDistance(
  positions: Vec3[],
  inverseMass: ReadonlyArray<number>,
  constraint: DistanceConstraint,
  stiffness: number,
): void {
  const a = positions[constraint.a]!;
  const b = positions[constraint.b]!;
  const delta = sub(b, a);
  const distance = length(delta);
  const totalMass = inverseMass[constraint.a]! + inverseMass[constraint.b]!;
  if (distance < 1e-12 || totalMass === 0) return;
  const correction = (distance - constraint.rest) * stiffness / totalMass;
  const nx = delta.x / distance;
  const ny = delta.y / distance;
  const nz = delta.z / distance;
  const wa = inverseMass[constraint.a]!;
  const wb = inverseMass[constraint.b]!;
  if (wa > 0) positions[constraint.a] = vec3(a.x + nx * correction * wa, a.y + ny * correction * wa, a.z + nz * correction * wa);
  if (wb > 0) positions[constraint.b] = vec3(b.x - nx * correction * wb, b.y - ny * correction * wb, b.z - nz * correction * wb);
}

function meshEdges(mesh: Mesh): Array<[number, number]> {
  const edges = new Map<string, [number, number]>();
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const triangle = [mesh.indices[i]!, mesh.indices[i + 1]!, mesh.indices[i + 2]!];
    for (let edge = 0; edge < 3; edge++) {
      const a = triangle[edge]!;
      const b = triangle[(edge + 1) % 3]!;
      const key = edgeKey(a, b);
      if (!edges.has(key)) edges.set(key, [a, b]);
    }
  }
  return [...edges.values()];
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

function pointDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function angleDelta(a: number, b: number): number {
  let delta = a - b;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}
