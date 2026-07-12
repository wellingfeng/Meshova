import { vec2, type Vec2 } from "../math/vec2.js";
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeMesh, recomputeNormals, type Mesh } from "./mesh.js";

export type DualGridValue = string | number | boolean;

export interface DualGrid<T extends DualGridValue> {
  readonly width: number;
  readonly depth: number;
  readonly originX: number;
  readonly originZ: number;
  readonly values: ReadonlyArray<T>;
}

export interface DualGridOrigin {
  originX?: number;
  originZ?: number;
}

export interface DualGridLayerOptions {
  tileSize?: number;
  topY?: number;
  skirtBottomY?: number;
  subdivisions?: number;
  threshold?: number;
  smoothCorners?: boolean;
}

export interface DualGridCaseStats {
  readonly counts: ReadonlyArray<number>;
  readonly occupiedCells: number;
  readonly transitionCells: number;
}

interface ScalarPoint {
  x: number;
  z: number;
  value: number;
}

interface BoundaryEdge {
  a: number;
  b: number;
  count: number;
}

export function createDualGrid<T extends DualGridValue>(
  rows: ReadonlyArray<ReadonlyArray<T>>,
  origin: DualGridOrigin = {},
): DualGrid<T> {
  if (rows.length < 2 || (rows[0]?.length ?? 0) < 2) {
    throw new Error("dual grid requires at least 2x2 samples");
  }
  const width = rows[0]!.length;
  if (rows.some((row) => row.length !== width)) {
    throw new Error("dual grid rows must have equal width");
  }
  return {
    width,
    depth: rows.length,
    originX: origin.originX ?? 0,
    originZ: origin.originZ ?? 0,
    values: rows.flatMap((row) => row.slice()),
  };
}

export function createDualGridChunk<T extends DualGridValue>(
  chunkX: number,
  chunkZ: number,
  cellsX: number,
  cellsZ: number,
  sample: (globalX: number, globalZ: number) => T,
): DualGrid<T> {
  const width = Math.max(1, Math.floor(cellsX));
  const depth = Math.max(1, Math.floor(cellsZ));
  const originX = Math.floor(chunkX) * width;
  const originZ = Math.floor(chunkZ) * depth;
  const rows: T[][] = [];
  for (let z = 0; z <= depth; z++) {
    const row: T[] = [];
    for (let x = 0; x <= width; x++) row.push(sample(originX + x, originZ + z));
    rows.push(row);
  }
  return createDualGrid(rows, { originX, originZ });
}

export function dualGridValue<T extends DualGridValue>(grid: DualGrid<T>, x: number, z: number): T {
  if (x < 0 || z < 0 || x >= grid.width || z >= grid.depth) {
    throw new Error(`dual grid sample out of range: ${x},${z}`);
  }
  return grid.values[z * grid.width + x]!;
}

export function dualGridMask<T extends DualGridValue>(
  grid: DualGrid<T>,
  target: T,
  x: number,
  z: number,
): number {
  if (x < 0 || z < 0 || x >= grid.width - 1 || z >= grid.depth - 1) {
    throw new Error(`dual grid cell out of range: ${x},${z}`);
  }
  let mask = 0;
  if (dualGridValue(grid, x, z) === target) mask |= 1;
  if (dualGridValue(grid, x + 1, z) === target) mask |= 2;
  if (dualGridValue(grid, x + 1, z + 1) === target) mask |= 4;
  if (dualGridValue(grid, x, z + 1) === target) mask |= 8;
  return mask;
}

export function countDualGridCases<T extends DualGridValue>(
  grid: DualGrid<T>,
  target: T,
): DualGridCaseStats {
  const counts = new Array<number>(16).fill(0);
  let occupiedCells = 0;
  let transitionCells = 0;
  for (let z = 0; z < grid.depth - 1; z++) {
    for (let x = 0; x < grid.width - 1; x++) {
      const mask = dualGridMask(grid, target, x, z);
      counts[mask] = counts[mask]! + 1;
      if (mask !== 0) occupiedCells++;
      if (mask !== 0 && mask !== 15) transitionCells++;
    }
  }
  return { counts, occupiedCells, transitionCells };
}

export function buildDualGridLayer<T extends DualGridValue>(
  grid: DualGrid<T>,
  target: T,
  options: DualGridLayerOptions = {},
): Mesh {
  const tileSize = Math.max(1e-5, options.tileSize ?? 1);
  const topY = options.topY ?? 0;
  const skirtBottomY = Math.min(topY, options.skirtBottomY ?? topY);
  const subdivisions = clampInt(options.subdivisions ?? 5, 1, 16);
  const threshold = clamp(options.threshold ?? 0.5, 0.01, 0.99);
  const smoothCorners = options.smoothCorners ?? true;
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: Vec2[] = [];
  const indices: number[] = [];
  const vertexByPosition = new Map<string, number>();

  const pushTopVertex = (point: ScalarPoint): number => {
    const worldX = (grid.originX + point.x) * tileSize;
    const worldZ = (grid.originZ + point.z) * tileSize;
    const key = `${Math.round(worldX * 1e8)},${Math.round(worldZ * 1e8)}`;
    const found = vertexByPosition.get(key);
    if (found !== undefined) return found;
    const index = positions.length;
    positions.push(vec3(worldX, topY, worldZ));
    normals.push(vec3(0, 1, 0));
    uvs.push(vec2(worldX / tileSize, worldZ / tileSize));
    vertexByPosition.set(key, index);
    return index;
  };

  const pushTopTriangle = (a: ScalarPoint, b: ScalarPoint, c: ScalarPoint): void => {
    const area = signedAreaXZ(a, b, c);
    if (Math.abs(area) < 1e-10) return;
    const ia = pushTopVertex(a);
    const ib = pushTopVertex(b);
    const ic = pushTopVertex(c);
    if (area < 0) indices.push(ia, ib, ic);
    else indices.push(ia, ic, ib);
  };

  for (let cellZ = 0; cellZ < grid.depth - 1; cellZ++) {
    for (let cellX = 0; cellX < grid.width - 1; cellX++) {
      const q00 = dualGridValue(grid, cellX, cellZ) === target ? 1 : 0;
      const q10 = dualGridValue(grid, cellX + 1, cellZ) === target ? 1 : 0;
      const q11 = dualGridValue(grid, cellX + 1, cellZ + 1) === target ? 1 : 0;
      const q01 = dualGridValue(grid, cellX, cellZ + 1) === target ? 1 : 0;
      if (q00 + q10 + q11 + q01 === 0) continue;

      const sample = (u: number, v: number): number => {
        const su = smoothCorners ? smoothstep(u) : u;
        const sv = smoothCorners ? smoothstep(v) : v;
        return q00 * (1 - su) * (1 - sv)
          + q10 * su * (1 - sv)
          + q11 * su * sv
          + q01 * (1 - su) * sv;
      };

      for (let subZ = 0; subZ < subdivisions; subZ++) {
        const v0 = subZ / subdivisions;
        const v1 = (subZ + 1) / subdivisions;
        for (let subX = 0; subX < subdivisions; subX++) {
          const u0 = subX / subdivisions;
          const u1 = (subX + 1) / subdivisions;
          const p00 = point(cellX + u0, cellZ + v0, sample(u0, v0));
          const p10 = point(cellX + u1, cellZ + v0, sample(u1, v0));
          const p11 = point(cellX + u1, cellZ + v1, sample(u1, v1));
          const p01 = point(cellX + u0, cellZ + v1, sample(u0, v1));
          const alternate = ((grid.originX + cellX) * subdivisions + subX
            + (grid.originZ + cellZ) * subdivisions + subZ) % 2 !== 0;
          const triangles = alternate
            ? [[p00, p01, p10], [p10, p01, p11]]
            : [[p00, p01, p11], [p00, p11, p10]];
          for (const triangle of triangles) {
            const polygon = clipTriangle(triangle as [ScalarPoint, ScalarPoint, ScalarPoint], threshold);
            for (let i = 1; i + 1 < polygon.length; i++) {
              pushTopTriangle(polygon[0]!, polygon[i]!, polygon[i + 1]!);
            }
          }
        }
      }
    }
  }

  if (indices.length === 0) return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });
  if (skirtBottomY < topY - 1e-8) appendBoundarySkirt(positions, normals, uvs, indices, skirtBottomY);
  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

function appendBoundarySkirt(
  positions: Vec3[],
  normals: Vec3[],
  uvs: Vec2[],
  indices: number[],
  bottomY: number,
): void {
  const edges = new Map<string, BoundaryEdge>();
  const topIndexCount = indices.length;
  for (let i = 0; i < topIndexCount; i += 3) {
    addBoundaryEdge(edges, indices[i]!, indices[i + 1]!);
    addBoundaryEdge(edges, indices[i + 1]!, indices[i + 2]!);
    addBoundaryEdge(edges, indices[i + 2]!, indices[i]!);
  }
  for (const edge of edges.values()) {
    if (edge.count !== 1) continue;
    const a = positions[edge.a]!;
    const b = positions[edge.b]!;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const base = positions.length;
    positions.push(
      vec3(a.x, a.y, a.z),
      vec3(a.x, bottomY, a.z),
      vec3(b.x, bottomY, b.z),
      vec3(b.x, b.y, b.z),
    );
    normals.push(vec3(0, 0, 0), vec3(0, 0, 0), vec3(0, 0, 0), vec3(0, 0, 0));
    uvs.push(vec2(0, 0), vec2(0, 1), vec2(length, 1), vec2(length, 0));
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function addBoundaryEdge(edges: Map<string, BoundaryEdge>, a: number, b: number): void {
  const key = a < b ? `${a}:${b}` : `${b}:${a}`;
  const edge = edges.get(key);
  if (edge) edge.count++;
  else edges.set(key, { a, b, count: 1 });
}

function clipTriangle(
  triangle: [ScalarPoint, ScalarPoint, ScalarPoint],
  threshold: number,
): ScalarPoint[] {
  const output: ScalarPoint[] = [];
  for (let i = 0; i < triangle.length; i++) {
    const current = triangle[i]!;
    const previous = triangle[(i + triangle.length - 1) % triangle.length]!;
    const currentInside = current.value >= threshold;
    const previousInside = previous.value >= threshold;
    if (currentInside !== previousInside) output.push(intersection(previous, current, threshold));
    if (currentInside) output.push(current);
  }
  return dedupePolygon(output);
}

function intersection(a: ScalarPoint, b: ScalarPoint, threshold: number): ScalarPoint {
  const denominator = b.value - a.value;
  const t = Math.abs(denominator) < 1e-12 ? 0.5 : (threshold - a.value) / denominator;
  return point(
    a.x + (b.x - a.x) * t,
    a.z + (b.z - a.z) * t,
    threshold,
  );
}

function dedupePolygon(points: ScalarPoint[]): ScalarPoint[] {
  const output: ScalarPoint[] = [];
  for (const current of points) {
    const previous = output[output.length - 1];
    if (!previous || Math.hypot(current.x - previous.x, current.z - previous.z) > 1e-9) output.push(current);
  }
  if (output.length > 1) {
    const first = output[0]!;
    const last = output[output.length - 1]!;
    if (Math.hypot(first.x - last.x, first.z - last.z) <= 1e-9) output.pop();
  }
  return output;
}

function point(x: number, z: number, value: number): ScalarPoint {
  return { x, z, value };
}

function signedAreaXZ(a: ScalarPoint, b: ScalarPoint, c: ScalarPoint): number {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
