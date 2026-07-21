/**
 * The mesh critic — turns raw geometry metrics plus a category rubric into a
 * structured, part-located critique the agent loop can feed back to the LLM.
 *
 * Two tiers run here deterministically (no API budget):
 *   A. geometry sanity  — watertightness, degenerate/flipped faces, scale
 *   C(det). proportions — bbox ratios vs the rubric envelope
 * The B (aesthetic) and C(VLM) tiers are optional: pass a `vlm` scorer to fold
 * in multi-view aesthetic/realism judgments at milestones. The critic never
 * requires an LLM to produce a useful report.
 *
 * The output is designed to be *actionable*: each issue carries the offending
 * part name and a concrete suggestion, so the model revises with a target
 * instead of guessing.
 */
import type { NamedPart } from "../geometry/export.js";
import { bounds, merge, type Bounds, type Mesh } from "../geometry/mesh.js";
import type { Vec3 } from "../math/vec3.js";
import { buildSurface, resolvePhysical } from "../texture/surface.js";
import { meshMetrics, sealTest, foliageMetrics, zFightingReport, type MeshMetrics } from "./geometry-metrics.js";
import { rubricForGoal, type Rubric } from "./rubric.js";

export type CritiqueAxis = "geometry" | "proportion" | "aesthetic" | "realism" | "motion";
export type Severity = "hard" | "soft";

export interface CritiqueIssue {
  axis: CritiqueAxis;
  severity: Severity;
  /** Offending part name, when the issue localizes to one. */
  part?: string;
  /** What is wrong. */
  finding: string;
  /** Concrete fix instruction the model can act on. */
  suggestion: string;
}

export interface CritiqueScores {
  geometry: number;
  proportion: number;
  aesthetic: number;
  realism: number;
  /** Mesh-only score, never inflated by VLM aesthetic/realism averages. */
  deterministic: number;
  /** Weighted overall, 0..1. */
  overall: number;
}

export interface CritiqueReport {
  category: string;
  scores: CritiqueScores;
  issues: CritiqueIssue[];
  /** Passed when no hard issues remain and overall clears the threshold. */
  passed: boolean;
  /** Per-part metric bundle, for logging / archival regression tracking. */
  partMetrics: Array<{ name: string; metrics: MeshMetrics }>;
}

export type VlmReviewLayer =
  | "silhouetteProportion"
  | "componentStructure"
  | "spatialStructure"
  | "formDetail"
  | "colorPalette"
  | "materialSurface"
  | "lightingCamera";

export interface VlmFeatureReview {
  id: string;
  score: number;
  visible: boolean;
  notes?: string;
}

/** Optional aesthetic/realism scorer (e.g. a VLM over multi-view renders). */
export interface VlmCritique {
  aesthetic: number;
  realism: number;
  /** Overall reference match judged from the shared multi-image evidence. */
  visualScore?: number;
  /** Self-reported evidence confidence, not model-generation confidence. */
  confidence?: number;
  layerScores?: Partial<Record<VlmReviewLayer, number>>;
  featureReviews?: VlmFeatureReview[];
  /** Actual provider model used after retry/fallback. */
  providerModel?: string;
  /** Total provider attempts spent before success. */
  providerAttempts?: number;
  providerFallbackUsed?: boolean;
  summary?: string;
  issues?: CritiqueIssue[];
}

export interface CritiqueOptions {
  goal: string;
  /** Overall pass threshold, 0..1. Default 0.7. */
  passThreshold?: number;
  /** Override the auto-selected rubric. */
  rubric?: Rubric;
  /** Fold in aesthetic/realism from an external judge (VLM). */
  vlm?: VlmCritique;
  /** Expected model height in units, for scale sanity. Default [0.3, 4]. */
  scaleRange?: [number, number];
  /** Ground plane used by the structural-support check. Default 0. */
  groundY?: number;
  /** Disable structural-support checking for intentionally weightless scenes. */
  checkSupport?: boolean;
}

const HARD_PENALTY = 0.34;
const SOFT_PENALTY = 0.12;
const FOLIAGE_CROWDING_SOFT = 0.6;
const FOLIAGE_CROWDING_HARD = 0.75;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Count parts whose name/label mentions a role keyword (for count checks). */
function countRole(parts: NamedPart[], role: string): number {
  const r = role.toLowerCase();
  let n = 0;
  for (const p of parts) {
    const hay = `${p.name} ${p.label ?? ""}`.toLowerCase();
    if (hay.includes(r)) n++;
  }
  return n;
}

function hasRole(parts: NamedPart[], role: string): boolean {
  return countRole(parts, role) > 0;
}

/** Escape a string for safe use inside a RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Names that denote GENUINELY thin/open surfaces where boundary edges are fine:
 * flat cards/sheets, cloth, foliage cards, road markings, and thin appendages.
 *
 * Deliberately excludes solid-body words (stone, rock, body, shell, terrain,
 * cloud, base, trunk, ...): those SHOULD be closed volumes, so an open shell on
 * them is a real "broken/holed mesh" defect (e.g. fractured rubble that came
 * out as gappy shells). Solid parts fall back to the geometric flatness test,
 * which only exempts things that are actually paper-thin.
 */
const THIN_NAME_RE =
  /leaf|leaves|foliage|canopy|frond|needle|needles|petal|blade|line|lane|marking|stripe|decal|sign|board|panel|sheet|cloth|fabric|banner|flag|valance|visor|awning|tarp|card|billboard|window|glass|screen|film|skirt|flap|wing|ear|horn|fin|tail|antenna|whisker|feather|membrane|web|deck|surface|ribbon|road|pavement|carriageway|tarmac/i;

/** Open-tube/vessel words: open boundary at the ends is expected (capless). */
const OPEN_TUBE_RE = /bore|tube|pipe|duct|ring|band|rim|hoop|collar/i;

/**
 * Foliage parts (leaf-card clusters) get a morphology check the topology tests
 * can't do: each card is a legitimately-thin open surface, so watertight/hole
 * checks exempt them — but they can still come out as torn slivers or a stacked,
 * interpenetrating blob (random yaw + high per-branch density). `foliageMetrics`
 * measures card slenderness and voxel clumping to catch exactly that.
 */
const FOLIAGE_NAME_RE = /leaf|leaves|foliage|canopy|frond|needle|needles|crown|leafage|petal/i;
const NEEDLE_NAME_RE = /needle|needles/i;
const FROND_NAME_RE = /frond|palm/i;
const IMPOSTER_NAME_RE = /imposter|impostor|billboard|sprite|lod/i;

/**
 * Structural words that co-occur with a foliage word but are NOT leaf cards — a
 * "canopy_columns" is support pillars, a "crown_frame" is structure. These are
 * elongated by design, so the leaf morphology check must skip them or it
 * false-flags them as "torn slivers".
 */
const NOT_LEAF_RE = /column|pillar|post|pole|beam|frame|truss|mast|support|trunk|stem|stalk|branch|strut/i;

/**
 * Woody branch/stem clusters (a tree's or forest's merged trunks + branches):
 * these are many tapered SWEEP tubes whose ends are open by construction (a
 * branch tip / ground-buried base needs no cap, and it's hidden by leaves or
 * the ground). So an open-shell fraction on them is expected, NOT a "broken
 * solid" defect. Deliberately separate from solid words like stone/rock, which
 * SHOULD be closed — those still get the hole check.
 */
const WOODY_NAME_RE = /wood|trunk|branch|twig|bough|stem|stalk|root|vine|liana/i;
const CLOSED_TRANSMISSIVE_SURFACES = new Set(["glass", "frostedGlass", "liquid", "gem", "ice", "jade"]);

const TRANSLUCENT_SURFACE_INTENT: Record<string, RegExp> = {
  glass: /glass|window|windshield|lens|headlight|fog.?light|tail(?:.?light|_)|lamp|screen|jar|玻璃|窗|灯罩|灯泡|灯面/i,
  frostedGlass: /glass|window|screen|panel|玻璃|窗|屏|隔断/i,
  liquid: /liquid|fluid|drink|contents|rain|jar|bottle|液|饮|雨|罐|瓶|货物/i,
  water: /water|ocean|sea|river|lake|pool|rain|水|海|河|湖|雨/i,
  foliage: /leaf|leaves|foliage|canop(?:y|ies)|frond|needle|petal|flower|grass|叶|树冠|棕榈|针叶|花|草/i,
  leaf: /leaf|leaves|foliage|canop(?:y|ies)|frond|needle|petal|flower|grass|叶|树冠|棕榈|针叶|花|草/i,
  grassBlade: /grass|blade|lawn|草|草坪/i,
  gem: /gem|jewel|crystal|diamond|宝石|珠宝|水晶|钻石/i,
  ice: /ice|frost|冰|霜/i,
  jade: /jade|wax|玉|蜡/i,
  snow: /snow|雪/i,
  cloud: /cloud|mist|fog|云|雾/i,
  skin: /skin|body|face|head|nose|hand|arm|leg|foot|皮肤|身体|脸|头|鼻|手|臂|腿|脚/i,
  marble: /marble|stone|slab|tile|counter|statue|大理石|石|板|砖|雕像/i,
};

function partTransparency(part: NamedPart): {
  type: string;
  transmission: number;
  opacity: number;
  expected: boolean;
} | null {
  if (!part.surface) return null;
  const surface = buildSurface(part.surface.type, part.surface.params ?? {});
  if (!surface) return null;
  const physical = resolvePhysical(surface.physical);
  if (physical.transmission <= 0 && physical.opacity >= 1) return null;
  const roleText = `${part.name} ${part.label ?? ""} ${String(part.metadata?.role ?? "")}`;
  return {
    type: part.surface.type,
    transmission: physical.transmission,
    opacity: physical.opacity,
    expected: TRANSLUCENT_SURFACE_INTENT[part.surface.type]?.test(roleText) ?? false,
  };
}

function isThinName(name: string): boolean {
  return THIN_NAME_RE.test(name) || OPEN_TUBE_RE.test(name);
}

/**
 * A part is "flat" when its thinnest bbox axis is a small fraction of its
 * largest — a sheet/card/plane, where open boundary edges are expected.
 */
function isFlatGeometry(size: Vec3): boolean {
  const dims = [Math.abs(size.x), Math.abs(size.y), Math.abs(size.z)].sort((a, b) => a - b);
  const min = dims[0]!;
  const max = dims[2]!;
  if (max < 1e-6) return false;
  return min / max < 0.06;
}

function axisDims(size: Vec3): [number, number, number] {
  return [Math.abs(size.x), Math.abs(size.y), Math.abs(size.z)].sort((a, b) => a - b) as [number, number, number];
}

function isDominantFlatCard(partSize: Vec3, assemblySize: Vec3, triangles: number): boolean {
  if (triangles > 24) return false;
  const [, mid, max] = axisDims(partSize);
  const assemblyMax = Math.max(...axisDims(assemblySize), 1e-6);
  const cardLike = isFlatGeometry(partSize) || triangles <= 8;
  return cardLike && max / assemblyMax > 0.45 && mid / assemblyMax > 0.25;
}

function boundsCenter(bb: Bounds): Vec3 {
  return {
    x: (bb.min.x + bb.max.x) / 2,
    y: (bb.min.y + bb.max.y) / 2,
    z: (bb.min.z + bb.max.z) / 2,
  };
}

function boundsSize(bb: Bounds): Vec3 {
  return {
    x: bb.max.x - bb.min.x,
    y: bb.max.y - bb.min.y,
    z: bb.max.z - bb.min.z,
  };
}

function overlaps(a: Bounds, b: Bounds, eps = 1e-3): boolean {
  return a.min.x < b.max.x - eps && a.max.x > b.min.x + eps &&
    a.min.y < b.max.y - eps && a.max.y > b.min.y + eps &&
    a.min.z < b.max.z - eps && a.max.z > b.min.z + eps;
}

function componentBounds(mesh: Mesh, eps = 1e-4): Bounds[] {
  type MutableBounds = {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
  const n = mesh.positions.length;
  if (n === 0) return [];
  const parent = Array.from({ length: n }, (_, i) => i);

  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r]!;
    while (parent[i] !== i) {
      const p = parent[i]!;
      parent[i] = r;
      i = p;
    }
    return r;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  const q = (v: number) => Math.round(v / eps);
  const keyFor = (p: Vec3) => `${q(p.x)},${q(p.y)},${q(p.z)}`;
  const firstAt = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const key = keyFor(mesh.positions[i]!);
    const first = firstAt.get(key);
    if (first === undefined) firstAt.set(key, i);
    else union(first, i);
  }
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i]!;
    const b = mesh.indices[i + 1]!;
    const c = mesh.indices[i + 2]!;
    union(a, b);
    union(a, c);
  }

  const out = new Map<number, MutableBounds>();
  for (let i = 0; i < n; i++) {
    const p = mesh.positions[i]!;
    const root = find(i);
    const bb = out.get(root);
    if (!bb) {
      out.set(root, { min: { ...p }, max: { ...p } });
      continue;
    }
    out.set(root, {
      min: {
        x: Math.min(bb.min.x, p.x),
        y: Math.min(bb.min.y, p.y),
        z: Math.min(bb.min.z, p.z),
      },
      max: {
        x: Math.max(bb.max.x, p.x),
        y: Math.max(bb.max.y, p.y),
        z: Math.max(bb.max.z, p.z),
      },
    });
  }
  return [...out.values()];
}

interface SupportNode {
  part: NamedPart;
  bounds: Bounds;
  size: Vec3;
  diagonal: number;
  volume: number;
  grounded: boolean;
  links: number[];
}

const SUPPORT_EXEMPT_RE =
  /\b(cloud|clouds|sky|smoke|fog|mist|steam|flame|fire|spark|particle|rain|snow|aura|halo|light ray|god ray|leaf|leaves|foliage|frond|needle|petal|flower|grass blade|hair|fur|feather|decal|marking|stripe|water surface)\b|云|天空|烟|雾|蒸汽|火焰|粒子|雨|雪|光环|叶|树冠|花瓣|花朵|草叶|毛发|羽毛|贴花|标线|水面/i;

function supportExempt(part: NamedPart): boolean {
  if (part.metadata?.supportExempt === true || part.metadata?.physicalWeight === false) return true;
  return SUPPORT_EXEMPT_RE.test(semanticText(part));
}

function boundsGap(a: Bounds, b: Bounds): number {
  const dx = a.max.x < b.min.x ? b.min.x - a.max.x : b.max.x < a.min.x ? a.min.x - b.max.x : 0;
  const dy = a.max.y < b.min.y ? b.min.y - a.max.y : b.max.y < a.min.y ? a.min.y - b.max.y : 0;
  const dz = a.max.z < b.min.z ? b.min.z - a.max.z : b.max.z < a.min.z ? a.min.z - b.max.z : 0;
  return Math.hypot(dx, dy, dz);
}

function checkStructuralSupport(
  parts: NamedPart[],
  issues: CritiqueIssue[],
  assemblySize: Vec3,
  groundY: number,
): number {
  const diagonal = Math.max(1e-6, Math.hypot(assemblySize.x, assemblySize.y, assemblySize.z));
  const contactTolerance = Math.max(0.02, Math.min(0.18, diagonal * 0.012));
  const groundTolerance = Math.max(0.025, Math.min(0.15, diagonal * 0.01));
  const reportDiagonal = Math.max(0.035, diagonal * 0.018);
  const reportVolume = Math.max(1e-7, diagonal * diagonal * diagonal * 1e-7);
  const nodes: SupportNode[] = [];

  for (const part of parts) {
    if (supportExempt(part)) continue;
    for (const component of componentBounds(part.mesh)) {
      const size = boundsSize(component);
      const componentDiagonal = Math.hypot(size.x, size.y, size.z);
      const dims = [Math.abs(size.x), Math.abs(size.y), Math.abs(size.z)].sort((a, b) => a - b);
      const volume = Math.max(
        0,
        size.x * size.y * size.z,
        dims[1]! * dims[2]! * Math.max(0.002, diagonal * 0.001),
      );
      if (componentDiagonal < reportDiagonal * 0.1 || volume < reportVolume * 0.01) continue;
      nodes.push({
        part,
        bounds: component,
        size,
        diagonal: componentDiagonal,
        volume,
        grounded:
          component.min.y <= groundY + groundTolerance ||
          part.metadata?.supportAnchor === true ||
          /\b(terrain|ground|landscape|floor plane|foundation soil)\b|地形|地面|地板/i.test(semanticText(part)),
        links: [],
      });
    }
  }
  if (nodes.length === 0) return 0;

  const order = nodes.map((_, i) => i).sort((a, b) => nodes[a]!.bounds.min.x - nodes[b]!.bounds.min.x);
  for (let oi = 0; oi < order.length; oi++) {
    const i = order[oi]!;
    const a = nodes[i]!;
    const maxX = a.bounds.max.x + contactTolerance;
    for (let oj = oi + 1; oj < order.length; oj++) {
      const j = order[oj]!;
      const b = nodes[j]!;
      if (b.bounds.min.x > maxX) break;
      if (boundsGap(a.bounds, b.bounds) > contactTolerance) continue;
      a.links.push(j);
      b.links.push(i);
    }
  }

  const supported = new Uint8Array(nodes.length);
  const stack: number[] = [];
  for (let i = 0; i < nodes.length; i++) {
    if (!nodes[i]!.grounded) continue;
    supported[i] = 1;
    stack.push(i);
  }
  while (stack.length > 0) {
    const i = stack.pop()!;
    for (const j of nodes[i]!.links) {
      if (supported[j]) continue;
      supported[j] = 1;
      stack.push(j);
    }
  }

  const unsupported = nodes.filter((node, i) =>
    !supported[i] && node.diagonal >= reportDiagonal && node.volume >= reportVolume,
  );
  if (unsupported.length === 0) return 0;

  const byPart = new Map<string, SupportNode[]>();
  for (const node of unsupported) {
    const list = byPart.get(node.part.name) ?? [];
    list.push(node);
    byPart.set(node.part.name, list);
  }
  for (const [part, list] of [...byPart.entries()].slice(0, 6)) {
    const largest = list.reduce((best, node) => node.diagonal > best.diagonal ? node : best, list[0]!);
    const center = boundsCenter(largest.bounds);
    issues.push({
      axis: "realism", severity: "hard", part,
      finding: `${list.length} weighted component(s) are floating with no contact path to ground; largest is near (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)})`,
      suggestion: `move the component into contact, add a bracket/post/cable/load-bearing connection, or mark genuinely weightless visual geometry with metadata.supportExempt=true`,
    });
  }
  return HARD_PENALTY;
}

function findRolePart(parts: NamedPart[], re: RegExp): NamedPart | undefined {
  return parts.find((p) => re.test(`${p.name} ${p.label ?? ""}`));
}

function distinctLevels(boxes: Bounds[]): number[] {
  const ys = boxes
    .map((b) => boundsCenter(b).y)
    .sort((a, b) => a - b);
  const levels: number[] = [];
  for (const y of ys) {
    const last = levels[levels.length - 1];
    if (last === undefined || Math.abs(y - last) > 0.18) levels.push(y);
    else levels[levels.length - 1] = (last + y) / 2;
  }
  return levels;
}

function checkFireEscapeAccess(parts: NamedPart[], issues: CritiqueIssue[]): number {
  const platformPart = findRolePart(parts, /platform|landing|平台/i);
  if (!platformPart) return 0;

  const platformBoxes = componentBounds(platformPart.mesh)
    .filter((b) => {
      const s = boundsSize(b);
      return s.x > 0.4 && s.z > 0.25;
    });
  const levels = distinctLevels(platformBoxes);
  if (levels.length === 0) return 0;

  const stepPart = findRolePart(parts, /step|stair|tread|ladder|踏步|楼梯|爬梯/i);
  if (!stepPart) {
    issues.push({
      axis: "realism", severity: "hard", part: platformPart.name,
      finding: "fire escape has landings but no reachable stair/ladder path",
      suggestion: "add stairs or a ladder that connects ground and every landing",
    });
    return HARD_PENALTY;
  }

  let penalty = 0;
  const stepBoxes = componentBounds(stepPart.mesh).filter((b) => {
    const s = boundsSize(b);
    return Math.max(s.x, s.z) > 0.12 && s.y < 0.25;
  });
  if (stepBoxes.length === 0) {
    issues.push({
      axis: "realism", severity: "hard", part: stepPart.name,
      finding: "fire escape access path has no usable treads/rungs",
      suggestion: "build separate treads/rungs with climbable spacing and width",
    });
    return HARD_PENALTY;
  }

  const railPart = findRolePart(parts, /rail|guard|baluster|栏杆|扶手/i);
  const railBoxes = railPart ? componentBounds(railPart.mesh) : [];
  let blockedLandings = 0;
  let missingLandings = 0;
  for (const y of levels) {
    const nearSteps = stepBoxes.filter((b) => Math.abs(boundsCenter(b).y - y) < 0.42);
    if (nearSteps.length === 0) {
      missingLandings++;
      continue;
    }
    const hasClearOpening = nearSteps.some((b) => {
      const c = boundsCenter(b);
      const clear: Bounds = {
        min: { x: c.x - 0.32, y: y + 0.03, z: c.z - 0.42 },
        max: { x: c.x + 0.32, y: y + 1.12, z: c.z + 0.42 },
      };
      return !railBoxes.some((r) => overlaps(r, clear, 0.02));
    });
    if (!hasClearOpening) blockedLandings++;
  }
  if (missingLandings > 0) {
    issues.push({
      axis: "realism", severity: "hard", part: stepPart.name,
      finding: `${missingLandings} fire-escape landing(s) are not connected by the access path`,
      suggestion: "make each stair/ladder flight terminate at a landing opening, not in empty space or under the deck",
    });
    penalty += HARD_PENALTY;
  }
  if (blockedLandings > 0) {
    issues.push({
      axis: "realism", severity: "hard", part: railPart?.name ?? platformPart.name,
      finding: `${blockedLandings} fire-escape landing entrance(s) are blocked by railing/guard geometry`,
      suggestion: "cut a clear gate/opening in the landing guardrail exactly where the stair or ladder arrives",
    });
    penalty += HARD_PENALTY;
  }

  for (let i = 0; i < levels.length; i++) {
    const bottom = i === 0 ? 0 : levels[i - 1]!;
    const top = levels[i]!;
    const between = stepBoxes
      .filter((b) => {
        const y = boundsCenter(b).y;
        return y > bottom + 0.08 && y < top - 0.08;
      })
      .sort((a, b) => boundsCenter(a).y - boundsCenter(b).y);
    if (between.length < 2) continue;
    const a = boundsCenter(between[0]!);
    const b = boundsCenter(between[between.length - 1]!);
    const run = Math.hypot(b.x - a.x, b.z - a.z);
    const rise = Math.abs(b.y - a.y);
    const angle = Math.atan2(rise, Math.max(run, 1e-6)) * 180 / Math.PI;
    if (angle > 72) {
      issues.push({
        axis: "realism", severity: "hard", part: stepPart.name,
        finding: `fire-escape flight is too steep for treads (${angle.toFixed(0)} degrees)`,
        suggestion: "increase horizontal run or treat it as a vertical ladder with proper rungs and landing clearance",
      });
      penalty += HARD_PENALTY;
      break;
    }
    if (angle > 64) {
      issues.push({
        axis: "realism", severity: "soft", part: stepPart.name,
        finding: `fire-escape flight is very steep (${angle.toFixed(0)} degrees)`,
        suggestion: "increase stair run or reduce floor height so the climb reads as usable stairs",
      });
      penalty += SOFT_PENALTY;
      break;
    }
  }

  return penalty;
}

const SETTLEMENT_ROAD_RE =
  /\b(road|roads|street|streets|lane|lanes|path|paths|track|tracks|sidewalk|sidewalks)\b|道路|山路|街道|小路|人行道|车行道/i;
const SETTLEMENT_NON_ROAD_RE =
  /\b(street tree|street lamp|traffic signal|bench|trashcan|trash can|tree|trunk|limb|limbs|canopy|foliage|leaf|leaves|lamp|light|bin)\b|树|树冠|树干|灯|长椅|垃圾桶|信号灯/i;
const SETTLEMENT_BUILDING_RE =
  /\b(building|buildings|house|houses|hut|huts|wall|walls|facade|facades)\b|建筑|房屋/i;
const SETTLEMENT_DETAIL_RE =
  /\b(window|windows|door|doors|frame|frames|facade|facades|balcony|balconies|canopy|porch|stair|stairs|step|steps)\b|门|窗|阳台|立面/i;

interface NamedBounds {
  part: string;
  bounds: Bounds;
}

function roleText(part: NamedPart): string {
  const role = typeof part.metadata?.role === "string" ? part.metadata.role : "";
  return `${part.name} ${part.label ?? ""} ${role}`.replace(/[_-]+/g, " ");
}

function semanticText(part: NamedPart): string {
  const meta = part.metadata
    ? Object.values(part.metadata)
      .filter((v): v is string | number | boolean => typeof v === "string" || typeof v === "number" || typeof v === "boolean")
      .join(" ")
    : "";
  return `${part.name} ${part.label ?? ""} ${meta}`.replace(/[_-]+/g, " ").toLowerCase();
}

function hasActiveWind(part: NamedPart): boolean {
  if (!part.windWeight || part.windWeight.length === 0) return false;
  return part.windWeight.some((w) => Math.abs(w) > 1e-4);
}

const STATIC_WIND_RE =
  /\b(cactus|cacti|saguaro|barrel cactus|barrel|prickly pear|prickly|cholla|beavertail|succulent|areole|areoles|spine|spines|thorn|thorns|rib|ribs|rock|stone|boulder|building|buildings|house|houses|roof|wall|walls|road|roads|street|terrain|ground|car|vehicle|body|chassis|wheel|tire|chair|seat|table|bottle|vase|jar|tank|tower|lamp|platform|railing|stair|stairs|window|door|concrete|brick|metal)\b|仙人掌|肉质茎|刺座|刺|纵肋|岩|石|建筑|房屋|屋顶|道路|地面|车辆|车轮|椅|桌|瓶|罐|灯/i;

function policyAllowedWindRe(parts: string[]): RegExp {
  return new RegExp(parts.map((p) => `\\b${escapeRe(p).replace(/\s+/g, "[\\s_-]+")}\\b`).join("|"), "i");
}

function checkMotionPolicy(part: NamedPart, rubric: Rubric, issues: CritiqueIssue[]): number {
  if (!hasActiveWind(part)) return 0;

  const text = semanticText(part);
  const policy = rubric.motionPolicy;
  if (policy?.allowWind === false) {
    issues.push({
      axis: "motion", severity: "hard", part: part.name,
      finding: `"${part.name}" has active wind/sway animation weights, but ${rubric.category} should be static: ${policy.note}`,
      suggestion: `remove windWeight from "${part.name}" or set it to all zero; only attach viewer wind to semantically flexible parts`,
    });
    return HARD_PENALTY;
  }

  if (policy?.allowWind === true && policy.allowedWindParts && policy.allowedWindParts.length > 0) {
    const allowed = policyAllowedWindRe(policy.allowedWindParts);
    if (!allowed.test(text)) {
      const severity: Severity = STATIC_WIND_RE.test(text) ? "hard" : "soft";
      issues.push({
        axis: "motion", severity, part: part.name,
        finding: `"${part.name}" has active wind/sway animation weights, but it is not an allowed animated part for ${rubric.category}: ${policy.note}`,
        suggestion: `move windWeight to foliage/cloth/water-style parts only, or rename/metadata-tag the part with a valid flexible role if it is truly meant to sway`,
      });
      return severity === "hard" ? HARD_PENALTY : SOFT_PENALTY;
    }
    return 0;
  }

  if (STATIC_WIND_RE.test(text)) {
    issues.push({
      axis: "motion", severity: "hard", part: part.name,
      finding: `"${part.name}" has active wind/sway animation weights but reads as a rigid/static object`,
      suggestion: `remove windWeight from rigid props, structures, terrain, rocks, vehicles, cactus stems/spines, and other non-flexible parts`,
    });
    return HARD_PENALTY;
  }

  return 0;
}

function footprintArea(b: Bounds): number {
  return Math.max(0, b.max.x - b.min.x) * Math.max(0, b.max.z - b.min.z);
}

function containsXZ(p: Vec3, b: Bounds, pad: number): boolean {
  return p.x >= b.min.x - pad && p.x <= b.max.x + pad &&
    p.z >= b.min.z - pad && p.z <= b.max.z + pad;
}

function gapXZ(a: Bounds, b: Bounds): number {
  const dx = a.max.x < b.min.x ? b.min.x - a.max.x : b.max.x < a.min.x ? a.min.x - b.max.x : 0;
  const dz = a.max.z < b.min.z ? b.min.z - a.max.z : b.max.z < a.min.z ? a.min.z - b.max.z : 0;
  return Math.hypot(dx, dz);
}

function overlapAreaXZ(a: Bounds, b: Bounds): number {
  const x = Math.max(0, Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x));
  const z = Math.max(0, Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z));
  return x * z;
}

function unionBounds(a: Bounds, b: Bounds): Bounds {
  return {
    min: {
      x: Math.min(a.min.x, b.min.x),
      y: Math.min(a.min.y, b.min.y),
      z: Math.min(a.min.z, b.min.z),
    },
    max: {
      x: Math.max(a.max.x, b.max.x),
      y: Math.max(a.max.y, b.max.y),
      z: Math.max(a.max.z, b.max.z),
    },
  };
}

function collapseStackedFootprints(items: NamedBounds[]): NamedBounds[] {
  const out: NamedBounds[] = [];
  for (const item of items) {
    let merged = false;
    for (const existing of out) {
      const overlap = overlapAreaXZ(existing.bounds, item.bounds);
      const minArea = Math.min(footprintArea(existing.bounds), footprintArea(item.bounds));
      if (minArea > 1e-6 && overlap / minArea > 0.75) {
        existing.bounds = unionBounds(existing.bounds, item.bounds);
        merged = true;
        break;
      }
    }
    if (!merged) {
      out.push({
        part: item.part,
        bounds: {
          min: { ...item.bounds.min },
          max: { ...item.bounds.max },
        },
      });
    }
  }
  return out;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function variation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean <= 1e-6) return 0;
  const variance = values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function settlementBuildingBoxes(parts: NamedPart[], assemblySize: Vec3): NamedBounds[] {
  const sceneArea = Math.max(1e-6, Math.abs(assemblySize.x * assemblySize.z));
  const minArea = Math.max(1e-4, sceneArea * 0.00005);
  const minHeight = Math.max(0.02, Math.abs(assemblySize.y) * 0.01);
  const raw: NamedBounds[] = [];
  for (const part of parts) {
    if (!SETTLEMENT_BUILDING_RE.test(roleText(part))) continue;
    for (const b of componentBounds(part.mesh)) {
      const s = boundsSize(b);
      if (footprintArea(b) < minArea || s.y < minHeight) continue;
      raw.push({ part: part.name, bounds: b });
    }
  }
  return collapseStackedFootprints(raw);
}

function settlementRoadPoints(parts: NamedPart[]): Array<{ part: string; point: Vec3 }> {
  const out: Array<{ part: string; point: Vec3 }> = [];
  for (const part of parts) {
    const text = roleText(part);
    if (!SETTLEMENT_ROAD_RE.test(text) || SETTLEMENT_NON_ROAD_RE.test(text)) continue;
    for (const point of part.mesh.positions) out.push({ part: part.name, point });
  }
  return out;
}

function hasSettlementDetail(parts: NamedPart[]): boolean {
  return parts.some((part) => SETTLEMENT_DETAIL_RE.test(roleText(part)));
}

function checkSettlementLayout(parts: NamedPart[], issues: CritiqueIssue[], assemblySize: Vec3): number {
  const buildings = settlementBuildingBoxes(parts, assemblySize);
  if (buildings.length === 0) return 0;

  let penalty = 0;
  const roadPoints = settlementRoadPoints(parts);
  const medianFoot = median(buildings.map((b) => {
    const s = boundsSize(b.bounds);
    return Math.max(s.x, s.z);
  }));
  const clearance = Math.max(0.08, medianFoot * 0.22);

  if (roadPoints.length > 0) {
    let onRoad = 0;
    let tooClose = 0;
    let firstRoadPart = roadPoints[0]!.part;
    for (const b of buildings) {
      const s = boundsSize(b.bounds);
      const shrink = Math.min(0.04, Math.max(s.x, s.z) * 0.12);
      const inner: Bounds = {
        min: { x: b.bounds.min.x + shrink, y: b.bounds.min.y, z: b.bounds.min.z + shrink },
        max: { x: b.bounds.max.x - shrink, y: b.bounds.max.y, z: b.bounds.max.z - shrink },
      };
      const hit = roadPoints.find((r) => containsXZ(r.point, inner, 0));
      if (hit) {
        onRoad++;
        firstRoadPart = hit.part;
        continue;
      }
      if (roadPoints.some((r) => containsXZ(r.point, b.bounds, clearance))) tooClose++;
    }
    if (onRoad > 0) {
      issues.push({
        axis: "realism", severity: "hard", part: firstRoadPart,
        finding: `${onRoad} building footprint(s) overlap road geometry`,
        suggestion: "keep a clear setback from roads; reject house placements whose footprint intersects the road ribbon",
      });
      penalty += HARD_PENALTY;
    } else {
      const nearRatio = tooClose / buildings.length;
      if (nearRatio > 0.45) {
        issues.push({
          axis: "realism", severity: "soft", part: firstRoadPart,
          finding: `${(nearRatio * 100).toFixed(0)}% of buildings sit too tight against roads`,
          suggestion: "increase road-side setback or add sidewalk/yard clearance so roads read as circulation, not hidden gaps",
        });
        penalty += SOFT_PENALTY;
      }
    }
  }

  if (buildings.length >= 12) {
    let crowded = 0;
    for (let i = 0; i < buildings.length; i++) {
      let nearest = Infinity;
      for (let j = 0; j < buildings.length; j++) {
        if (i === j) continue;
        nearest = Math.min(nearest, gapXZ(buildings[i]!.bounds, buildings[j]!.bounds));
      }
      if (nearest < clearance * 0.75) crowded++;
    }
    const crowdRatio = crowded / buildings.length;
    if (crowdRatio > 0.28) {
      const severity: Severity = crowdRatio > 0.52 ? "hard" : "soft";
      issues.push({
        axis: "aesthetic", severity,
        finding: `buildings are overcrowded (${(crowdRatio * 100).toFixed(0)}% below spacing threshold)`,
        suggestion: "use stronger parcel spacing / poisson pruning and leave readable alleys or yards between houses",
      });
      penalty += severity === "hard" ? HARD_PENALTY : SOFT_PENALTY;
    }

    if (!hasSettlementDetail(parts)) {
      issues.push({
        axis: "aesthetic", severity: "soft",
        finding: "settlement buildings repeat as plain body+roof blocks with no facade detail",
        suggestion: "add windows, doors, stoops, balconies, or per-house facade modules so repeated houses do not read as clones",
      });
      penalty += SOFT_PENALTY;
    }

    const heights = buildings.map((b) => boundsSize(b.bounds).y);
    const footprints = buildings.map((b) => Math.sqrt(footprintArea(b.bounds)));
    if (variation(heights) < 0.1 && variation(footprints) < 0.12) {
      issues.push({
        axis: "aesthetic", severity: "soft",
        finding: "building scale variation is too low for a settlement",
        suggestion: "vary house width/depth/height and rotate lots so the scene does not become a repeated stamp pattern",
      });
      penalty += SOFT_PENALTY;
    }
  }

  return penalty;
}

/**
 * Produce a full critique for a set of named parts against the goal's rubric.
 * Deterministic on its own; VLM input (if given) is folded in verbatim.
 */
export function critique(parts: NamedPart[], opts: CritiqueOptions): CritiqueReport {
  const rubric = opts.rubric ?? rubricForGoal(opts.goal);
  const threshold = opts.passThreshold ?? 0.7;
  const scaleRange = opts.scaleRange ?? [0.3, 4];
  const issues: CritiqueIssue[] = [];
  const partMetrics: Array<{ name: string; metrics: MeshMetrics }> = [];
  const merged = parts.flatMap((p) => p.mesh.positions);
  const bb = bounds({ positions: merged, normals: [], uvs: [], indices: [] });
  const size = { x: bb.max.x - bb.min.x, y: bb.max.y - bb.min.y, z: bb.max.z - bb.min.z };

  // --- A tier: per-part geometry sanity ---
  let geomPenalty = 0;
  let motionPenalty = 0;
  let materialPenalty = 0;
  for (const part of parts) {
    const mm = meshMetrics(part.mesh);
    partMetrics.push({ name: part.name, metrics: mm });
    motionPenalty += checkMotionPolicy(part, rubric, issues);

    if (mm.triangles === 0) {
      issues.push({
        axis: "geometry", severity: "hard", part: part.name,
        finding: "part has no triangles (empty mesh)",
        suggestion: `remove or rebuild "${part.name}"; it produced no geometry`,
      });
      geomPenalty += HARD_PENALTY;
      continue;
    }
    if (mm.degenerateFaces > 0) {
      issues.push({
        axis: "geometry", severity: "soft", part: part.name,
        finding: `${mm.degenerateFaces} degenerate (zero-area) faces`,
        suggestion: `avoid collapsing vertices in "${part.name}"; check subdivide/displace params`,
      });
      geomPenalty += SOFT_PENALTY;
    }
    if (mm.flippedFaces > mm.triangles * 0.15) {
      issues.push({
        axis: "geometry", severity: "hard", part: part.name,
        finding: `${mm.flippedFaces}/${mm.triangles} faces have inward/flipped normals`,
        suggestion: `recompute normals or fix winding on "${part.name}" (it will render dark/inside-out)`,
      });
      geomPenalty += HARD_PENALTY;
    }
    // Open shells are common and legitimate for panels, planes, billboards,
    // signs, road markings, foliage cards, cloth, and any part meant to be a
    // thin surface. Only flag a heavy hole ratio, and skip parts that are
    // intentionally thin — declared via metadata, named as a surface, or
    // geometrically flat (one bbox axis far thinner than the others).
    // "weathered"/"ruined" parts are intentionally broken: a crumbled ruin, a
    // fractured column, eroded rubble. Their open cross-sections and bitten
    // chunks are the art intent, not a defect — the model declares this via
    // metadata (or a ruin/broken/rubble name) so the hole check backs off.
    const intentionallyBroken =
      part.metadata?.weathered === true ||
      part.metadata?.ruined === true ||
      /\bruin|ruined|rubble|debris|wreck|crumbl|weathered|broken\b/i.test(part.name);
    const transparency = partTransparency(part);
    const closedTransmission = !!transparency && CLOSED_TRANSMISSIVE_SURFACES.has(transparency.type);
    const intendedThin =
      part.metadata?.thin === true ||
      part.metadata?.surface === "panel" ||
      (!closedTransmission && isThinName(part.name)) ||
      WOODY_NAME_RE.test(part.name) ||
      intentionallyBroken ||
      (!closedTransmission && isFlatGeometry(mm.size));
    if (transparency && !transparency.expected) {
      issues.push({
        axis: "realism", severity: "hard", part: part.name,
        finding: `"${part.name}" uses transmissive surface "${transparency.type}" (transmission=${transparency.transmission.toFixed(2)}, opacity=${transparency.opacity.toFixed(2)}) without matching transparent/translucent semantics`,
        suggestion: `use an opaque surface for "${part.name}", or rename/label it with the real transparent material role if transmission is intentional`,
      });
      materialPenalty += HARD_PENALTY;
    }
    if (part.doubleSided && !transparency && mm.boundaryEdges > 0 && !intendedThin) {
      issues.push({
        axis: "realism", severity: "hard", part: part.name,
        finding: `opaque 3D part "${part.name}" is an open shell forced double-sided; visible backfaces can read as unintended translucency`,
        suggestion: `fix outward face winding, add real wall thickness, and remove doubleSided from "${part.name}"`,
      });
      materialPenalty += HARD_PENALTY;
    }
    if (part.doubleSided && closedTransmission) {
      issues.push({
        axis: "realism", severity: "hard", part: part.name,
        finding: `transmissive solid "${part.name}" is forced double-sided; closed glass/liquid volumes must render their real outer and inner walls`,
        suggestion: `remove doubleSided from "${part.name}"; add geometric thickness if its back faces are otherwise missing`,
      });
      materialPenalty += HARD_PENALTY;
    }
    if (mm.boundaryEdges > 0 && closedTransmission) {
      issues.push({
        axis: "geometry", severity: "hard", part: part.name,
        finding: `"${part.name}" is a single-sided/open transmissive shell (${mm.boundaryEdges} boundary edges over ${mm.triangles} faces)`,
        suggestion: `solidify "${part.name}" into a watertight shell with real wall thickness; do not hide the defect with doubleSided`,
      });
      geomPenalty += HARD_PENALTY;
    } else if (mm.boundaryEdges > 0 && !intendedThin) {
      const openRatio = mm.boundaryEdges / Math.max(1, mm.triangles);
      // Distinguish a genuinely BROKEN mesh (fractured rubble that came out as
      // gappy shells: many triangles yet a large boundary — holes riddle the
      // surface) from a legitimate single OPENING (a bowl/cone/lid/cap: a small
      // part whose one open rim is naturally ~100% boundary). The tell is the
      // absolute face count: a real solid with hundreds+ of faces should be
      // nearly closed; if it still has a big open fraction, it's holed/broken.
      const bigSolid = mm.triangles >= 200;
      if (bigSolid && openRatio > 0.15) {
        const sev: Severity = openRatio > 0.4 ? "hard" : "soft";
        issues.push({
          axis: "geometry", severity: sev, part: part.name,
          finding: `"${part.name}" is a broken/open shell (${mm.boundaryEdges} boundary edges over ${mm.triangles} faces, ${(openRatio * 100).toFixed(0)}%) — it has holes / isn't a closed solid`,
          suggestion: `close the mesh into a solid volume (cap openings / weld the shell); it should not render see-through with gaps`,
        });
        geomPenalty += sev === "hard" ? HARD_PENALTY : SOFT_PENALTY;
      }
    }
    const metaRole = typeof part.metadata?.role === "string" ? part.metadata.role : "";
    const roleText = `${part.name} ${part.label ?? ""} ${metaRole}`;
    if (rubric.category === "tree" && IMPOSTER_NAME_RE.test(roleText) && isDominantFlatCard(mm.size, size, mm.triangles)) {
      issues.push({
        axis: "aesthetic", severity: "hard", part: part.name,
        finding: `"${part.name}" is a large visible LOD/billboard card, not believable foliage geometry`,
        suggestion: `hide imposters in the normal model preview, or replace "${part.name}" with real branch/leaf geometry; only show billboard cards in a dedicated LOD debug view`,
      });
      geomPenalty += HARD_PENALTY;
    }
    // Note: non-manifold welded edges are NOT scored. UV spheres, cylinders and
    // cones keep duplicated seam/pole vertices, so welded edge counts flag them
    // by construction; the signal is unreliable on render meshes.

    // Foliage morphology: leaf-card clusters escape the topology checks (thin
    // open surfaces are fine), but they can still be torn slivers or a stacked,
    // interpenetrating mess. Measure card slenderness + voxel clumping.
    if (FOLIAGE_NAME_RE.test(part.name) && !NOT_LEAF_RE.test(part.name) && mm.triangles >= 6) {
      const fm = foliageMetrics(part.mesh);
      const needleLike = NEEDLE_NAME_RE.test(part.name);
      // Real leaf clusters are many cards. A handful of components is structure
      // (columns, a few billboards), not a leaf canopy — skip the leaf checks.
      if (fm.cards >= 8) {
        // A broadleaf crown made from a few oversized billboard planes can pass
        // topology and density checks yet still look like floating paper sheets.
        // Palms/fronds and needle sprays are allowed to use larger individual
        // blades, so this gate only applies to broadleaf-like tree foliage.
        const broadleafCards = rubric.category === "tree" && !NEEDLE_NAME_RE.test(roleText) && !FROND_NAME_RE.test(roleText);
        if (broadleafCards && fm.maxCardDiagonalRatio > 0.16) {
          const sev: Severity = fm.maxCardDiagonalRatio > 0.22 || fm.largeCardRatio > 0.25 ? "hard" : "soft";
          issues.push({
            axis: "aesthetic", severity: sev, part: part.name,
            finding: `"${part.name}" leaf cards are too large for the crown — largest card spans ${(fm.maxCardDiagonalRatio * 100).toFixed(0)}% of the foliage bbox and ${(fm.largeCardRatio * 100).toFixed(0)}% of cards exceed the size limit`,
            suggestion: `use many smaller leaf clusters or a denser crown shell; avoid a few billboard planes defining the tree silhouette`,
          });
          geomPenalty += sev === "hard" ? HARD_PENALTY : SOFT_PENALTY;
        }
        // Torn strips: many leaf cards are long slivers rather than leaf-shaped.
        if (!needleLike && fm.slenderRatio > 0.5) {
          const sev: Severity = fm.slenderRatio > 0.75 ? "hard" : "soft";
          issues.push({
            axis: "aesthetic", severity: sev, part: part.name,
            finding: `"${part.name}" leaves are torn slivers — ${(fm.slenderRatio * 100).toFixed(0)}% of ${fm.cards} cards are long thin strips (mean aspect ${fm.meanAspect.toFixed(1)}:1)`,
            suggestion: `use leaf-shaped cards near 1:1–2:1 aspect (lower leafSize aspect / use a shaped blade), not elongated strips`,
          });
          geomPenalty += sev === "hard" ? HARD_PENALTY : SOFT_PENALTY;
        }
        // Over-crowded: leaves piled at the same spots, reads as a noisy blob.
        // Normal dense foliage sits well below this; only genuine stacking
        // (many tris jammed into one cell) trips it.
        if (fm.crowding > FOLIAGE_CROWDING_SOFT) {
          const sev: Severity = fm.crowding >= FOLIAGE_CROWDING_HARD ? "hard" : "soft";
          issues.push({
            axis: "aesthetic", severity: sev, part: part.name,
            finding: `"${part.name}" leaves overlap heavily / foliage is overcrowded — leaf cards pile at the same spots (crowding ${(fm.crowding * 100).toFixed(0)}%)`,
            suggestion: `reduce leaf density or spread placement so cards don't stack; vary yaw/size less aggressively so they read as separate leaves`,
          });
          geomPenalty += sev === "hard" ? HARD_PENALTY : SOFT_PENALTY;
        }
        // Exposed occluder blob: a closed solid sphere inside the leaf mass that
        // should be hidden by the leaf shell but leaks out as a bare "green
        // ball". Leaf cards are thin open surfaces, so ANY closed solid volume
        // here is a modeling defect. Small fractions still read on the
        // silhouette, so flag from a low threshold.
        if (fm.blobRatio > 0.02) {
          const sev: Severity = fm.blobRatio > 0.12 ? "hard" : "soft";
          issues.push({
            axis: "aesthetic", severity: sev, part: part.name,
            finding: `"${part.name}" has exposed occluder blobs — ${(fm.blobRatio * 100).toFixed(0)}% of the foliage is bare closed spheres ("green balls") showing through the leaf shell`,
            suggestion: `shrink the interior occluder spheres and/or thicken the leaf shell so cards fully wrap them; the blob must never reach the crown silhouette`,
          });
          geomPenalty += sev === "hard" ? HARD_PENALTY : SOFT_PENALTY;
        }
      }
    }
  }

  // Same-facing coplanar overlaps cause depth-buffer flicker / speckled
  // windows in the viewer. This is assembly-level: frame/glass/wall parts can
  // each be valid alone but fight once rendered together.
  const zf = zFightingReport(parts, { includeSamePart: false });
  if (zf.pairs > 0) {
    const example = zf.examples[0];
    const where = example ? `${example.partA}/${example.partB}` : zf.parts.slice(0, 2).join("/");
    issues.push({
      axis: "geometry",
      severity: "hard",
      ...(where ? { part: where } : {}),
      finding: `${zf.pairs} coplanar same-facing triangle pair(s) overlap (z-fighting / 重面闪烁)`,
      suggestion: "offset glass/decals/panels along their normals, cut real openings, or delete hidden coplanar faces; do not stack render surfaces on the same plane",
    });
    geomPenalty += HARD_PENALTY;
  }

  // --- Functional plausibility: sealed vessels must not leak ---
  // A water tower / bottle / tank holds liquid, so its container must have no
  // gaps between staves/panels. Per-part watertight can't see this (each plank
  // is closed on its own); the assembly-level seal test can.
  let functionPenalty = 0;
  if (rubric.mustBeSealed) {
    const sealNames = rubric.sealParts ?? ["tank", "barrel", "body", "vessel", "drum"];
    const sealRe = new RegExp(sealNames.map(escapeRe).join("|"), "i");
    const vessel = parts.filter((p) => sealRe.test(p.name) || sealRe.test(p.label ?? ""));
    if (vessel.length > 0) {
      const combined = merge(...vessel.map((p) => p.mesh));
      const seal = sealTest(combined);
      // A properly closed vessel encloses ~1.0. The side wall (staves) leaking
      // is the tell-tale of a gapped barrel; weight it heavily. Roof/floor gaps
      // show up in overall enclosure.
      if (seal.sideEnclosure < 0.85) {
        issues.push({
          axis: "realism", severity: "hard",
          part: vessel[0]!.name,
          finding: `"${vessel[0]!.name}" is not sealed — only ${(seal.sideEnclosure * 100).toFixed(0)}% of side-wall rays are blocked, so there are gaps between staves/panels (it would leak)`,
          suggestion: `close the gaps: overlap/merge the staves into a continuous wall, or add an inner shell so the vessel actually holds liquid`,
        });
        functionPenalty += HARD_PENALTY;
      } else if (seal.enclosure < 0.9) {
        issues.push({
          axis: "realism", severity: "soft",
          part: vessel[0]!.name,
          finding: `"${vessel[0]!.name}" side walls are sealed but the top/bottom leaks (${(seal.enclosure * 100).toFixed(0)}% enclosed)`,
          suggestion: `cap the vessel: add a floor and/or lid so it is fully closed`,
        });
        functionPenalty += SOFT_PENALTY;
      }
    }
  }
  if (rubric.requiresAccessPath || rubric.category === "fire-escape") {
    functionPenalty += checkFireEscapeAccess(parts, issues);
  }
  if (rubric.category === "settlement") {
    functionPenalty += checkSettlementLayout(parts, issues, size);
  }
  if (opts.checkSupport !== false) {
    functionPenalty += checkStructuralSupport(parts, issues, size, opts.groundY ?? 0);
  }

  // --- Whole-model scale + proportion (C tier, deterministic) ---
  const height = size.y;

  // Scale sanity only applies when we actually know the category: a generic /
  // unclassified model (building, city block, overpass, sign) has no canonical
  // height, so the 0.3-4 envelope would just produce noise. Use the rubric's
  // own heightRange when present, otherwise the caller's explicit scaleRange,
  // otherwise skip the check.
  const heightRange = rubric.heightRange ?? (opts.scaleRange ? scaleRange : undefined);
  let propPenalty = 0;
  if (heightRange && (height < heightRange[0] || height > heightRange[1])) {
    issues.push({
      axis: "proportion", severity: "soft",
      finding: `model height ${height.toFixed(2)} is outside the expected ${heightRange[0]}-${heightRange[1]} units`,
      suggestion: `rescale so the model height lands in ${heightRange[0]}-${heightRange[1]} units`,
    });
    propPenalty += SOFT_PENALTY;
  }

  const ratios: Record<string, number> = {
    "h/w": size.y / Math.max(size.x, 1e-6),
    "h/d": size.y / Math.max(size.z, 1e-6),
    "w/d": size.x / Math.max(size.z, 1e-6),
  };
  for (const pr of rubric.proportions) {
    const v = ratios[pr.ratio]!;
    if (v < pr.min || v > pr.max) {
      issues.push({
        axis: "proportion", severity: "soft",
        finding: `${pr.ratio}=${v.toFixed(2)} outside expected ${pr.min}-${pr.max}: ${pr.note}`,
        suggestion: `adjust proportions so ${pr.ratio} lands in ${pr.min}-${pr.max}`,
      });
      propPenalty += SOFT_PENALTY;
    }
  }

  // --- Rubric structure: expected parts + counts ---
  // Accept role synonyms so a "canopy" satisfies "foliage", "cockpit" satisfies
  // "cabin", etc. — the modeler shouldn't be forced into one exact word.
  const rolesFor = (role: string): string[] => rubric.partSynonyms?.[role] ?? [role];
  const hardExpected = new Set(rubric.hardExpectedParts ?? []);
  for (const role of rubric.expectedParts) {
    const names = rolesFor(role);
    if (!names.some((n) => hasRole(parts, n))) {
      const severity: Severity = hardExpected.has(role) ? "hard" : "soft";
      issues.push({
        axis: "realism", severity,
        finding: `no part appears to be the "${role}" a ${rubric.category} should have`,
        suggestion: `add a "${role}" part (name it so its role is clear)`,
      });
      propPenalty += severity === "hard" ? HARD_PENALTY : SOFT_PENALTY;
    }
  }
  if (rubric.counts) {
    for (const [role, [lo, hi]] of Object.entries(rubric.counts)) {
      const n = rolesFor(role).reduce((s, name) => s + countRole(parts, name), 0);
      if (n > 0 && (n < lo || n > hi)) {
        issues.push({
          axis: "realism", severity: "soft",
          finding: `${n} "${role}" parts; a ${rubric.category} usually has ${lo === hi ? lo : `${lo}-${hi}`}`,
          suggestion: `use ${lo === hi ? lo : `${lo}-${hi}`} "${role}" parts`,
        });
        propPenalty += SOFT_PENALTY;
      }
    }
  }

  // --- Scores ---
  const geometry = clamp01(1 - geomPenalty);
  const proportion = clamp01(1 - propPenalty);
  const aesthetic = opts.vlm ? clamp01(opts.vlm.aesthetic) : 1;
  // Functional plausibility (seal test) lands on the realism axis: a leaking
  // vessel is a realism failure, whether or not a VLM ran.
  const realism = opts.vlm
    ? clamp01(opts.vlm.realism - functionPenalty - motionPenalty - materialPenalty)
    : clamp01(proportion - functionPenalty - motionPenalty - materialPenalty);
  if (opts.vlm?.issues) issues.push(...opts.vlm.issues);

  // Geometry and proportion dominate the deterministic score; VLM axes weigh in
  // only when provided (aesthetic defaults to neutral 1 so it can't lower the
  // score before a VLM has spoken).
  const w = opts.vlm
    ? { geometry: 0.35, proportion: 0.2, aesthetic: 0.2, realism: 0.25 }
    : { geometry: 0.55, proportion: 0.45, aesthetic: 0, realism: 0 };
  // function/motion penalties always bite the overall score, even with no VLM
  // (where the realism axis carries no weight) — a leaking vessel or an
  // implausibly animated rigid object must score low, not just fail the pass gate.
  const deterministicRaw = clamp01(
    geometry * 0.55 + proportion * 0.45 - functionPenalty - motionPenalty - materialPenalty,
  );
  const rawOverall = clamp01(
    w.geometry * geometry + w.proportion * proportion + w.aesthetic * aesthetic + w.realism * realism - functionPenalty - motionPenalty - materialPenalty,
  );

  const hardCount = issues.filter((i) => i.severity === "hard").length;
  const deterministic = hardCount > 0
    ? Math.min(deterministicRaw, Math.max(0, threshold - 0.01))
    : deterministicRaw;
  const overall = hardCount > 0 ? Math.min(rawOverall, Math.max(0, threshold - 0.01)) : rawOverall;
  const passed = hardCount === 0 && overall >= threshold;

  return {
    category: rubric.category,
    scores: { geometry, proportion, aesthetic, realism, deterministic, overall },
    issues,
    passed,
    partMetrics,
  };
}

/**
 * Render a critique as compact agent feedback: the score line plus the
 * prioritized issues (hard first), each with its fix. This is what gets
 * appended to the LLM's next-turn message so revision is targeted.
 */
export function formatCritique(report: CritiqueReport, maxIssues = 8): string {
  const s = report.scores;
  const head =
    `Critique [${report.category}] overall=${s.overall.toFixed(2)} deterministic=${s.deterministic.toFixed(2)} ` +
    `(geometry=${s.geometry.toFixed(2)}, proportion=${s.proportion.toFixed(2)}` +
    (s.aesthetic < 1 || s.realism !== s.proportion
      ? `, aesthetic=${s.aesthetic.toFixed(2)}, realism=${s.realism.toFixed(2)}`
      : "") +
    `)${report.passed ? " PASS" : ""}`;
  if (report.issues.length === 0) return `${head}\nNo issues found.`;

  const sorted = [...report.issues].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "hard" ? -1 : 1,
  );
  const lines = sorted.slice(0, maxIssues).map((i) => {
    const where = i.part ? ` [${i.part}]` : "";
    const tag = i.severity === "hard" ? "MUST FIX" : "improve";
    return `- (${tag}, ${i.axis})${where} ${i.finding} -> ${i.suggestion}`;
  });
  const more = sorted.length > maxIssues ? `\n(+${sorted.length - maxIssues} more)` : "";
  return `${head}\n${lines.join("\n")}${more}`;
}
