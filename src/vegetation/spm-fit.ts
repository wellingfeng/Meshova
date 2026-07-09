/**
 * SPM structural feature -> Meshova tree params mapping.
 *
 * A SpeedTree .spm is gzip-compressed SpeedTree XML. Offline, we extract only
 * STRUCTURAL STATISTICS from it (per-level branch counts, length ratios, leaf
 * counts, angles) — never geometry or textures. This module maps that
 * `SpmTreeFeature` onto Meshova's native SpeedTreeLibraryParams so the fitting
 * loop starts from a near-truth configuration instead of blind defaults.
 *
 * No SpeedTree asset is copied or shipped; the output is pure Meshova params.
 */
import type { SpeedTreeLibraryParams } from "./library.js";

/** One branch generation's real statistics, read from SPM Node instances. */
export interface SpmLevelFeature {
  level: number;
  name: string;
  /** Total Node instances of this generator across the whole tree. */
  instances: number;
  /** instances / parent-level instances (average children per parent). */
  childrenPerParent?: number;
  /** Spine:Length of this level / trunk length. */
  lengthRatio?: number;
  /** Spine start angle from parent, degrees. */
  startAngle?: number;
  bifChance?: number;
  bifAngle?: number;
  flares?: number;
}

/** Compact structural fingerprint of one SPM tree. */
export interface SpmTreeFeature {
  source?: Record<string, unknown>;
  /** Trunk Spine:Length in SPM units (arbitrary, used for ratios only). */
  trunkLength: number;
  /** Number of Spine branch generations. */
  depth: number;
  hasLeaf: boolean;
  hasFrond: boolean;
  leafSize?: number;
  leafAspect?: number;
  leafInstances: number;
  frondInstances: number;
  levels: SpmLevelFeature[];
}

/** Result of mapping an SPM feature into Meshova param space. */
export interface SpmFitSeed {
  /** Param overrides to merge onto defaultSpeedTreeLibraryParams. */
  params: Partial<SpeedTreeLibraryParams>;
  /** Human-readable notes on what drove each value (for the report). */
  notes: string[];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Map an SPM structural feature onto SpeedTreeLibraryParams overrides.
 *
 * The mapping is deliberately conservative — SPM units are arbitrary, so we use
 * RATIOS and COUNTS, not absolute sizes. Absolute height stays with the
 * recipe/reference-image aspect; SPM drives relative structure:
 *  - first-order branch count  -> branchCount multiplier
 *  - crown length ratios       -> crownScale / crownDepth
 *  - leaf instance density     -> leafDensity multiplier
 *  - leaf card size/aspect     -> leafSize
 *  - branch start angle        -> branchAngle offset
 */
export function spmFeatureToParams(feature: SpmTreeFeature): SpmFitSeed {
  const notes: string[] = [];
  const params: Partial<SpeedTreeLibraryParams> = {};

  // Spine levels below the trunk (level >= 1 excluding the trunk itself).
  const spineLevels = feature.levels.filter((l) => l.level >= 1);
  const trunk = spineLevels.find((l) => /trunk|base|stem/i.test(l.name)) ?? spineLevels[0];
  // First-order branches = children of the trunk.
  const firstOrder = spineLevels
    .filter((l) => l !== trunk && (l.level === (trunk?.level ?? 1) + 1 || l.level === 2))
    .sort((a, b) => (b.instances ?? 0) - (a.instances ?? 0))[0];

  if (firstOrder && firstOrder.childrenPerParent) {
    // Meshova baseline first-order branchCount is ~9; scale toward SPM's real count.
    const real = firstOrder.childrenPerParent;
    const mult = clamp(real / 9, 0.35, 2.2);
    params.branchCount = round2(mult);
    notes.push(`一级分支数≈${real.toFixed(1)} → branchCount×${params.branchCount}`);
  }

  // Crown breadth from first-order branch length relative to trunk: long primary
  // branches = wider crown. Twig-level ratios are too noisy, so use the first
  // order (or the longest available spine level under the trunk).
  const breadth = (firstOrder && firstOrder.lengthRatio)
    ? firstOrder.lengthRatio
    : spineLevels.filter((l) => l !== trunk).map((l) => l.lengthRatio ?? 0).sort((a, b) => b - a)[0];
  if (breadth && breadth > 0) {
    // SPM branch length ratios commonly run 0.4..2.5x trunk; normalize to crown scale.
    const cs = clamp(0.55 + Math.min(breadth, 2.5) * 0.32, 0.5, 1.7);
    params.crownScale = round2(cs);
    params.crownDepth = round2(clamp(cs * 0.92, 0.4, 1.6));
    notes.push(`一级枝长比≈${breadth.toFixed(2)} → crownScale ${params.crownScale}`);
  }

  // Leaf density from real leaf instance count.
  if (feature.hasLeaf && feature.leafInstances > 0) {
    // Reference: ~2000 leaf cards ≈ dense. Map log-scaled.
    const d = clamp(Math.log10(feature.leafInstances + 1) / Math.log10(3000), 0.4, 1.0);
    params.leafDensity = round2(0.7 + d * 1.6);
    notes.push(`叶实例=${feature.leafInstances} → leafDensity×${params.leafDensity}`);
  }

  // Leaf size / aspect (SPM Leaves:Size is in model units; use as relative hint).
  if (feature.leafSize && feature.leafSize > 0) {
    const ls = clamp(feature.leafSize / 6, 0.4, 2.2);
    params.leafSize = round2(ls);
    notes.push(`SPM 叶尺寸=${feature.leafSize} → leafSize×${params.leafSize}`);
  }

  // Branch start angle. SPM Spine:Start angle is a normalized 0..1 fraction, not
  // degrees. Map 0..1 -> ~20..80deg, then express as an offset from Meshova's
  // ~52deg baseline.
  if (firstOrder && typeof firstOrder.startAngle === "number" && firstOrder.startAngle > 0) {
    const deg = 20 + clamp(firstOrder.startAngle, 0, 1) * 60;
    const off = clamp(Math.round(deg - 52), -35, 35);
    if (Math.abs(off) > 4) {
      params.branchAngle = off;
      notes.push(`SPM 起始角=${firstOrder.startAngle} → ~${deg.toFixed(0)}° → branchAngle ${off > 0 ? "+" : ""}${off}`);
    }
  }

  return { params, notes };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
