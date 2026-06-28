/**
 * High-level plant builders: tree / shrub / grass — SpeedTree's three forms,
 * all expressed through one generator by parameter alone.
 *
 *  - tree:  one tapered trunk + recursive branches + leaf cards
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
import { growBranches, branchesToMesh, type BranchSegment } from "./branch.js";
import { scatterLeaves } from "./leaf.js";
import { frond, needleCluster } from "./frond.js";

export interface PlantResult {
  /** Woody parts (trunk + branches) — assign a bark material. */
  wood: Mesh;
  /** Leaf cards — assign a thin/translucent leaf material. */
  leaves: Mesh;
  /** All branch segments (for inspection / further scatter). */
  branches: BranchSegment[];
}

export interface TreeOptions {
  seed?: number;
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
  /** Branch out-going angle (degrees). */
  branchAngle?: number;
  /** Leaves per terminal branch. */
  leafDensity?: number;
  /** Leaf card size. */
  leafSize?: number;
  /** Set false to omit leaves (bare/winter tree). */
  leaves?: boolean;
}

/** Build a single-trunk tree. */
export function tree(opts: TreeOptions = {}): PlantResult {
  const seed = opts.seed ?? 1;
  const height = opts.height ?? 4;
  const trunkRadius = opts.trunkRadius ?? 0.28;
  const rng = makeRng(seed);

  // Trunk: vertical polyline, gnarled, swept with taper + root flare.
  const raw = polyline([vec3(0, 0, 0), vec3(0, height * 0.5, 0), vec3(0, height, 0)]);
  const trunkCurve = gnarlCurve(raw, { seed: (rng.next() * 1e9) | 0, amount: (opts.gnarl ?? 0.12) * height * 0.15 });
  const trunkMesh = sweep(trunkCurve, {
    sides: 8,
    radius: trunkRadius,
    radiusAt: (t) => trunkTaper(t),
    caps: true,
  });

  const branches = growBranches(trunkCurve, trunkRadius, {
    seed: (rng.next() * 1e9) | 0,
    count: opts.branchCount ?? 7,
    depth: opts.depth ?? 3,
    angle: opts.branchAngle ?? 48,
    phototropism: 0.4,
    gravity: 0.08,
    startPct: 0.35,
    endPct: 0.96,
    radiusScale: 0.58,
    lengthScale: 0.7,
  });
  const branchMesh = branchesToMesh(branches, { sides: 6 });
  const wood = merge(trunkMesh, branchMesh);

  const wantLeaves = opts.leaves ?? true;
  const leaves = wantLeaves
    ? scatterLeaves(branches, {
        seed: (rng.next() * 1e9) | 0,
        perBranch: opts.leafDensity ?? 8,
        size: opts.leafSize ?? 0.18,
        upBias: 0.45,
        cross: true,
      })
    : merge();

  return { wood, leaves, branches };
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
    woods.push(branchesToMesh(br, { sides: 4 }));
    for (const b of br) allBranches.push(b);
  }
  const wood = merge(...woods);
  const leaves = scatterLeaves(allBranches, {
    seed: (rng.next() * 1e9) | 0,
    perBranch: opts.leafDensity ?? 10,
    size: opts.leafSize ?? 0.12,
    upBias: 0.5,
    cross: true,
  });
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
    const f = frond(rachis, {
      seed: (rng.next() * 1e9) | 0,
      pairs: 16,
      leafletLength: 0.5,
      leafletWidth: 0.05,
      angle: 35,
      rachisRadius: 0.025,
    });
    frondStems.push(f.stem);
    frondBlades.push(f.blades);
  }
  return { wood: merge(...frondStems), leaves: frondBlades.length ? merge(...frondBlades) : merge(), branches: [] };
}

/** Local golden-angle constant (avoid cross-module import churn). */
const GOLDEN_ANGLE_LOCAL = Math.PI * (3 - Math.sqrt(5));
