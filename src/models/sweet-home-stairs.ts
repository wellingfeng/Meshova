/**
 * Procedural reconstructions of staircase references from Sweet Home 3D.
 * Only public preview images and names are used; no source mesh data is read.
 */
import { box, cylinder, merge, transform, type Mesh, type NamedPart } from "../geometry/index.js";
import { vec3, type Vec3 } from "../math/vec3.js";

type RGB = [number, number, number];

export type SweetHomeStairKind =
  | "straight"
  | "quarter-landing"
  | "half-landing"
  | "spiral"
  | "square-spiral"
  | "grand";

export interface SweetHomeStairParams {
  kind: SweetHomeStairKind;
  width: number;
  rise: number;
  run: number;
  steps: number;
  railHeight: number;
  railings: number;
}

export interface SweetHomeStairModelDefinition {
  id: string;
  name: string;
  kind: SweetHomeStairKind;
  sourceName: string;
  sourceImage: string;
  defaults: SweetHomeStairParams;
}

const SOURCE_PAGE = "https://www.sweethome3d.com/zh-hans/%e5%85%8d%e8%b4%b9-3d-%e6%a8%a1%e5%9e%8b/";
const SOURCE_ASSETS = "https://www.sweethome3d.com/wp-content/themes/sweet-home-3d/theme/assets/models/contributions";

const WOOD: RGB = [0.5, 0.22, 0.1];
const DARK_WOOD: RGB = [0.22, 0.09, 0.045];
const PALE_WOOD: RGB = [0.72, 0.55, 0.32];
const DARK_METAL: RGB = [0.055, 0.06, 0.065];
const WHITE_PAINT: RGB = [0.82, 0.8, 0.73];

export const SWEET_HOME_STAIR_MODELS: SweetHomeStairModelDefinition[] = [
  {
    id: "sweet-home-straight-staircase",
    name: "开放式直跑楼梯",
    kind: "straight",
    sourceName: "Straight staircase",
    sourceImage: `${SOURCE_ASSETS}/stairs_legal.png`,
    defaults: { kind: "straight", width: 1.05, rise: 2.7, run: 3.35, steps: 15, railHeight: 0.9, railings: 1 },
  },
  {
    id: "sweet-home-quarter-landing-staircase",
    name: "四分之一平台楼梯",
    kind: "quarter-landing",
    sourceName: "Quarter landing staircase",
    sourceImage: `${SOURCE_ASSETS}/stairs_90_closed_legal_high.png`,
    defaults: { kind: "quarter-landing", width: 0.95, rise: 2.8, run: 4.2, steps: 16, railHeight: 0.9, railings: 1 },
  },
  {
    id: "sweet-home-half-landing-staircase",
    name: "半平台折返楼梯",
    kind: "half-landing",
    sourceName: "Half landing staircase",
    sourceImage: `${SOURCE_ASSETS}/staircase_180_landing.png`,
    defaults: { kind: "half-landing", width: 0.92, rise: 3, run: 3.5, steps: 16, railHeight: 0.92, railings: 1 },
  },
  {
    id: "sweet-home-spiral-staircase",
    name: "中心柱圆形旋梯",
    kind: "spiral",
    sourceName: "Spiral Staircase",
    sourceImage: `${SOURCE_ASSETS}/escalierColimacon.png`,
    defaults: { kind: "spiral", width: 2.15, rise: 2.8, run: 1, steps: 17, railHeight: 0.86, railings: 1 },
  },
  {
    id: "sweet-home-square-spiral-staircase",
    name: "紧凑方形旋梯",
    kind: "square-spiral",
    sourceName: "Square spiral staircase",
    sourceImage: `${SOURCE_ASSETS}/stairs_180_square.png`,
    defaults: { kind: "square-spiral", width: 2, rise: 2.75, run: 1, steps: 16, railHeight: 0.88, railings: 1 },
  },
  {
    id: "sweet-home-grand-staircase",
    name: "双扶手分叉大楼梯",
    kind: "grand",
    sourceName: "Grand Staircase Dark",
    sourceImage: `${SOURCE_ASSETS}/grandStaircaseDark.png`,
    defaults: { kind: "grand", width: 1.55, rise: 2.9, run: 4.6, steps: 13, railHeight: 0.92, railings: 1 },
  },
];

interface FlightGeometry {
  treads: Mesh[];
  risers: Mesh[];
  supports: Mesh[];
  posts: Mesh[];
  handrails: Mesh[];
}

interface HorizontalDirection {
  x: number;
  z: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function beamBetween(a: Vec3, b: Vec3, thickness: number): Mesh {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const horizontal = Math.hypot(dx, dz);
  const length = Math.hypot(horizontal, dy);
  const yaw = Math.atan2(dx, dz);
  const pitch = -Math.atan2(dy, horizontal);
  return transform(box(thickness, thickness, Math.max(0.001, length)), {
    rotate: vec3(pitch, yaw, 0),
    translate: vec3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2),
  });
}

function verticalPost(x: number, baseY: number, z: number, height: number, radius = 0.025): Mesh {
  return transform(cylinder(radius, height, 10), {
    translate: vec3(x, baseY + height / 2, z),
  });
}

function provenance(kind: SweetHomeStairKind): Record<string, unknown> {
  const definition = SWEET_HOME_STAIR_MODELS.find((entry) => entry.kind === kind)!;
  return {
    referenceSite: "Sweet Home 3D",
    referencePage: SOURCE_PAGE,
    referenceModel: definition.sourceName,
    referenceImage: definition.sourceImage,
    reconstruction: "procedural-from-preview",
    sourceMeshUsed: false,
  };
}

function materialPart(
  name: string,
  label: string,
  meshes: Mesh[],
  color: RGB,
  surfaceType: string,
  metadata: Record<string, unknown>,
  roughness: number,
): NamedPart {
  return {
    name,
    label,
    mesh: merge(...meshes),
    color,
    surface: { type: surfaceType, params: { color, roughness } },
    metadata,
  };
}

function buildFlight(
  start: Vec3,
  direction: HorizontalDirection,
  width: number,
  run: number,
  rise: number,
  steps: number,
  railHeight: number,
  railSides: number[],
  solidRisers: boolean,
): FlightGeometry {
  const count = Math.max(2, Math.round(steps));
  const treadDepth = run / count;
  const riseStep = rise / count;
  const treadThickness = 0.075;
  const yaw = Math.atan2(direction.x, direction.z);
  const sideX = direction.z;
  const sideZ = -direction.x;
  const treads: Mesh[] = [];
  const risers: Mesh[] = [];
  const supports: Mesh[] = [];
  const posts: Mesh[] = [];
  const handrails: Mesh[] = [];

  for (let index = 0; index < count; index++) {
    const distance = treadDepth * (index + 0.5);
    const y = start.y + riseStep * (index + 1);
    const x = start.x + direction.x * distance;
    const z = start.z + direction.z * distance;
    treads.push(transform(box(width, treadThickness, treadDepth * 1.08), {
      rotate: vec3(0, yaw, 0),
      translate: vec3(x, y, z),
    }));
    if (solidRisers) {
      const previousTop = index === 0
        ? start.y
        : start.y + riseStep * index + treadThickness / 2;
      const currentBottom = y - treadThickness / 2;
      const riserHeight = Math.max(0.015, currentBottom - previousTop);
      const treadFrontDistance = distance - treadDepth * 0.54;
      const riserDepth = 0.045;
      const riserDistance = treadFrontDistance + 0.018 + riserDepth / 2;
      risers.push(transform(box(width, riserHeight, riserDepth), {
        rotate: vec3(0, yaw, 0),
        translate: vec3(
          start.x + direction.x * riserDistance,
          (previousTop + currentBottom) / 2,
          start.z + direction.z * riserDistance,
        ),
      }));
    }
  }

  for (const side of [-1, 1]) {
    const offset = side * width * 0.39;
    const a = vec3(
      start.x + sideX * offset + direction.x * treadDepth * 0.4,
      start.y + riseStep * 0.35,
      start.z + sideZ * offset + direction.z * treadDepth * 0.4,
    );
    const b = vec3(
      start.x + sideX * offset + direction.x * (run - treadDepth * 0.35),
      start.y + rise - riseStep * 0.35,
      start.z + sideZ * offset + direction.z * (run - treadDepth * 0.35),
    );
    supports.push(beamBetween(a, b, 0.075));
  }

  for (const side of railSides) {
    const topPoints: Vec3[] = [];
    const sampleIndices: number[] = [];
    for (let index = 0; index < count; index += 2) sampleIndices.push(index);
    if (sampleIndices.at(-1) !== count - 1) sampleIndices.push(count - 1);
    for (const index of sampleIndices) {
      const distance = treadDepth * (index + 0.5);
      const baseY = start.y + riseStep * (index + 1);
      const x = start.x + direction.x * distance + sideX * side * width * 0.47;
      const z = start.z + direction.z * distance + sideZ * side * width * 0.47;
      posts.push(verticalPost(x, baseY, z, railHeight));
      topPoints.push(vec3(x, baseY + railHeight, z));
    }
    for (let index = 0; index < topPoints.length - 1; index++) {
      handrails.push(beamBetween(topPoints[index]!, topPoints[index + 1]!, 0.055));
    }
  }

  return { treads, risers, supports, posts, handrails };
}

function flightParts(kind: SweetHomeStairKind, flights: FlightGeometry[], extraWood: Mesh[] = [], extraRails: Mesh[] = []): NamedPart[] {
  const metadata = provenance(kind);
  const treads = flights.flatMap((flight) => flight.treads);
  const risers = flights.flatMap((flight) => flight.risers);
  const supports = flights.flatMap((flight) => flight.supports);
  const posts = flights.flatMap((flight) => flight.posts);
  const handrails = flights.flatMap((flight) => flight.handrails).concat(extraRails);
  const parts: NamedPart[] = [
    materialPart("stair_treads", "踏步", treads.concat(extraWood), WOOD, "wood", metadata, 0.56),
    materialPart("stair_supports", "梯梁", supports, DARK_WOOD, "wood", metadata, 0.62),
  ];
  if (risers.length > 0) parts.push(materialPart("stair_risers", "踢面", risers, DARK_WOOD, "wood", metadata, 0.6));
  if (posts.length > 0) parts.push(materialPart("railing_posts", "栏杆立柱", posts, DARK_METAL, "metal", metadata, 0.32));
  if (handrails.length > 0) parts.push(materialPart("handrails", "扶手", handrails, DARK_WOOD, "wood", metadata, 0.48));
  return parts;
}

function buildStraight(params: SweetHomeStairParams): NamedPart[] {
  const flight = buildFlight(
    vec3(0, 0, -params.run / 2),
    { x: 0, z: 1 },
    params.width,
    params.run,
    params.rise,
    params.steps,
    params.railHeight,
    params.railings > 0 ? [-1, 1] : [],
    false,
  );
  return flightParts(params.kind, [flight]);
}

function buildQuarterLanding(params: SweetHomeStairParams): NamedPart[] {
  const firstSteps = Math.max(3, Math.round(params.steps * 0.62));
  const secondSteps = Math.max(3, params.steps - firstSteps);
  const firstRun = params.run * 0.62;
  const secondRun = params.run - firstRun;
  const firstRise = params.rise * firstSteps / (firstSteps + secondSteps);
  const landingY = firstRise;
  const rails = params.railings > 0 ? [-1, 1] : [];
  const first = buildFlight(vec3(0, 0, -firstRun), { x: 0, z: 1 }, params.width, firstRun, firstRise, firstSteps, params.railHeight, rails, true);
  const second = buildFlight(vec3(params.width / 2, landingY, params.width / 2), { x: 1, z: 0 }, params.width, secondRun, params.rise - firstRise, secondSteps, params.railHeight, rails, true);
  const landing = transform(box(params.width, 0.1, params.width), { translate: vec3(0, landingY, params.width / 2) });
  return flightParts(params.kind, [first, second], [landing]);
}

function buildHalfLanding(params: SweetHomeStairParams): NamedPart[] {
  const lowerSteps = Math.max(3, Math.floor(params.steps / 2));
  const upperSteps = Math.max(3, params.steps - lowerSteps);
  const lowerRise = params.rise * lowerSteps / (lowerSteps + upperSteps);
  const gap = 0.12;
  const offset = params.width / 2 + gap / 2;
  const rails = params.railings > 0 ? [-1, 1] : [];
  const lower = buildFlight(vec3(-offset, 0, -params.run), { x: 0, z: 1 }, params.width, params.run, lowerRise, lowerSteps, params.railHeight, rails, true);
  const upper = buildFlight(vec3(offset, lowerRise, 0), { x: 0, z: -1 }, params.width, params.run, params.rise - lowerRise, upperSteps, params.railHeight, rails, true);
  const landingWidth = params.width * 2 + gap;
  const landing = transform(box(landingWidth, 0.1, params.width), { translate: vec3(0, lowerRise, params.width / 2) });
  const landingRail = params.railings > 0
    ? [beamBetween(vec3(-landingWidth / 2, lowerRise + params.railHeight, params.width), vec3(landingWidth / 2, lowerRise + params.railHeight, params.width), 0.055)]
    : [];
  return flightParts(params.kind, [lower, upper], [landing], landingRail);
}

function buildSpiral(params: SweetHomeStairParams, square: boolean): NamedPart[] {
  const count = Math.max(8, Math.round(params.steps));
  const radius = params.width / 2;
  const innerRadius = Math.max(0.13, radius * 0.16);
  const treadLength = radius - innerRadius;
  const middleRadius = innerRadius + treadLength / 2;
  const riseStep = params.rise / count;
  const turn = square ? Math.PI * 1.55 : Math.PI * 1.7;
  const angularStep = turn / Math.max(1, count - 1);
  const treadWidth = Math.max(0.16, middleRadius * angularStep * (square ? 1.15 : 0.92));
  const treads: Mesh[] = [];
  const risers: Mesh[] = [];
  const posts: Mesh[] = [];
  const handrails: Mesh[] = [];
  const railPoints: Vec3[] = [];

  for (let index = 0; index < count; index++) {
    const angle = -turn / 2 + index * angularStep;
    const sx = Math.sin(angle);
    const sz = Math.cos(angle);
    const squareScale = square ? 1 / Math.max(Math.abs(sx), Math.abs(sz), 0.001) : 1;
    const centerRadius = middleRadius * squareScale;
    const outerRadius = radius * squareScale;
    const y = riseStep * (index + 1);
    treads.push(transform(box(treadWidth, 0.075, treadLength), {
      rotate: vec3(0, angle, 0),
      translate: vec3(sx * centerRadius, y, sz * centerRadius),
    }));
    if (square) {
      risers.push(transform(box(treadWidth, riseStep, 0.05), {
        rotate: vec3(0, angle, 0),
        translate: vec3(sx * (innerRadius * squareScale), y - riseStep / 2, sz * (innerRadius * squareScale)),
      }));
    }
    if (params.railings > 0 && (index % 2 === 0 || index === count - 1)) {
      const x = sx * outerRadius;
      const z = sz * outerRadius;
      posts.push(verticalPost(x, y, z, params.railHeight));
      railPoints.push(vec3(x, y + params.railHeight, z));
    }
  }
  for (let index = 0; index < railPoints.length - 1; index++) {
    handrails.push(beamBetween(railPoints[index]!, railPoints[index + 1]!, 0.05));
  }

  const metadata = provenance(params.kind);
  const core = square
    ? transform(box(innerRadius * 1.5, params.rise + params.railHeight * 0.6, innerRadius * 1.5), { translate: vec3(0, (params.rise + params.railHeight * 0.6) / 2, 0) })
    : transform(cylinder(innerRadius * 0.65, params.rise + params.railHeight * 0.65, 16), { translate: vec3(0, (params.rise + params.railHeight * 0.65) / 2, 0) });
  const parts: NamedPart[] = [
    materialPart("spiral_treads", "旋转踏步", treads, square ? WOOD : WHITE_PAINT, square ? "wood" : "metal", metadata, square ? 0.56 : 0.34),
    materialPart("central_column", "中心承重柱", [core], square ? DARK_WOOD : [0.45, 0.46, 0.47], square ? "wood" : "metal", metadata, 0.34),
  ];
  if (risers.length > 0) parts.push(materialPart("spiral_risers", "旋梯踢面", risers, DARK_WOOD, "wood", metadata, 0.58));
  if (posts.length > 0) parts.push(materialPart("railing_posts", "外侧栏杆立柱", posts, DARK_METAL, "metal", metadata, 0.32));
  if (handrails.length > 0) parts.push(materialPart("handrails", "旋转扶手", handrails, DARK_WOOD, "wood", metadata, 0.46));
  return parts;
}

function buildGrand(params: SweetHomeStairParams): NamedPart[] {
  const lowerSteps = Math.max(4, Math.floor(params.steps * 0.55));
  const upperSteps = Math.max(3, params.steps - lowerSteps);
  const lowerRise = params.rise * lowerSteps / (lowerSteps + upperSteps);
  const lowerRun = params.run * 0.58;
  const upperRun = params.run - lowerRun;
  const rails = params.railings > 0 ? [-1, 1] : [];
  const lower = buildFlight(vec3(0, 0, -lowerRun), { x: 0, z: 1 }, params.width, lowerRun, lowerRise, lowerSteps, params.railHeight, rails, true);
  const wingWidth = params.width * 0.72;
  const left = buildFlight(vec3(-params.width * 0.58, lowerRise, 0.35), { x: -1, z: 0 }, wingWidth, upperRun, params.rise - lowerRise, upperSteps, params.railHeight, rails, true);
  const right = buildFlight(vec3(params.width * 0.58, lowerRise, 0.35), { x: 1, z: 0 }, wingWidth, upperRun, params.rise - lowerRise, upperSteps, params.railHeight, rails, true);
  const landing = transform(box(params.width * 2.1, 0.12, params.width * 1.2), { translate: vec3(0, lowerRise, 0.35) });
  const balconies = [
    transform(box(upperRun * 0.7, 0.12, wingWidth * 1.2), { translate: vec3(-params.width * 0.58 - upperRun * 1.05, params.rise, 0.35) }),
    transform(box(upperRun * 0.7, 0.12, wingWidth * 1.2), { translate: vec3(params.width * 0.58 + upperRun * 1.05, params.rise, 0.35) }),
  ];
  const parts = flightParts(params.kind, [lower, left, right], [landing, ...balconies]);
  const metadata = provenance(params.kind);
  const columnHeight = params.railHeight * 1.18;
  const columns = [
    [-params.width * 1.05, lowerRise, 0.9],
    [params.width * 1.05, lowerRise, 0.9],
    [-params.width * 0.58 - upperRun, params.rise, 0.35 + wingWidth * 0.52],
    [params.width * 0.58 + upperRun, params.rise, 0.35 + wingWidth * 0.52],
  ].map(([x, y, z]) => verticalPost(x!, y!, z!, columnHeight, 0.07));
  parts.push(materialPart("newel_columns", "装饰主柱", columns, PALE_WOOD, "wood", metadata, 0.5));
  return parts;
}

export function buildSweetHomeStaircaseParts(input: Partial<SweetHomeStairParams> = {}): NamedPart[] {
  const kind = input.kind ?? "straight";
  const definition = SWEET_HOME_STAIR_MODELS.find((entry) => entry.kind === kind) ?? SWEET_HOME_STAIR_MODELS[0]!;
  const params: SweetHomeStairParams = {
    ...definition.defaults,
    ...input,
    kind,
    width: clamp(input.width ?? definition.defaults.width, 0.55, 4),
    rise: clamp(input.rise ?? definition.defaults.rise, 0.8, 8),
    run: clamp(input.run ?? definition.defaults.run, 0.8, 12),
    steps: Math.round(clamp(input.steps ?? definition.defaults.steps, 6, 40)),
    railHeight: clamp(input.railHeight ?? definition.defaults.railHeight, 0.45, 1.5),
    railings: input.railings ?? definition.defaults.railings,
  };

  switch (kind) {
    case "quarter-landing": return buildQuarterLanding(params);
    case "half-landing": return buildHalfLanding(params);
    case "spiral": return buildSpiral(params, false);
    case "square-spiral": return buildSpiral(params, true);
    case "grand": return buildGrand(params);
    default: return buildStraight(params);
  }
}
