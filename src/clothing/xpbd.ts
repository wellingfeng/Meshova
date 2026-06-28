/**
 * XPBD cloth solver (M7 — XPBD Solver).
 *
 * Extended Position-Based Dynamics: a stable cloth simulator that converges by
 * projecting constraints (Müller 2007 PBD + Macklin 2016 XPBD compliance). It
 * upgrades the heuristic drape from "shaped shell" to "settled cloth": stretch
 * + bend constraints, gravity, avatar collision, and damping produce real folds
 * and hang.
 *
 * Determinism preserved: integration is fully deterministic given input mesh +
 * params (no random, no wall-clock). Same garment + same iterations => same
 * settled mesh. The input mesh is never mutated (project invariant).
 *
 * Collision uses the avatar's capsule limbs + torso ellipse stack as colliders.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3, add, sub, scale, length, dot, distance } from "../math/vec3.js";
import type { Mesh } from "../geometry/mesh.js";
import { makeMesh, recomputeNormals } from "../geometry/mesh.js";
import type { Avatar } from "./avatar.js";
import { bodySectionAt } from "./avatar.js";
import type { FabricPhysical } from "./fabric.js";

/** Distance constraint between two particles with a rest length + compliance. */
interface DistanceConstraint {
  i: number;
  j: number;
  rest: number;
  /** XPBD compliance (inverse stiffness); 0 = rigid. */
  compliance: number;
}

export interface SolveOptions {
  /** Solver iterations (time substeps). More = stiffer + slower. */
  iterations?: number;
  /** Constraint projection passes per iteration. */
  passes?: number;
  /** Gravity per step^2. Negative Y pulls down. */
  gravity?: number;
  /** Timestep per iteration. */
  dt?: number;
  /** Fabric controlling stretch/bend stiffness + density + damping. */
  fabric?: FabricPhysical;
  /** Avatar collider; if present, particles are pushed outside the body. */
  avatar?: Avatar;
  /** Collision skin offset (cloth floats this far off the body). */
  collisionOffset?: number;
  /** Pin particles whose Y is above this (anchors a waistband/shoulder). */
  pinAboveY?: number;
  /** Pin particles within this distance of the highest point (alt anchor). */
  pinTopBand?: number;
}

const DEFAULT_FABRIC: FabricPhysical = {
  stretchStiffness: 0.7,
  bendStiffness: 0.4,
  shearStiffness: 0.5,
  density: 0.5,
  damping: 0.15,
};

/** Map a 0..1 stiffness to an XPBD compliance (rigid at 1, soft at 0). */
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
 * Bend constraints: for each interior edge shared by two triangles, constrain
 * the two opposite vertices' distance. Holding that diagonal resists folding (a
 * cheap dihedral proxy widely used in real-time cloth).
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

/** Push a point outside the avatar body (torso ellipse + limb capsules). */
function collide(avatar: Avatar, p: Vec3, offset: number): Vec3 {
  let out = p;

  const lo = avatar.sections[0]!.y;
  const hi = avatar.sections[avatar.sections.length - 1]!.y;
  if (out.y >= lo && out.y <= hi) {
    const sec = bodySectionAt(avatar, out.y);
    const rx = sec.rx + offset;
    const rz = sec.rz + offset;
    const dx = out.x - sec.cx;
    const dz = out.z - sec.cz;
    const e = (dx * dx) / (rx * rx) + (dz * dz) / (rz * rz);
    if (e < 1 && e > 1e-6) {
      const s = 1 / Math.sqrt(e);
      out = vec3(sec.cx + dx * s, out.y, sec.cz + dz * s);
    }
  }

  for (const limb of avatar.limbs) {
    const ab = sub(limb.end, limb.start);
    const abLen2 = dot(ab, ab);
    if (abLen2 < 1e-9) continue;
    let t = dot(sub(out, limb.start), ab) / abLen2;
    t = Math.max(0, Math.min(1, t));
    const closest = add(limb.start, scale(ab, t));
    const r = limb.startRadius + (limb.endRadius - limb.startRadius) * t + offset;
    const d = sub(out, closest);
    const dl = length(d);
    if (dl < r && dl > 1e-6) {
      out = add(closest, scale(d, r / dl));
    }
  }

  return out;
}

/**
 * Settle a garment mesh with XPBD. Returns a new mesh with recomputed normals.
 */
export function solveCloth(mesh: Mesh, opts: SolveOptions = {}): Mesh {
  const iterations = Math.max(1, opts.iterations ?? 20);
  const passes = Math.max(1, opts.passes ?? 2);
  const gravity = opts.gravity ?? -0.012;
  const dt = opts.dt ?? 1;
  const fabric = opts.fabric ?? DEFAULT_FABRIC;
  const offset = opts.collisionOffset ?? 0.006;
  const damping = Math.max(0, Math.min(0.95, fabric.damping));

  const n = mesh.positions.length;
  const pos: Vec3[] = mesh.positions.map((p) => vec3(p.x, p.y, p.z));
  const prev: Vec3[] = pos.map((p) => vec3(p.x, p.y, p.z));
  const invMass = new Float64Array(n).fill(1);

  let maxY = -Infinity;
  for (const p of pos) if (p.y > maxY) maxY = p.y;
  const pinTop = opts.pinTopBand;
  const pinAbove = opts.pinAboveY;
  for (let i = 0; i < n; i++) {
    const y = pos[i]!.y;
    if (pinAbove !== undefined && y >= pinAbove) invMass[i] = 0;
    if (pinTop !== undefined && maxY - y <= pinTop) invMass[i] = 0;
  }

  const stretchCompliance = stiffnessToCompliance(fabric.stretchStiffness);
  const bendCompliance = stiffnessToCompliance(fabric.bendStiffness) * 4;
  const edges = buildEdges(mesh.indices);
  const stretch: DistanceConstraint[] = edges.map(([i, j]) => ({
    i, j, rest: distance(pos[i]!, pos[j]!), compliance: stretchCompliance,
  }));
  const bend = buildBendConstraints(mesh.indices, pos, bendCompliance);
  const all = stretch.concat(bend);

  const gravityStep = gravity * dt * dt;

  for (let iter = 0; iter < iterations; iter++) {
    // Integrate (Verlet-style with damping) + external gravity.
    for (let i = 0; i < n; i++) {
      if (invMass[i] === 0) continue;
      const p = pos[i]!;
      const pr = prev[i]!;
      const vx = (p.x - pr.x) * (1 - damping);
      const vy = (p.y - pr.y) * (1 - damping);
      const vz = (p.z - pr.z) * (1 - damping);
      prev[i] = vec3(p.x, p.y, p.z);
      pos[i] = vec3(p.x + vx, p.y + vy + gravityStep, p.z + vz);
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

      if (opts.avatar) {
        for (let i = 0; i < n; i++) {
          if (invMass[i] === 0) continue;
          pos[i] = collide(opts.avatar, pos[i]!, offset);
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

/** Average per-edge strain (deviation from rest length) — a fit/stress metric. */
export function meanStrain(mesh: Mesh, settled: Mesh): number {
  const edges = buildEdges(mesh.indices);
  if (edges.length === 0) return 0;
  let sum = 0;
  for (const [i, j] of edges) {
    const rest = distance(mesh.positions[i]!, mesh.positions[j]!);
    if (rest < 1e-9) continue;
    const cur = distance(settled.positions[i]!, settled.positions[j]!);
    sum += Math.abs(cur - rest) / rest;
  }
  return sum / edges.length;
}

