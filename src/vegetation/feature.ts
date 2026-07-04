import type { Mesh } from "../geometry/mesh.js";
import { merge } from "../geometry/mesh.js";
import { sphere } from "../geometry/primitives.js";
import { transform } from "../geometry/transform.js";
import type { Vec3 } from "../math/vec3.js";
import { add, normalize, scale, vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import type { BranchSegment } from "./branch.js";
import { curveFrameAt, rotateAround } from "./curve-frame.js";

export type BranchFeatureKind = "knot" | "burl" | "scar";

export interface BranchFeature {
  kind: BranchFeatureKind;
  position: Vec3;
  normal: Vec3;
  radius: number;
  depth: number;
  t: number;
}

export interface BranchFeatureOptions {
  seed?: number;
  count?: number;
  kind?: BranchFeatureKind | "mixed";
  /** Skip twigs thinner than this. */
  minBranchRadius?: number;
  /** Feature radius relative to host branch radius. */
  size?: number;
  /** Offset along normal relative to feature radius. */
  protrusion?: number;
}

export function branchFeatures(
  branches: ReadonlyArray<BranchSegment>,
  opts: BranchFeatureOptions = {},
): BranchFeature[] {
  const candidates = branches.filter((b) => b.radius >= (opts.minBranchRadius ?? 0.035));
  if (candidates.length === 0) return [];
  const rng = makeRng(opts.seed ?? 17);
  const count = Math.max(0, Math.floor(opts.count ?? 8));
  const size = opts.size ?? 1.15;
  const protrusion = opts.protrusion ?? 0.45;
  const out: BranchFeature[] = [];
  for (let i = 0; i < count; i++) {
    const branch = candidates[Math.floor(rng.next() * candidates.length)]!;
    const t = 0.12 + rng.next() * 0.72;
    const frame = curveFrameAt(branch.curve, t);
    const roll = rng.next() * Math.PI * 2;
    const normal = normalize(rotateAround(frame.normal, frame.tangent, roll));
    const kind = chooseKind(opts.kind ?? "mixed", rng.next());
    const radius = branch.radius * size * (0.55 + rng.next() * 0.65);
    out.push({
      kind,
      position: add(frame.position, scale(normal, branch.radius + radius * protrusion)),
      normal,
      radius,
      depth: branch.depth,
      t,
    });
  }
  return out;
}

export function branchFeatureMeshes(
  branches: ReadonlyArray<BranchSegment>,
  opts: BranchFeatureOptions = {},
): Mesh {
  const meshes = branchFeatures(branches, opts).map(featureToMesh);
  return meshes.length ? merge(...meshes) : merge();
}

function featureToMesh(feature: BranchFeature): Mesh {
  const base = sphere(1, 8, 5);
  const flatten = feature.kind === "scar" ? 0.18 : feature.kind === "knot" ? 0.55 : 0.85;
  return transform(base, {
    translate: feature.position,
    scale: vec3(feature.radius, feature.radius * flatten, feature.radius),
  });
}

function chooseKind(kind: BranchFeatureOptions["kind"], r: number): BranchFeatureKind {
  if (kind && kind !== "mixed") return kind;
  if (r < 0.5) return "knot";
  if (r < 0.82) return "burl";
  return "scar";
}
