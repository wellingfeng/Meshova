import {
  box,
  cylinder,
  merge,
  transform,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import { vec3 } from "../math/vec3.js";
import { buildRoofGeneratorMesh, type RoofGeneratorStyle } from "./roof-generator.js";

type RGB = [number, number, number];

export type ArchitecturalRoofKind = "shed" | "gable" | "hip" | "skylight-gable";

export type ArchitecturalRoofAnchorType =
  | "wall-top"
  | "ridge"
  | "gutter"
  | "downspout"
  | "skylight";

export interface ArchitecturalRoofParams {
  kind: ArchitecturalRoofKind;
  width: number;
  depth: number;
  baseHeight: number;
  rise: number;
  overhang: number;
  skylights: number;
  gutter: boolean;
  detail: number;
}

export interface ArchitecturalRoofDefinition {
  id: string;
  name: string;
  kind: ArchitecturalRoofKind;
  defaults: ArchitecturalRoofParams;
}

export interface ArchitecturalRoofAnchor {
  type: ArchitecturalRoofAnchorType;
  position: [number, number, number];
  direction: [number, number, number];
}

export interface ArchitecturalRoofIssue {
  code: "low-slope" | "skylight-clearance";
  severity: "warning" | "error";
  message: string;
}

export interface ArchitecturalRoofResult {
  parts: NamedPart[];
  anchors: ArchitecturalRoofAnchor[];
  issues: ArchitecturalRoofIssue[];
}

interface SkylightOpening {
  centerX: number;
  centerSlope: number;
  width: number;
  height: number;
}

const ROOF_TILE: RGB = [0.34, 0.11, 0.07];
const ROOF_METAL: RGB = [0.23, 0.27, 0.3];
const TRIM: RGB = [0.52, 0.48, 0.42];
const GUTTER: RGB = [0.22, 0.24, 0.25];
const GLASS: RGB = [0.28, 0.62, 0.72];
const WALL_PLATE: RGB = [0.43, 0.28, 0.14];

function definition(
  kind: ArchitecturalRoofKind,
  name: string,
  width: number,
  depth: number,
  rise: number,
  skylights: number,
): ArchitecturalRoofDefinition {
  return {
    id: `architectural-roof-${kind}`,
    name,
    kind,
    defaults: {
      kind,
      width,
      depth,
      baseHeight: 2.8,
      rise,
      overhang: 0.35,
      skylights,
      gutter: true,
      detail: 1,
    },
  };
}

export const ARCHITECTURAL_ROOF_MODELS: ArchitecturalRoofDefinition[] = [
  definition("shed", "带排水单坡屋顶", 5.2, 4.2, 1.05, 0),
  definition("gable", "模块化双坡屋顶", 6.4, 5.2, 1.7, 0),
  definition("hip", "自动收脊四坡屋顶", 6.8, 5.4, 1.55, 0),
  definition("skylight-gable", "真实开洞天窗双坡屋顶", 7.2, 5.8, 1.8, 2),
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolveParams(input: Partial<ArchitecturalRoofParams>): ArchitecturalRoofParams {
  const kind = input.kind ?? "skylight-gable";
  const definitionForKind = ARCHITECTURAL_ROOF_MODELS.find((entry) => entry.kind === kind)
    ?? ARCHITECTURAL_ROOF_MODELS[3]!;
  const defaults = definitionForKind.defaults;
  const width = Math.max(1.8, input.width ?? defaults.width);
  const maxSkylights = Math.max(1, Math.floor(width / 1.25));
  return {
    kind,
    width,
    depth: Math.max(1.6, input.depth ?? defaults.depth),
    baseHeight: Math.max(0.4, input.baseHeight ?? defaults.baseHeight),
    rise: Math.max(0.12, input.rise ?? defaults.rise),
    overhang: clamp(input.overhang ?? defaults.overhang, 0, 1.5),
    skylights: kind === "skylight-gable"
      ? clamp(Math.round(input.skylights ?? defaults.skylights), 1, maxSkylights)
      : 0,
    gutter: input.gutter ?? defaults.gutter,
    detail: clamp(input.detail ?? defaults.detail, 0, 1),
  };
}

function part(
  name: string,
  label: string,
  meshes: Mesh | Mesh[],
  color: RGB,
  materialSlot: string,
  surfaceType: string,
  metadata: Record<string, unknown> = {},
): NamedPart {
  const list = Array.isArray(meshes) ? meshes : [meshes];
  return {
    name,
    label,
    mesh: list.length === 1 ? list[0]! : merge(...list),
    color,
    surface: { type: surfaceType, params: { color, roughness: surfaceType === "glass" ? 0.12 : 0.66 } },
    metadata: { materialSlot, collision: surfaceType === "glass" ? "mesh" : "box", ...metadata },
  };
}

function moved(mesh: Mesh, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): Mesh {
  return transform(mesh, { translate: vec3(x, y, z), rotate: vec3(rx, ry, rz) });
}

function slopedPanel(
  panelWidth: number,
  slopeLength: number,
  centerX: number,
  centerSlope: number,
  fullHalfDepth: number,
  baseHeight: number,
  rise: number,
  side: -1 | 1,
  thickness: number,
  normalOffset = 0,
): Mesh {
  const roofAngle = Math.atan2(rise, fullHalfDepth);
  const rotationX = side * roofAngle;
  const slopeFraction = centerSlope / Math.hypot(fullHalfDepth, rise);
  const centerZ = side * fullHalfDepth * slopeFraction + Math.sin(rotationX) * normalOffset;
  const centerY = baseHeight + rise * (1 - slopeFraction) + Math.cos(rotationX) * normalOffset;
  return moved(box(panelWidth, thickness, slopeLength), centerX, centerY, centerZ, rotationX);
}

function skylightOpenings(params: ArchitecturalRoofParams, slopeLength: number): SkylightOpening[] {
  const usableWidth = params.width + params.overhang * 2 - 0.7;
  const openingWidth = Math.min(0.92, usableWidth / Math.max(1, params.skylights) * 0.62);
  const openingHeight = Math.min(1.18, slopeLength * 0.3);
  return Array.from({ length: params.skylights }, (_, index) => ({
    centerX: params.skylights === 1
      ? 0
      : -usableWidth * 0.36 + usableWidth * 0.72 * index / (params.skylights - 1),
    centerSlope: slopeLength * 0.56,
    width: openingWidth,
    height: openingHeight,
  }));
}

function buildSegmentedSkylightRoof(params: ArchitecturalRoofParams): {
  covering: Mesh[];
  glazing: Mesh[];
  frames: Mesh[];
  openings: SkylightOpening[];
} {
  const fullWidth = params.width + params.overhang * 2;
  const fullDepth = params.depth + params.overhang * 2;
  const halfDepth = fullDepth / 2;
  const slopeLength = Math.hypot(halfDepth, params.rise);
  const thickness = Math.max(0.065, Math.min(fullWidth, fullDepth) * 0.014);
  const openings = skylightOpenings(params, slopeLength);
  const openingStart = openings[0]!.centerSlope - openings[0]!.height / 2;
  const openingEnd = openings[0]!.centerSlope + openings[0]!.height / 2;
  const covering: Mesh[] = [
    slopedPanel(fullWidth, slopeLength, 0, slopeLength / 2, halfDepth, params.baseHeight, params.rise, -1, thickness),
    slopedPanel(fullWidth, openingStart, 0, openingStart / 2, halfDepth, params.baseHeight, params.rise, 1, thickness),
    slopedPanel(fullWidth, slopeLength - openingEnd, 0, (openingEnd + slopeLength) / 2, halfDepth, params.baseHeight, params.rise, 1, thickness),
  ];

  const sortedOpenings = [...openings].sort((left, right) => left.centerX - right.centerX);
  let segmentStart = -fullWidth / 2;
  for (const opening of sortedOpenings) {
    const openingLeft = opening.centerX - opening.width / 2;
    const segmentWidth = openingLeft - segmentStart;
    if (segmentWidth > 0.02) {
      covering.push(slopedPanel(segmentWidth, opening.height, segmentStart + segmentWidth / 2, opening.centerSlope, halfDepth, params.baseHeight, params.rise, 1, thickness));
    }
    segmentStart = opening.centerX + opening.width / 2;
  }
  const finalWidth = fullWidth / 2 - segmentStart;
  if (finalWidth > 0.02) {
    covering.push(slopedPanel(finalWidth, openings[0]!.height, segmentStart + finalWidth / 2, openings[0]!.centerSlope, halfDepth, params.baseHeight, params.rise, 1, thickness));
  }

  const frameThickness = Math.max(0.045, thickness * 0.72);
  const glazing: Mesh[] = [];
  const frames: Mesh[] = [];
  for (const opening of openings) {
    glazing.push(slopedPanel(opening.width * 0.9, opening.height * 0.9, opening.centerX, opening.centerSlope, halfDepth, params.baseHeight, params.rise, 1, 0.022, thickness * 0.92));
    frames.push(
      slopedPanel(frameThickness, opening.height, opening.centerX - opening.width / 2, opening.centerSlope, halfDepth, params.baseHeight, params.rise, 1, frameThickness, thickness * 1.18),
      slopedPanel(frameThickness, opening.height, opening.centerX + opening.width / 2, opening.centerSlope, halfDepth, params.baseHeight, params.rise, 1, frameThickness, thickness * 1.18),
      slopedPanel(opening.width, frameThickness, opening.centerX, opening.centerSlope - opening.height / 2, halfDepth, params.baseHeight, params.rise, 1, frameThickness, thickness * 1.18),
      slopedPanel(opening.width, frameThickness, opening.centerX, opening.centerSlope + opening.height / 2, halfDepth, params.baseHeight, params.rise, 1, frameThickness, thickness * 1.18),
    );
  }
  return { covering, glazing, frames, openings };
}

function wallPlate(params: ArchitecturalRoofParams): Mesh[] {
  const thickness = 0.1;
  return [
    moved(box(params.width, thickness, thickness), 0, params.baseHeight - thickness / 2, params.depth / 2),
    moved(box(params.width, thickness, thickness), 0, params.baseHeight - thickness / 2, -params.depth / 2),
    moved(box(thickness, thickness, params.depth), params.width / 2, params.baseHeight - thickness / 2, 0),
    moved(box(thickness, thickness, params.depth), -params.width / 2, params.baseHeight - thickness / 2, 0),
  ];
}

function ridgeCaps(params: ArchitecturalRoofParams): Mesh[] {
  const fullWidth = params.width + params.overhang * 2;
  const fullDepth = params.depth + params.overhang * 2;
  const thickness = 0.075;
  if (params.kind === "shed") {
    return [moved(box(fullWidth, thickness, thickness), 0, params.baseHeight + params.rise + 0.09, fullDepth / 2)];
  }
  if (params.kind === "hip") {
    if (fullWidth >= fullDepth) {
      return [moved(box(Math.max(0.12, fullWidth - fullDepth), thickness, thickness), 0, params.baseHeight + params.rise + 0.09, 0)];
    }
    return [moved(box(thickness, thickness, Math.max(0.12, fullDepth - fullWidth)), 0, params.baseHeight + params.rise + 0.09, 0)];
  }
  return [moved(box(fullWidth * 0.98, thickness, thickness), 0, params.baseHeight + params.rise + 0.09, 0)];
}

function drainageParts(params: ArchitecturalRoofParams): { gutters: Mesh[]; downspouts: Mesh[] } {
  if (!params.gutter) return { gutters: [], downspouts: [] };
  const fullWidth = params.width + params.overhang * 2;
  const fullDepth = params.depth + params.overhang * 2;
  const radius = 0.055;
  const gutterZ = params.kind === "shed" ? -fullDepth / 2 - radius * 1.5 : fullDepth / 2 + radius * 1.5;
  const gutterY = params.baseHeight - 0.13;
  const gutters = [moved(cylinder(radius, fullWidth, 12), 0, gutterY, gutterZ, 0, 0, Math.PI / 2)];
  if (params.kind !== "shed") {
    gutters.push(moved(cylinder(radius, fullWidth, 12), 0, gutterY, -gutterZ, 0, 0, Math.PI / 2));
  }
  const pipeHeight = Math.max(0.4, params.baseHeight - 0.12);
  const downspouts = [moved(cylinder(radius * 0.72, pipeHeight, 10), fullWidth / 2 - radius, pipeHeight / 2, gutterZ)];
  if (params.kind !== "shed") {
    downspouts.push(moved(cylinder(radius * 0.72, pipeHeight, 10), -fullWidth / 2 + radius, pipeHeight / 2, -gutterZ));
  }
  return { gutters, downspouts };
}

function anchors(params: ArchitecturalRoofParams, openings: SkylightOpening[]): ArchitecturalRoofAnchor[] {
  const fullWidth = params.width + params.overhang * 2;
  const fullDepth = params.depth + params.overhang * 2;
  const gutterOffset = 0.055 * 1.5;
  const gutterZ = params.kind === "shed" ? -fullDepth / 2 - gutterOffset : fullDepth / 2 + gutterOffset;
  const output: ArchitecturalRoofAnchor[] = [
    { type: "wall-top", position: [-params.width / 2, params.baseHeight, -params.depth / 2], direction: [0, -1, 0] },
    { type: "wall-top", position: [params.width / 2, params.baseHeight, -params.depth / 2], direction: [0, -1, 0] },
    { type: "wall-top", position: [params.width / 2, params.baseHeight, params.depth / 2], direction: [0, -1, 0] },
    { type: "wall-top", position: [-params.width / 2, params.baseHeight, params.depth / 2], direction: [0, -1, 0] },
    { type: "ridge", position: [0, params.baseHeight + params.rise, 0], direction: [1, 0, 0] },
  ];
  if (params.gutter) {
    output.push(
      { type: "gutter", position: [0, params.baseHeight - 0.13, gutterZ], direction: [1, 0, 0] },
      { type: "downspout", position: [fullWidth / 2, params.baseHeight - 0.13, gutterZ], direction: [0, -1, 0] },
    );
  }
  const halfDepth = fullDepth / 2;
  const slopeLength = Math.hypot(halfDepth, params.rise);
  for (const opening of openings) {
    const fraction = opening.centerSlope / slopeLength;
    output.push({
      type: "skylight",
      position: [opening.centerX, params.baseHeight + params.rise * (1 - fraction), halfDepth * fraction],
      direction: [0, Math.cos(Math.atan2(params.rise, halfDepth)), Math.sin(Math.atan2(params.rise, halfDepth))],
    });
  }
  return output;
}

function diagnostics(params: ArchitecturalRoofParams, openings: SkylightOpening[]): ArchitecturalRoofIssue[] {
  const issues: ArchitecturalRoofIssue[] = [];
  const run = params.kind === "shed" ? params.depth : params.depth / 2;
  if (params.rise / run < 0.18) {
    issues.push({ code: "low-slope", severity: "warning", message: "屋面坡度过低，排水和覆材搭接风险增加。" });
  }
  if (openings.some((opening) => opening.width < 0.45 || opening.height < 0.55)) {
    issues.push({ code: "skylight-clearance", severity: "error", message: "天窗净尺寸不足，减少数量或增大屋面。" });
  }
  return issues;
}

export function buildArchitecturalRoofSystem(input: Partial<ArchitecturalRoofParams> = {}): ArchitecturalRoofResult {
  const params = resolveParams(input);
  let openings: SkylightOpening[] = [];
  const parts: NamedPart[] = [
    part("wall_plates", "墙顶连接梁", wallPlate(params), WALL_PLATE, "structure", "wood"),
  ];

  if (params.kind === "skylight-gable") {
    const segmented = buildSegmentedSkylightRoof(params);
    openings = segmented.openings;
    parts.push(
      part("roof_covering", "分段开洞屋面", segmented.covering, ROOF_TILE, "roof", "ceramic", {
        openingMode: "segmented-covering",
        openings,
      }),
      part("skylight_glazing", "天窗玻璃", segmented.glazing, GLASS, "glazing", "glass", { openings }),
      part("skylight_frames", "天窗框", segmented.frames, ROOF_METAL, "skylight-frame", "metal"),
    );
  } else {
    const style: RoofGeneratorStyle = params.kind;
    const roof = buildRoofGeneratorMesh({
      style,
      width: params.width,
      depth: params.depth,
      wallHeight: params.baseHeight,
      roofHeight: params.rise,
      overhang: params.overhang,
      dormers: 0,
      chimney: false,
      rafters: false,
      seed: 0,
    });
    parts.push(part("roof_covering", "连续屋面", roof, params.kind === "shed" ? ROOF_METAL : ROOF_TILE, "roof", params.kind === "shed" ? "metal" : "ceramic"));
  }

  parts.push(part("ridge_caps", params.kind === "shed" ? "高侧收边" : "屋脊压条", ridgeCaps(params), TRIM, "roof-trim", "metal"));
  const drainage = drainageParts(params);
  if (drainage.gutters.length > 0) {
    parts.push(
      part("gutters", "檐沟", drainage.gutters, GUTTER, "gutter", "metal"),
      part("downspouts", "落水管", drainage.downspouts, GUTTER, "downspout", "metal"),
    );
  }

  if (params.detail >= 0.5) {
    const fullWidth = params.width + params.overhang * 2;
    const fullDepth = params.depth + params.overhang * 2;
    parts.push(part("fascia", "檐口封边", [
      moved(box(fullWidth, 0.1, 0.055), 0, params.baseHeight - 0.2, fullDepth / 2 - 0.08),
      moved(box(fullWidth, 0.1, 0.055), 0, params.baseHeight - 0.2, -fullDepth / 2 + 0.08),
    ], TRIM, "fascia", "wood"));
  }

  const resolvedAnchors = anchors(params, openings);
  const issues = diagnostics(params, openings);
  return {
    parts: parts.map((entry) => ({
      ...entry,
      metadata: {
        ...entry.metadata,
        proceduralFamily: "architectural-roof-system",
        roofKind: params.kind,
        anchors: resolvedAnchors,
        issues,
      },
    })),
    anchors: resolvedAnchors,
    issues,
  };
}

export function buildArchitecturalRoofParts(input: Partial<ArchitecturalRoofParams> = {}): NamedPart[] {
  return buildArchitecturalRoofSystem(input).parts;
}
