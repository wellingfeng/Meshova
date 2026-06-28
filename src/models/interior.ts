/**
 * Procedural interior generator: room shell + furniture + simple articulation.
 *
 * This covers the next high-value category after buildings/cities: indoor
 * assets with constraints and joints. It stays scriptable and deterministic:
 * room size, furniture density, seed, door angle and drawer offset fully define
 * the scene.
 */
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import {
  box,
  bounds,
  cylinder,
  merge,
  sphere,
  transform,
  translateMesh,
  triangleCount,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";

type RGB = [number, number, number];

export interface InteriorJoint {
  /** Stable joint id. */
  name: string;
  /** Part driven by the joint. */
  part: string;
  /** Joint primitive. */
  type: "hinge" | "slider";
  /** World-space pivot/anchor. */
  origin: Vec3;
  /** World-space axis. */
  axis: Vec3;
  /** Current value: radians for hinge, distance for slider. */
  value: number;
  /** Allowed value range. */
  min: number;
  max: number;
}

export interface InteriorRoomParams {
  /** Room width along X. */
  width: number;
  /** Room depth along Z. */
  depth: number;
  /** Wall height. */
  wallHeight: number;
  /** Uniform furniture scale. */
  furnitureScale: number;
  /** Chairs around the table. */
  chairs: number;
  /** Shelf levels on the back-wall bookcase. */
  shelves: number;
  /** Small props/books count. */
  clutter: number;
  /** Door openness 0..1. */
  doorOpen: number;
  /** Drawer openness 0..1. */
  drawerOpen: number;
  /** Layout/material seed. */
  seed: number;
}

export interface InteriorRoom {
  parts: NamedPart[];
  joints: InteriorJoint[];
}

export const INTERIOR_ROOM_DEFAULTS: InteriorRoomParams = {
  width: 7.0,
  depth: 5.2,
  wallHeight: 3.0,
  furnitureScale: 1.0,
  chairs: 4,
  shelves: 4,
  clutter: 14,
  doorOpen: 0.35,
  drawerOpen: 0.25,
  seed: 23,
};

export interface InteriorRoomScore {
  score: number;
  metrics: {
    shell: number;
    furniture: number;
    articulation: number;
    layoutCoverage: number;
  };
  feedback: string;
}

const FLOOR: RGB = [0.45, 0.31, 0.18];
const WALL: RGB = [0.72, 0.7, 0.66];
const TRIM: RGB = [0.38, 0.25, 0.13];
const WOOD: RGB = [0.42, 0.25, 0.12];
const DARK_WOOD: RGB = [0.25, 0.14, 0.07];
const FABRIC: RGB = [0.22, 0.34, 0.52];
const PILLOW: RGB = [0.84, 0.82, 0.75];
const METAL: RGB = [0.7, 0.68, 0.62];
const GLASS: RGB = [0.55, 0.72, 0.82];
const LAMP: RGB = [1.0, 0.82, 0.44];

function surf(
  name: string,
  mesh: Mesh,
  color: RGB,
  type: string,
  params: Record<string, unknown> = {},
): NamedPart {
  return { name, mesh, color, surface: { type, params: { color, ...params } } };
}

function addBox(
  out: Mesh[],
  size: Vec3,
  pos: Vec3,
  rotate: Vec3 = vec3(0, 0, 0),
): void {
  out.push(transform(box(size.x, size.y, size.z), { rotate, translate: pos }));
}

function addCylinder(
  out: Mesh[],
  radius: number,
  height: number,
  pos: Vec3,
  rotate: Vec3 = vec3(0, 0, 0),
  segments = 16,
): void {
  out.push(transform(cylinder(radius, height, segments, true), { rotate, translate: pos }));
}

function pushMerged(
  parts: NamedPart[],
  name: string,
  meshes: Mesh[],
  color: RGB,
  type: string,
  params: Record<string, unknown> = {},
): void {
  if (meshes.length > 0) parts.push(surf(name, merge(...meshes), color, type, params));
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Build parts + joint metadata for a furnished interior room.
 */
export function buildInteriorRoom(params: Partial<InteriorRoomParams> = {}): InteriorRoom {
  const p: InteriorRoomParams = { ...INTERIOR_ROOM_DEFAULTS, ...params };
  const width = Math.max(3, p.width);
  const depth = Math.max(3, p.depth);
  const wallH = Math.max(1.8, p.wallHeight);
  const s = Math.max(0.6, p.furnitureScale);
  const halfW = width / 2;
  const halfD = depth / 2;
  const wallT = 0.12;
  const rng = makeRng(Math.round(p.seed) >>> 0);

  const parts: NamedPart[] = [];
  const joints: InteriorJoint[] = [];

  // Room shell: floor + three walls, open front so the viewer can see in.
  const shell: Mesh[] = [];
  addBox(shell, vec3(width, 0.12, depth), vec3(0, -0.06, 0));
  addBox(shell, vec3(width, wallH, wallT), vec3(0, wallH / 2, -halfD));
  addBox(shell, vec3(wallT, wallH, depth), vec3(-halfW, wallH / 2, 0));
  addBox(shell, vec3(wallT, wallH, depth), vec3(halfW, wallH / 2, 0));
  parts.push(surf("room_shell", merge(...shell), WALL, "concrete", { roughness: 0.82, seed: p.seed }));

  const floor = transform(box(width, 0.08, depth), { translate: vec3(0, 0.0, 0) });
  parts.push(surf("wood_floor", floor, FLOOR, "wood", { tone: FLOOR, ringScale: 10, seed: p.seed + 1 }));

  const trim: Mesh[] = [];
  addBox(trim, vec3(width, 0.09, 0.08), vec3(0, 0.12, -halfD + wallT));
  addBox(trim, vec3(0.08, 0.09, depth), vec3(-halfW + wallT, 0.12, 0));
  addBox(trim, vec3(0.08, 0.09, depth), vec3(halfW - wallT, 0.12, 0));
  pushMerged(parts, "baseboards", trim, TRIM, "wood", { tone: TRIM, seed: p.seed + 2 });

  // Door on the back wall. Leaf is modeled around a hinge pivot.
  const doorW = 0.86 * s;
  const doorH = Math.min(2.2, wallH - 0.25);
  const doorX = -halfW * 0.46;
  const hinge = vec3(doorX - doorW / 2, 0.02, -halfD + wallT + 0.035);
  const doorAngle = -clamp01(p.doorOpen) * Math.PI * 0.5;
  const doorLocal = translateMesh(box(doorW, doorH, 0.08), vec3(doorW / 2, doorH / 2, 0));
  const doorLeaf = transform(doorLocal, { rotate: vec3(0, doorAngle, 0), translate: hinge });
  parts.push(surf("door_leaf", doorLeaf, DARK_WOOD, "wood", { tone: DARK_WOOD, seed: p.seed + 3 }));
  const doorFrame: Mesh[] = [];
  addBox(doorFrame, vec3(doorW + 0.18, 0.08, 0.12), vec3(doorX, doorH + 0.06, -halfD + wallT + 0.02));
  addBox(doorFrame, vec3(0.08, doorH + 0.16, 0.12), vec3(doorX - doorW / 2 - 0.06, doorH / 2, -halfD + wallT + 0.02));
  addBox(doorFrame, vec3(0.08, doorH + 0.16, 0.12), vec3(doorX + doorW / 2 + 0.06, doorH / 2, -halfD + wallT + 0.02));
  pushMerged(parts, "door_frame", doorFrame, TRIM, "wood", { tone: TRIM, seed: p.seed + 4 });
  joints.push({
    name: "door_hinge",
    part: "door_leaf",
    type: "hinge",
    origin: hinge,
    axis: vec3(0, 1, 0),
    value: doorAngle,
    min: -Math.PI * 0.5,
    max: 0,
  });

  // Window and sill on right wall.
  const windowMeshes: Mesh[] = [];
  addBox(windowMeshes, vec3(0.04, 1.0, 1.35), vec3(halfW - wallT - 0.02, 1.8, -0.75));
  addBox(windowMeshes, vec3(0.06, 0.06, 1.5), vec3(halfW - wallT - 0.04, 2.33, -0.75));
  addBox(windowMeshes, vec3(0.06, 0.06, 1.5), vec3(halfW - wallT - 0.04, 1.27, -0.75));
  addBox(windowMeshes, vec3(0.06, 1.15, 0.06), vec3(halfW - wallT - 0.04, 1.8, -1.48));
  addBox(windowMeshes, vec3(0.06, 1.15, 0.06), vec3(halfW - wallT - 0.04, 1.8, -0.02));
  addBox(windowMeshes, vec3(0.18, 0.08, 1.65), vec3(halfW - wallT - 0.12, 1.19, -0.75));
  pushMerged(parts, "window", windowMeshes, GLASS, "glass", { tint: GLASS, roughness: 0.08, thickness: 0.08 });

  // Bed along left wall.
  const bedW = 1.55 * s;
  const bedD = 2.25 * s;
  const bedX = -halfW + wallT + bedW / 2 + 0.32;
  const bedZ = halfD - bedD / 2 - 0.42;
  const bedFrame: Mesh[] = [];
  addBox(bedFrame, vec3(bedW + 0.18, 0.28, bedD + 0.12), vec3(bedX, 0.22, bedZ));
  addBox(bedFrame, vec3(bedW + 0.25, 0.9, 0.16), vec3(bedX, 0.72, bedZ - bedD / 2 - 0.04));
  pushMerged(parts, "bed_frame", bedFrame, WOOD, "wood", { tone: WOOD, seed: p.seed + 5 });
  const mattress = transform(box(bedW, 0.28, bedD), { translate: vec3(bedX, 0.48, bedZ + 0.06) });
  parts.push(surf("mattress", mattress, [0.82, 0.82, 0.78], "fabric", { color: [0.82, 0.82, 0.78], seed: p.seed + 6 }));
  const bedding: Mesh[] = [];
  addBox(bedding, vec3(bedW * 0.42, 0.16, 0.42), vec3(bedX - bedW * 0.24, 0.72, bedZ - bedD * 0.35));
  addBox(bedding, vec3(bedW * 0.42, 0.16, 0.42), vec3(bedX + bedW * 0.24, 0.72, bedZ - bedD * 0.35));
  addBox(bedding, vec3(bedW * 0.94, 0.12, bedD * 0.48), vec3(bedX, 0.72, bedZ + bedD * 0.18));
  pushMerged(parts, "soft_bedding", bedding, PILLOW, "fabric", { color: PILLOW, seed: p.seed + 7 });

  // Dining/work table and chairs.
  const table: Mesh[] = [];
  const tableX = 0.35;
  const tableZ = 0.45;
  const tableW = 1.45 * s;
  const tableD = 0.9 * s;
  const tableH = 0.76 * s;
  addBox(table, vec3(tableW, 0.12, tableD), vec3(tableX, tableH, tableZ));
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      addBox(table, vec3(0.09, tableH, 0.09), vec3(tableX + sx * tableW * 0.42, tableH / 2, tableZ + sz * tableD * 0.38));
    }
  }
  pushMerged(parts, "table", table, WOOD, "wood", { tone: WOOD, seed: p.seed + 8 });

  const chairSeats: Mesh[] = [];
  const chairFrames: Mesh[] = [];
  const chairCount = Math.max(0, Math.min(8, Math.round(p.chairs)));
  for (let i = 0; i < chairCount; i++) {
    const a = (i / Math.max(1, chairCount)) * Math.PI * 2;
    const radialX = Math.cos(a);
    const radialZ = Math.sin(a);
    const cx = tableX + radialX * (tableW * 0.62);
    const cz = tableZ + radialZ * (tableD * 0.78);
    const yaw = -a + Math.PI / 2;
    addChair(chairSeats, chairFrames, vec3(cx, 0, cz), yaw, s);
  }
  pushMerged(parts, "chair_seats", chairSeats, FABRIC, "leather", { color: FABRIC, seed: p.seed + 9 });
  pushMerged(parts, "chair_frames", chairFrames, DARK_WOOD, "wood", { tone: DARK_WOOD, seed: p.seed + 10 });

  // Cabinet with drawers against right wall; drawer parts slide toward room.
  const cabinet: Mesh[] = [];
  const drawers: Mesh[] = [];
  const handles: Mesh[] = [];
  const cabD = 0.6 * s;
  const cabW = 1.1 * s;
  const cabH = 1.0 * s;
  const cabX = halfW - wallT - cabD / 2 - 0.22;
  const cabZ = halfD - cabW / 2 - 0.55;
  addBox(cabinet, vec3(cabD, cabH, cabW), vec3(cabX, cabH / 2, cabZ));
  addBox(cabinet, vec3(cabD + 0.08, 0.1, cabW + 0.08), vec3(cabX, cabH + 0.05, cabZ));
  const drawerSlide = clamp01(p.drawerOpen) * 0.42 * s;
  const drawerCount = 3;
  const faceX = cabX - cabD / 2 - 0.025 - drawerSlide;
  for (let i = 0; i < drawerCount; i++) {
    const y = 0.23 * s + i * 0.27 * s;
    addBox(drawers, vec3(0.08, 0.2 * s, cabW * 0.82), vec3(faceX, y, cabZ));
    addCylinder(handles, 0.025 * s, cabW * 0.46, vec3(faceX - 0.055, y, cabZ), vec3(Math.PI / 2, 0, 0), 10);
  }
  pushMerged(parts, "cabinet_body", cabinet, DARK_WOOD, "wood", { tone: DARK_WOOD, seed: p.seed + 11 });
  pushMerged(parts, "drawers", drawers, WOOD, "wood", { tone: WOOD, seed: p.seed + 12 });
  pushMerged(parts, "drawer_handles", handles, METAL, "brushedMetal", { color: METAL, seed: p.seed + 13 });
  joints.push({
    name: "drawer_slide",
    part: "drawers",
    type: "slider",
    origin: vec3(cabX - cabD / 2, 0.23 * s, cabZ),
    axis: vec3(-1, 0, 0),
    value: drawerSlide,
    min: 0,
    max: 0.42 * s,
  });

  // Back-wall bookcase + seeded books/props.
  const shelfMeshes: Mesh[] = [];
  const propMeshes: Mesh[] = [];
  const shelfW = 1.45 * s;
  const shelfD = 0.28 * s;
  const shelfH = 1.9 * s;
  const shelfX = halfW * 0.28;
  const shelfZ = -halfD + wallT + shelfD / 2 + 0.08;
  addBox(shelfMeshes, vec3(0.08, shelfH, shelfD), vec3(shelfX - shelfW / 2, shelfH / 2, shelfZ));
  addBox(shelfMeshes, vec3(0.08, shelfH, shelfD), vec3(shelfX + shelfW / 2, shelfH / 2, shelfZ));
  const levels = Math.max(1, Math.min(7, Math.round(p.shelves)));
  for (let i = 0; i <= levels; i++) {
    const y = (shelfH / levels) * i;
    addBox(shelfMeshes, vec3(shelfW + 0.1, 0.06, shelfD), vec3(shelfX, y, shelfZ));
  }
  const clutter = Math.max(0, Math.min(40, Math.round(p.clutter)));
  for (let i = 0; i < clutter; i++) {
    const level = rng.int(0, Math.max(0, levels - 1));
    const bookW = rng.range(0.05, 0.12) * s;
    const bookH = rng.range(0.24, 0.46) * s;
    const x = shelfX - shelfW * 0.42 + rng.next() * shelfW * 0.84;
    const y = (shelfH / levels) * level + 0.06 + bookH / 2;
    const z = shelfZ - shelfD * 0.18;
    addBox(propMeshes, vec3(bookW, bookH, 0.08 * s), vec3(x, y, z), vec3(0, rng.range(-0.04, 0.04), rng.range(-0.05, 0.05)));
  }
  pushMerged(parts, "bookcase", shelfMeshes, WOOD, "wood", { tone: WOOD, seed: p.seed + 14 });
  pushMerged(parts, "books_props", propMeshes, [0.46, 0.18, 0.16], "plastic", { color: [0.46, 0.18, 0.16], roughness: 0.55 });

  // Ceiling lamp.
  const lampMeshes: Mesh[] = [];
  addCylinder(lampMeshes, 0.025, 0.5, vec3(0, wallH - 0.25, 0), vec3(0, 0, 0), 10);
  lampMeshes.push(transform(sphere(0.18 * s, 16, 10), { scale: vec3(1, 0.65, 1), translate: vec3(0, wallH - 0.55, 0) }));
  pushMerged(parts, "ceiling_lamp", lampMeshes, LAMP, "emissive", { color: LAMP, intensity: 2.2 });

  return { parts, joints };
}

/** Build only renderable parts, for examples/viewer parity with other models. */
export function buildInteriorRoomParts(params: Partial<InteriorRoomParams> = {}): NamedPart[] {
  return buildInteriorRoom(params).parts;
}

/**
 * Cheap geometry-side score for indoor scenes. Used by agent loops before
 * rendering: it checks shell, furniture, joints and plausible floor coverage.
 */
export function scoreInteriorRoom(parts: NamedPart[], joints: InteriorJoint[] = []): InteriorRoomScore {
  const byName = new Map(parts.map((p) => [p.name, p]));
  const has = (name: string) => byName.has(name);
  const shell = has("room_shell") && has("wood_floor") ? 1 : has("room_shell") ? 0.5 : 0;
  const furnitureNames = ["bed_frame", "table", "chair_seats", "cabinet_body", "bookcase"];
  const furniture = furnitureNames.filter(has).length / furnitureNames.length;
  const articulation = Math.min(1, joints.filter((j) => j.type === "hinge" || j.type === "slider").length / 2);

  const floor = byName.get("wood_floor");
  let layoutCoverage = 0.5;
  if (floor) {
    const fb = bounds(floor.mesh);
    const floorArea = Math.max(1e-6, (fb.max.x - fb.min.x) * (fb.max.z - fb.min.z));
    let occupied = 0;
    for (const name of furnitureNames) {
      const part = byName.get(name);
      if (!part) continue;
      const bb = bounds(part.mesh);
      occupied += Math.max(0, bb.max.x - bb.min.x) * Math.max(0, bb.max.z - bb.min.z);
    }
    const ratio = occupied / floorArea;
    layoutCoverage = clamp01(1 - Math.abs(ratio - 0.36) / 0.36);
  }

  const metrics = { shell, furniture, articulation, layoutCoverage };
  const score = clamp01(
    metrics.shell * 0.25 +
      metrics.furniture * 0.35 +
      metrics.articulation * 0.25 +
      metrics.layoutCoverage * 0.15,
  );

  const tips: string[] = [];
  if (metrics.shell < 1) tips.push("add floor and walls");
  if (metrics.furniture < 0.8) tips.push("add bed/table/chairs/cabinet/bookcase");
  if (metrics.articulation < 1) tips.push("include hinge and slider joints");
  if (metrics.layoutCoverage < 0.4) tips.push("adjust furniture scale or room size for believable coverage");
  const feedback = tips.length
    ? `Score ${score.toFixed(2)}. To improve: ${tips.join("; ")}.`
    : `Score ${score.toFixed(2)}. Looks like a furnished articulated room.`;

  return { score, metrics, feedback };
}

function addChair(seats: Mesh[], frames: Mesh[], center: Vec3, yaw: number, scale: number): void {
  const local: Mesh[] = [];
  const frameLocal: Mesh[] = [];
  addBox(local, vec3(0.46 * scale, 0.08 * scale, 0.42 * scale), vec3(0, 0.45 * scale, 0));
  addBox(frameLocal, vec3(0.48 * scale, 0.08 * scale, 0.08 * scale), vec3(0, 0.82 * scale, -0.21 * scale), vec3(-0.18, 0, 0));
  addBox(frameLocal, vec3(0.06 * scale, 0.72 * scale, 0.06 * scale), vec3(-0.2 * scale, 0.42 * scale, -0.16 * scale), vec3(-0.1, 0, 0));
  addBox(frameLocal, vec3(0.06 * scale, 0.72 * scale, 0.06 * scale), vec3(0.2 * scale, 0.42 * scale, -0.16 * scale), vec3(-0.1, 0, 0));
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      addBox(frameLocal, vec3(0.055 * scale, 0.45 * scale, 0.055 * scale), vec3(sx * 0.18 * scale, 0.22 * scale, sz * 0.16 * scale));
    }
  }
  seats.push(transform(merge(...local), { rotate: vec3(0, yaw, 0), translate: center }));
  frames.push(transform(merge(...frameLocal), { rotate: vec3(0, yaw, 0), translate: center }));
}
