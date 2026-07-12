/**
 * High-level plant builders: tree / shrub / grass — SpeedTree's three forms,
 * all expressed through one generator by parameter alone.
 *
 *  - tree:  one tapered trunk + recursive branches + shaped leaves
 *  - shrub: several short trunks (clump) + shallow branches + dense leaves
 *  - grass: no branches — many bent blades scattered over an area
 *
 * Each builder returns a small struct of named meshes so the caller can assign
 * bark vs leaf materials. Determinism: one seed drives the whole plant.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3, add, scale, normalize } from "../math/vec3.js";
import type { Curve } from "../geometry/curve.js";
import { polyline, bezier, sweep } from "../geometry/curve.js";
import type { Mesh } from "../geometry/mesh.js";
import { merge } from "../geometry/mesh.js";
import { makeRng } from "../random/prng.js";
import { gnarlCurve, curveFrameAt } from "./curve-frame.js";
import {
  growBranches,
  branchesToMesh,
  sweepBarkTube,
  type BarkUvOptions,
  type BranchLevelOptions,
  type BranchPlacementMode,
  type BranchSegment,
  type BranchMeshOptions,
  type GrowBranchesOptions,
} from "./branch.js";
import { scatterLeaves, type LeafShape, type ScatterLeavesOptions } from "./leaf.js";
import { frond, needleCluster } from "./frond.js";
import { shapeBranchesToEnvelope, type CanopyEnvelope } from "./envelope.js";
import { shapeBranchesToTrellis, type TrellisEnvelope } from "./trellis.js";
import { branchFeatureMeshes, type BranchFeatureOptions } from "./feature.js";
import type { Curve1DInput } from "./curve-param.js";

export interface PlantResult {
  /** Woody parts (trunk + branches) — assign a bark material. */
  wood: Mesh;
  /** Leaf blades — assign a thin/translucent leaf material. */
  leaves: Mesh;
  /** Optional bark details such as knots, scars, and burls. */
  features?: Mesh;
  /** All branch segments (for inspection / further scatter). */
  branches: BranchSegment[];
}

export interface TreeOptions {
  seed?: number;
  /** Optional guide spine. Use image/VLM extracted trunk instead of a straight trunk. */
  trunkCurve?: Curve;
  /** Trunk height in world units. */
  height?: number;
  /** Trunk base radius. */
  trunkRadius?: number;
  /** Trunk wobble amount. */
  gnarl?: number;
  /** Number of first-order branches. */
  branchCount?: number;
  /** Recursion depth of branching. */
  depth?: number;
  /** ez-tree-style authoring params; per-level values override branchCount/depth/etc. */
  authoring?: TreeAuthoringOptions;
  /** Branch + leaf placement mode. */
  placement?: BranchPlacementMode;
  /** Branch out-going angle (degrees). */
  branchAngle?: number;
  /** Bend branches toward +Y light. */
  branchPhototropism?: number;
  /** Bend branches toward -Y gravity. */
  branchGravity?: number;
  /** Base child branch length multiplier. */
  branchLengthScale?: number;
  /** Leaves per terminal branch. */
  leafDensity?: number;
  /** Leaf card size. */
  leafSize?: number;
  /** Set false to omit leaves (bare/winter tree). */
  leaves?: boolean;
  /** Leaf silhouette. Defaults to "oval"; "quad" keeps classic crossed cards. */
  leafShape?: LeafShape;
  /** Tip curl for shaped leaves. */
  leafCurl?: number;
  /** Side fold for shaped leaves. */
  leafFold?: number;
  /** Add flared bark collars at branch roots. */
  branchFlare?: boolean;
  /** Root collar radius multiplier. */
  branchFlareScale?: number;
  /** Bark-friendly UV repeat mode for trunk + branches. */
  barkUv?: boolean | BarkUvOptions;
  /** SpeedTree-style branch length multiplier over parent t. */
  branchLengthProfile?: Curve1DInput;
  /** SpeedTree-style branch radius multiplier over parent t. */
  branchRadiusProfile?: Curve1DInput;
  /** SpeedTree-style branch angle multiplier over parent t. */
  branchAngleProfile?: Curve1DInput;
  /** SpeedTree-style child count multiplier over recursion depth. */
  branchCountProfile?: Curve1DInput;
  /** Leaf count multiplier over terminal branch attachment t. */
  leafDensityProfile?: Curve1DInput;
  /** Clamp branch tips into a crown silhouette. */
  canopy?: CanopyEnvelope;
  /** Pull branch curves toward wall/grid/wire support. */
  trellis?: TrellisEnvelope;
  /** Add knots/scars/burls on branches. */
  branchFeatures?: boolean | BranchFeatureOptions;
  /** Fake leaf normals into a rounded crown for fuller lighting. */
  roundedLeafNormals?: boolean;
}

export interface TreeAuthoringOptions {
  /** Per-generation branch params, level 0 = first-order branches off trunk. */
  levels?: BranchLevelOptions[];
  placement?: BranchPlacementMode;
  barkUv?: boolean | BarkUvOptions;
  leafPlacement?: BranchPlacementMode;
  roundedLeafNormals?: boolean;
  trellis?: TrellisEnvelope;
}

/** Build a single-trunk tree. */
export function tree(opts: TreeOptions = {}): PlantResult {
  const seed = opts.seed ?? 1;
  const height = opts.height ?? (opts.trunkCurve ? curveYSpan(opts.trunkCurve) : 4);
  const trunkRadius = opts.trunkRadius ?? 0.28;
  const rng = makeRng(seed);
  const barkUv = opts.barkUv ?? opts.authoring?.barkUv;

  // Trunk: vertical polyline, gnarled, swept with taper + root flare.
  const raw = opts.trunkCurve ?? polyline([vec3(0, 0, 0), vec3(0, height * 0.5, 0), vec3(0, height, 0)]);
  const trunkCurve = gnarlCurve(raw, { seed: (rng.next() * 1e9) | 0, amount: (opts.gnarl ?? 0.12) * height * 0.15 });
  const trunkSweep = {
    sides: 8,
    radius: trunkRadius,
    radiusAt: (t: number) => trunkTaper(t),
    caps: true,
  };
  const trunkMesh = barkUv ? sweepBarkTube(trunkCurve, { ...trunkSweep, barkUv: barkUv === true ? {} : barkUv }) : sweep(trunkCurve, trunkSweep);

  const growOpts: GrowBranchesOptions = {
    seed: (rng.next() * 1e9) | 0,
    count: opts.authoring?.levels?.[0]?.count ?? opts.authoring?.levels?.[0]?.children ?? opts.branchCount ?? 7,
    depth: authoringDepth(opts.authoring, opts.depth),
    angle: opts.branchAngle ?? 48,
    phototropism: opts.branchPhototropism ?? 0.4,
    gravity: opts.branchGravity ?? 0.08,
    startPct: 0.35,
    endPct: 0.96,
    radiusScale: 0.58,
    lengthScale: opts.branchLengthScale ?? 0.7,
  };
  const branchPlacement = opts.placement ?? opts.authoring?.placement;
  if (branchPlacement !== undefined) growOpts.placement = branchPlacement;
  if (opts.authoring?.levels !== undefined) growOpts.levels = opts.authoring.levels;
  if (opts.branchLengthProfile !== undefined) growOpts.lengthProfile = opts.branchLengthProfile;
  if (opts.branchRadiusProfile !== undefined) growOpts.radiusProfile = opts.branchRadiusProfile;
  if (opts.branchAngleProfile !== undefined) growOpts.angleProfile = opts.branchAngleProfile;
  if (opts.branchCountProfile !== undefined) growOpts.countProfile = opts.branchCountProfile;
  let branches = growBranches(trunkCurve, trunkRadius, growOpts);
  branches = shapeBranchesToEnvelope(branches, opts.canopy);
  branches = shapeBranchesToTrellis(branches, opts.trellis ?? opts.authoring?.trellis);
  const branchMeshOpts: BranchMeshOptions = {
    sides: 6,
    flare: opts.branchFlare ?? true,
  };
  if (opts.branchFlareScale !== undefined) branchMeshOpts.flareScale = opts.branchFlareScale;
  if (barkUv !== undefined) branchMeshOpts.barkUv = barkUv;
  const branchMesh = branchesToMesh(branches, branchMeshOpts);
  const featureOpts = opts.branchFeatures === true ? {} : opts.branchFeatures;
  const features = featureOpts
    ? branchFeatureMeshes(branches, { seed: (rng.next() * 1e9) | 0, ...featureOpts })
    : merge();
  const wood = merge(trunkMesh, branchMesh, features);

  const leafDensity = opts.leafDensity ?? 8;
  const wantLeaves = (opts.leaves ?? true) && leafDensity > 0;
  let leaves = merge();
  if (wantLeaves) {
    const leafOpts: ScatterLeavesOptions = {
      seed: (rng.next() * 1e9) | 0,
      perBranch: leafDensity,
      size: opts.leafSize ?? 0.18,
      upBias: 0.45,
      cross: opts.leafShape === "quad",
      shape: opts.leafShape ?? "oval",
    };
    const leafPlacement = opts.authoring?.leafPlacement ?? opts.placement ?? opts.authoring?.placement;
    const roundedNormals = opts.roundedLeafNormals ?? opts.authoring?.roundedLeafNormals;
    if (leafPlacement !== undefined) leafOpts.placement = leafPlacement;
    if (roundedNormals !== undefined) leafOpts.roundedNormals = roundedNormals;
    if (opts.leafDensityProfile !== undefined) leafOpts.densityProfile = opts.leafDensityProfile;
    if (opts.leafCurl !== undefined) leafOpts.curl = opts.leafCurl;
    if (opts.leafFold !== undefined) leafOpts.fold = opts.leafFold;
    leaves = scatterLeaves(branches, leafOpts);
  }

  return opts.branchFeatures ? { wood, leaves, branches, features } : { wood, leaves, branches };
}

function authoringDepth(authoring: TreeAuthoringOptions | undefined, fallback?: number): number {
  return authoring?.levels && authoring.levels.length > 0 ? authoring.levels.length : fallback ?? 3;
}

function curveYSpan(curve: Curve): number {
  if (curve.points.length === 0) return 4;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of curve.points) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return Math.max(1e-4, maxY - minY);
}

/** Root-flared, tapering trunk profile. */
function trunkTaper(t: number): number {
  const flare = t < 0.12 ? 1 + (0.12 - t) / 0.12 * 0.6 : 1; // base widens
  const taper = 1 - 0.78 * (t * t * (3 - 2 * t)); // smooth narrowing to top
  return flare * taper;
}

export interface ShrubOptions {
  seed?: number;
  height?: number;
  /** Number of stems in the clump. */
  stems?: number;
  stemRadius?: number;
  spread?: number;
  leafDensity?: number;
  leafSize?: number;
  leafShape?: LeafShape;
  leafCurl?: number;
  leafFold?: number;
  branchFlare?: boolean;
}

/** Build a multi-stem shrub (no dominant trunk, dense foliage). */
export function shrub(opts: ShrubOptions = {}): PlantResult {
  const seed = opts.seed ?? 2;
  const height = opts.height ?? 1.4;
  const stems = Math.max(2, Math.floor(opts.stems ?? 5));
  const stemRadius = opts.stemRadius ?? 0.06;
  const spread = opts.spread ?? 0.25;
  const rng = makeRng(seed);

  const woods: Mesh[] = [];
  const allBranches: BranchSegment[] = [];
  for (let i = 0; i < stems; i++) {
    const a = (i / stems) * Math.PI * 2 + rng.next();
    const r = spread * rng.next();
    const base = vec3(Math.cos(a) * r, 0, Math.sin(a) * r);
    const topLean = vec3(Math.cos(a) * spread * 1.5, height * (0.8 + rng.next() * 0.4), Math.sin(a) * spread * 1.5);
    const stemCurve = gnarlCurve(polyline([base, add(base, scale(add(topLean, scale(base, -1)), 0.5)), topLean]), {
      seed: (rng.next() * 1e9) | 0,
      amount: 0.06,
    });
    woods.push(sweep(stemCurve, { sides: 5, radius: stemRadius, radiusAt: (t) => 1 - 0.7 * t, caps: false }));
    const br = growBranches(stemCurve, stemRadius, {
      seed: (rng.next() * 1e9) | 0,
      count: 4,
      depth: 2,
      angle: 55,
      phototropism: 0.5,
      gravity: 0.05,
      radiusScale: 0.55,
      lengthScale: 0.6,
    });
    woods.push(branchesToMesh(br, { sides: 4, flare: opts.branchFlare ?? true }));
    for (const b of br) allBranches.push(b);
  }
  const wood = merge(...woods);
  const leafOpts: ScatterLeavesOptions = {
    seed: (rng.next() * 1e9) | 0,
    perBranch: opts.leafDensity ?? 10,
    size: opts.leafSize ?? 0.12,
    upBias: 0.5,
    cross: opts.leafShape === "quad",
    shape: opts.leafShape ?? "oval",
  };
  if (opts.leafCurl !== undefined) leafOpts.curl = opts.leafCurl;
  if (opts.leafFold !== undefined) leafOpts.fold = opts.leafFold;
  const leaves = scatterLeaves(allBranches, leafOpts);
  return { wood, leaves, branches: allBranches };
}

export interface GrassOptions {
  seed?: number;
  /** Number of blades. */
  blades?: number;
  /** Area side length (blades scattered in a square XZ patch). */
  area?: number;
  /** Blade height. */
  height?: number;
  /** Lateral bend at the tip. */
  bend?: number;
  /** Blade width. */
  width?: number;
}

/**
 * Build a grass patch: many thin bent blades scattered over a square area.
 * Each blade is a 3-point bezier swept with a narrow, flat-ish profile.
 */
export function grass(opts: GrassOptions = {}): PlantResult {
  const seed = opts.seed ?? 3;
  const blades = Math.max(1, Math.floor(opts.blades ?? 200));
  const area = opts.area ?? 2;
  const height = opts.height ?? 0.4;
  const bend = opts.bend ?? 0.25;
  const width = opts.width ?? 0.012;
  const rng = makeRng(seed);

  const meshes: Mesh[] = [];
  for (let i = 0; i < blades; i++) {
    const x = (rng.next() - 0.5) * area;
    const z = (rng.next() - 0.5) * area;
    const root = vec3(x, 0, z);
    const h = height * (0.6 + rng.next() * 0.8);
    const dirA = rng.next() * Math.PI * 2;
    const b = bend * (0.5 + rng.next());
    const tip = add(root, vec3(Math.cos(dirA) * b, h, Math.sin(dirA) * b));
    const blade = bezier(
      root,
      add(root, vec3(Math.cos(dirA) * b * 0.2, h * 0.55, Math.sin(dirA) * b * 0.2)),
      add(root, vec3(Math.cos(dirA) * b * 0.6, h * 0.85, Math.sin(dirA) * b * 0.6)),
      tip,
      5,
    );
    meshes.push(sweep(blade, { sides: 3, radius: width, radiusAt: (t) => 1 - 0.85 * t, caps: false }));
  }
  const leaves = meshes.length ? merge(...meshes) : merge();
  // Grass is "all leaf": wood is empty, foliage holds the blades.
  return { wood: merge(), leaves, branches: [] };
}

export interface ConiferOptions {
  seed?: number;
  /** Trunk height. */
  height?: number;
  trunkRadius?: number;
  /** Number of whorls (tiers of branches) up the trunk. */
  whorls?: number;
  /** Branches per whorl. */
  perWhorl?: number;
  /** Needle clusters distributed along each branch. */
  needleDensity?: number;
}

/**
 * Build a conical conifer (pine/spruce): a straight trunk with downward-drooping
 * branch whorls that shorten toward the top, each clad in needle clusters.
 * Classic Christmas-tree silhouette, fully procedural.
 */
export function conifer(opts: ConiferOptions = {}): PlantResult {
  const seed = opts.seed ?? 1;
  const height = opts.height ?? 5;
  const trunkRadius = opts.trunkRadius ?? 0.16;
  const whorls = Math.max(3, Math.floor(opts.whorls ?? 9));
  const perWhorl = Math.max(3, Math.floor(opts.perWhorl ?? 6));
  const needleDensity = Math.max(2, Math.floor(opts.needleDensity ?? 5));
  const rng = makeRng(seed);

  const trunkCurve = polyline([vec3(0, 0, 0), vec3(0, height * 0.5, 0), vec3(0, height, 0)]);
  const trunkMesh = sweep(trunkCurve, { sides: 7, radius: trunkRadius, radiusAt: (t) => 1 - 0.9 * t, caps: true });

  const woods: Mesh[] = [trunkMesh];
  const needleMeshes: Mesh[] = [];
  for (let w = 0; w < whorls; w++) {
    const wt = w / (whorls - 1); // 0 base -> 1 top
    const y = height * (0.12 + wt * 0.85);
    // Branch length shrinks toward the top for the cone profile.
    const branchLen = height * 0.4 * (1 - wt) + 0.15;
    const droop = 0.25 + wt * 0.15; // upper branches droop a bit more
    const yawOffset = w * GOLDEN_ANGLE_LOCAL;
    for (let b = 0; b < perWhorl; b++) {
      const a = yawOffset + (b / perWhorl) * Math.PI * 2;
      const outDir = vec3(Math.cos(a), -droop, Math.sin(a));
      const base = vec3(0, y, 0);
      const tip = add(base, scale(normalize(outDir), branchLen));
      const branchCurve = bezier(
        base,
        add(base, scale(normalize(outDir), branchLen * 0.4)),
        add(base, scale(normalize(add(outDir, vec3(0, -0.2, 0))), branchLen * 0.75)),
        tip,
        5,
      );
      woods.push(sweep(branchCurve, { sides: 4, radius: trunkRadius * 0.3 * (1 - wt * 0.6), radiusAt: (t) => 1 - 0.85 * t, caps: false }));
      // Needle clusters along the branch.
      for (let n = 0; n < needleDensity; n++) {
        const t = 0.25 + 0.7 * (n / needleDensity);
        const frame = curveFrameAt(branchCurve, t);
        needleMeshes.push(
          needleCluster(frame.position, normalize(add(frame.tangent, vec3(0, 0.3, 0))), {
            seed: (rng.next() * 1e9) | 0,
            count: 6,
            length: 0.16 * (1 - wt * 0.4),
            spread: 0.6,
          }),
        );
      }
    }
  }
  return { wood: merge(...woods), leaves: needleMeshes.length ? merge(...needleMeshes) : merge(), branches: [] };
}

export interface PalmOptions {
  seed?: number;
  /** Trunk height. */
  height?: number;
  trunkRadius?: number;
  /** Number of fronds in the crown. */
  fronds?: number;
  /** Frond length. */
  frondLength?: number;
  leafletPairs?: number;
  leafletLength?: number;
  leafletWidth?: number;
  leafletShape?: LeafShape;
  leafletFold?: number;
  leafletCurl?: number;
  /** Lean of the trunk (world units of horizontal offset at the top). */
  lean?: number;
}

/**
 * Build a palm: a tall, slightly leaning, ringed trunk topped by a crown of
 * arching fronds. Uses the frond system for the leaves.
 */
export function palm(opts: PalmOptions = {}): PlantResult {
  const seed = opts.seed ?? 1;
  const height = opts.height ?? 5;
  const trunkRadius = opts.trunkRadius ?? 0.14;
  const frondCount = Math.max(4, Math.floor(opts.fronds ?? 9));
  const frondLength = opts.frondLength ?? 1.8;
  const lean = opts.lean ?? 0.4;
  const rng = makeRng(seed);

  // Leaning trunk: a gentle bezier from base to crown.
  const crown = vec3(lean, height, lean * 0.3);
  const trunkCurve = bezier(
    vec3(0, 0, 0),
    vec3(lean * 0.1, height * 0.4, 0),
    vec3(lean * 0.5, height * 0.8, lean * 0.2),
    crown,
    8,
  );
  const trunkMesh = sweep(trunkCurve, { sides: 8, radius: trunkRadius, radiusAt: (t) => (1 - 0.35 * t) * (1 + 0.04 * Math.sin(t * 30)), caps: true });

  const frondStems: Mesh[] = [trunkMesh];
  const frondBlades: Mesh[] = [];
  const topFrame = curveFrameAt(trunkCurve, 1);
  for (let i = 0; i < frondCount; i++) {
    const a = (i / frondCount) * Math.PI * 2 + rng.next() * 0.3;
    // Each frond arcs outward and droops under its own weight.
    const outDir = vec3(Math.cos(a), 0.5, Math.sin(a));
    const start = topFrame.position;
    const mid = add(start, scale(normalize(outDir), frondLength * 0.5));
    const tip = add(add(start, scale(normalize(vec3(Math.cos(a), -0.1, Math.sin(a))), frondLength)), vec3(0, -frondLength * 0.25, 0));
    const rachis = bezier(start, add(start, scale(normalize(add(outDir, vec3(0, 0.5, 0))), frondLength * 0.35)), mid, tip, 8);
    const frondOpts = {
      seed: (rng.next() * 1e9) | 0,
      pairs: opts.leafletPairs ?? 16,
      leafletLength: opts.leafletLength ?? 0.5,
      leafletWidth: opts.leafletWidth ?? 0.05,
      roundedNormals: true,
      angle: 35,
      rachisRadius: 0.025,
    };
    (frondOpts as typeof frondOpts & { leafletShape: LeafShape }).leafletShape = opts.leafletShape ?? "lanceolate";
    if (opts.leafletFold !== undefined) {
      (frondOpts as typeof frondOpts & { leafletFold: number }).leafletFold = opts.leafletFold;
    }
    if (opts.leafletCurl !== undefined) {
      (frondOpts as typeof frondOpts & { leafletCurl: number }).leafletCurl = opts.leafletCurl;
    }
    const f = frond(rachis, frondOpts);
    frondStems.push(f.stem);
    frondBlades.push(f.blades);
  }
  return { wood: merge(...frondStems), leaves: frondBlades.length ? merge(...frondBlades) : merge(), branches: [] };
}

/** Local golden-angle constant (avoid cross-module import churn). */
const GOLDEN_ANGLE_LOCAL = Math.PI * (3 - Math.sqrt(5));
