import type { Mesh } from "../geometry/mesh.js";
import { merge, vertexCount } from "../geometry/mesh.js";
import { tree, type PlantResult, type TreeOptions } from "./plant.js";
import { billboardImposter } from "./imposter.js";

export interface TreeLODOptions extends TreeOptions {
  highDistance?: number;
  midDistance?: number;
  lowDistance?: number;
  imposterDistance?: number;
}

export interface TreeLODLevel extends PlantResult {
  name: "high" | "mid" | "low";
  distance: number;
}

export interface TreeLODSet {
  high: TreeLODLevel;
  mid: TreeLODLevel;
  low: TreeLODLevel;
  imposter: Mesh;
  imposterDistance: number;
}

/**
 * Build a deterministic tree LOD set. High keeps authored detail; mid removes
 * one branch generation and some leaves; low keeps broad silhouette; imposter
 * is crossed billboard geometry sized to the high mesh bounds.
 */
export function buildTreeLOD(opts: TreeLODOptions = {}): TreeLODSet {
  const depth = Math.max(1, Math.floor(opts.depth ?? 3));
  const branchCount = Math.max(1, Math.floor(opts.branchCount ?? 7));
  const leafDensity = Math.max(0, Math.floor(opts.leafDensity ?? 8));
  const leafSize = opts.leafSize ?? 0.18;
  const leaves = (opts.leaves ?? true) && leafDensity > 0;

  const highPlant = tree(opts);
  const midPlant = tree({
    ...opts,
    depth: Math.max(1, depth - 1),
    branchCount: Math.max(1, Math.ceil(branchCount * 0.65)),
    leaves,
    leafDensity: leaves ? Math.max(1, Math.ceil(leafDensity * 0.55)) : 0,
    leafSize: leafSize * 1.15,
    branchFlareScale: (opts.branchFlareScale ?? 1.85) * 0.9,
  });
  const lowPlant = tree({
    ...opts,
    depth: 1,
    branchCount: Math.max(1, Math.ceil(branchCount * 0.38)),
    leaves,
    leafDensity: leaves ? Math.max(1, Math.ceil(leafDensity * 0.25)) : 0,
    leafSize: leafSize * 1.55,
    branchFlare: false,
  });

  const source = merge(highPlant.wood, highPlant.leaves);
  const fallback = merge(lowPlant.wood, lowPlant.leaves);
  const imposter = billboardImposter(vertexCount(source) > 0 ? source : fallback, { cards: 2 });

  return {
    high: { ...highPlant, name: "high", distance: opts.highDistance ?? 0 },
    mid: { ...midPlant, name: "mid", distance: opts.midDistance ?? 18 },
    low: { ...lowPlant, name: "low", distance: opts.lowDistance ?? 42 },
    imposter,
    imposterDistance: opts.imposterDistance ?? 80,
  };
}
