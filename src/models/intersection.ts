/**
 * Road intersection kit — a four-arm crossroads, Meshova's take on CitySample's
 * meshed_inter + crosswalk + sidewalk road tiles (Kit_City_Road). Where
 * `geometry/road.ts` gives curved ribbon roads for open stretches, a junction is
 * an axis-aligned assembly: a central asphalt pad, up to four road arms, painted
 * lane/stop lines, zebra crosswalks, raised corner sidewalks with curbs, and an
 * optional centre island. Deterministic and axis-aligned; same params -> same
 * mesh. Every part carries a matched surface material.
 */
import { vec3 } from "../math/vec3.js";
import {
  box,
  plane,
  cylinder,
  transform,
  merge,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";

type RGB = [number, number, number];
const ASPHALT: RGB = [0.09, 0.09, 0.1];
const PAINT: RGB = [0.9, 0.9, 0.88];
const PAINT_Y: RGB = [0.95, 0.82, 0.15];
const CURB: RGB = [0.66, 0.66, 0.68];
const SIDEWALK: RGB = [0.55, 0.55, 0.57];
const GRASS: RGB = [0.24, 0.34, 0.16];

const asphaltS = () => ({ type: "ceramic" as const, params: { color: ASPHALT, roughness: 0.92 } });
const paintS = (c: RGB) => ({ type: "ceramic" as const, params: { color: c, roughness: 0.55 } });
const concS = (c: RGB, roughness = 0.8) => ({ type: "concrete" as const, params: { color: c, roughness } });

/** Which arms of the crossroads are present (N=+Z, S=-Z, E=+X, W=-X). */
export interface IntersectionArms {
  north: boolean;
  south: boolean;
  east: boolean;
  west: boolean;
}

export interface IntersectionParams {
  /** Half-width of the road (per direction) in metres. */
  roadHalfWidth: number;
  /** Length of each road arm beyond the junction pad. */
  armLength: number;
  /** Number of lanes per direction (adds lane divider lines). */
  lanes: number;
  /** Draw zebra crosswalks across each arm. */
  crosswalks: boolean;
  /** Draw raised corner sidewalks + curbs. */
  sidewalks: boolean;
  /** Which arms are present. */
  arms: IntersectionArms;
  /** Sidewalk width (metres). */
  sidewalkWidth: number;
}

export const INTERSECTION_DEFAULTS: IntersectionParams = {
  roadHalfWidth: 5,
  armLength: 10,
  lanes: 2,
  crosswalks: true,
  sidewalks: true,
  arms: { north: true, south: true, east: true, west: true },
  sidewalkWidth: 2.4,
};

/**
 * A flat painted stripe laid just above the asphalt. The asphalt pad is 0.1
 * tall centred at y=0.02 (top face at 0.07), so paint sits at y=0.09 to stay
 * visible from above and avoid z-fighting.
 */
function stripe(w: number, d: number, x: number, z: number, rotY = 0): Mesh {
  return transform(box(w, 0.02, d), { rotate: vec3(0, rotY, 0), translate: vec3(x, 0.09, z) });
}

/** Zebra crosswalk: a row of `bars` white stripes spanning the road width. */
function zebra(spanW: number, x: number, z: number, alongX: boolean): Mesh {
  const bars: Mesh[] = [];
  const barW = 0.5, gap = 0.5;
  const step = barW + gap;
  const n = Math.max(3, Math.floor(spanW / step));
  const start = -(n - 1) * step / 2;
  for (let i = 0; i < n; i++) {
    const off = start + i * step;
    // Bars run across the direction of travel.
    if (alongX) bars.push(stripe(1.6, barW, x, z + off));
    else bars.push(stripe(barW, 1.6, x + off, z));
  }
  return merge(...bars);
}

/** Build a four-arm road intersection with markings, crosswalks and sidewalks. */
export function buildIntersectionParts(params: Partial<IntersectionParams> = {}): NamedPart[] {
  const p: IntersectionParams = { ...INTERSECTION_DEFAULTS, ...params, arms: { ...INTERSECTION_DEFAULTS.arms, ...(params.arms ?? {}) } };
  const parts: NamedPart[] = [];
  const hw = p.roadHalfWidth;
  const al = p.armLength;
  const arms = p.arms;

  // Ground plane for context (grass/dirt) under everything.
  const extent = (hw + al) * 2 + p.sidewalkWidth * 2;
  parts.push({ name: "ground", label: "地面", mesh: transform(plane(extent, extent, 1, 1), { translate: vec3(0, -0.01, 0) }), color: GRASS, surface: concS(GRASS, 1) });

  // Central junction pad + each present arm as an asphalt rectangle.
  const pads: Mesh[] = [];
  pads.push(transform(box(hw * 2, 0.1, hw * 2), { translate: vec3(0, 0.02, 0) }));
  if (arms.north) pads.push(transform(box(hw * 2, 0.1, al), { translate: vec3(0, 0.02, hw + al / 2) }));
  if (arms.south) pads.push(transform(box(hw * 2, 0.1, al), { translate: vec3(0, 0.02, -(hw + al / 2)) }));
  if (arms.east) pads.push(transform(box(al, 0.1, hw * 2), { translate: vec3(hw + al / 2, 0.02, 0) }));
  if (arms.west) pads.push(transform(box(al, 0.1, hw * 2), { translate: vec3(-(hw + al / 2), 0.02, 0) }));
  parts.push({ name: "asphalt", label: "沥青路面", mesh: merge(...pads), color: ASPHALT, surface: asphaltS() });

  const armList: Array<["north" | "south" | "east" | "west", boolean, boolean, number]> = [
    ["north", arms.north, false, 1],
    ["south", arms.south, false, -1],
    ["east", arms.east, true, 1],
    ["west", arms.west, true, -1],
  ];

  // Lane divider + edge lines running down each arm.
  const lines: Mesh[] = [];
  const yellow: Mesh[] = [];
  const nLanes = Math.max(1, Math.round(p.lanes));
  for (const [, present, alongX, sign] of armList) {
    if (!present) continue;
    const armStart = hw;
    const armEnd = hw + al;
    const mid = (armStart + armEnd) / 2;
    const len = al - 0.5;
    // Centre double-yellow (divides opposing traffic).
    if (alongX) yellow.push(stripe(len, 0.16, sign * mid, 0));
    else yellow.push(stripe(0.16, len, 0, sign * mid));
    // White lane dividers between lanes on each half.
    for (let side = -1; side <= 1; side += 2) {
      for (let l = 1; l < nLanes; l++) {
        const off = side * (l / nLanes) * hw;
        if (alongX) lines.push(stripe(len, 0.1, sign * mid, off));
        else lines.push(stripe(0.1, len, off, sign * mid));
      }
    }
    // Stop line at the junction mouth.
    if (alongX) lines.push(stripe(0.3, hw * 2 - 0.4, sign * (hw + 0.4), 0));
    else lines.push(stripe(hw * 2 - 0.4, 0.3, 0, sign * (hw + 0.4)));
  }
  if (yellow.length) parts.push({ name: "center_lines", label: "中心黄线", mesh: merge(...yellow), color: PAINT_Y, surface: paintS(PAINT_Y) });
  if (lines.length) parts.push({ name: "lane_lines", label: "车道线", mesh: merge(...lines), color: PAINT, surface: paintS(PAINT) });

  // Zebra crosswalks just outside the junction pad on each present arm.
  if (p.crosswalks) {
    const walks: Mesh[] = [];
    for (const [, present, alongX, sign] of armList) {
      if (!present) continue;
      const at = hw + 1.6;
      if (alongX) walks.push(zebra(hw * 2 - 0.6, sign * at, 0, false));
      else walks.push(zebra(hw * 2 - 0.6, 0, sign * at, true));
    }
    parts.push({ name: "crosswalks", label: "斑马线", mesh: merge(...walks), color: PAINT, surface: paintS(PAINT) });
  }

  // Corner sidewalks: four L-shaped raised concrete pads with curbs at the corners.
  if (p.sidewalks) {
    const sw = p.sidewalkWidth;
    const walk: Mesh[] = [];
    const curbs: Mesh[] = [];
    const outer = hw + al;
    for (const cx of [-1, 1]) {
      for (const cz of [-1, 1]) {
        // Sidewalk pad fills the corner block between two arms.
        const px = cx * (hw + (outer - hw) / 2 + sw / 2);
        const pz = cz * (hw + (outer - hw) / 2 + sw / 2);
        const size = (outer - hw) + sw;
        walk.push(transform(box(size, 0.16, size), { translate: vec3(px, 0.08, pz) }));
        // Curb strip facing the road on the two inner edges.
        curbs.push(transform(box(size, 0.22, 0.2), { translate: vec3(px, 0.11, cz * (hw - 0.1)) }));
        curbs.push(transform(box(0.2, 0.22, size), { translate: vec3(cx * (hw - 0.1), 0.11, pz) }));
      }
    }
    parts.push({ name: "sidewalks", label: "人行道", mesh: merge(...walk), color: SIDEWALK, surface: concS(SIDEWALK, 0.7) });
    parts.push({ name: "curbs", label: "路缘石", mesh: merge(...curbs), color: CURB, surface: concS(CURB, 0.7) });
  }

  return parts;
}
