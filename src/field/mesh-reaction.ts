/**
 * Scalar diffusion and Gray-Scott reaction-diffusion on arbitrary triangle meshes.
 * The graph Laplacian follows mesh edges, so patterns cross curved surfaces
 * without requiring UVs or a regular raster grid.
 */
import { clamp } from "../math/scalar.js";
import { add, scale } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import { makeMesh, recomputeNormals, type Mesh } from "../geometry/mesh.js";
import type { MeshField } from "./mesh-data.js";

export interface MeshGraphNeighbor {
  readonly index: number;
  readonly weight: number;
}

export interface MeshGraph {
  readonly neighbors: ReadonlyArray<ReadonlyArray<MeshGraphNeighbor>>;
}

export interface MeshGraphOptions {
  readonly weighting?: "uniform" | "inverseDistance";
}

export interface MeshDiffuseOptions extends MeshGraphOptions {
  readonly iterations?: number;
  readonly rate?: number;
  readonly min?: number;
  readonly max?: number;
}

export interface GrayScottMeshOptions extends MeshGraphOptions {
  readonly iterations?: number;
  readonly dt?: number;
  readonly diffU?: number;
  readonly diffV?: number;
  readonly feed?: number;
  readonly kill?: number;
  readonly seed?: number;
  readonly spots?: number;
  readonly spotHops?: number;
}

export interface GrayScottMeshState {
  readonly u: MeshField;
  readonly v: MeshField;
}

export function buildMeshGraph(mesh: Mesh, options: MeshGraphOptions = {}): MeshGraph {
  const weighting = options.weighting ?? "inverseDistance";
  const maps = Array.from({ length: mesh.positions.length }, () => new Map<number, number>());
  const addEdge = (a: number, b: number): void => {
    if (a === b) return;
    const pa = mesh.positions[a];
    const pb = mesh.positions[b];
    if (!pa || !pb) throw new Error(`mesh edge index out of range: ${a}, ${b}`);
    const distance = Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z);
    const weight = weighting === "uniform" ? 1 : 1 / Math.max(distance, 1e-9);
    maps[a]!.set(b, Math.max(maps[a]!.get(b) ?? 0, weight));
    maps[b]!.set(a, Math.max(maps[b]!.get(a) ?? 0, weight));
  };
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i]!;
    const b = mesh.indices[i + 1]!;
    const c = mesh.indices[i + 2]!;
    addEdge(a, b);
    addEdge(b, c);
    addEdge(c, a);
  }
  return {
    neighbors: maps.map((map) => [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, weight]) => ({ index, weight }))),
  };
}

export function meshLaplacian(field: MeshField, graph: MeshGraph): MeshField {
  assertFieldSize(field, graph.neighbors.length);
  const values = field.values.map((value, i) => {
    const neighbors = graph.neighbors[i]!;
    let weighted = 0;
    let totalWeight = 0;
    for (const neighbor of neighbors) {
      weighted += field.values[neighbor.index]! * neighbor.weight;
      totalWeight += neighbor.weight;
    }
    return totalWeight > 0 ? weighted / totalWeight - value : 0;
  });
  return { values };
}

export function diffuseMeshField(
  mesh: Mesh,
  field: MeshField,
  options: MeshDiffuseOptions = {},
): MeshField {
  assertFieldSize(field, mesh.positions.length);
  const graph = buildMeshGraph(mesh, options);
  const iterations = Math.max(0, Math.round(options.iterations ?? 1));
  const rate = clamp(options.rate ?? 0.5, 0, 1);
  const min = options.min ?? -Infinity;
  const max = options.max ?? Infinity;
  let current: MeshField = { values: field.values.slice() };
  for (let iteration = 0; iteration < iterations; iteration++) {
    const laplace = meshLaplacian(current, graph);
    current = {
      values: current.values.map((value, i) => clamp(value + laplace.values[i]! * rate, min, max)),
    };
  }
  return current;
}

export function grayScottStateMesh(
  mesh: Mesh,
  options: GrayScottMeshOptions = {},
  graph = buildMeshGraph(mesh, options),
): GrayScottMeshState {
  const count = mesh.positions.length;
  const u = new Array<number>(count).fill(1);
  const v = new Array<number>(count).fill(0);
  if (count === 0) return { u: { values: u }, v: { values: v } };
  const rng = makeRng(options.seed ?? 0);
  const spots = Math.max(1, Math.round(options.spots ?? 6));
  const hops = Math.max(0, Math.round(options.spotHops ?? 1));
  for (let spot = 0; spot < spots; spot++) {
    const center = rng.int(0, count - 1);
    const depth = new Map<number, number>([[center, 0]]);
    const queue = [center];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor]!;
      const d = depth.get(index)!;
      u[index] = 0;
      v[index] = 1;
      if (d >= hops) continue;
      for (const neighbor of graph.neighbors[index]!) {
        if (depth.has(neighbor.index)) continue;
        depth.set(neighbor.index, d + 1);
        queue.push(neighbor.index);
      }
    }
  }
  return { u: { values: u }, v: { values: v } };
}

export function grayScottStepMesh(
  mesh: Mesh,
  state: GrayScottMeshState,
  options: GrayScottMeshOptions = {},
  graph = buildMeshGraph(mesh, options),
): GrayScottMeshState {
  assertFieldSize(state.u, mesh.positions.length);
  assertFieldSize(state.v, mesh.positions.length);
  const laplaceU = meshLaplacian(state.u, graph);
  const laplaceV = meshLaplacian(state.v, graph);
  const diffU = options.diffU ?? 0.16;
  const diffV = options.diffV ?? 0.08;
  const feed = options.feed ?? 0.035;
  const kill = options.kill ?? 0.061;
  const dt = options.dt ?? 1;
  const nextU: number[] = [];
  const nextV: number[] = [];
  for (let i = 0; i < mesh.positions.length; i++) {
    const u = state.u.values[i]!;
    const v = state.v.values[i]!;
    const uvv = u * v * v;
    nextU.push(clamp(u + (diffU * laplaceU.values[i]! - uvv + feed * (1 - u)) * dt, 0, 1));
    nextV.push(clamp(v + (diffV * laplaceV.values[i]! + uvv - (feed + kill) * v) * dt, 0, 1));
  }
  return { u: { values: nextU }, v: { values: nextV } };
}

export function grayScottFieldMesh(mesh: Mesh, options: GrayScottMeshOptions = {}): MeshField {
  const graph = buildMeshGraph(mesh, options);
  let state = grayScottStateMesh(mesh, options, graph);
  const iterations = Math.max(1, Math.round(options.iterations ?? 32));
  for (let i = 0; i < iterations; i++) state = grayScottStepMesh(mesh, state, options, graph);
  return state.v;
}

export function normalizeMeshField(field: MeshField): MeshField {
  if (field.values.length === 0) return { values: [] };
  let min = Infinity;
  let max = -Infinity;
  for (const value of field.values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  const span = max - min;
  return { values: field.values.map((value) => span > 1e-12 ? (value - min) / span : 0) };
}

export function displaceMeshByField(mesh: Mesh, field: MeshField, amplitude = 1): Mesh {
  assertFieldSize(field, mesh.positions.length);
  return recomputeNormals(makeMesh({
    positions: mesh.positions.map((position, i) => add(position, scale(mesh.normals[i]!, field.values[i]! * amplitude))),
    normals: mesh.normals.slice(),
    uvs: mesh.uvs.slice(),
    indices: mesh.indices.slice(),
  }));
}

function assertFieldSize(field: MeshField, expected: number): void {
  if (field.values.length !== expected) {
    throw new Error(`mesh field length ${field.values.length} != vertex count ${expected}`);
  }
}
