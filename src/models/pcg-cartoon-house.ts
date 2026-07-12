import { vec2 } from "../math/vec2.js";
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import {
  box,
  cylinder,
  makeMesh,
  merge,
  transform,
  type Mesh,
  type NamedPart,
  type PartSurfaceRef,
} from "../geometry/index.js";
import { buildRoofGeneratorMesh } from "./roof-generator.js";

type RGB = [number, number, number];

export interface PcgCartoonHouseParams {
  width: number;
  depth: number;
  wallHeight: number;
  roofPitch: number;
  wingScale: number;
  roofRows: number;
  timberDensity: number;
  chimneyCount: number;
  windowCount: number;
  seed: number;
}

export const PCG_CARTOON_HOUSE_DEFAULTS: PcgCartoonHouseParams = {
  width: 5.8,
  depth: 3.8,
  wallHeight: 2.5,
  roofPitch: 0.78,
  wingScale: 0.48,
  roofRows: 9,
  timberDensity: 0.82,
  chimneyCount: 2,
  windowCount: 7,
  seed: 23,
};

interface GroupDef {
  label: string;
  color: RGB;
  surface: PartSurfaceRef;
}

interface Group extends GroupDef {
  meshes: Mesh[];
}

const SOURCE_VIDEO = "https://www.bilibili.com/video/BV1b3j4zmEkq/";
const WALL: RGB = [0.84, 0.55, 0.36];
const ROOF: RGB = [0.3, 0.8, 0.58];
const ROOF_TRIM: RGB = [0.22, 0.65, 0.46];
const TIMBER: RGB = [0.38, 0.2, 0.12];
const WINDOW_FRAME: RGB = [0.27, 0.72, 0.54];
const GLASS: RGB = [0.48, 0.82, 0.79];
const DOOR: RGB = [0.24, 0.66, 0.48];
const CHIMNEY: RGB = [0.7, 0.72, 0.69];
const FOUNDATION: RGB = [0.5, 0.49, 0.45];

const GROUPS = {
  foundation: def("石质基座", FOUNDATION, "stone", { roughness: 0.9 }),
  walls: def("奶油色木墙", WALL, "stylizedPlaster", { bands: 4 }),
  roof: def("薄荷绿瓦屋顶", ROOF, "stylizedRoof", { rows: 9 }),
  roof_trim: def("屋脊与檐口", ROOF_TRIM, "ceramic", { roughness: 0.72 }),
  timber_frame: def("深棕木构梁架", TIMBER, "wood", { ringScale: 11 }),
  window_frames: def("薄荷绿窗框", WINDOW_FRAME, "brushPainted", { bands: 3 }),
  window_glass: def("青色窗玻璃", GLASS, "glass", { roughness: 0.18 }),
  door: def("薄荷绿木门", DOOR, "brushPainted", { bands: 3 }),
  chimney: def("浅灰烟囱", CHIMNEY, "stylizedPlaster", { bands: 3 }),
  metal: def("门窗五金", [0.2, 0.18, 0.14], "stylizedMetal", { bands: 3 }),
} satisfies Record<string, GroupDef>;

export function buildPcgCartoonHouseParts(params: Partial<PcgCartoonHouseParams> = {}): NamedPart[] {
  const p = resolveParams(params);
  const rng = makeRng(p.seed);
  const groups = new Map<string, Group>();
  const baseHeight = 0.22;
  const eaveY = baseHeight + p.wallHeight;
  const overhang = Math.min(p.width, p.depth) * 0.075;
  const mainCenterZ = -p.depth * 0.08;
  const wingSide = rng.next() < 0.5 ? -1 : 1;
  const wingWidth = p.width * p.wingScale;
  const wingDepth = p.depth * 0.82;
  const wingCenterX = wingSide * (p.width * 0.5 - wingWidth * 0.55);
  const wingCenterZ = p.depth * 0.46;
  const mainRise = p.depth * 0.5 * p.roofPitch;
  const wingRise = wingWidth * 0.5 * p.roofPitch * 1.04;

  add(groups, "foundation", placedBox(p.width + 0.28, baseHeight, p.depth + 0.28, 0, baseHeight * 0.5, mainCenterZ));
  add(groups, "foundation", placedBox(wingWidth + 0.24, baseHeight + 0.02, wingDepth + 0.24, wingCenterX, (baseHeight + 0.02) * 0.5, wingCenterZ));
  add(groups, "walls", placedBox(p.width, p.wallHeight, p.depth, 0, baseHeight + p.wallHeight * 0.5, mainCenterZ));
  add(groups, "walls", placedBox(wingWidth, p.wallHeight * 1.02, wingDepth, wingCenterX, baseHeight + p.wallHeight * 0.51, wingCenterZ));

  const mainRoof = transform(buildRoofGeneratorMesh({
    style: "gable",
    width: p.width,
    depth: p.depth,
    wallHeight: eaveY,
    roofHeight: mainRise,
    overhang,
  }), { translate: vec3(0, 0, mainCenterZ) });
  const wingRoof = transform(buildRoofGeneratorMesh({
    style: "gable",
    width: wingDepth,
    depth: wingWidth,
    wallHeight: eaveY + 0.035,
    roofHeight: wingRise,
    overhang,
  }), {
    rotate: vec3(0, Math.PI / 2, 0),
    translate: vec3(wingCenterX, 0, wingCenterZ),
  });
  add(groups, "roof", mainRoof);
  add(groups, "roof", wingRoof);

  const wingFrontZ = wingCenterZ + wingDepth * 0.5 + 0.004;
  const wingGableFrontZ = wingFrontZ + overhang + 0.008;
  add(groups, "walls", frontGablePanel(wingCenterX, eaveY, wingGableFrontZ, wingWidth + overhang * 1.4, wingRise));
  add(groups, "walls", sideGablePanel(p.width * 0.5 + overhang + 0.008, eaveY, mainCenterZ, p.depth + overhang * 1.4, mainRise, 1));
  add(groups, "walls", sideGablePanel(-p.width * 0.5 - overhang - 0.008, eaveY, mainCenterZ, p.depth + overhang * 1.4, mainRise, -1));

  addRoofTrim(groups, p, overhang, mainCenterZ, mainRise, wingCenterX, wingCenterZ, wingWidth, wingDepth, wingRise);
  addTimberFrame(groups, p, baseHeight, eaveY, mainCenterZ, wingCenterX, wingFrontZ, wingGableFrontZ, wingWidth, wingRise);
  addOpenings(groups, p, rng, baseHeight, mainCenterZ, wingSide, wingCenterX, wingFrontZ, wingGableFrontZ, wingWidth, wingRise);
  addChimneys(groups, p, rng, eaveY, mainCenterZ, mainRise);

  return [...groups.entries()].map(([name, group]) => {
    const surface = name === "roof"
      ? { type: "stylizedRoof", params: { color: ROOF, rows: p.roofRows, seed: p.seed + 17 } }
      : group.surface;
    return {
      name,
      label: group.label,
      mesh: group.meshes.length === 1 ? group.meshes[0]! : merge(...group.meshes),
      color: group.color,
      surface,
      metadata: {
        sourceStudy: SOURCE_VIDEO,
        recipe: "L 形体块 + 十字山墙 + 木构立面模块",
        seed: p.seed,
      },
    };
  });
}

function addRoofTrim(
  groups: Map<string, Group>,
  p: PcgCartoonHouseParams,
  overhang: number,
  mainCenterZ: number,
  mainRise: number,
  wingCenterX: number,
  wingCenterZ: number,
  wingWidth: number,
  wingDepth: number,
  wingRise: number,
): void {
  const eaveY = 0.22 + p.wallHeight;
  const radius = Math.max(0.045, p.width * 0.012);
  add(groups, "roof_trim", transform(cylinder(radius, p.width + overhang * 2.2, 8), {
    rotate: vec3(0, 0, Math.PI / 2),
    translate: vec3(0, eaveY + mainRise + radius * 0.35, mainCenterZ),
  }));
  add(groups, "roof_trim", transform(cylinder(radius, wingDepth + overhang * 2.2, 8), {
    rotate: vec3(Math.PI / 2, 0, 0),
    translate: vec3(wingCenterX, eaveY + wingRise + radius * 0.35, wingCenterZ),
  }));

  const eaveThickness = radius * 1.25;
  for (const side of [-1, 1]) {
    add(groups, "roof_trim", placedBox(
      p.width + overhang * 2.1,
      eaveThickness,
      eaveThickness,
      0,
      eaveY + 0.015,
      mainCenterZ + side * (p.depth * 0.5 + overhang),
    ));
    add(groups, "roof_trim", placedBox(
      eaveThickness,
      eaveThickness,
      wingDepth + overhang * 2.1,
      wingCenterX + side * (wingWidth * 0.5 + overhang),
      eaveY + 0.045,
      wingCenterZ,
    ));
  }
}

function addTimberFrame(
  groups: Map<string, Group>,
  p: PcgCartoonHouseParams,
  baseY: number,
  eaveY: number,
  mainCenterZ: number,
  wingCenterX: number,
  wingFrontZ: number,
  wingGableFrontZ: number,
  wingWidth: number,
  wingRise: number,
): void {
  const beam = Math.max(0.08, p.width * 0.022);
  const frontZ = mainCenterZ + p.depth * 0.5 + 0.035;
  const wallMidY = baseY + p.wallHeight * 0.53;
  for (const x of [-p.width * 0.5, 0, p.width * 0.5]) {
    add(groups, "timber_frame", placedBox(beam, p.wallHeight + 0.06, beam, x, baseY + p.wallHeight * 0.5, frontZ));
  }
  add(groups, "timber_frame", placedBox(p.width + beam, beam, beam, 0, wallMidY, frontZ));
  add(groups, "timber_frame", placedBox(p.width + beam, beam, beam, 0, eaveY - beam * 0.5, frontZ));

  for (const x of [wingCenterX - wingWidth * 0.5, wingCenterX, wingCenterX + wingWidth * 0.5]) {
    add(groups, "timber_frame", placedBox(beam, p.wallHeight + 0.08, beam, x, baseY + p.wallHeight * 0.5, wingFrontZ + 0.018));
  }
  add(groups, "timber_frame", placedBox(wingWidth + beam, beam, beam, wingCenterX, wallMidY, wingFrontZ + 0.018));
  add(groups, "timber_frame", placedBox(wingWidth + beam, beam, beam, wingCenterX, eaveY - beam * 0.5, wingFrontZ + 0.018));

  const apex = vec3(wingCenterX, eaveY + wingRise, wingGableFrontZ + 0.006);
  const left = vec3(wingCenterX - wingWidth * 0.5, eaveY, wingGableFrontZ + 0.006);
  const right = vec3(wingCenterX + wingWidth * 0.5, eaveY, wingGableFrontZ + 0.006);
  add(groups, "timber_frame", frontBeam(left, apex, beam));
  add(groups, "timber_frame", frontBeam(apex, right, beam));
  const roundRadius = Math.min(0.22, wingWidth * 0.1);
  const roundY = eaveY + wingRise * 0.46;
  const gap = roundRadius * 1.42;
  const lowerHeight = Math.max(0, roundY - gap - eaveY);
  const upperHeight = Math.max(0, eaveY + wingRise - roundY - gap);
  if (lowerHeight > 0) {
    add(groups, "timber_frame", placedBox(beam, lowerHeight, beam, wingCenterX, eaveY + lowerHeight * 0.5, wingGableFrontZ + 0.006));
  }
  if (upperHeight > 0) {
    add(groups, "timber_frame", placedBox(beam, upperHeight, beam, wingCenterX, roundY + gap + upperHeight * 0.5, wingGableFrontZ + 0.006));
  }

  if (p.timberDensity > 0.35) {
    const braceY0 = baseY + p.wallHeight * 0.16;
    const braceY1 = baseY + p.wallHeight * 0.5;
    const inset = wingWidth * 0.22;
    add(groups, "timber_frame", frontBeam(
      vec3(wingCenterX - wingWidth * 0.46, braceY0, wingFrontZ + 0.024),
      vec3(wingCenterX - inset, braceY1, wingFrontZ + 0.024),
      beam * 0.82,
    ));
    add(groups, "timber_frame", frontBeam(
      vec3(wingCenterX + wingWidth * 0.46, braceY0, wingFrontZ + 0.024),
      vec3(wingCenterX + inset, braceY1, wingFrontZ + 0.024),
      beam * 0.82,
    ));
  }
}

function addOpenings(
  groups: Map<string, Group>,
  p: PcgCartoonHouseParams,
  rng: ReturnType<typeof makeRng>,
  baseY: number,
  mainCenterZ: number,
  wingSide: number,
  wingCenterX: number,
  wingFrontZ: number,
  wingGableFrontZ: number,
  wingWidth: number,
  wingRise: number,
): void {
  const doorWidth = wingWidth * 0.3;
  const doorHeight = p.wallHeight * 0.62;
  const doorX = wingCenterX - wingSide * wingWidth * 0.2;
  add(groups, "door", placedBox(doorWidth, doorHeight, 0.09, doorX, baseY + doorHeight * 0.5, wingFrontZ + 0.055));
  addDoorFrame(groups, doorX, baseY, wingFrontZ + 0.105, doorWidth, doorHeight, p.width * 0.018);
  add(groups, "metal", transform(cylinder(0.035, 0.045, 10), {
    rotate: vec3(Math.PI / 2, 0, 0),
    translate: vec3(doorX + wingSide * doorWidth * 0.28, baseY + doorHeight * 0.5, wingFrontZ + 0.13),
  }));

  const windowWidth = Math.min(0.82, p.width * 0.14);
  const windowHeight = Math.min(0.9, p.wallHeight * 0.34);
  const frontZ = mainCenterZ + p.depth * 0.5 + 0.065;
  const bayX = -wingSide * p.width * 0.26;
  addBayWindow(
    groups,
    bayX,
    baseY + p.wallHeight * 0.56,
    frontZ,
    windowWidth * 1.45,
    windowHeight,
    Math.min(0.24, p.depth * 0.055),
  );

  const wingWindowX = wingCenterX + wingSide * wingWidth * 0.2;
  addFrontWindow(groups, wingWindowX, baseY + p.wallHeight * 0.56, wingFrontZ + 0.07, windowWidth * 0.82, windowHeight * 0.88);

  const sideWindowCount = Math.max(1, Math.round((p.windowCount - 2) * 0.5));
  for (let i = 0; i < sideWindowCount; i++) {
    const t = sideWindowCount === 1 ? 0 : i / (sideWindowCount - 1) - 0.5;
    const x = t * p.width * 0.72 + rng.range(-0.04, 0.04);
    if (Math.abs(x - wingCenterX) < wingWidth * 0.56) continue;
    if (Math.abs(x - bayX) < windowWidth * 1.35) continue;
    addFrontWindow(groups, x, baseY + p.wallHeight * 0.57, frontZ, windowWidth, windowHeight);
  }

  const roundRadius = Math.min(0.22, wingWidth * 0.1);
  add(groups, "window_frames", transform(cylinder(roundRadius * 1.22, 0.075, 16), {
    rotate: vec3(Math.PI / 2, 0, 0),
    translate: vec3(wingCenterX, 0.22 + p.wallHeight + wingRise * 0.46, wingGableFrontZ + 0.045),
  }));
  add(groups, "window_glass", transform(cylinder(roundRadius, 0.082, 16), {
    rotate: vec3(Math.PI / 2, 0, 0),
    translate: vec3(wingCenterX, 0.22 + p.wallHeight + wingRise * 0.46, wingGableFrontZ + 0.052),
  }));

  add(groups, "foundation", placedBox(doorWidth * 1.45, 0.12, 0.38, doorX, 0.06, wingFrontZ + 0.25));
}

function addChimneys(
  groups: Map<string, Group>,
  p: PcgCartoonHouseParams,
  rng: ReturnType<typeof makeRng>,
  eaveY: number,
  mainCenterZ: number,
  mainRise: number,
): void {
  const count = Math.max(0, Math.min(3, Math.round(p.chimneyCount)));
  for (let i = 0; i < count; i++) {
    const x = count === 1 ? p.width * 0.22 : -p.width * 0.28 + i * (p.width * 0.56 / Math.max(1, count - 1));
    const z = mainCenterZ + rng.range(-p.depth * 0.12, p.depth * 0.12);
    const chimneyHeight = p.wallHeight * rng.range(0.34, 0.43);
    const y = eaveY + mainRise * 0.58 + chimneyHeight * 0.5;
    add(groups, "chimney", placedBox(0.34, chimneyHeight, 0.34, x, y, z));
    add(groups, "chimney", placedBox(0.46, 0.12, 0.46, x, y + chimneyHeight * 0.5 + 0.03, z));
  }
}

function addBayWindow(
  groups: Map<string, Group>,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  projection: number,
): void {
  const frame = Math.max(0.065, width * 0.08);
  const centerZ = z + projection * 0.5;
  add(groups, "window_frames", placedBox(width + frame * 2, frame, projection, x, y - height * 0.5 - frame * 0.5, centerZ));
  add(groups, "window_frames", placedBox(width + frame * 2, frame, projection, x, y + height * 0.5 + frame * 0.5, centerZ));
  add(groups, "window_frames", placedBox(frame, height, projection, x - width * 0.5 - frame * 0.5, y, centerZ));
  add(groups, "window_frames", placedBox(frame, height, projection, x + width * 0.5 + frame * 0.5, y, centerZ));
  addFrontWindow(groups, x, y, z + projection, width, height);
}

function addFrontWindow(groups: Map<string, Group>, x: number, y: number, z: number, width: number, height: number): void {
  const frame = Math.max(0.065, width * 0.1);
  add(groups, "window_glass", placedBox(width, height, 0.055, x, y, z));
  add(groups, "window_frames", placedBox(width + frame * 2, frame, 0.09, x, y + height * 0.5 + frame * 0.5, z + 0.012));
  add(groups, "window_frames", placedBox(width + frame * 2, frame, 0.09, x, y - height * 0.5 - frame * 0.5, z + 0.012));
  add(groups, "window_frames", placedBox(frame, height, 0.09, x - width * 0.5 - frame * 0.5, y, z + 0.012));
  add(groups, "window_frames", placedBox(frame, height, 0.09, x + width * 0.5 + frame * 0.5, y, z + 0.012));
  add(groups, "window_frames", placedBox(frame * 0.65, height, 0.095, x, y, z + 0.016));
  add(groups, "window_frames", placedBox(width, frame * 0.65, 0.095, x, y, z + 0.016));
}

function addDoorFrame(
  groups: Map<string, Group>,
  x: number,
  baseY: number,
  z: number,
  width: number,
  height: number,
  frame: number,
): void {
  add(groups, "timber_frame", placedBox(frame, height + frame, frame, x - width * 0.5 - frame * 0.5, baseY + height * 0.5, z));
  add(groups, "timber_frame", placedBox(frame, height + frame, frame, x + width * 0.5 + frame * 0.5, baseY + height * 0.5, z));
  add(groups, "timber_frame", placedBox(width + frame * 2, frame, frame, x, baseY + height + frame * 0.5, z));
}

function frontBeam(a: Vec3, b: Vec3, thickness: number): Mesh {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  return transform(box(length, thickness, thickness), {
    rotate: vec3(0, 0, Math.atan2(dy, dx)),
    translate: vec3((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, (a.z + b.z) * 0.5),
  });
}

function frontGablePanel(x: number, baseY: number, z: number, width: number, rise: number): Mesh {
  const positions = [
    vec3(x - width * 0.5, baseY, z),
    vec3(x + width * 0.5, baseY, z),
    vec3(x, baseY + rise, z),
  ];
  return makeMesh({
    positions,
    normals: positions.map(() => vec3(0, 0, 1)),
    uvs: [vec2(0, 0), vec2(1, 0), vec2(0.5, 1)],
    indices: [0, 1, 2],
  });
}

function sideGablePanel(x: number, baseY: number, z: number, depth: number, rise: number, side: -1 | 1): Mesh {
  const positions = [
    vec3(x, baseY, z - depth * 0.5),
    vec3(x, baseY, z + depth * 0.5),
    vec3(x, baseY + rise, z),
  ];
  return makeMesh({
    positions,
    normals: positions.map(() => vec3(side, 0, 0)),
    uvs: [vec2(0, 0), vec2(1, 0), vec2(0.5, 1)],
    indices: side > 0 ? [0, 2, 1] : [0, 1, 2],
  });
}

function placedBox(width: number, height: number, depth: number, x: number, y: number, z: number): Mesh {
  return transform(box(width, height, depth), { translate: vec3(x, y, z) });
}

function add(groups: Map<string, Group>, name: keyof typeof GROUPS, mesh: Mesh): void {
  let group = groups.get(name);
  if (!group) {
    const source = GROUPS[name];
    group = { ...source, meshes: [] };
    groups.set(name, group);
  }
  group.meshes.push(mesh);
}

function def(label: string, color: RGB, type: string, params: Record<string, unknown>): GroupDef {
  return { label, color, surface: { type, params: { color, ...params } } };
}

function resolveParams(params: Partial<PcgCartoonHouseParams>): PcgCartoonHouseParams {
  const p = { ...PCG_CARTOON_HOUSE_DEFAULTS, ...params };
  return {
    width: clamp(p.width, 3.6, 9),
    depth: clamp(p.depth, 2.8, 6.5),
    wallHeight: clamp(p.wallHeight, 1.8, 4.2),
    roofPitch: clamp(p.roofPitch, 0.35, 1.2),
    wingScale: clamp(p.wingScale, 0.32, 0.68),
    roofRows: Math.round(clamp(p.roofRows, 4, 16)),
    timberDensity: clamp(p.timberDensity, 0, 1),
    chimneyCount: Math.round(clamp(p.chimneyCount, 0, 3)),
    windowCount: Math.round(clamp(p.windowCount, 3, 12)),
    seed: Math.round(p.seed) >>> 0,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
