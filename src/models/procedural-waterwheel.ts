/**
 * Procedural waterwheel study based on the linked Houdini planning lesson.
 * All assemblies derive from the wheel radius and width so they stay aligned.
 */
import { vec3 } from "../math/vec3.js";
import {
  box,
  cylinder,
  merge,
  torus,
  transform,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";

type RGB = [number, number, number];

const SOURCE_URL = "https://www.bilibili.com/video/BV1nwKZ6UECd/";
const WOOD: RGB = [0.43, 0.27, 0.13];
const WOOD_DARK: RGB = [0.25, 0.14, 0.07];
const WOOD_LIGHT: RGB = [0.57, 0.38, 0.2];
const IRON: RGB = [0.18, 0.2, 0.22];
const WATER: RGB = [0.08, 0.42, 0.68];

export interface ProceduralWaterwheelParams {
  /** Outer ring center radius in metres. */
  radius: number;
  /** Distance between front and back wheel rings. */
  wheelWidth: number;
  /** Radial thickness of timber rings. */
  ringThickness: number;
  /** Number of radial spokes on each wheel face. */
  spokeCount: number;
  /** Number of water-catching paddles. */
  paddleCount: number;
  /** Paddle extension beyond the outer ring. */
  paddleLength: number;
  /** Bend angle of the paddle tip in radians. */
  paddleBend: number;
  /** Rotor angle in radians. */
  wheelAngle: number;
  /** Axle length along Z. */
  axleLength: number;
  /** Axle radius. */
  axleRadius: number;
  /** Number of planks used to approximate the curved trough. */
  troughPlanks: number;
  /** Extra inlet height relative to wheel radius. */
  troughSlope: number;
  /** Include the procedural water guide geometry. */
  water: boolean;
}

export const PROCEDURAL_WATERWHEEL_DEFAULTS: ProceduralWaterwheelParams = {
  radius: 2.35,
  wheelWidth: 0.95,
  ringThickness: 0.24,
  spokeCount: 8,
  paddleCount: 16,
  paddleLength: 0.52,
  paddleBend: Math.PI / 7,
  wheelAngle: Math.PI / 15,
  axleLength: 2.8,
  axleRadius: 0.16,
  troughPlanks: 12,
  troughSlope: 0.16,
  water: true,
};

interface Point2 {
  x: number;
  y: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolveParams(params: Partial<ProceduralWaterwheelParams>): ProceduralWaterwheelParams {
  const merged = { ...PROCEDURAL_WATERWHEEL_DEFAULTS, ...params };
  const wheelWidth = clamp(merged.wheelWidth, 0.35, 2.4);
  return {
    radius: clamp(merged.radius, 0.8, 6),
    wheelWidth,
    ringThickness: clamp(merged.ringThickness, 0.08, 0.65),
    spokeCount: Math.round(clamp(merged.spokeCount, 3, 24)),
    paddleCount: Math.round(clamp(merged.paddleCount, 6, 40)),
    paddleLength: clamp(merged.paddleLength, 0.16, 1.5),
    paddleBend: clamp(merged.paddleBend, 0, Math.PI * 0.45),
    wheelAngle: merged.wheelAngle,
    axleLength: Math.max(clamp(merged.axleLength, 1.2, 8), wheelWidth + 0.8),
    axleRadius: clamp(merged.axleRadius, 0.05, 0.5),
    troughPlanks: Math.round(clamp(merged.troughPlanks, 4, 36)),
    troughSlope: clamp(merged.troughSlope, -0.2, 0.65),
    water: merged.water,
  };
}

const woodSurface = (color: RGB, roughness = 0.82) =>
  ({ type: "wood", params: { color, roughness } }) as const;
const metalSurface = (color: RGB) =>
  ({ type: "metal", params: { color, roughness: 0.42, metallic: 1 } }) as const;

function beamXY(start: Point2, end: Point2, thickness: number, depth: number, z = 0): Mesh {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  return transform(box(thickness, length, depth), {
    rotate: vec3(0, 0, Math.atan2(-dx, dy)),
    translate: vec3((start.x + end.x) / 2, (start.y + end.y) / 2, z),
  });
}

function segmentedRing(
  radius: number,
  radialThickness: number,
  depth: number,
  z: number,
  segments: number,
  centerY: number,
  angleOffset: number,
): Mesh {
  const tangentLength = 2 * radius * Math.tan(Math.PI / segments) * 1.035;
  const pieces: Mesh[] = [];
  for (let index = 0; index < segments; index++) {
    const angle = angleOffset + (index / segments) * Math.PI * 2;
    pieces.push(transform(box(tangentLength, radialThickness, depth), {
      rotate: vec3(0, 0, angle - Math.PI / 2),
      translate: vec3(Math.cos(angle) * radius, centerY + Math.sin(angle) * radius, z),
    }));
  }
  return merge(...pieces);
}

function ringPair(
  radius: number,
  radialThickness: number,
  wheelWidth: number,
  segments: number,
  centerY: number,
  angleOffset: number,
): Mesh {
  const depth = Math.min(radialThickness * 0.78, wheelWidth * 0.28);
  const z = wheelWidth / 2 - depth / 2;
  return merge(
    segmentedRing(radius, radialThickness, depth, -z, segments, centerY, angleOffset),
    segmentedRing(radius, radialThickness, depth, z, segments, centerY, angleOffset),
  );
}

function buildSpokes(p: ProceduralWaterwheelParams, centerY: number): Mesh {
  const innerRadius = p.radius * 0.34;
  const outerRadius = p.radius - p.ringThickness * 0.62;
  const beamLength = outerRadius - innerRadius;
  const beamCenter = (outerRadius + innerRadius) / 2;
  const spokeWidth = Math.max(0.08, p.ringThickness * 0.58);
  const depth = Math.min(p.ringThickness * 0.62, p.wheelWidth * 0.22);
  const z = p.wheelWidth / 2 - depth / 2;
  const pieces: Mesh[] = [];
  for (let index = 0; index < p.spokeCount; index++) {
    const angle = p.wheelAngle + (index / p.spokeCount) * Math.PI * 2;
    for (const sideZ of [-z, z]) {
      pieces.push(transform(box(spokeWidth, beamLength, depth), {
        rotate: vec3(0, 0, angle - Math.PI / 2),
        translate: vec3(
          Math.cos(angle) * beamCenter,
          centerY + Math.sin(angle) * beamCenter,
          sideZ,
        ),
      }));
    }
  }
  return merge(...pieces);
}

function buildPaddles(p: ProceduralWaterwheelParams, centerY: number): Mesh {
  const pieces: Mesh[] = [];
  const mainLength = p.paddleLength * 0.76;
  const lipLength = p.paddleLength * 0.38;
  const depth = p.wheelWidth + p.ringThickness * 0.72;
  const thickness = Math.max(0.055, p.ringThickness * 0.3);
  const rootRadius = p.radius - p.ringThickness * 0.35;
  for (let index = 0; index < p.paddleCount; index++) {
    const angle = p.wheelAngle + (index / p.paddleCount) * Math.PI * 2;
    const radial = { x: Math.cos(angle), y: Math.sin(angle) };
    const root = { x: radial.x * rootRadius, y: centerY + radial.y * rootRadius };
    const tip = {
      x: root.x + radial.x * mainLength,
      y: root.y + radial.y * mainLength,
    };
    const bentAngle = angle + p.paddleBend;
    const lipEnd = {
      x: tip.x + Math.cos(bentAngle) * lipLength,
      y: tip.y + Math.sin(bentAngle) * lipLength,
    };
    pieces.push(beamXY(root, tip, thickness, depth));
    if (p.paddleBend > 0.01) pieces.push(beamXY(tip, lipEnd, thickness, depth));
  }
  return merge(...pieces);
}

function buildSupport(p: ProceduralWaterwheelParams, centerY: number): Mesh {
  const frameThickness = Math.max(0.12, p.ringThickness * 0.72);
  const supportZ = Math.max(p.wheelWidth / 2 + 0.28, p.axleLength * 0.36);
  const supportSpan = p.radius * 0.9;
  const topY = centerY + p.radius * 0.46;
  const pieces: Mesh[] = [];
  for (const z of [-supportZ, supportZ]) {
    pieces.push(
      beamXY({ x: -supportSpan, y: 0 }, { x: -p.radius * 0.2, y: topY }, frameThickness, frameThickness, z),
      beamXY({ x: supportSpan, y: 0 }, { x: p.radius * 0.2, y: topY }, frameThickness, frameThickness, z),
      transform(box(supportSpan * 2.25, frameThickness, frameThickness), {
        translate: vec3(0, frameThickness / 2, z),
      }),
      transform(box(p.radius * 1.25, frameThickness, frameThickness), {
        translate: vec3(0, centerY + p.radius * 0.35, z),
      }),
    );
  }
  for (const x of [-p.radius * 0.2, p.radius * 0.2]) {
    pieces.push(transform(box(frameThickness, frameThickness, supportZ * 2 + frameThickness), {
      translate: vec3(x, topY, 0),
    }));
  }
  return merge(...pieces);
}

function troughPoint(p: ProceduralWaterwheelParams, centerY: number, t: number): Point2 {
  const startX = -p.radius * 2.05;
  const endX = -p.radius * 0.32;
  const startY = centerY + p.radius * (1.18 + p.troughSlope);
  const endY = centerY + p.radius * 0.88;
  return {
    x: startX + (endX - startX) * t,
    y: startY + (endY - startY) * t - Math.sin(t * Math.PI) * p.radius * 0.055,
  };
}

function buildTrough(p: ProceduralWaterwheelParams, centerY: number): Mesh {
  const pieces: Mesh[] = [];
  const troughWidth = Math.max(0.48, p.wheelWidth * 0.82);
  const centerZ = -p.wheelWidth * 0.56;
  const boardThickness = Math.max(0.055, p.ringThickness * 0.28);
  const sideHeight = Math.max(0.2, p.ringThickness * 1.05);
  for (let index = 0; index < p.troughPlanks; index++) {
    const start = troughPoint(p, centerY, index / p.troughPlanks);
    const end = troughPoint(p, centerY, (index + 1) / p.troughPlanks);
    pieces.push(beamXY(start, end, boardThickness, troughWidth, centerZ));
    const raisedStart = { x: start.x, y: start.y + sideHeight * 0.4 };
    const raisedEnd = { x: end.x, y: end.y + sideHeight * 0.4 };
    pieces.push(
      beamXY(raisedStart, raisedEnd, sideHeight, boardThickness, centerZ - troughWidth / 2),
      beamXY(raisedStart, raisedEnd, sideHeight, boardThickness, centerZ + troughWidth / 2),
    );
  }
  return merge(...pieces);
}

function buildTroughSupports(p: ProceduralWaterwheelParams, centerY: number): Mesh {
  const pieces: Mesh[] = [];
  const troughWidth = Math.max(0.48, p.wheelWidth * 0.82);
  const centerZ = -p.wheelWidth * 0.56;
  const thickness = Math.max(0.1, p.ringThickness * 0.55);
  for (const t of [0.16, 0.72]) {
    const point = troughPoint(p, centerY, t);
    const height = Math.max(0.4, point.y - thickness * 0.5);
    for (const side of [-1, 1]) {
      pieces.push(transform(box(thickness, height, thickness), {
        translate: vec3(point.x, height / 2, centerZ + side * troughWidth * 0.48),
      }));
    }
  }
  return merge(...pieces);
}

function buildWater(p: ProceduralWaterwheelParams, centerY: number): Mesh {
  const pieces: Mesh[] = [];
  const troughWidth = Math.max(0.48, p.wheelWidth * 0.82);
  const centerZ = -p.wheelWidth * 0.56;
  for (let index = 0; index < p.troughPlanks; index++) {
    const start = troughPoint(p, centerY, index / p.troughPlanks);
    const end = troughPoint(p, centerY, (index + 1) / p.troughPlanks);
    const liftedStart = { x: start.x, y: start.y + 0.055 };
    const liftedEnd = { x: end.x, y: end.y + 0.055 };
    pieces.push(beamXY(liftedStart, liftedEnd, 0.045, troughWidth * 0.72, centerZ));
  }
  const outlet = troughPoint(p, centerY, 1);
  const wheelHit = { x: -p.radius * 0.62, y: centerY + p.radius * 0.62 };
  pieces.push(beamXY(outlet, wheelHit, 0.09, troughWidth * 0.64, centerZ));
  pieces.push(transform(box(p.radius * 1.15, 0.045, p.wheelWidth * 1.5), {
    translate: vec3(-p.radius * 0.48, 0.055, 0),
  }));
  pieces.push(transform(torus(p.radius * 0.34, 0.035, 32, 6), {
    translate: vec3(-p.radius * 0.48, 0.085, 0),
  }));
  return merge(...pieces);
}

export function buildProceduralWaterwheelParts(
  params: Partial<ProceduralWaterwheelParams> = {},
): NamedPart[] {
  const p = resolveParams(params);
  const centerY = p.radius + p.paddleLength + 0.22;
  const ringSegments = Math.max(16, p.paddleCount);
  const innerRadius = p.radius * 0.34;
  const innerThickness = Math.max(0.1, p.ringThickness * 0.66);
  const wheelDepth = Math.min(p.ringThickness * 0.78, p.wheelWidth * 0.28);
  const axle = transform(cylinder(p.axleRadius, p.axleLength, 20), {
    rotate: vec3(Math.PI / 2, 0, 0),
    translate: vec3(0, centerY, 0),
  });
  const hub = transform(cylinder(innerRadius * 0.32, p.wheelWidth + wheelDepth * 1.8, 20), {
    rotate: vec3(Math.PI / 2, 0, 0),
    translate: vec3(0, centerY, 0),
  });

  const parts: NamedPart[] = [
    {
      name: "outer_rings",
      label: "外轮圈",
      mesh: ringPair(p.radius, p.ringThickness, p.wheelWidth, ringSegments, centerY, p.wheelAngle),
      color: WOOD,
      surface: woodSurface(WOOD),
    },
    {
      name: "inner_rings",
      label: "内轮圈",
      mesh: ringPair(innerRadius, innerThickness, p.wheelWidth, ringSegments, centerY, p.wheelAngle),
      color: WOOD_DARK,
      surface: woodSurface(WOOD_DARK, 0.86),
    },
    {
      name: "spokes",
      label: "轮辐",
      mesh: buildSpokes(p, centerY),
      color: WOOD_LIGHT,
      surface: woodSurface(WOOD_LIGHT, 0.78),
    },
    {
      name: "paddles",
      label: "叶板",
      mesh: buildPaddles(p, centerY),
      color: WOOD,
      surface: woodSurface(WOOD, 0.88),
    },
    {
      name: "axle",
      label: "轮轴",
      mesh: merge(axle, hub),
      color: IRON,
      surface: metalSurface(IRON),
    },
    {
      name: "support_frame",
      label: "支撑架",
      mesh: merge(buildSupport(p, centerY), buildTroughSupports(p, centerY)),
      color: WOOD_DARK,
      surface: woodSurface(WOOD_DARK, 0.84),
    },
    {
      name: "trough",
      label: "曲线水槽",
      mesh: buildTrough(p, centerY),
      color: WOOD_LIGHT,
      surface: woodSurface(WOOD_LIGHT, 0.9),
    },
  ];
  if (p.water) {
    parts.push({
      name: "water",
      label: "水流示意",
      mesh: buildWater(p, centerY),
      color: WATER,
      surface: {
        type: "water",
        params: { color: WATER, roughness: 0.12, waveStrength: 0.16, flowSpeed: 1.15 },
      },
      doubleSided: true,
      metadata: { waterSystem: "procedural-waterwheel" },
    });
  }
  return parts.map((part) => ({
    ...part,
    metadata: {
      sourceStudy: SOURCE_URL,
      proceduralAssembly: "waterwheel",
      ...part.metadata,
    },
  }));
}
