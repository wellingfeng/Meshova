import type { Vec3 } from "../math/vec3.js";
import { length, sub } from "../math/vec3.js";
import { polyline, type Curve } from "./curve.js";
import type { PointCloud } from "./point-cloud.js";

export type PathCostMode = "distance" | "fitness";

export interface PathTraversalContext {
  readonly cloud: PointCloud;
  readonly fromIndex: number;
  readonly toIndex: number;
  readonly from: Vec3;
  readonly to: Vec3;
  readonly distance: number;
}

export interface PathfindOptions {
  readonly searchDistance: number;
  readonly maxSnapDistance?: number;
  readonly heuristicWeight?: number;
  readonly costMode?: PathCostMode;
  readonly costAttribute?: string;
  readonly fitnessFloor?: number;
  readonly fitnessExponent?: number;
  readonly hardRejectBelow?: number;
  readonly acceptPartialPath?: boolean;
  readonly includeEndpoints?: boolean;
  readonly maxVisited?: number;
  readonly canTraverse?: (context: PathTraversalContext) => boolean;
}

export interface PathfindResult {
  readonly curve: Curve;
  readonly pointIndices: ReadonlyArray<number>;
  readonly reachedGoal: boolean;
  readonly cost: number;
  readonly visited: number;
  readonly startIndex: number;
  readonly goalIndex: number;
}

interface Neighbor {
  index: number;
  distance: number;
}

interface HeapItem {
  index: number;
  score: number;
  cost: number;
}

class MinHeap {
  private readonly items: HeapItem[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: HeapItem): void {
    const items = this.items;
    items.push(item);
    let child = items.length - 1;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      if (!heapLess(items[child]!, items[parent]!)) break;
      [items[child], items[parent]] = [items[parent]!, items[child]!];
      child = parent;
    }
  }

  pop(): HeapItem | undefined {
    const items = this.items;
    const root = items[0];
    const tail = items.pop();
    if (!root || !tail || items.length === 0) return root;
    items[0] = tail;
    let parent = 0;
    while (true) {
      const left = parent * 2 + 1;
      const right = left + 1;
      let best = parent;
      if (left < items.length && heapLess(items[left]!, items[best]!)) best = left;
      if (right < items.length && heapLess(items[right]!, items[best]!)) best = right;
      if (best === parent) break;
      [items[parent], items[best]] = [items[best]!, items[parent]!];
      parent = best;
    }
    return root;
  }
}

export function pathfind(
  cloud: PointCloud,
  start: Vec3,
  goal: Vec3,
  options: PathfindOptions,
): PathfindResult {
  const searchDistance = options.searchDistance;
  if (!Number.isFinite(searchDistance) || searchDistance <= 0) {
    throw new Error("searchDistance must be a finite number greater than 0");
  }
  if (cloud.points.length === 0) return emptyResult();

  const heuristicWeight = options.heuristicWeight ?? 1;
  if (!Number.isFinite(heuristicWeight) || heuristicWeight < 0) {
    throw new Error("heuristicWeight must be a finite number greater than or equal to 0");
  }

  const costMode = options.costMode ?? "distance";
  const costAttribute = options.costAttribute ?? "density";
  const fitness = costMode === "fitness" ? cloud.attributes[costAttribute] : undefined;
  if (costMode === "fitness" && !fitness) {
    throw new Error(`cost attribute "${costAttribute}" does not exist`);
  }

  const startIndex = nearestPoint(cloud.points, start);
  const goalIndex = nearestPoint(cloud.points, goal);
  const maxSnapDistance = options.maxSnapDistance ?? searchDistance;
  if (
    length(sub(cloud.points[startIndex]!, start)) > maxSnapDistance ||
    length(sub(cloud.points[goalIndex]!, goal)) > maxSnapDistance
  ) {
    return emptyResult(startIndex, goalIndex);
  }

  const neighbors = buildNeighbors(cloud, searchDistance, options.canTraverse);
  const count = cloud.points.length;
  const costs = new Float64Array(count);
  costs.fill(Infinity);
  costs[startIndex] = 0;
  const previous = new Int32Array(count);
  previous.fill(-1);
  const closed = new Uint8Array(count);
  const heap = new MinHeap();
  heap.push({
    index: startIndex,
    cost: 0,
    score: heuristic(cloud.points[startIndex]!, cloud.points[goalIndex]!, heuristicWeight),
  });

  const maxVisited = Math.max(1, Math.floor(options.maxVisited ?? Number.MAX_SAFE_INTEGER));
  let visited = 0;
  let reachedGoal = false;
  let partialIndex = startIndex;
  let partialDistance = length(sub(cloud.points[startIndex]!, goal));

  while (heap.size > 0 && visited < maxVisited) {
    const current = heap.pop()!;
    if (closed[current.index] || current.cost !== costs[current.index]) continue;
    closed[current.index] = 1;
    visited++;

    const distanceToGoal = length(sub(cloud.points[current.index]!, goal));
    if (
      distanceToGoal < partialDistance ||
      (distanceToGoal === partialDistance && costs[current.index]! < costs[partialIndex]!) ||
      (distanceToGoal === partialDistance && costs[current.index] === costs[partialIndex] && current.index < partialIndex)
    ) {
      partialIndex = current.index;
      partialDistance = distanceToGoal;
    }

    if (current.index === goalIndex) {
      reachedGoal = true;
      break;
    }

    for (const neighbor of neighbors[current.index]!) {
      if (closed[neighbor.index]) continue;
      if (
        neighbor.index !== goalIndex &&
        fitness &&
        fitness[neighbor.index]! < (options.hardRejectBelow ?? -Infinity)
      ) {
        continue;
      }
      const stepCost = traversalCost(current.index, neighbor, fitness, options);
      const candidate = costs[current.index]! + stepCost;
      if (candidate >= costs[neighbor.index]!) continue;
      costs[neighbor.index] = candidate;
      previous[neighbor.index] = current.index;
      heap.push({
        index: neighbor.index,
        cost: candidate,
        score:
          candidate +
          heuristic(cloud.points[neighbor.index]!, cloud.points[goalIndex]!, heuristicWeight),
      });
    }
  }

  const endIndex = reachedGoal
    ? goalIndex
    : options.acceptPartialPath ?? true
      ? partialIndex
      : -1;
  if (endIndex < 0) {
    return emptyResult(startIndex, goalIndex, visited);
  }

  const pointIndices = reconstructPath(previous, startIndex, endIndex);
  const curve = pathCurve(
    cloud,
    pointIndices,
    start,
    goal,
    reachedGoal,
    options.includeEndpoints ?? true,
  );
  const snapCost = length(sub(cloud.points[startIndex]!, start));
  const goalCost = reachedGoal ? length(sub(cloud.points[goalIndex]!, goal)) : 0;
  return {
    curve,
    pointIndices,
    reachedGoal,
    cost: costs[endIndex]! + snapCost + goalCost,
    visited,
    startIndex,
    goalIndex,
  };
}

function buildNeighbors(
  cloud: PointCloud,
  searchDistance: number,
  canTraverse: PathfindOptions["canTraverse"],
): Neighbor[][] {
  const buckets = new Map<string, number[]>();
  for (let index = 0; index < cloud.points.length; index++) {
    const point = cloud.points[index]!;
    const key = gridKey(point, searchDistance);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(index);
    else buckets.set(key, [index]);
  }

  const neighbors = Array.from({ length: cloud.points.length }, () => [] as Neighbor[]);
  const maxDistanceSquared = searchDistance * searchDistance;
  for (let fromIndex = 0; fromIndex < cloud.points.length; fromIndex++) {
    const from = cloud.points[fromIndex]!;
    const gx = Math.floor(from.x / searchDistance);
    const gy = Math.floor(from.y / searchDistance);
    const gz = Math.floor(from.z / searchDistance);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const bucket = buckets.get(`${gx + dx},${gy + dy},${gz + dz}`);
          if (!bucket) continue;
          for (const toIndex of bucket) {
            if (toIndex <= fromIndex) continue;
            const to = cloud.points[toIndex]!;
            const delta = sub(to, from);
            const distanceSquared = delta.x * delta.x + delta.y * delta.y + delta.z * delta.z;
            if (distanceSquared <= 1e-18 || distanceSquared > maxDistanceSquared + 1e-12) continue;
            const distance = Math.sqrt(distanceSquared);
            if (canTraverse && !canTraverse({ cloud, fromIndex, toIndex, from, to, distance })) {
              continue;
            }
            neighbors[fromIndex]!.push({ index: toIndex, distance });
            neighbors[toIndex]!.push({ index: fromIndex, distance });
          }
        }
      }
    }
  }
  for (const list of neighbors) list.sort((a, b) => a.index - b.index);
  return neighbors;
}

function traversalCost(
  fromIndex: number,
  neighbor: Neighbor,
  fitness: ReadonlyArray<number> | undefined,
  options: PathfindOptions,
): number {
  if (!fitness) return neighbor.distance;
  const floor = clamp(options.fitnessFloor ?? 0.01, Number.EPSILON, 1);
  const exponent = Math.max(0, options.fitnessExponent ?? 1);
  const average = clamp((fitness[fromIndex]! + fitness[neighbor.index]!) * 0.5, 0, 1);
  return neighbor.distance / Math.max(floor, average ** exponent);
}

function reconstructPath(previous: Int32Array, startIndex: number, endIndex: number): number[] {
  const path = [endIndex];
  let current = endIndex;
  while (current !== startIndex) {
    current = previous[current]!;
    if (current < 0) return [];
    path.push(current);
  }
  return path.reverse();
}

function pathCurve(
  cloud: PointCloud,
  indices: ReadonlyArray<number>,
  start: Vec3,
  goal: Vec3,
  reachedGoal: boolean,
  includeEndpoints: boolean,
): Curve {
  if (indices.length === 0) return polyline([]);
  const points = indices.map((index) => ({ ...cloud.points[index]! }));
  if (!includeEndpoints) return polyline(points);
  if (length(sub(points[0]!, start)) > 1e-9) points.unshift({ ...start });
  else points[0] = { ...start };
  if (reachedGoal) {
    if (length(sub(points[points.length - 1]!, goal)) > 1e-9) points.push({ ...goal });
    else points[points.length - 1] = { ...goal };
  }
  return polyline(points);
}

function nearestPoint(points: ReadonlyArray<Vec3>, target: Vec3): number {
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < points.length; index++) {
    const delta = sub(points[index]!, target);
    const distanceSquared = delta.x * delta.x + delta.y * delta.y + delta.z * delta.z;
    if (distanceSquared < bestDistance) {
      bestDistance = distanceSquared;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function heuristic(from: Vec3, goal: Vec3, weight: number): number {
  return length(sub(goal, from)) * weight;
}

function gridKey(point: Vec3, cellSize: number): string {
  return `${Math.floor(point.x / cellSize)},${Math.floor(point.y / cellSize)},${Math.floor(point.z / cellSize)}`;
}

function heapLess(a: HeapItem, b: HeapItem): boolean {
  if (a.score !== b.score) return a.score < b.score;
  if (a.index !== b.index) return a.index < b.index;
  return a.cost < b.cost;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function emptyResult(
  startIndex = -1,
  goalIndex = -1,
  visited = 0,
): PathfindResult {
  return {
    curve: polyline([]),
    pointIndices: [],
    reachedGoal: false,
    cost: Infinity,
    visited,
    startIndex,
    goalIndex,
  };
}
