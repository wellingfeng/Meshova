import type { Vec3 } from "../math/vec3.js";
import { vec3 } from "../math/vec3.js";
import { polyline } from "../geometry/curve.js";
import { tree, type PlantResult, type TreeOptions } from "./plant.js";
import type { CanopyEnvelope, CanopyEnvelopeShape } from "./envelope.js";

export interface TreeGuide {
  /** Trunk or main stem spine from image/VLM/rough mesh analysis. */
  trunk: ReadonlyArray<Vec3>;
  /** Target crown silhouette. */
  canopy?: CanopyEnvelope;
  branchCount?: number;
  depth?: number;
  branchAngle?: number;
}

export interface TreeGuideSilhouetteOptions {
  height?: number;
  crownWidth?: number;
  crownDepth?: number;
  trunkLean?: number;
  crownBasePct?: number;
  shape?: CanopyEnvelopeShape;
}

export function treeGuideFromSilhouette(opts: TreeGuideSilhouetteOptions = {}): TreeGuide {
  const height = opts.height ?? 4;
  const lean = opts.trunkLean ?? 0;
  const crownBasePct = opts.crownBasePct ?? 0.28;
  const crownWidth = opts.crownWidth ?? height * 0.75;
  const crownDepth = opts.crownDepth ?? crownWidth;
  return {
    trunk: [
      vec3(0, 0, 0),
      vec3(lean * 0.25, height * 0.45, 0),
      vec3(lean, height, lean * 0.15),
    ],
    canopy: {
      shape: opts.shape ?? "ellipsoid",
      center: vec3(lean * 0.55, 0, 0),
      baseY: height * crownBasePct,
      height: height * (1 - crownBasePct),
      radiusX: crownWidth * 0.5,
      radiusZ: crownDepth * 0.5,
      // Soft clamp: only rein tips that clearly spear outside the crown, and
      // never pull them all the way to the axis. A high strength + a spindly
      // top profile is what wove the old canopies into inward "birdcages".
      strength: 0.55,
      minScale: 0.4,
    },
  };
}

export function buildTreeFromGuide(
  guide: TreeGuide,
  opts: TreeOptions = {},
): PlantResult {
  const guided: TreeOptions = {
    ...opts,
    trunkCurve: polyline(guide.trunk.map((p) => ({ ...p }))),
  };
  if (guide.canopy && opts.canopy === undefined) guided.canopy = guide.canopy;
  if (guide.branchCount !== undefined && opts.branchCount === undefined) guided.branchCount = guide.branchCount;
  if (guide.depth !== undefined && opts.depth === undefined) guided.depth = guide.depth;
  if (guide.branchAngle !== undefined && opts.branchAngle === undefined) guided.branchAngle = guide.branchAngle;
  return tree(guided);
}
