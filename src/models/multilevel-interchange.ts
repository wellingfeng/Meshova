import { vec3, type Vec3 } from "../math/vec3.js";
import {
  box,
  merge,
  polyline,
  roadDeck,
  roadEdgeLines,
  roadGuardrail,
  roadLaneLines,
  roadPierCaps,
  roadPillars,
  roadRibbon,
  transform,
  type Curve,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import { buildFreewayParts } from "./freeway.js";
import { buildIntersectionParts } from "./intersection.js";
import { buildTrafficSignalParts } from "./city-props.js";

type RGB = [number, number, number];

export interface MultilevelInterchangeParams {
  /** Overall interchange span in metres. */
  span: number;
  /** Top expressway deck elevation. */
  mainElevation: number;
  /** Middle cross-route deck elevation. */
  crossElevation: number;
  /** Lanes per direction on the top expressway. */
  lanesPerSide: number;
  /** Single-lane ramp width. */
  rampWidth: number;
  /** Cloverleaf loop radius. */
  loopRadius: number;
  /** Add signal rigs to the ground crossroads. */
  trafficSignals: boolean;
  /** Add expressway and junction lighting. */
  streetLights: boolean;
  /** Add raised planted medians. */
  landscaping: boolean;
}

export const MULTILEVEL_INTERCHANGE_DEFAULTS: MultilevelInterchangeParams = {
  span: 190,
  mainElevation: 11,
  crossElevation: 6,
  lanesPerSide: 4,
  rampWidth: 4.2,
  loopRadius: 28,
  trafficSignals: true,
  streetLights: true,
  landscaping: true,
};

const ASPHALT: RGB = [0.075, 0.078, 0.085];
const CONCRETE: RGB = [0.58, 0.59, 0.61];
const CONCRETE_DARK: RGB = [0.43, 0.44, 0.47];
const ROAD_PAINT: RGB = [0.94, 0.93, 0.87];
const GRASS: RGB = [0.13, 0.3, 0.15];
const CURB: RGB = [0.72, 0.72, 0.69];

function smoothstep(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function named(name: string, label: string, mesh: Mesh, color: RGB, type: "asphalt" | "concrete" | "ceramic" | "metal" | "foliage", roughness: number): NamedPart {
  return { name, label, mesh, color, surface: { type, params: { color, roughness } } };
}

function placeParts(
  parts: readonly NamedPart[],
  prefix: string,
  labelPrefix: string,
  translate: Vec3,
  rotateY = 0,
  labels: Record<string, string> = {},
): NamedPart[] {
  return parts.map((part) => ({
    ...part,
    name: `${prefix}_${part.name}`,
    label: `${labelPrefix}·${labels[part.name] ?? part.label ?? "构件"}`,
    mesh: transform(part.mesh, { rotate: vec3(0, rotateY, 0), translate }),
  }));
}

function crossRouteCurve(span: number, elevation: number): Curve {
  const half = span * 0.56;
  const rampFraction = 0.22;
  const points: Vec3[] = [];
  const segments = Math.max(64, Math.round(span / 1.5));
  for (let index = 0; index <= segments; index++) {
    const t = index / segments;
    const ramp = t < rampFraction
      ? smoothstep(t / rampFraction)
      : t > 1 - rampFraction
        ? smoothstep((1 - t) / rampFraction)
        : 1;
    points.push(vec3(3 * Math.sin(t * Math.PI * 2), elevation * ramp, -half + t * half * 2));
  }
  return polyline(points);
}

function loopRampCurve(
  sideX: -1 | 1,
  sideZ: -1 | 1,
  radius: number,
  highY: number,
  lowY: number,
): Curve {
  const points: Vec3[] = [];
  const segments = 72;
  const branchOffset = 1.8;
  for (let index = 0; index <= segments; index++) {
    const t = index / segments;
    const angle = -Math.PI / 2 + t * Math.PI * 1.5;
    const x = sideX * (radius + radius * Math.cos(angle)) + sideZ * branchOffset;
    const z = sideZ * (radius + radius * Math.sin(angle)) + sideX * branchOffset;
    const y = highY + (lowY - highY) * smoothstep(t);
    points.push(vec3(x, y, z));
  }
  return polyline(points);
}

function cubicRampCurve(start: Vec3, controlA: Vec3, controlB: Vec3, end: Vec3): Curve {
  const points: Vec3[] = [];
  const segments = 56;
  for (let index = 0; index <= segments; index++) {
    const t = index / segments;
    const u = 1 - t;
    points.push(vec3(
      u ** 3 * start.x + 3 * u * u * t * controlA.x + 3 * u * t * t * controlB.x + t ** 3 * end.x,
      u ** 3 * start.y + 3 * u * u * t * controlA.y + 3 * u * t * t * controlB.y + t ** 3 * end.y,
      u ** 3 * start.z + 3 * u * u * t * controlA.z + 3 * u * t * t * controlB.z + t ** 3 * end.z,
    ));
  }
  return polyline(points);
}

function elevatedRoadParts(
  key: string,
  label: string,
  curve: Curve,
  halfWidth: number,
  lanes: number,
  pillarSpacing: number,
): NamedPart[] {
  const options = {
    halfWidth,
    sampleDistance: 1.1,
    widthSubdivisions: Math.max(2, lanes * 2),
    adaptiveCurvature: true,
    curvatureThresholdDeg: 5,
    verticalOffset: 0.02,
    uvLengthScale: 8,
  };
  const parts: NamedPart[] = [
    named(`${key}_asphalt`, `${label}沥青`, roadRibbon(curve, { ...options, verticalOffset: 0.18 }), ASPHALT, "asphalt", 0.92),
    named(`${key}_slab`, `${label}桥面板`, roadDeck(curve, { ...options, thickness: 0.65 }), CONCRETE, "concrete", 0.84),
    named(`${key}_edge_lines`, `${label}边缘线`, roadEdgeLines(curve, { ...options, verticalOffset: 0.2, lineWidth: 0.16, edgeInset: 0.28 }), ROAD_PAINT, "ceramic", 0.5),
    named(`${key}_guardrails`, `${label}双侧护栏`, merge(
      roadGuardrail(curve, { ...options, side: -1, lateral: halfWidth + 0.12, postSpacing: 3.2, railHeight: 0.72 }),
      roadGuardrail(curve, { ...options, side: 1, lateral: halfWidth + 0.12, postSpacing: 3.2, railHeight: 0.72 }),
    ), CONCRETE, "concrete", 0.72),
  ];

  if (lanes > 1) {
    parts.push(named(`${key}_lane_lines`, `${label}车道线`, roadLaneLines(curve, {
      ...options,
      verticalOffset: 0.2,
      lanes,
      dashed: true,
      dashLength: 3,
      gapLength: 4,
      lineWidth: 0.14,
      skipCenter: false,
    }), ROAD_PAINT, "ceramic", 0.5));
  }

  parts.push(
    named(`${key}_piers`, `${label}桥墩`, roadPillars(curve, {
      sampleDistance: 1.1,
      verticalOffset: 0.02,
      spacing: pillarSpacing,
      radius: Math.max(0.42, halfWidth * 0.11),
      groundY: 0,
      deckThickness: 1.36,
      shape: "round",
      taper: 0.9,
    }), CONCRETE_DARK, "concrete", 0.88),
    named(`${key}_pier_caps`, `${label}盖梁`, roadPierCaps(curve, {
      sampleDistance: 1.1,
      verticalOffset: 0.02,
      spacing: pillarSpacing,
      capWidth: halfWidth * 2 + 0.9,
      capHeight: 0.58,
      capLength: 1.05,
      deckThickness: 0.65,
    }), CONCRETE_DARK, "concrete", 0.84),
  );
  return parts;
}

function chevronPatch(x: number, y: number, z: number, yaw: number, count: number): Mesh {
  const stripes: Mesh[] = [];
  for (let index = 0; index < count; index++) {
    const distance = index * 1.4;
    for (const side of [-1, 1]) {
      stripes.push(transform(box(0.15, 0.025, 2.1), {
        rotate: vec3(0, yaw + side * 0.58, 0),
        translate: vec3(x + Math.sin(yaw) * distance, y, z + Math.cos(yaw) * distance),
      }));
    }
  }
  return merge(...stripes);
}

const MAIN_LABELS: Record<string, string> = {
  deck_r: "右幅车行道",
  deck_l: "左幅车行道",
  slab_r: "右幅桥面板",
  slab_l: "左幅桥面板",
  lanes_r: "右幅车道线",
  lanes_l: "左幅车道线",
  edge_r: "右幅边缘线",
  edge_l: "左幅边缘线",
  guardrail_r: "右幅护栏",
  guardrail_l: "左幅护栏",
  median_barrier: "中央隔离带",
  pillars: "主线桥墩",
  pier_caps: "主线盖梁",
  sign_gantry: "高速龙门标志",
  light_poles_r: "右幅路灯",
  light_poles_l: "左幅路灯",
};

export function buildMultilevelInterchangeParts(params: Partial<MultilevelInterchangeParams> = {}): NamedPart[] {
  const input = { ...MULTILEVEL_INTERCHANGE_DEFAULTS, ...params };
  const p: MultilevelInterchangeParams = {
    ...input,
    span: Math.max(120, input.span),
    mainElevation: Math.max(8, input.mainElevation),
    crossElevation: Math.max(3.8, Math.min(input.mainElevation - 2.5, input.crossElevation)),
    lanesPerSide: Math.max(2, Math.round(input.lanesPerSide)),
    rampWidth: Math.max(3.2, input.rampWidth),
    loopRadius: Math.max(20, Math.min(input.span * 0.22, input.loopRadius)),
  };
  const parts: NamedPart[] = [];
  const groundIntersectionZ = -p.span * 0.42;

  parts.push(named("site_ground", "枢纽绿化地面", transform(box(p.span * 1.24, 0.12, p.span * 1.24), {
    translate: vec3(0, -0.08, 0),
  }), GRASS, "foliage", 0.98));

  const groundRoads = buildIntersectionParts({
    roadHalfWidth: 9,
    armLength: p.span * 0.24,
    lanes: 3,
    crosswalks: true,
    sidewalks: true,
    sidewalkWidth: 3,
  });
  parts.push(...placeParts(
    groundRoads.filter((part) => part.name !== "ground"),
    "ground",
    "地面十字路口",
    vec3(0, 0, groundIntersectionZ),
  ));

  const mainRoad = buildFreewayParts({
    length: p.span * 1.08,
    bend: 4,
    lanesPerSide: p.lanesPerSide,
    laneWidth: 3.4,
    medianWidth: 1.6,
    elevation: p.mainElevation,
    guardrails: true,
    pillars: true,
    pillarSpacing: 15,
    signGantry: true,
    signSpacing: 52,
    lightPoles: p.streetLights,
    lightSpacing: 24,
    noiseBarrier: false,
    deckThickness: 0.8,
    sample: 1.25,
  }).map((part) => part.name.startsWith("deck_") ? {
    ...part,
    surface: { type: "asphalt", params: { color: ASPHALT, roughness: 0.92 } },
  } : part);
  parts.push(...placeParts(mainRoad, "main", "顶层双向高速", vec3(0, 0, 4), Math.PI / 2, MAIN_LABELS));

  const cross = crossRouteCurve(p.span, p.crossElevation);
  parts.push(...elevatedRoadParts("cross", "中层跨线桥", cross, 7.2, 4, 14));

  for (const sideX of [-1, 1] as const) {
    for (const sideZ of [-1, 1] as const) {
      const quadrant = `${sideX > 0 ? "east" : "west"}_${sideZ > 0 ? "north" : "south"}`;
      const quadrantLabel = `${sideX > 0 ? "东" : "西"}${sideZ > 0 ? "北" : "南"}环形匝道`;
      parts.push(...elevatedRoadParts(
        `loop_${quadrant}`,
        quadrantLabel,
        loopRampCurve(sideX, sideZ, p.loopRadius, p.mainElevation, p.crossElevation),
        p.rampWidth / 2,
        1,
        11,
      ));
    }
  }

  const directWestNorth = cubicRampCurve(
    vec3(-p.span * 0.42, p.mainElevation, -4),
    vec3(-p.span * 0.27, p.mainElevation, -25),
    vec3(-22, p.crossElevation + 0.8, p.span * 0.28),
    vec3(0, p.crossElevation, p.span * 0.42),
  );
  const directEastSouth = cubicRampCurve(
    vec3(p.span * 0.42, p.mainElevation, 11),
    vec3(p.span * 0.27, p.mainElevation, 32),
    vec3(22, p.crossElevation + 0.8, -p.span * 0.28),
    vec3(0, p.crossElevation, -p.span * 0.42),
  );
  parts.push(
    ...elevatedRoadParts("direct_west_north", "西向北定向匝道", directWestNorth, p.rampWidth / 2, 1, 13),
    ...elevatedRoadParts("direct_east_south", "东向南定向匝道", directEastSouth, p.rampWidth / 2, 1, 13),
  );

  const goreY = p.mainElevation + 0.11;
  parts.push(named("ramp_gore_chevrons", "匝道口导流斜纹", merge(
    chevronPatch(-p.loopRadius - 5, goreY, -1, Math.PI / 2, 7),
    chevronPatch(p.loopRadius + 5, goreY, 9, -Math.PI / 2, 7),
  ), ROAD_PAINT, "ceramic", 0.5));

  if (p.landscaping) {
    const medianLength = p.span * 0.16;
    parts.push(
      named("ground_median_curbs", "地面道路绿化带路缘", merge(
        transform(box(3.2, 0.2, medianLength), { translate: vec3(0, 0.11, groundIntersectionZ - p.span * 0.16) }),
        transform(box(3.2, 0.2, medianLength), { translate: vec3(0, 0.11, groundIntersectionZ + p.span * 0.16) }),
        transform(box(medianLength, 0.2, 3.2), { translate: vec3(-p.span * 0.16, 0.11, groundIntersectionZ) }),
        transform(box(medianLength, 0.2, 3.2), { translate: vec3(p.span * 0.16, 0.11, groundIntersectionZ) }),
      ), CURB, "concrete", 0.78),
      named("ground_planted_medians", "地面道路绿化带", merge(
        transform(box(2.7, 0.12, medianLength - 0.5), { translate: vec3(0, 0.27, groundIntersectionZ - p.span * 0.16) }),
        transform(box(2.7, 0.12, medianLength - 0.5), { translate: vec3(0, 0.27, groundIntersectionZ + p.span * 0.16) }),
        transform(box(medianLength - 0.5, 0.12, 2.7), { translate: vec3(-p.span * 0.16, 0.27, groundIntersectionZ) }),
        transform(box(medianLength - 0.5, 0.12, 2.7), { translate: vec3(p.span * 0.16, 0.27, groundIntersectionZ) }),
      ), GRASS, "foliage", 0.98),
    );
  }

  if (p.trafficSignals) {
    const signalKit = buildTrafficSignalParts({ mastHeight: 6.5, armReach: 10.5, heads: 3, pedestrian: true, streetSign: true });
    const corner = 11.8;
    const placements: Array<[string, string, Vec3, number]> = [
      ["northwest", "西北角", vec3(-corner, 0, groundIntersectionZ + corner), 0],
      ["northeast", "东北角", vec3(corner, 0, groundIntersectionZ + corner), Math.PI / 2],
      ["southeast", "东南角", vec3(corner, 0, groundIntersectionZ - corner), Math.PI],
      ["southwest", "西南角", vec3(-corner, 0, groundIntersectionZ - corner), -Math.PI / 2],
    ];
    for (const [key, label, position, yaw] of placements) {
      parts.push(...placeParts(signalKit, `signal_${key}`, `地面路口${label}信号灯`, position, yaw));
    }
  }

  return parts;
}
