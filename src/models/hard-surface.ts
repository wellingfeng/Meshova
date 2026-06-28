/**
 * Procedural hard-surface kit: chamfered chassis + panels + vents + bolts +
 * pipes + seeded greebles. The output is meant as a reusable detail grammar for
 * vehicles, robots, sci-fi props and industrial equipment.
 */
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import {
  bevelEdges,
  bounds,
  box,
  computeNormals,
  cylinder,
  extrudeRegion,
  insetFaces,
  merge,
  plane,
  sphere,
  transform,
  triangleCount,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";

type RGB = [number, number, number];

export interface HardSurfaceKitParams {
  /** Main chassis width along X. */
  width: number;
  /** Main chassis height along Y. */
  height: number;
  /** Main chassis depth along Z. */
  depth: number;
  /** Chassis chamfer width. */
  bevel: number;
  /** Top armor panel columns. */
  panelCols: number;
  /** Top armor panel rows. */
  panelRows: number;
  /** Front vent columns. */
  ventCols: number;
  /** Front vent rows. */
  ventRows: number;
  /** Fastener count around the front perimeter. */
  bolts: number;
  /** External conduit/pipe count. */
  pipes: number;
  /** Seeded micro-box detail count. */
  greebles: number;
  /** Variant seed. */
  seed: number;
}

export interface HardSurfaceKitScore {
  score: number;
  metrics: {
    chassis: number;
    paneling: number;
    mechanicalDetail: number;
    materialSeparation: number;
  };
  feedback: string;
}

export const HARD_SURFACE_KIT_DEFAULTS: HardSurfaceKitParams = {
  width: 3.0,
  height: 1.25,
  depth: 2.0,
  bevel: 0.08,
  panelCols: 3,
  panelRows: 2,
  ventCols: 3,
  ventRows: 5,
  bolts: 14,
  pipes: 4,
  greebles: 24,
  seed: 31,
};

const STEEL: RGB = [0.5, 0.53, 0.56];
const DARK_STEEL: RGB = [0.16, 0.17, 0.19];
const DARK: RGB = [0.04, 0.045, 0.055];
const ACCENT: RGB = [0.9, 0.52, 0.18];
const RUBBER: RGB = [0.02, 0.022, 0.025];
const WARNING: RGB = [1.0, 0.74, 0.16];

function surf(
  name: string,
  mesh: Mesh,
  color: RGB,
  type: string,
  params: Record<string, unknown> = {},
): NamedPart {
  return { name, mesh, color, surface: { type, params: { color, ...params } } };
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

function addBox(
  out: Mesh[],
  size: Vec3,
  pos: Vec3,
  rotate: Vec3 = vec3(0, 0, 0),
): void {
  out.push(transform(box(size.x, size.y, size.z), { rotate, translate: pos }));
}

function cylinderX(radius: number, length: number, pos: Vec3, segments = 16): Mesh {
  return transform(cylinder(radius, length, segments, true), {
    rotate: vec3(0, 0, Math.PI / 2),
    translate: pos,
  });
}

function cylinderY(radius: number, length: number, pos: Vec3, segments = 16): Mesh {
  return transform(cylinder(radius, length, segments, true), { translate: pos });
}

function cylinderZ(radius: number, length: number, pos: Vec3, segments = 16): Mesh {
  return transform(cylinder(radius, length, segments, true), {
    rotate: vec3(Math.PI / 2, 0, 0),
    translate: pos,
  });
}

function recessedPanel(w: number, h: number, inset: number, recess: number): Mesh {
  let m = plane(w, h, 1, 1);
  m = insetFaces(m, undefined, { amount: inset });
  m = extrudeRegion(m, { normalDir: vec3(0, 1, 0), angleDeg: 30 }, { distance: -recess });
  return computeNormals(m, 35);
}

/**
 * Build a parameterized hard-surface industrial module. It stays high-level:
 * separate named parts expose semantic groups for agents, exporters and viewer
 * material matching.
 */
export function buildHardSurfaceKitParts(
  params: Partial<HardSurfaceKitParams> = {},
): NamedPart[] {
  const p: HardSurfaceKitParams = { ...HARD_SURFACE_KIT_DEFAULTS, ...params };
  const width = Math.max(1.2, p.width);
  const height = Math.max(0.6, p.height);
  const depth = Math.max(0.8, p.depth);
  const bevel = Math.max(0.01, Math.min(p.bevel, Math.min(width, height, depth) * 0.18));
  const panelCols = Math.max(1, Math.min(8, Math.round(p.panelCols)));
  const panelRows = Math.max(1, Math.min(6, Math.round(p.panelRows)));
  const ventCols = Math.max(1, Math.min(8, Math.round(p.ventCols)));
  const ventRows = Math.max(1, Math.min(10, Math.round(p.ventRows)));
  const boltCount = Math.max(0, Math.min(40, Math.round(p.bolts)));
  const pipeCount = Math.max(0, Math.min(10, Math.round(p.pipes)));
  const greebleCount = Math.max(0, Math.min(80, Math.round(p.greebles)));
  const rng = makeRng(Math.round(p.seed) >>> 0);

  const hw = width / 2;
  const hd = depth / 2;
  const parts: NamedPart[] = [];

  const chassis = transform(
    computeNormals(bevelEdges(box(width, height, depth), { width: bevel }), 35),
    { translate: vec3(0, height / 2, 0) },
  );
  parts.push(surf("chassis", chassis, STEEL, "carPaint", { roughness: 0.36, seed: p.seed }));

  const frontPanel = transform(recessedPanel(width * 0.62, height * 0.58, 0.12, 0.07), {
    rotate: vec3(Math.PI / 2, 0, 0),
    translate: vec3(-width * 0.13, height * 0.54, hd + 0.035),
  });
  parts.push(surf("front_recessed_panel", frontPanel, DARK_STEEL, "metal", { roughness: 0.42, seed: p.seed + 1 }));

  const topPanel = transform(recessedPanel(width * 0.74, depth * 0.42, 0.1, 0.05), {
    translate: vec3(0.1, height + 0.035, -depth * 0.14),
  });
  parts.push(surf("top_service_panel", topPanel, DARK_STEEL, "metal", { roughness: 0.4, seed: p.seed + 2 }));

  const armor: Mesh[] = [];
  const gapX = width * 0.05;
  const gapZ = depth * 0.05;
  const cellW = (width * 0.78 - gapX * (panelCols - 1)) / panelCols;
  const cellD = (depth * 0.38 - gapZ * (panelRows - 1)) / panelRows;
  const x0 = -((panelCols - 1) * (cellW + gapX)) / 2;
  const z0 = depth * 0.22 - ((panelRows - 1) * (cellD + gapZ)) / 2;
  for (let r = 0; r < panelRows; r++) {
    for (let c = 0; c < panelCols; c++) {
      const x = x0 + c * (cellW + gapX);
      const z = z0 + r * (cellD + gapZ);
      addBox(armor, vec3(cellW, 0.065, cellD), vec3(x, height + 0.065, z));
    }
  }
  pushMerged(parts, "armor_panels", armor, DARK_STEEL, "metal", { roughness: 0.5, seed: p.seed + 3 });

  const vents: Mesh[] = [];
  const ventW = width * 0.34;
  const ventH = height * 0.34;
  const slotW = (ventW / ventCols) * 0.68;
  const slotH = (ventH / ventRows) * 0.34;
  for (let c = 0; c < ventCols; c++) {
    for (let r = 0; r < ventRows; r++) {
      const x = width * 0.25 - ventW / 2 + (c + 0.5) * (ventW / ventCols);
      const y = height * 0.34 + (r + 0.5) * (ventH / ventRows);
      addBox(vents, vec3(slotW, slotH, 0.07), vec3(x, y, hd + 0.08));
    }
  }
  pushMerged(parts, "vents", vents, RUBBER, "plastic", { roughness: 0.78, seed: p.seed + 4 });

  const bolts: Mesh[] = [];
  for (let i = 0; i < boltCount; i++) {
    const t = boltCount <= 1 ? 0 : i / boltCount;
    const pos = frontPerimeterPoint(t, width * 0.82, height * 0.78, height * 0.5, hd + 0.095);
    bolts.push(transform(cylinder(0.055, 0.045, 12, true), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: pos,
    }));
  }
  pushMerged(parts, "bolts", bolts, ACCENT, "metal", { roughness: 0.28, seed: p.seed + 5 });

  const pipes: Mesh[] = [];
  for (let i = 0; i < pipeCount; i++) {
    const r = 0.035 + (i % 3) * 0.008;
    if (i % 2 === 0) {
      const z = -depth * 0.28 + i * depth * 0.055;
      const y = height + 0.17 + i * 0.018;
      pipes.push(cylinderX(r, width * 0.68, vec3(0, y, z), 14));
      pipes.push(cylinderY(r * 0.82, height * 0.2, vec3(-width * 0.34, height + 0.055, z), 12));
      pipes.push(cylinderY(r * 0.82, height * 0.2, vec3(width * 0.34, height + 0.055, z), 12));
    } else {
      const z = -depth * 0.35 + i * depth * 0.09;
      const x = hw + 0.075 + (i % 3) * 0.035;
      pipes.push(cylinderY(r, height * 0.72, vec3(x, height * 0.48, z), 14));
      pipes.push(cylinderZ(r * 0.85, depth * 0.18, vec3(x, height * 0.82, z + depth * 0.09), 12));
    }
  }
  pushMerged(parts, "pipes", pipes, DARK_STEEL, "metal", { roughness: 0.32, seed: p.seed + 6 });

  const greebles: Mesh[] = [];
  for (let i = 0; i < greebleCount; i++) {
    const face = rng.next() < 0.62 ? "top" : "front";
    const sx = rng.range(0.08, 0.25);
    const sy = rng.range(0.045, 0.18);
    const sz = rng.range(0.08, 0.24);
    if (face === "top") {
      const x = rng.range(-width * 0.42, width * 0.42);
      const z = rng.range(-depth * 0.38, depth * 0.33);
      addBox(greebles, vec3(sx, sy, sz), vec3(x, height + 0.09 + sy * 0.5, z), vec3(0, rng.range(-0.15, 0.15), 0));
    } else {
      const x = rng.range(-width * 0.42, width * 0.42);
      const y = rng.range(height * 0.22, height * 0.82);
      addBox(greebles, vec3(sx, sy, sz * 0.35), vec3(x, y, hd + 0.095), vec3(0, 0, rng.range(-0.08, 0.08)));
    }
  }
  pushMerged(parts, "greebles", greebles, STEEL, "metal", { roughness: 0.48, seed: p.seed + 7 });

  const warning: Mesh[] = [];
  addBox(warning, vec3(width * 0.18, 0.03, 0.045), vec3(-width * 0.34, height + 0.12, hd * 0.18), vec3(0, 0.35, 0));
  addBox(warning, vec3(width * 0.18, 0.03, 0.045), vec3(-width * 0.2, height + 0.12, hd * 0.18), vec3(0, 0.35, 0));
  pushMerged(parts, "warning_stripes", warning, WARNING, "plastic", { roughness: 0.44, seed: p.seed + 8 });

  const sideKnob = transform(
    merge(
      cylinderX(0.18, 0.16, vec3(0, 0, 0), 18),
      transform(sphere(0.12, 14, 10), { scale: vec3(1, 0.65, 1), translate: vec3(0.09, 0, 0) }),
    ),
    { translate: vec3(-hw - 0.08, height * 0.58, -depth * 0.12) },
  );
  parts.push(surf("side_knob", sideKnob, ACCENT, "metal", { roughness: 0.24, seed: p.seed + 9 }));

  return parts;
}

export function scoreHardSurfaceKit(parts: NamedPart[]): HardSurfaceKitScore {
  const byName = new Map(parts.map((p) => [p.name, p]));
  const has = (name: string) => byName.has(name);
  const chassis = has("chassis") ? 1 : 0;
  const paneling =
    (has("front_recessed_panel") ? 0.35 : 0) +
    (has("top_service_panel") ? 0.25 : 0) +
    (has("armor_panels") ? 0.4 : 0);
  const mechanicalDetail =
    (has("vents") ? 0.25 : 0) +
    (has("bolts") ? 0.2 : 0) +
    (has("pipes") ? 0.25 : 0) +
    (has("greebles") ? 0.2 : 0) +
    (has("side_knob") ? 0.1 : 0);

  const surfaceTypes = new Set(parts.map((p) => p.surface?.type).filter((x): x is string => !!x));
  const materialSeparation = clamp01(surfaceTypes.size / 4);

  let detailDensity = 0;
  const detailParts = ["vents", "bolts", "pipes", "greebles", "warning_stripes"];
  for (const name of detailParts) {
    const part = byName.get(name);
    if (part) detailDensity += triangleCount(part.mesh);
  }
  const density = clamp01(detailDensity / 900);

  const metrics = {
    chassis,
    paneling: clamp01(paneling),
    mechanicalDetail: clamp01(mechanicalDetail * 0.75 + density * 0.25),
    materialSeparation,
  };
  const score = clamp01(
    metrics.chassis * 0.25 +
      metrics.paneling * 0.3 +
      metrics.mechanicalDetail * 0.3 +
      metrics.materialSeparation * 0.15,
  );

  const tips: string[] = [];
  if (metrics.chassis < 1) tips.push("add a chamfered chassis");
  if (metrics.paneling < 0.8) tips.push("add recessed panels and armor plates");
  if (metrics.mechanicalDetail < 0.65) tips.push("add vents, bolts, pipes and greebles");
  if (metrics.materialSeparation < 0.75) tips.push("separate metal, dark plastic and accent materials");
  const feedback = tips.length
    ? `Score ${score.toFixed(2)}. To improve: ${tips.join("; ")}.`
    : `Score ${score.toFixed(2)}. Reads as a detailed hard-surface kit.`;

  return { score, metrics, feedback };
}

function frontPerimeterPoint(t: number, w: number, h: number, cy: number, z: number): Vec3 {
  const hw = w / 2;
  const hh = h / 2;
  const p = ((t % 1) + 1) % 1;
  if (p < 0.25) return vec3(-hw + (p / 0.25) * w, cy + hh, z);
  if (p < 0.5) return vec3(hw, cy + hh - ((p - 0.25) / 0.25) * h, z);
  if (p < 0.75) return vec3(hw - ((p - 0.5) / 0.25) * w, cy - hh, z);
  return vec3(-hw, cy - hh + ((p - 0.75) / 0.25) * h, z);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
