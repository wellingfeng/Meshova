import {
  transform,
  type NamedPart,
} from "../geometry/index.js";
import { vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import { buildBlendReferenceFurnishingParts } from "./blend-reference-furnishings.js";
import { buildCreamSofaParts } from "./cream-sofa.js";
import { buildInteriorSystemParts } from "./interior-systems.js";
import {
  buildRoomShellParts,
  type RoomOpening,
  type RoomWallSide,
} from "./spatial-interior-systems.js";
import { buildSweetHomeFurnishingParts } from "./sweet-home-furnishings.js";
import type { SweetHomeFurnishingKind } from "./sweet-home-furnishings.js";

export type RoomLayoutKind =
  | "living-room"
  | "bedroom-suite"
  | "dining-room"
  | "home-office"
  | "studio-apartment";

export type LayoutAssetKind =
  | "sofa"
  | "armchair"
  | "coffee-table"
  | "tv-console"
  | "floor-lamp"
  | "plant"
  | "bed"
  | "nightstand"
  | "wardrobe"
  | "office-desk"
  | "dining-table"
  | "dining-chair"
  | "bookcase"
  | "filing-cabinet"
  | "workstation";

export type LayoutRelationKind = "distance" | "facing" | "align-x" | "align-z";

export interface LayoutObjectSpec {
  id: string;
  label: string;
  asset: LayoutAssetKind;
  width: number;
  height: number;
  depth: number;
  clearance: number;
  priority: number;
  optional?: boolean;
  wallAffinity?: readonly RoomWallSide[];
  preferredPosition: readonly [number, number];
  preferredYaw: number;
  blocksWindow?: boolean;
}

export interface LayoutRelation {
  kind: LayoutRelationKind;
  first: string;
  second: string;
  target: number;
  tolerance: number;
  weight: number;
}

export interface LayoutDoor {
  wall: RoomWallSide;
  center: number;
  width: number;
  depth: number;
}

export interface LayoutWindow {
  wall: RoomWallSide;
  center: number;
  width: number;
  sill: number;
}

export interface RoomLayoutRequest {
  width: number;
  depth: number;
  aisleWidth: number;
  seed: number;
  objects: readonly LayoutObjectSpec[];
  relations: readonly LayoutRelation[];
  door: LayoutDoor;
  windows: readonly LayoutWindow[];
}

export interface LayoutPlacement {
  id: string;
  label: string;
  asset: LayoutAssetKind;
  x: number;
  z: number;
  yaw: number;
  width: number;
  height: number;
  depth: number;
  clearance: number;
}

export interface RoomLayoutMetrics {
  boundary: number;
  overlap: number;
  doorway: number;
  windowAccess: number;
  relationships: number;
  circulation: number;
  accessibleObjects: number;
  score: number;
}

export interface RoomLayoutIssue {
  code: "out-of-bounds" | "overlap" | "door-blocked" | "window-blocked" | "unreachable";
  severity: "warning" | "error";
  objects: string[];
  message: string;
}

export interface RoomLayoutResult {
  placements: LayoutPlacement[];
  metrics: RoomLayoutMetrics;
  issues: RoomLayoutIssue[];
}

export interface RoomLayoutSceneParams {
  kind: RoomLayoutKind;
  width: number;
  depth: number;
  height: number;
  density: number;
  accessibility: number;
  openness: number;
  detail: number;
  seed: number;
}

export interface RoomLayoutDefinition {
  id: string;
  name: string;
  kind: RoomLayoutKind;
  defaults: RoomLayoutSceneParams;
}

export const ROOM_LAYOUT_RESEARCH_SOURCES = [
  {
    id: "make-it-home-2011",
    title: "Make it home: automatic optimization of furniture arrangement",
    url: "https://doi.org/10.1145/1964921.1964981",
    applied: ["层级与空间关系", "可见性", "可达性", "代价函数", "确定性退火搜索"],
  },
  {
    id: "ada-accessible-routes",
    title: "U.S. Access Board Guide to Accessible Routes",
    url: "https://www.access-board.gov/ada/guides/chapter-4-accessible-routes/",
    applied: ["连续净宽 0.9144m", "门口局部净宽 0.8128m", "转弯与通行空间"],
  },
] as const;

const WALL_GAP = 0.08;
const GRID_STEP = 0.24;

function definition(
  kind: RoomLayoutKind,
  name: string,
  width: number,
  depth: number,
  density: number,
  seed: number,
): RoomLayoutDefinition {
  return {
    id: `layout-${kind}`,
    name,
    kind,
    defaults: { kind, width, depth, height: 2.9, density, accessibility: 1, openness: 0.3, detail: 1, seed },
  };
}

export const ROOM_LAYOUT_MODELS: RoomLayoutDefinition[] = [
  definition("living-room", "自动布局客厅", 6.6, 5.2, 0.88, 101),
  definition("bedroom-suite", "自动布局卧室套装", 6.2, 5.1, 0.9, 211),
  definition("dining-room", "自动布局餐厅", 6.4, 5.2, 0.82, 307),
  definition("home-office", "自动布局家庭办公室", 6.1, 4.8, 0.86, 419),
  definition("studio-apartment", "自动布局单间公寓", 8.2, 6.2, 0.92, 523),
];

interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface Candidate {
  x: number;
  z: number;
  yaw: number;
}

interface Evaluation {
  cost: number;
  metrics: Omit<RoomLayoutMetrics, "circulation" | "accessibleObjects" | "score">;
  issues: RoomLayoutIssue[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle: number): number {
  const wrapped = angle % (Math.PI * 2);
  return wrapped < -Math.PI ? wrapped + Math.PI * 2 : wrapped > Math.PI ? wrapped - Math.PI * 2 : wrapped;
}

function rotatedSize(width: number, depth: number, yaw: number): [number, number] {
  const quarterTurns = Math.round(yaw / (Math.PI * 0.5));
  return Math.abs(quarterTurns) % 2 === 1 ? [depth, width] : [width, depth];
}

function footprint(placement: LayoutPlacement, padding = 0): Rect {
  const [width, depth] = rotatedSize(placement.width, placement.depth, placement.yaw);
  return {
    minX: placement.x - width * 0.5 - padding,
    maxX: placement.x + width * 0.5 + padding,
    minZ: placement.z - depth * 0.5 - padding,
    maxZ: placement.z + depth * 0.5 + padding,
  };
}

function overlapArea(first: Rect, second: Rect): number {
  return Math.max(0, Math.min(first.maxX, second.maxX) - Math.max(first.minX, second.minX))
    * Math.max(0, Math.min(first.maxZ, second.maxZ) - Math.max(first.minZ, second.minZ));
}

function doorRect(request: RoomLayoutRequest): Rect {
  const halfWidth = request.width * 0.5;
  const halfDepth = request.depth * 0.5;
  const span = request.door.width * 0.5 + 0.12;
  const depth = Math.max(request.door.depth, request.aisleWidth);
  if (request.door.wall === "back") return { minX: request.door.center - span, maxX: request.door.center + span, minZ: -halfDepth, maxZ: -halfDepth + depth };
  if (request.door.wall === "front") return { minX: request.door.center - span, maxX: request.door.center + span, minZ: halfDepth - depth, maxZ: halfDepth };
  if (request.door.wall === "left") return { minX: -halfWidth, maxX: -halfWidth + depth, minZ: request.door.center - span, maxZ: request.door.center + span };
  return { minX: halfWidth - depth, maxX: halfWidth, minZ: request.door.center - span, maxZ: request.door.center + span };
}

function windowRect(window: LayoutWindow, request: RoomLayoutRequest): Rect {
  const halfWidth = request.width * 0.5;
  const halfDepth = request.depth * 0.5;
  const span = window.width * 0.5;
  const access = 0.42;
  if (window.wall === "back") return { minX: window.center - span, maxX: window.center + span, minZ: -halfDepth, maxZ: -halfDepth + access };
  if (window.wall === "front") return { minX: window.center - span, maxX: window.center + span, minZ: halfDepth - access, maxZ: halfDepth };
  if (window.wall === "left") return { minX: -halfWidth, maxX: -halfWidth + access, minZ: window.center - span, maxZ: window.center + span };
  return { minX: halfWidth - access, maxX: halfWidth, minZ: window.center - span, maxZ: window.center + span };
}

function relationCost(relation: LayoutRelation, placements: readonly LayoutPlacement[]): number {
  const first = placements.find((placement) => placement.id === relation.first);
  const second = placements.find((placement) => placement.id === relation.second);
  if (!first || !second) return relation.weight * 2;
  if (relation.kind === "distance") {
    const distance = Math.hypot(first.x - second.x, first.z - second.z);
    return Math.max(0, Math.abs(distance - relation.target) - relation.tolerance) * relation.weight;
  }
  if (relation.kind === "align-x") return Math.max(0, Math.abs(first.x - second.x) - relation.tolerance) * relation.weight;
  if (relation.kind === "align-z") return Math.max(0, Math.abs(first.z - second.z) - relation.tolerance) * relation.weight;
  const dx = second.x - first.x;
  const dz = second.z - first.z;
  const length = Math.max(1e-6, Math.hypot(dx, dz));
  const dot = Math.sin(first.yaw) * (dx / length) + Math.cos(first.yaw) * (dz / length);
  return Math.max(0, relation.target - dot - relation.tolerance) * relation.weight;
}

function wallAffinityCost(spec: LayoutObjectSpec, placement: LayoutPlacement, request: RoomLayoutRequest): number {
  if (!spec.wallAffinity?.length) return 0;
  const rect = footprint(placement);
  const distances = spec.wallAffinity.map((side) => {
    if (side === "back") return Math.abs(rect.minZ + request.depth * 0.5 - WALL_GAP);
    if (side === "front") return Math.abs(request.depth * 0.5 - rect.maxZ - WALL_GAP);
    if (side === "left") return Math.abs(rect.minX + request.width * 0.5 - WALL_GAP);
    return Math.abs(request.width * 0.5 - rect.maxX - WALL_GAP);
  });
  return Math.min(...distances) * 2.4;
}

function evaluate(request: RoomLayoutRequest, specs: readonly LayoutObjectSpec[], placements: readonly LayoutPlacement[]): Evaluation {
  const halfWidth = request.width * 0.5;
  const halfDepth = request.depth * 0.5;
  const issues: RoomLayoutIssue[] = [];
  let boundaryPenalty = 0;
  let overlapPenalty = 0;
  let doorwayPenalty = 0;
  let windowPenalty = 0;
  const entry = doorRect(request);
  for (const placement of placements) {
    const rect = footprint(placement);
    const outside = Math.max(0, -halfWidth - rect.minX) + Math.max(0, rect.maxX - halfWidth)
      + Math.max(0, -halfDepth - rect.minZ) + Math.max(0, rect.maxZ - halfDepth);
    if (outside > 0) {
      boundaryPenalty += outside * 45;
      issues.push({ code: "out-of-bounds", severity: "error", objects: [placement.id], message: `${placement.label} 超出房间边界` });
    }
    const doorOverlap = overlapArea(rect, entry);
    if (doorOverlap > 0) {
      doorwayPenalty += doorOverlap * 55;
      issues.push({ code: "door-blocked", severity: "error", objects: [placement.id], message: `${placement.label} 阻挡门口净空` });
    }
    const spec = specs.find((entrySpec) => entrySpec.id === placement.id);
    if (spec?.blocksWindow) {
      for (const window of request.windows) {
        const blocked = overlapArea(rect, windowRect(window, request));
        if (blocked > 0 && placement.height > window.sill + 0.2) {
          windowPenalty += blocked * 18;
          issues.push({ code: "window-blocked", severity: "warning", objects: [placement.id], message: `${placement.label} 遮挡窗前操作区` });
        }
      }
    }
    boundaryPenalty += spec ? wallAffinityCost(spec, placement, request) : 0;
  }
  for (let firstIndex = 0; firstIndex < placements.length; firstIndex++) {
    for (let secondIndex = firstIndex + 1; secondIndex < placements.length; secondIndex++) {
      const first = placements[firstIndex]!;
      const second = placements[secondIndex]!;
      const padding = Math.min(first.clearance, second.clearance) * 0.22;
      const area = overlapArea(footprint(first, padding), footprint(second, padding));
      if (area <= 0) continue;
      overlapPenalty += area * 70;
      issues.push({ code: "overlap", severity: "error", objects: [first.id, second.id], message: `${first.label} 与 ${second.label} 发生净空冲突` });
    }
  }
  const relationshipPenalty = request.relations.reduce((sum, relation) => sum + relationCost(relation, placements), 0);
  const preferencePenalty = placements.reduce((sum, placement) => {
    const spec = specs.find((entrySpec) => entrySpec.id === placement.id);
    if (!spec) return sum;
    const targetX = spec.preferredPosition[0] * request.width * 0.5;
    const targetZ = spec.preferredPosition[1] * request.depth * 0.5;
    const positionCost = Math.hypot(placement.x - targetX, placement.z - targetZ) * 0.22;
    const yawCost = Math.abs(normalizeAngle(placement.yaw - spec.preferredYaw)) * 0.16;
    return sum + positionCost + yawCost;
  }, 0);
  const cost = boundaryPenalty + overlapPenalty + doorwayPenalty + windowPenalty + relationshipPenalty + preferencePenalty;
  return {
    cost,
    metrics: {
      boundary: clamp(1 - boundaryPenalty / 20, 0, 1),
      overlap: clamp(1 - overlapPenalty / 20, 0, 1),
      doorway: clamp(1 - doorwayPenalty / 15, 0, 1),
      windowAccess: clamp(1 - windowPenalty / 10, 0, 1),
      relationships: clamp(1 - relationshipPenalty / 18, 0, 1),
    },
    issues,
  };
}

function candidateKey(candidate: Candidate): string {
  return `${candidate.x.toFixed(3)}|${candidate.z.toFixed(3)}|${candidate.yaw.toFixed(4)}`;
}

function wallCandidates(spec: LayoutObjectSpec, request: RoomLayoutRequest): Candidate[] {
  const candidates: Candidate[] = [];
  const halfWidth = request.width * 0.5;
  const halfDepth = request.depth * 0.5;
  for (const side of spec.wallAffinity ?? []) {
    const yaw = side === "back" ? 0 : side === "front" ? Math.PI : side === "left" ? Math.PI * 0.5 : -Math.PI * 0.5;
    const [width, depth] = rotatedSize(spec.width, spec.depth, yaw);
    const count = side === "back" || side === "front" ? 9 : 7;
    for (let index = 0; index < count; index++) {
      const t = index / (count - 1);
      if (side === "back" || side === "front") {
        const x = -halfWidth + width * 0.5 + (request.width - width) * t;
        const z = side === "back" ? -halfDepth + depth * 0.5 + WALL_GAP : halfDepth - depth * 0.5 - WALL_GAP;
        candidates.push({ x, z, yaw });
      } else {
        const z = -halfDepth + depth * 0.5 + (request.depth - depth) * t;
        const x = side === "left" ? -halfWidth + width * 0.5 + WALL_GAP : halfWidth - width * 0.5 - WALL_GAP;
        candidates.push({ x, z, yaw });
      }
    }
  }
  return candidates;
}

function candidatesFor(spec: LayoutObjectSpec, request: RoomLayoutRequest): Candidate[] {
  const candidates = wallCandidates(spec, request);
  const preferredX = spec.preferredPosition[0] * request.width * 0.5;
  const preferredZ = spec.preferredPosition[1] * request.depth * 0.5;
  const offsets = [-0.72, -0.36, 0, 0.36, 0.72];
  for (const offsetX of offsets) {
    for (const offsetZ of offsets) {
      for (const yaw of [spec.preferredYaw, spec.preferredYaw + Math.PI * 0.5, spec.preferredYaw - Math.PI * 0.5, spec.preferredYaw + Math.PI]) {
        candidates.push({ x: preferredX + offsetX, z: preferredZ + offsetZ, yaw: normalizeAngle(yaw) });
      }
    }
  }
  const unique = new Map<string, Candidate>();
  for (const candidate of candidates) unique.set(candidateKey(candidate), candidate);
  return [...unique.values()];
}

function placementFrom(spec: LayoutObjectSpec, candidate: Candidate): LayoutPlacement {
  return {
    id: spec.id,
    label: spec.label,
    asset: spec.asset,
    x: candidate.x,
    z: candidate.z,
    yaw: candidate.yaw,
    width: spec.width,
    height: spec.height,
    depth: spec.depth,
    clearance: spec.clearance,
  };
}

function entrancePoint(request: RoomLayoutRequest): [number, number] {
  const halfWidth = request.width * 0.5;
  const halfDepth = request.depth * 0.5;
  const inset = Math.max(0.35, request.door.depth * 0.55);
  if (request.door.wall === "back") return [request.door.center, -halfDepth + inset];
  if (request.door.wall === "front") return [request.door.center, halfDepth - inset];
  if (request.door.wall === "left") return [-halfWidth + inset, request.door.center];
  return [halfWidth - inset, request.door.center];
}

function accessPoint(placement: LayoutPlacement): [number, number] {
  const front = placement.depth * 0.5 + Math.max(0.38, placement.clearance * 0.5);
  return [placement.x + Math.sin(placement.yaw) * front, placement.z + Math.cos(placement.yaw) * front];
}

function circulationMetrics(request: RoomLayoutRequest, placements: readonly LayoutPlacement[]): { circulation: number; accessibleObjects: number; unreachable: string[] } {
  const cols = Math.max(4, Math.floor(request.width / GRID_STEP));
  const rows = Math.max(4, Math.floor(request.depth / GRID_STEP));
  const cellWidth = request.width / cols;
  const cellDepth = request.depth / rows;
  const obstacles = placements.map((placement) => footprint(placement, 0.08));
  const indexOf = (x: number, z: number): number => {
    const col = clamp(Math.floor((x + request.width * 0.5) / cellWidth), 0, cols - 1);
    const row = clamp(Math.floor((z + request.depth * 0.5) / cellDepth), 0, rows - 1);
    return row * cols + col;
  };
  const isBlocked = (index: number): boolean => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = -request.width * 0.5 + (col + 0.5) * cellWidth;
    const z = -request.depth * 0.5 + (row + 0.5) * cellDepth;
    return obstacles.some((rect) => x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ);
  };
  const [startX, startZ] = entrancePoint(request);
  const start = indexOf(startX, startZ);
  const visited = new Uint8Array(cols * rows);
  const queue: number[] = [];
  if (!isBlocked(start)) {
    visited[start] = 1;
    queue.push(start);
  }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor]!;
    const col = index % cols;
    const row = Math.floor(index / cols);
    const neighbors = [
      col > 0 ? index - 1 : -1,
      col + 1 < cols ? index + 1 : -1,
      row > 0 ? index - cols : -1,
      row + 1 < rows ? index + cols : -1,
    ];
    for (const next of neighbors) {
      if (next < 0 || visited[next] || isBlocked(next)) continue;
      visited[next] = 1;
      queue.push(next);
    }
  }
  const freeCells = Array.from({ length: cols * rows }, (_, index) => index).filter((index) => !isBlocked(index));
  const reachableFree = freeCells.filter((index) => visited[index]).length;
  const unreachable = placements.filter((placement) => {
    const [x, z] = accessPoint(placement);
    const target = indexOf(x, z);
    if (visited[target]) return false;
    const col = target % cols;
    const row = Math.floor(target / cols);
    for (let radius = 1; radius <= 3; radius++) {
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const checkCol = col + dx;
          const checkRow = row + dz;
          if (checkCol < 0 || checkCol >= cols || checkRow < 0 || checkRow >= rows) continue;
          if (visited[checkRow * cols + checkCol]) return false;
        }
      }
    }
    return true;
  }).map((placement) => placement.id);
  return {
    circulation: freeCells.length === 0 ? 0 : reachableFree / freeCells.length,
    accessibleObjects: placements.length === 0 ? 1 : 1 - unreachable.length / placements.length,
    unreachable,
  };
}

export function solveRoomLayout(request: RoomLayoutRequest): RoomLayoutResult {
  const specs = request.objects.slice().sort((first, second) => second.priority - first.priority || first.id.localeCompare(second.id));
  const candidateSets = new Map(specs.map((spec) => [spec.id, candidatesFor(spec, request)]));
  const placements: LayoutPlacement[] = [];
  for (const spec of specs) {
    const candidates = candidateSets.get(spec.id)!;
    let best: LayoutPlacement | undefined;
    let bestCost = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      const placement = placementFrom(spec, candidate);
      const evaluated = evaluate(request, specs, [...placements, placement]);
      if (evaluated.cost < bestCost) {
        bestCost = evaluated.cost;
        best = placement;
      }
    }
    if (best) placements.push(best);
  }
  const rng = makeRng(Math.round(request.seed) >>> 0);
  let current = placements;
  let currentCost = evaluate(request, specs, current).cost;
  let best = current.map((placement) => ({ ...placement }));
  let bestCost = currentCost;
  for (let iteration = 0; iteration < 320; iteration++) {
    const itemIndex = rng.int(0, Math.max(0, current.length - 1));
    const spec = specs[itemIndex];
    if (!spec) continue;
    const candidates = candidateSets.get(spec.id)!;
    const candidate = candidates[rng.int(0, candidates.length - 1)]!;
    const trial = current.map((placement, index) => index === itemIndex ? placementFrom(spec, candidate) : placement);
    const trialCost = evaluate(request, specs, trial).cost;
    const temperature = 2.4 * (1 - iteration / 320) + 0.04;
    if (trialCost <= currentCost || rng.next() < Math.exp((currentCost - trialCost) / temperature)) {
      current = trial;
      currentCost = trialCost;
      if (trialCost < bestCost) {
        best = trial.map((placement) => ({ ...placement }));
        bestCost = trialCost;
      }
    }
  }
  const evaluated = evaluate(request, specs, best);
  const circulation = circulationMetrics(request, best);
  const issues = evaluated.issues.concat(circulation.unreachable.map((id) => ({
    code: "unreachable" as const,
    severity: "error" as const,
    objects: [id],
    message: `${best.find((placement) => placement.id === id)?.label ?? id} 缺少连续通行路径`,
  })));
  const baseMetrics = evaluated.metrics;
  const score = (
    baseMetrics.boundary * 0.14
    + baseMetrics.overlap * 0.2
    + baseMetrics.doorway * 0.14
    + baseMetrics.windowAccess * 0.08
    + baseMetrics.relationships * 0.16
    + circulation.circulation * 0.14
    + circulation.accessibleObjects * 0.14
  ) * 100;
  return {
    placements: best,
    metrics: { ...baseMetrics, ...circulation, score },
    issues,
  };
}

function object(
  id: string,
  label: string,
  asset: LayoutAssetKind,
  width: number,
  height: number,
  depth: number,
  priority: number,
  x: number,
  z: number,
  yaw: number,
  options: Partial<Pick<LayoutObjectSpec, "clearance" | "optional" | "wallAffinity" | "blocksWindow">> = {},
): LayoutObjectSpec {
  return {
    id,
    label,
    asset,
    width,
    height,
    depth,
    priority,
    preferredPosition: [x, z],
    preferredYaw: yaw,
    clearance: options.clearance ?? 0.72,
    ...(options.optional === undefined ? {} : { optional: options.optional }),
    ...(options.wallAffinity === undefined ? {} : { wallAffinity: options.wallAffinity }),
    ...(options.blocksWindow === undefined ? {} : { blocksWindow: options.blocksWindow }),
  };
}

function presetObjects(kind: RoomLayoutKind): { objects: LayoutObjectSpec[]; relations: LayoutRelation[] } {
  if (kind === "living-room") {
    return {
      objects: [
        object("sofa", "多人软包沙发", "sofa", 2.8, 0.82, 1.1, 10, 0, -0.64, 0, { wallAffinity: ["back"] }),
        object("media", "电视柜", "tv-console", 2.0, 0.66, 0.48, 9, 0, 0.72, Math.PI, { wallAffinity: ["front"], blocksWindow: true }),
        object("coffee", "茶几", "coffee-table", 1.3, 0.46, 0.72, 8, 0, 0.05, 0, { clearance: 0.46 }),
        object("chair", "休闲单椅", "armchair", 0.86, 0.95, 0.88, 6, -0.66, 0.08, Math.PI * 0.5, { optional: true }),
        object("lamp", "落地灯", "floor-lamp", 0.48, 1.72, 0.48, 4, 0.72, -0.58, 0, { optional: true, wallAffinity: ["back", "right"] }),
        object("plant", "室内盆栽", "plant", 0.82, 1.45, 0.82, 3, -0.74, -0.62, 0, { optional: true, wallAffinity: ["back", "left"], blocksWindow: true }),
      ],
      relations: [
        { kind: "facing", first: "sofa", second: "media", target: 0.86, tolerance: 0.08, weight: 7 },
        { kind: "distance", first: "sofa", second: "coffee", target: 1.15, tolerance: 0.28, weight: 4 },
        { kind: "align-x", first: "sofa", second: "coffee", target: 0, tolerance: 0.38, weight: 3 },
        { kind: "align-x", first: "media", second: "coffee", target: 0, tolerance: 0.42, weight: 2 },
      ],
    };
  }
  if (kind === "bedroom-suite") {
    return {
      objects: [
        object("bed", "双人软包床", "bed", 1.86, 1.08, 2.18, 10, 0.18, -0.48, 0, { wallAffinity: ["back"] }),
        object("night-left", "左床头柜", "nightstand", 0.55, 0.58, 0.46, 8, -0.42, -0.5, 0, { wallAffinity: ["back"] }),
        object("night-right", "右床头柜", "nightstand", 0.55, 0.58, 0.46, 8, 0.7, -0.5, 0, { wallAffinity: ["back"] }),
        object("wardrobe", "多轨衣柜", "wardrobe", 2.35, 2.28, 0.68, 9, -0.7, 0.25, Math.PI * 0.5, { wallAffinity: ["left", "right"], blocksWindow: true }),
        object("desk", "卧室书桌", "office-desk", 1.48, 0.76, 0.7, 6, 0.62, 0.55, Math.PI, { optional: true, wallAffinity: ["front", "right"], blocksWindow: true }),
        object("chair", "书桌椅", "dining-chair", 0.5, 0.95, 0.53, 5, 0.58, 0.25, 0, { optional: true }),
        object("lamp", "床头灯", "floor-lamp", 0.38, 1.45, 0.38, 3, -0.68, -0.58, 0, { optional: true, wallAffinity: ["back"] }),
      ],
      relations: [
        { kind: "distance", first: "bed", second: "night-left", target: 1.25, tolerance: 0.25, weight: 4 },
        { kind: "distance", first: "bed", second: "night-right", target: 1.25, tolerance: 0.25, weight: 4 },
        { kind: "distance", first: "desk", second: "chair", target: 0.82, tolerance: 0.25, weight: 3 },
        { kind: "facing", first: "chair", second: "desk", target: 0.75, tolerance: 0.12, weight: 3 },
      ],
    };
  }
  if (kind === "dining-room") {
    const chairs = [
      object("chair-n1", "北侧餐椅一", "dining-chair", 0.5, 0.92, 0.53, 6, -0.24, -0.34, 0),
      object("chair-n2", "北侧餐椅二", "dining-chair", 0.5, 0.92, 0.53, 6, 0.24, -0.34, 0),
      object("chair-s1", "南侧餐椅一", "dining-chair", 0.5, 0.92, 0.53, 6, -0.24, 0.34, Math.PI),
      object("chair-s2", "南侧餐椅二", "dining-chair", 0.5, 0.92, 0.53, 6, 0.24, 0.34, Math.PI),
      object("chair-w", "西侧餐椅", "dining-chair", 0.5, 0.92, 0.53, 5, -0.5, 0, Math.PI * 0.5, { optional: true }),
      object("chair-e", "东侧餐椅", "dining-chair", 0.5, 0.92, 0.53, 5, 0.5, 0, -Math.PI * 0.5, { optional: true }),
    ];
    return {
      objects: [
        object("table", "六人餐桌", "dining-table", 2.15, 0.77, 1.02, 10, 0, 0, 0, { clearance: 0.92 }),
        ...chairs,
        object("cabinet", "餐边柜", "filing-cabinet", 1.35, 1.1, 0.48, 4, 0.62, -0.68, 0, { optional: true, wallAffinity: ["back", "right"], blocksWindow: true }),
        object("plant", "餐厅盆栽", "plant", 0.72, 1.35, 0.72, 3, -0.7, -0.65, 0, { optional: true, wallAffinity: ["back", "left"], blocksWindow: true }),
      ],
      relations: chairs.map((chair) => ({ kind: "facing" as const, first: chair.id, second: "table", target: 0.72, tolerance: 0.14, weight: 2.5 })),
    };
  }
  if (kind === "home-office") {
    return {
      objects: [
        object("desk", "主工作台", "workstation", 1.75, 1.25, 0.78, 10, 0.12, -0.6, 0, { wallAffinity: ["back"], blocksWindow: true }),
        object("chair", "工作椅", "armchair", 0.72, 0.98, 0.72, 9, 0.12, -0.18, Math.PI, { clearance: 0.86 }),
        object("bookcase", "资料书柜", "bookcase", 1.35, 2.08, 0.38, 8, -0.7, 0, Math.PI * 0.5, { wallAffinity: ["left"], blocksWindow: true }),
        object("filing", "文件柜", "filing-cabinet", 0.82, 1.2, 0.5, 6, 0.7, -0.58, 0, { optional: true, wallAffinity: ["back", "right"], blocksWindow: true }),
        object("guest", "访客椅", "dining-chair", 0.52, 0.94, 0.54, 4, -0.2, 0.36, 0, { optional: true }),
        object("plant", "办公盆栽", "plant", 0.72, 1.42, 0.72, 3, 0.72, 0.62, 0, { optional: true, wallAffinity: ["front", "right"], blocksWindow: true }),
      ],
      relations: [
        { kind: "facing", first: "chair", second: "desk", target: 0.82, tolerance: 0.1, weight: 6 },
        { kind: "distance", first: "chair", second: "desk", target: 1.0, tolerance: 0.28, weight: 4 },
        { kind: "facing", first: "guest", second: "desk", target: 0.72, tolerance: 0.12, weight: 3 },
      ],
    };
  }
  return {
    objects: [
      object("bed", "公寓双人床", "bed", 1.82, 1.05, 2.15, 10, -0.52, -0.48, 0, { wallAffinity: ["back"] }),
      object("wardrobe", "公寓衣柜", "wardrobe", 2.1, 2.25, 0.66, 9, -0.72, 0.3, Math.PI * 0.5, { wallAffinity: ["left"], blocksWindow: true }),
      object("sofa", "双人沙发", "sofa", 2.35, 0.82, 1.0, 9, 0.45, 0.05, Math.PI * 0.5, { wallAffinity: ["right"] }),
      object("media", "紧凑电视柜", "tv-console", 1.65, 0.62, 0.46, 8, -0.05, 0.05, -Math.PI * 0.5, { wallAffinity: ["left"], blocksWindow: true }),
      object("coffee", "小茶几", "coffee-table", 1.0, 0.43, 0.6, 6, 0.2, 0.05, 0, { clearance: 0.42 }),
      object("desk", "靠窗书桌", "office-desk", 1.3, 0.76, 0.66, 5, 0.45, -0.62, 0, { optional: true, wallAffinity: ["back", "right"], blocksWindow: false }),
      object("chair", "书桌椅", "dining-chair", 0.5, 0.92, 0.52, 4, 0.45, -0.3, Math.PI, { optional: true }),
      object("plant", "角落盆栽", "plant", 0.68, 1.3, 0.68, 3, 0.72, 0.7, 0, { optional: true, wallAffinity: ["front", "right"], blocksWindow: true }),
    ],
    relations: [
      { kind: "facing", first: "sofa", second: "media", target: 0.82, tolerance: 0.12, weight: 6 },
      { kind: "distance", first: "sofa", second: "coffee", target: 1.05, tolerance: 0.25, weight: 3 },
      { kind: "facing", first: "chair", second: "desk", target: 0.72, tolerance: 0.12, weight: 3 },
    ],
  };
}

function assetParts(placement: LayoutPlacement, detail: number): NamedPart[] {
  if (placement.asset === "sofa") return buildCreamSofaParts({ variant: "wrap", width: placement.width, height: placement.height, depth: placement.depth });
  if (placement.asset === "plant") return buildBlendReferenceFurnishingParts({ kind: "indoor-plant", width: placement.width, height: placement.height, depth: placement.depth, detail, modules: detail >= 0.5 ? 18 : 9 });
  if (placement.asset === "workstation") return buildInteriorSystemParts({ kind: "workstation", width: placement.width, height: placement.height, depth: placement.depth, count: 1, detail });
  if (placement.asset === "tv-console") {
    const consoleParts = buildSweetHomeFurnishingParts({ kind: "tv-console", width: placement.width, height: placement.height, depth: placement.depth, count: 3, detail });
    const televisionParts = buildInteriorSystemParts({ kind: "television", width: placement.width * 0.72, height: placement.height * 1.2, depth: placement.depth * 0.24, count: 2, detail })
      .map((entry) => ({
        ...entry,
        name: `television_${entry.name}`,
        label: `电视屏幕 · ${entry.label ?? entry.name}`,
        mesh: transform(entry.mesh, { translate: vec3(0, placement.height, -placement.depth * 0.12) }),
      }));
    return [...consoleParts, ...televisionParts];
  }
  const sweetKind = {
    "armchair": "armchair",
    "coffee-table": "coffee-table",
    "floor-lamp": "floor-lamp",
    "bed": "bed",
    "nightstand": "nightstand",
    "wardrobe": "wardrobe",
    "office-desk": "office-desk",
    "dining-table": "dining-table",
    "dining-chair": "dining-chair",
    "bookcase": "bookcase",
    "filing-cabinet": "drawer-chest",
  }[placement.asset] as SweetHomeFurnishingKind;
  return buildSweetHomeFurnishingParts({
    kind: sweetKind,
    width: placement.width,
    height: placement.height,
    depth: placement.depth,
    count: placement.asset === "wardrobe" ? 4 : placement.asset === "bookcase" ? 5 : placement.asset === "filing-cabinet" ? 4 : placement.asset === "dining-chair" ? 3 : 2,
    detail,
  });
}

function placedParts(placement: LayoutPlacement, detail: number, layout: RoomLayoutResult): NamedPart[] {
  return assetParts(placement, detail).map((entry) => ({
    ...entry,
    name: `layout_${placement.id}_${entry.name}`,
    label: `${placement.label} · ${entry.label ?? entry.name}`,
    mesh: transform(entry.mesh, { rotate: vec3(0, placement.yaw, 0), translate: vec3(placement.x, 0, placement.z) }),
    metadata: {
      ...entry.metadata,
      layoutObjectId: placement.id,
      layoutAsset: placement.asset,
      placement: [placement.x, 0, placement.z],
      yaw: placement.yaw,
      reusedExistingModel: true,
      layoutScore: layout.metrics.score,
    },
  }));
}

function resolveSceneParams(input: Partial<RoomLayoutSceneParams>): RoomLayoutSceneParams {
  const kind = input.kind ?? "living-room";
  const definitionForKind = ROOM_LAYOUT_MODELS.find((entry) => entry.kind === kind) ?? ROOM_LAYOUT_MODELS[0]!;
  const defaults = definitionForKind.defaults;
  return {
    kind,
    width: clamp(input.width ?? defaults.width, 4.2, 14),
    depth: clamp(input.depth ?? defaults.depth, 3.8, 12),
    height: clamp(input.height ?? defaults.height, 2.2, 4.5),
    density: clamp(input.density ?? defaults.density, 0.35, 1),
    accessibility: clamp(input.accessibility ?? defaults.accessibility, 0, 1),
    openness: clamp(input.openness ?? defaults.openness, 0, 1),
    detail: clamp(input.detail ?? defaults.detail, 0, 1),
    seed: Math.round(input.seed ?? defaults.seed) >>> 0,
  };
}

export function buildRoomLayoutScene(input: Partial<RoomLayoutSceneParams> = {}): { parts: NamedPart[]; layout: RoomLayoutResult } {
  const params = resolveSceneParams(input);
  const preset = presetObjects(params.kind);
  const optionalBudget = Math.round(preset.objects.filter((entry) => entry.optional).length * params.density);
  let optionalUsed = 0;
  const objects = preset.objects.filter((entry) => {
    if (!entry.optional) return true;
    optionalUsed++;
    return optionalUsed <= optionalBudget;
  });
  const objectIds = new Set(objects.map((entry) => entry.id));
  const relations = preset.relations.filter((relation) => objectIds.has(relation.first) && objectIds.has(relation.second));
  const aisleWidth = 0.72 + params.accessibility * (0.9144 - 0.72);
  const door: LayoutDoor = { wall: "back", center: -params.width * 0.36, width: 0.92, depth: aisleWidth };
  const windows: LayoutWindow[] = [{ wall: "right", center: -params.depth * 0.08, width: Math.min(1.8, params.depth * 0.36), sill: 0.9 }];
  const layout = solveRoomLayout({ width: params.width, depth: params.depth, aisleWidth, seed: params.seed, objects, relations, door, windows });
  const openings: RoomOpening[] = [
    { id: "layout-entry", kind: "door", wall: door.wall, center: door.center, width: door.width, height: Math.min(2.15, params.height - 0.12), sill: 0, openness: params.openness },
    { id: "layout-window", kind: "window", wall: windows[0]!.wall, center: windows[0]!.center, width: windows[0]!.width, height: Math.min(1.35, params.height * 0.5), sill: windows[0]!.sill, openness: 0 },
  ];
  const metadata = {
    system: "room-layout",
    layoutKind: params.kind,
    layoutMetrics: layout.metrics,
    layoutIssues: layout.issues,
    aisleWidth,
    optimizer: "seeded-simulated-annealing",
    researchSources: ROOM_LAYOUT_RESEARCH_SOURCES.map((source) => source.id),
  };
  const shell = buildRoomShellParts({
    width: params.width,
    depth: params.depth,
    height: params.height,
    wallThickness: 0.16,
    floorThickness: 0.12,
    frontWall: false,
    ceiling: false,
    baseboards: false,
    detail: params.detail,
  }, openings)
    .filter((entry) => entry.name !== "opening_frames")
    .map((entry) => ({ ...entry, name: `layout_room_${entry.name}`, metadata: { ...entry.metadata, ...metadata } }));
  const furniture = layout.placements.flatMap((placement) => placedParts(placement, params.detail, layout));
  return { parts: [...shell, ...furniture], layout };
}

export function buildRoomLayoutParts(input: Partial<RoomLayoutSceneParams> = {}): NamedPart[] {
  return buildRoomLayoutScene(input).parts;
}
