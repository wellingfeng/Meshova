/**
 * Generic cloth physics — a standalone XPBD solver for any triangle mesh.
 *
 * Unlike `clothing/xpbd.ts` (which is bound to an Avatar collider for garments),
 * this operates on *any* mesh with generic colliders (ground plane, spheres,
 * infinite planes) plus gravity, pin selection, and a steady wind force. It is
 * the geometry-DSL entry point for "drop this fabric and let it settle".
 *
 * Determinism is preserved: the solve is a fixed number of deterministic
 * substeps with no random and no wall-clock. Same mesh + same params => same
 * settled mesh, every run (a hard project invariant). The input mesh is never
 * mutated; a new mesh with recomputed normals is returned.
 *
 * Model: Extended Position-Based Dynamics (Müller 2007 PBD + Macklin 2016 XPBD
 * compliance). Stretch constraints on every unique edge hold the weave; bend
 * constraints on shared interior edges (distance between the two opposite
 * vertices) resist folding. Verlet integration with velocity damping.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3, add, sub, scale, length, dot, distance } from "../math/vec3.js";
import type { Mesh } from "./mesh.js";
import { makeMesh, recomputeNormals } from "./mesh.js";

/** A sphere collider: cloth is pushed to stay outside `radius` of `center`. */
export interface SphereCollider {
  kind: "sphere";
  center: Vec3;
  radius: number;
}

/** A half-space collider: cloth stays on the +normal side of the plane. */
export interface PlaneCollider {
  kind: "plane";
  /** A point on the plane. */
  point: Vec3;
  /** Unit normal; cloth is kept on the side the normal points to. */
  normal: Vec3;
}

/** Infinite ground at a fixed Y; cloth never sinks below it. */
export interface GroundCollider {
  kind: "ground";
  /** Ground height. Default 0. */
  y?: number;
}

export type ClothCollider = SphereCollider | PlaneCollider | GroundCollider;

/**
 * Selects which particles are pinned (invMass = 0, immovable anchors). Return
 * true to pin. `index` is the vertex index, `p` its rest position.
 */
export type PinSelector = (p: Vec3, index: number) => boolean;

export interface ClothSimOptions {
  /** Solver substeps. More = stiffer + more settled + slower. Default 40. */
  iterations?: number;
  /**
   * Constraint projection passes per substep. Higher = tighter weave (less
   * rubber-band stretch) at linear cost. Default 8 — 3 leaves long pin-to-pin
   * chains under-solved so edges over-stretch and corners spike.
   */
  passes?: number;
  /** Gravity acceleration (applied along -Y unless `gravityDir` given). Default 0.008 per step^2. */
  gravity?: number;
  /** Optional gravity direction (unit-ish). Overrides the default -Y. */
  gravityDir?: Vec3;
  /** Timestep per substep. Default 1. */
  dt?: number;
  /** Velocity damping in [0,0.95]. Higher = calmer. Default 0.12. */
  damping?: number;
  /** Stretch stiffness in [0,1] (1 = inextensible). Default 0.9. */
  stretchStiffness?: number;
  /** Bend stiffness in [0,1] (1 = stiff/cardboard, 0 = limp). Default 0.3. */
  bendStiffness?: number;
  /** Steady wind force vector (added like gravity each step). Default none. */
  wind?: Vec3;
  /** Colliders the cloth must stay outside of. */
  colliders?: ReadonlyArray<ClothCollider>;
  /** Collision skin offset (cloth floats this far off colliders). Default 0.01. */
  collisionOffset?: number;
  /**
   * Strain limit (Provot 1995): hard-cap each stretch edge to this multiple of
   * its rest length after constraint projection, so a heavy fall can never
   * rubber-band the weave into spikes. 1 = inextensible, 1.1 = 10% give.
   * Default 1.1. Set to 0/undefined to disable.
   */
  maxStretch?: number;
  /** Explicit pin predicate. Takes priority over the pin* shortcuts below. */
  pin?: PinSelector;
  /** Pin every particle whose Y >= this value. */
  pinAboveY?: number;
  /** Pin particles within this distance of the highest point. */
  pinTopBand?: number;
}

interface DistanceConstraint {
  i: number;
  j: number;
  rest: number;
  compliance: number;
}

/**
 * Relaxation sweeps for the Provot strain limiter per pass. The limiter runs
 * every solver pass where the per-step displacement is small, so a few local
 * sweeps keep the running strain bounded; it does not try to fully converge a
 * cold-start over-stretch in one call (Gauss-Seidel propagates too slowly for
 * that, and the incremental path never needs it).
 */
const STRAIN_SWEEPS = 8;

/** Map 0..1 stiffness to an XPBD compliance (rigid near 1, soft near 0). */
function stiffnessToCompliance(stiffness: number): number {
  const s = Math.max(0, Math.min(1, stiffness));
  return (1 - s) * 0.02 + 1e-6;
}

function buildEdges(indices: ReadonlyArray<number>): Array<[number, number]> {
  const seen = new Set<string>();
  const edges: Array<[number, number]> = [];
  const addEdge = (a: number, b: number) => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push([a, b]);
  };
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t]!;
    const b = indices[t + 1]!;
    const c = indices[t + 2]!;
    addEdge(a, b);
    addEdge(b, c);
    addEdge(c, a);
  }
  return edges;
}

/**
 * Bend constraints: for each interior edge shared by two triangles, hold the
 * distance between the two opposite vertices. This resists folding (a cheap
 * dihedral proxy used throughout real-time cloth).
 */
function buildBendConstraints(
  indices: ReadonlyArray<number>,
  positions: ReadonlyArray<Vec3>,
  compliance: number,
): DistanceConstraint[] {
  const edgeToOpp = new Map<string, number[]>();
  for (let t = 0; t < indices.length; t += 3) {
    const tri = [indices[t]!, indices[t + 1]!, indices[t + 2]!];
    for (let e = 0; e < 3; e++) {
      const a = tri[e]!;
      const b = tri[(e + 1) % 3]!;
      const opp = tri[(e + 2) % 3]!;
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const list = edgeToOpp.get(key) ?? [];
      list.push(opp);
      edgeToOpp.set(key, list);
    }
  }
  const cons: DistanceConstraint[] = [];
  for (const opps of edgeToOpp.values()) {
    if (opps.length === 2) {
      const i = opps[0]!;
      const j = opps[1]!;
      cons.push({ i, j, rest: distance(positions[i]!, positions[j]!), compliance });
    }
  }
  return cons;
}

/** Resolve a single collider against a point, returning the pushed position. */
function resolveCollider(c: ClothCollider, p: Vec3, offset: number): Vec3 {
  if (c.kind === "ground") {
    const y = (c.y ?? 0) + offset;
    return p.y < y ? vec3(p.x, y, p.z) : p;
  }
  if (c.kind === "sphere") {
    const d = sub(p, c.center);
    const dl = length(d);
    const r = c.radius + offset;
    if (dl <= 1e-6) return add(c.center, vec3(0, r, 0));
    if (dl < r) return add(c.center, scale(d, r / dl));
    return p;
  }
  // plane half-space
  const nl = length(c.normal) || 1;
  const nrm = scale(c.normal, 1 / nl);
  const signed = dot(sub(p, c.point), nrm) - offset;
  return signed < 0 ? sub(p, scale(nrm, signed)) : p;
}

/**
 * Simulate cloth: settle any triangle mesh under gravity, wind, colliders and
 * pinned anchors using XPBD. Returns a new mesh with recomputed normals.
 *
 * This is the generic geometry-DSL counterpart to `solveCloth` (which is bound
 * to an Avatar). Feed it a subdivided plane (`plane(w,d,cols,rows)`), pin an
 * edge or corners, add a sphere/ground collider, and it drapes realistically.
 */
export function simulateCloth(mesh: Mesh, opts: ClothSimOptions = {}): Mesh {
  const iterations = Math.max(1, Math.round(opts.iterations ?? 40));
  const passes = Math.max(1, Math.round(opts.passes ?? 8));
  const gMag = opts.gravity ?? 0.008;
  const dt = opts.dt ?? 1;
  const damping = Math.max(0, Math.min(0.95, opts.damping ?? 0.12));
  const offset = opts.collisionOffset ?? 0.01;
  const colliders = opts.colliders ?? [];
  const maxStretch = opts.maxStretch ?? 1.1;
  const limitStrain = maxStretch > 0;

  const n = mesh.positions.length;
  if (n === 0) return mesh;

  const pos: Vec3[] = mesh.positions.map((p) => vec3(p.x, p.y, p.z));
  const prev: Vec3[] = pos.map((p) => vec3(p.x, p.y, p.z));
  const invMass = new Float64Array(n).fill(1);

  // Gravity + wind as a single per-step acceleration vector.
  const gDir = opts.gravityDir ?? vec3(0, -1, 0);
  const gLen = length(gDir) || 1;
  const gUnit = scale(gDir, 1 / gLen);
  const accel = add(scale(gUnit, gMag), opts.wind ?? vec3(0, 0, 0));
  const accelStep = scale(accel, dt * dt);

  // Resolve pins: explicit predicate wins, else pinAboveY / pinTopBand.
  let maxY = -Infinity;
  for (const p of pos) if (p.y > maxY) maxY = p.y;
  for (let i = 0; i < n; i++) {
    const p = pos[i]!;
    let pinned = false;
    if (opts.pin) pinned = opts.pin(p, i);
    else {
      if (opts.pinAboveY !== undefined && p.y >= opts.pinAboveY) pinned = true;
      if (opts.pinTopBand !== undefined && maxY - p.y <= opts.pinTopBand) pinned = true;
    }
    if (pinned) invMass[i] = 0;
  }

  const stretchCompliance = stiffnessToCompliance(opts.stretchStiffness ?? 0.9);
  const bendCompliance = stiffnessToCompliance(opts.bendStiffness ?? 0.3) * 4;
  const edges = buildEdges(mesh.indices);
  const stretch: DistanceConstraint[] = edges.map(([i, j]) => ({
    i, j, rest: distance(pos[i]!, pos[j]!), compliance: stretchCompliance,
  }));
  const bend = buildBendConstraints(mesh.indices, pos, bendCompliance);
  const all = stretch.concat(bend);

  for (let iter = 0; iter < iterations; iter++) {
    // Verlet integrate with velocity damping + external acceleration.
    for (let i = 0; i < n; i++) {
      if (invMass[i] === 0) continue;
      const p = pos[i]!;
      const pr = prev[i]!;
      const vx = (p.x - pr.x) * (1 - damping);
      const vy = (p.y - pr.y) * (1 - damping);
      const vz = (p.z - pr.z) * (1 - damping);
      prev[i] = vec3(p.x, p.y, p.z);
      pos[i] = vec3(p.x + vx + accelStep.x, p.y + vy + accelStep.y, p.z + vz + accelStep.z);
    }

    for (let pass = 0; pass < passes; pass++) {
      for (const c of all) {
        const wi = invMass[c.i]!;
        const wj = invMass[c.j]!;
        const wSum = wi + wj;
        if (wSum === 0) continue;
        const pi = pos[c.i]!;
        const pj = pos[c.j]!;
        const d = sub(pi, pj);
        const len = length(d);
        if (len < 1e-9) continue;
        const dir = scale(d, 1 / len);
        const alpha = c.compliance / (dt * dt);
        const corr = (len - c.rest) / (wSum + alpha);
        if (wi > 0) pos[c.i] = sub(pi, scale(dir, corr * wi));
        if (wj > 0) pos[c.j] = add(pj, scale(dir, corr * wj));
      }

      // Provot strain limit: hard-clamp any stretch edge longer than maxStretch
      // x rest so a heavy fall can't rubber-band the weave into spikes. A single
      // Gauss-Seidel sweep under-corrects long pin-to-pin chains, so relax a few
      // sweeps until the worst edge is within tolerance (deterministic, bounded).
      if (limitStrain) {
        for (let sweep = 0; sweep < STRAIN_SWEEPS; sweep++) {
          let worst = 1;
          for (const c of stretch) {
            const wi = invMass[c.i]!;
            const wj = invMass[c.j]!;
            const wSum = wi + wj;
            if (wSum === 0) continue;
            const pi = pos[c.i]!;
            const pj = pos[c.j]!;
            const d = sub(pi, pj);
            const len = length(d);
            const cap = c.rest * maxStretch;
            if (len < 1e-9) continue;
            const ratio = len / c.rest;
            if (ratio > worst) worst = ratio;
            if (len <= cap) continue;
            const dir = scale(d, 1 / len);
            const corr = (len - cap) / wSum;
            if (wi > 0) pos[c.i] = sub(pi, scale(dir, corr * wi));
            if (wj > 0) pos[c.j] = add(pj, scale(dir, corr * wj));
          }
          if (worst <= maxStretch + 1e-4) break; // converged: nothing over cap
        }
      }

      if (colliders.length > 0) {
        for (let i = 0; i < n; i++) {
          if (invMass[i] === 0) continue;
          let p = pos[i]!;
          for (const col of colliders) p = resolveCollider(col, p, offset);
          pos[i] = p;
        }
      }
    }
  }

  return recomputeNormals(makeMesh({
    positions: pos,
    normals: pos.map(() => vec3(0, 1, 0)),
    uvs: mesh.uvs.map((uv) => ({ x: uv.x, y: uv.y })),
    indices: mesh.indices.slice(),
  }));
}

/** Average per-edge strain (|current-rest|/rest) — a stretch/settle metric. */
export function clothStrain(rest: Mesh, settled: Mesh): number {
  const edges = buildEdges(rest.indices);
  if (edges.length === 0) return 0;
  let sum = 0;
  let count = 0;
  for (const [i, j] of edges) {
    const r = distance(rest.positions[i]!, rest.positions[j]!);
    if (r < 1e-9) continue;
    sum += Math.abs(distance(settled.positions[i]!, settled.positions[j]!) - r) / r;
    count++;
  }
  return count === 0 ? 0 : sum / count;
}
