import type { Vec3 } from "../math/vec3.js";
import { add, distance, dot, length, normalize, scale, sub, vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import { polyline, sweep } from "./curve.js";
import type { CurveGraph } from "./curve-graph.js";
import { merge, type Mesh } from "./mesh.js";

export interface GrowthBounds {
  readonly min: Vec3;
  readonly max: Vec3;
}

export interface SampleGrowthPointsOptions {
  readonly seed?: number;
  readonly mask?: (point: Vec3) => number;
  readonly maxAttempts?: number;
}

export interface ProximityGrowthOptions {
  readonly rootIndex?: number;
  readonly rootPoint?: Vec3;
  readonly maxDistance?: number;
  readonly maxChildren?: number;
  readonly direction?: Vec3;
  readonly maxAngle?: number;
  readonly connectIslands?: boolean;
  readonly relaxIterations?: number;
  readonly relaxStrength?: number;
  readonly endpointInset?: number;
  readonly baseRadius?: number;
  readonly endpointScale?: number;
  readonly centerPower?: number;
}

export interface GrowthNode {
  readonly id: string;
  readonly sourceIndex: number;
  readonly position: Vec3;
  readonly parent: string | null;
  readonly depth: number;
  readonly distanceFromRoot: number;
  readonly terminal: boolean;
  readonly radius: number;
}

export interface GrowthEdge {
  readonly from: string;
  readonly to: string;
  readonly length: number;
  readonly radiusFrom: number;
  readonly radiusTo: number;
}

export interface ProximityGrowthResult {
  readonly nodes: ReadonlyArray<GrowthNode>;
  readonly edges: ReadonlyArray<GrowthEdge>;
  readonly droppedPointIndices: ReadonlyArray<number>;
}

export function sampleGrowthPoints(
  count: number,
  bounds: GrowthBounds,
  options: SampleGrowthPointsOptions = {},
): Vec3[] {
  const target = Math.max(0, Math.floor(count));
  const rng = makeRng(options.seed ?? 1);
  const mask = options.mask ?? (() => 1);
  const maxAttempts = Math.max(target, Math.floor(options.maxAttempts ?? target * 30));
  const points: Vec3[] = [];
  for (let attempt = 0; attempt < maxAttempts && points.length < target; attempt++) {
    const point = vec3(
      rng.range(bounds.min.x, bounds.max.x),
      rng.range(bounds.min.y, bounds.max.y),
      rng.range(bounds.min.z, bounds.max.z),
    );
    const probability = clamp01(mask(point));
    if (rng.next() <= probability) points.push(point);
  }
  return points;
}

export function proximityGraphGrowth(
  sourcePoints: ReadonlyArray<Vec3>,
  options: ProximityGrowthOptions = {},
): ProximityGrowthResult {
  if (sourcePoints.length === 0) return { nodes: [], edges: [], droppedPointIndices: [] };
  const points = sourcePoints.map((point) => ({ ...point }));
  const rootIndex = chooseRoot(points, options);
  const maxDistance = options.maxDistance ?? Infinity;
  const maxChildren = Math.max(1, Math.floor(options.maxChildren ?? 4));
  const connectIslands = options.connectIslands ?? true;
  const direction = options.direction ? normalize(options.direction) : null;
  const minAlignment = options.maxAngle === undefined ? -1 : Math.cos(options.maxAngle);
  const connected = new Set<number>([rootIndex]);
  const remaining = new Set<number>(points.map((_, index) => index).filter((index) => index !== rootIndex));
  const parent = new Array<number>(points.length).fill(-1);
  const childCounts = new Array<number>(points.length).fill(0);

  while (remaining.size > 0) {
    let bestParent = -1;
    let bestChild = -1;
    let bestDistance = Infinity;
    for (const parentIndex of connected) {
      if (childCounts[parentIndex]! >= maxChildren) continue;
      for (const childIndex of remaining) {
        const delta = sub(points[childIndex]!, points[parentIndex]!);
        const candidateDistance = length(delta);
        if (candidateDistance > maxDistance || candidateDistance >= bestDistance) continue;
        if (direction && candidateDistance > 0 && dot(normalize(delta), direction) < minAlignment) continue;
        bestParent = parentIndex;
        bestChild = childIndex;
        bestDistance = candidateDistance;
      }
    }
    if (bestChild < 0 && connectIslands) {
      for (const parentIndex of connected) {
        if (childCounts[parentIndex]! >= maxChildren) continue;
        for (const childIndex of remaining) {
          const candidateDistance = distance(points[parentIndex]!, points[childIndex]!);
          if (candidateDistance < bestDistance) {
            bestParent = parentIndex;
            bestChild = childIndex;
            bestDistance = candidateDistance;
          }
        }
      }
    }
    if (bestChild < 0) break;
    parent[bestChild] = bestParent;
    childCounts[bestParent] = childCounts[bestParent]! + 1;
    connected.add(bestChild);
    remaining.delete(bestChild);
  }

  relaxTree(points, parent, rootIndex, options.relaxIterations ?? 0, options.relaxStrength ?? 0.35);
  insetEndpoints(points, parent, childCounts, options.endpointInset ?? 0);

  const depth = new Array<number>(points.length).fill(0);
  const rootDistance = new Array<number>(points.length).fill(0);
  const ordered = [...connected].sort((left, right) => treeDepth(parent, left) - treeDepth(parent, right));
  for (const index of ordered) {
    const parentIndex = parent[index]!;
    if (parentIndex < 0) continue;
    depth[index] = depth[parentIndex]! + 1;
    rootDistance[index] = rootDistance[parentIndex]! + distance(points[parentIndex]!, points[index]!);
  }
  const maxRootDistance = Math.max(...[...connected].map((index) => rootDistance[index]!), 1e-9);
  const baseRadius = Math.max(1e-6, options.baseRadius ?? 0.08);
  const endpointScale = clamp01(options.endpointScale ?? 0.22);
  const centerPower = Math.max(0.1, options.centerPower ?? 0.8);
  const radii = points.map((_, index) => {
    const terminal = index === rootIndex || childCounts[index] === 0;
    if (terminal) return baseRadius * endpointScale;
    const t = rootDistance[index]! / maxRootDistance;
    const middle = Math.pow(Math.max(0, Math.sin(Math.PI * t)), centerPower);
    return baseRadius * (endpointScale + (1 - endpointScale) * middle);
  });

  const nodes: GrowthNode[] = [];
  for (const index of connected) {
    const parentIndex = parent[index]!;
    nodes.push({
      id: `growth-${index}`,
      sourceIndex: index,
      position: points[index]!,
      parent: parentIndex >= 0 ? `growth-${parentIndex}` : null,
      depth: depth[index]!,
      distanceFromRoot: rootDistance[index]!,
      terminal: childCounts[index] === 0,
      radius: radii[index]!,
    });
  }
  nodes.sort((left, right) => left.sourceIndex - right.sourceIndex);

  const edges: GrowthEdge[] = [];
  for (const childIndex of connected) {
    const parentIndex = parent[childIndex]!;
    if (parentIndex < 0) continue;
    edges.push({
      from: `growth-${parentIndex}`,
      to: `growth-${childIndex}`,
      length: distance(points[parentIndex]!, points[childIndex]!),
      radiusFrom: radii[parentIndex]!,
      radiusTo: radii[childIndex]!,
    });
  }
  edges.sort((left, right) => left.to.localeCompare(right.to, undefined, { numeric: true }));
  return { nodes, edges, droppedPointIndices: [...remaining].sort((a, b) => a - b) };
}

export function proximityGrowthToCurveGraph(result: ProximityGrowthResult): CurveGraph {
  return {
    nodes: result.nodes.map((node) => ({ id: node.id, position: { ...node.position } })),
    edges: result.edges.map((edge) => ({ from: edge.from, to: edge.to, cost: edge.length })),
  };
}

export function proximityGrowthToMesh(
  result: ProximityGrowthResult,
  sides = 8,
): Mesh {
  const nodeById = new Map(result.nodes.map((node) => [node.id, node]));
  const meshes: Mesh[] = [];
  for (const edge of result.edges) {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to || edge.length <= 1e-9) continue;
    meshes.push(sweep(polyline([from.position, to.position]), {
      radius: 1,
      sides,
      caps: true,
      radiusAt: (t) => edge.radiusFrom + (edge.radiusTo - edge.radiusFrom) * t,
    }));
  }
  return merge(...meshes);
}

function chooseRoot(points: ReadonlyArray<Vec3>, options: ProximityGrowthOptions): number {
  if (options.rootIndex !== undefined) {
    return Math.max(0, Math.min(points.length - 1, Math.floor(options.rootIndex)));
  }
  if (!options.rootPoint) return 0;
  let best = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < points.length; index++) {
    const candidate = distance(points[index]!, options.rootPoint);
    if (candidate < bestDistance) {
      best = index;
      bestDistance = candidate;
    }
  }
  return best;
}

function relaxTree(
  points: Vec3[],
  parent: ReadonlyArray<number>,
  rootIndex: number,
  iterations: number,
  strength: number,
): void {
  const adjacency = points.map(() => [] as number[]);
  for (let index = 0; index < parent.length; index++) {
    const parentIndex = parent[index]!;
    if (parentIndex < 0) continue;
    adjacency[index]!.push(parentIndex);
    adjacency[parentIndex]!.push(index);
  }
  const amount = clamp01(strength);
  for (let iteration = 0; iteration < Math.max(0, Math.floor(iterations)); iteration++) {
    const next = points.map((point) => ({ ...point }));
    for (let index = 0; index < points.length; index++) {
      const neighbors = adjacency[index]!;
      if (index === rootIndex || neighbors.length <= 1) continue;
      const average = neighbors.reduce((sum, neighbor) => add(sum, points[neighbor]!), vec3());
      next[index] = add(scale(points[index]!, 1 - amount), scale(average, amount / neighbors.length));
    }
    for (let index = 0; index < points.length; index++) points[index] = next[index]!;
  }
}

function insetEndpoints(
  points: Vec3[],
  parent: ReadonlyArray<number>,
  childCounts: ReadonlyArray<number>,
  inset: number,
): void {
  const amount = clamp01(inset);
  if (amount <= 0) return;
  for (let index = 0; index < points.length; index++) {
    const parentIndex = parent[index]!;
    if (parentIndex < 0 || childCounts[index] !== 0) continue;
    points[index] = add(scale(points[index]!, 1 - amount), scale(points[parentIndex]!, amount));
  }
}

function treeDepth(parent: ReadonlyArray<number>, index: number): number {
  let depth = 0;
  let current = index;
  while (parent[current]! >= 0 && depth <= parent.length) {
    current = parent[current]!;
    depth++;
  }
  return depth;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
