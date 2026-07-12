import { vec2, type Vec2 } from "../math/vec2.js";
import { makeRng } from "../random/prng.js";

export interface CellGraphCell2D {
  readonly id: number;
  readonly center: Vec2;
  readonly corners: ReadonlyArray<Vec2>;
  readonly neighbors: ReadonlyArray<number>;
  readonly axial: readonly [number, number];
}

export interface CellGraph2D {
  readonly cells: ReadonlyArray<CellGraphCell2D>;
}

export interface HexCellGraphOptions {
  rings?: number;
  cellSize?: number;
  jitter?: number;
  seed?: number;
}

export interface CellGraphBoundaryEdge {
  readonly cell: number;
  readonly neighbor: number | null;
  readonly a: Vec2;
  readonly b: Vec2;
}

export function hexCellGraph(options: HexCellGraphOptions = {}): CellGraph2D {
  const rings = clampInt(options.rings ?? 5, 1, 32);
  const cellSize = Math.max(1e-5, options.cellSize ?? 1);
  const jitter = clamp(options.jitter ?? 0, 0, 0.38) * cellSize;
  const rng = makeRng(options.seed ?? 0);
  const axial: Array<readonly [number, number]> = [];
  for (let q = -rings; q <= rings; q++) {
    const rMin = Math.max(-rings, -q - rings);
    const rMax = Math.min(rings, -q + rings);
    for (let r = rMin; r <= rMax; r++) axial.push([q, r]);
  }

  const indexByAxial = new Map<string, number>();
  axial.forEach(([q, r], index) => indexByAxial.set(`${q},${r}`, index));
  const directions: ReadonlyArray<readonly [number, number]> = [
    [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
  ];
  const cells = axial.map(([q, r], id): CellGraphCell2D => {
    const baseX = cellSize * Math.sqrt(3) * (q + r * 0.5);
    const baseY = cellSize * 1.5 * r;
    const center = vec2(
      baseX + (rng.next() - 0.5) * jitter * 2,
      baseY + (rng.next() - 0.5) * jitter * 2,
    );
    const corners = Array.from({ length: 6 }, (_, corner) => {
      const angle = Math.PI / 6 + corner * Math.PI / 3;
      return vec2(center.x + Math.cos(angle) * cellSize, center.y + Math.sin(angle) * cellSize);
    });
    const neighbors = directions
      .map(([dq, dr]) => indexByAxial.get(`${q + dq},${r + dr}`))
      .filter((value): value is number => value !== undefined);
    return { id, center, corners, neighbors, axial: [q, r] };
  });
  return { cells };
}

export function clusterCells(
  graph: CellGraph2D,
  clusterCount: number,
  seed = 0,
): ReadonlyArray<number> {
  if (graph.cells.length === 0) return [];
  const count = clampInt(clusterCount, 1, graph.cells.length);
  const rng = makeRng(seed);
  const seeds: number[] = [Math.floor(rng.next() * graph.cells.length)];
  while (seeds.length < count) {
    let best = -1;
    let bestDistance = -1;
    for (const cell of graph.cells) {
      if (seeds.includes(cell.id)) continue;
      const distance = Math.min(...seeds.map((candidate) => {
        const other = graph.cells[candidate]!;
        return Math.hypot(cell.center.x - other.center.x, cell.center.y - other.center.y);
      }));
      if (distance > bestDistance + 1e-9 || (Math.abs(distance - bestDistance) < 1e-9 && cell.id < best)) {
        best = cell.id;
        bestDistance = distance;
      }
    }
    seeds.push(best);
  }

  const labels = new Array<number>(graph.cells.length).fill(-1);
  const queues = seeds.map((cell, label) => {
    labels[cell] = label;
    return [cell];
  });
  let remaining = graph.cells.length - seeds.length;
  while (remaining > 0) {
    let progressed = false;
    const start = Math.floor(rng.next() * count);
    for (let offset = 0; offset < count; offset++) {
      const label = (start + offset) % count;
      const queue = queues[label]!;
      const cellId = queue.shift();
      if (cellId === undefined) continue;
      const neighbors = graph.cells[cellId]!.neighbors.slice();
      for (let i = neighbors.length - 1; i > 0; i--) {
        const swap = Math.floor(rng.next() * (i + 1));
        [neighbors[i], neighbors[swap]] = [neighbors[swap]!, neighbors[i]!];
      }
      for (const neighbor of neighbors) {
        if (labels[neighbor] !== -1) continue;
        labels[neighbor] = label;
        queue.push(neighbor);
        remaining--;
        progressed = true;
      }
      if (queue.length === 0) {
        const frontier = graph.cells.find((cell) => labels[cell.id] === label
          && cell.neighbors.some((neighbor) => labels[neighbor] === -1));
        if (frontier) queue.push(frontier.id);
      }
    }
    if (!progressed) {
      const unassigned = labels.findIndex((label) => label === -1);
      if (unassigned < 0) break;
      const nearest = seeds.reduce((best, candidate, label) => {
        const cell = graph.cells[unassigned]!;
        const seedCell = graph.cells[candidate]!;
        const distance = Math.hypot(cell.center.x - seedCell.center.x, cell.center.y - seedCell.center.y);
        return distance < best.distance ? { label, distance } : best;
      }, { label: 0, distance: Infinity });
      labels[unassigned] = nearest.label;
      queues[nearest.label]!.push(unassigned);
      remaining--;
    }
  }
  return labels;
}

export function traceCellGraphBoundaries(
  graph: CellGraph2D,
  labels: ReadonlyArray<number>,
): ReadonlyArray<CellGraphBoundaryEdge> {
  if (labels.length !== graph.cells.length) throw new Error("cell labels must match graph cells");
  const edges: CellGraphBoundaryEdge[] = [];
  for (const cell of graph.cells) {
    for (let side = 0; side < 6; side++) {
      const neighbor = neighborOnSide(cell.axial, side, graph);
      if (neighbor !== null && labels[neighbor] === labels[cell.id]) continue;
      if (neighbor !== null && neighbor < cell.id) continue;
      edges.push({
        cell: cell.id,
        neighbor,
        a: cell.corners[side]!,
        b: cell.corners[(side + 1) % 6]!,
      });
    }
  }
  return edges;
}

function neighborOnSide(
  axial: readonly [number, number],
  side: number,
  graph: CellGraph2D,
): number | null {
  const directions: ReadonlyArray<readonly [number, number]> = [
    [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
  ];
  const [dq, dr] = directions[side]!;
  const q = axial[0] + dq;
  const r = axial[1] + dr;
  return graph.cells.find((cell) => cell.axial[0] === q && cell.axial[1] === r)?.id ?? null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
