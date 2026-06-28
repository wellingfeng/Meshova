import { describe, it, expect } from "vitest";
import {
  // quat
  quat,
  qidentity,
  fromAxisAngle,
  qmultiply,
  qinvert,
  qrotate,
  qslerp,
  fromEuler,
  toEuler,
  dihedral,
  // vec3
  vec3,
  normalize,
  // query
  box,
  closestPointOnSegment,
  distancePointLine,
  closestPointOnTriangle,
  closestPointOnMesh,
  xyzdist,
  minpos,
  nearpoint,
} from "../src/index.js";

describe("quaternion VEX parity", () => {
  it("identity rotation leaves a vector unchanged", () => {
    const v = vec3(1, 2, 3);
    const r = qrotate(qidentity(), v);
    expect(r.x).toBeCloseTo(1);
    expect(r.y).toBeCloseTo(2);
    expect(r.z).toBeCloseTo(3);
  });

  it("90deg about Z maps +X to +Y", () => {
    const q = fromAxisAngle(vec3(0, 0, 1), Math.PI / 2);
    const r = qrotate(q, vec3(1, 0, 0));
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(1);
    expect(r.z).toBeCloseTo(0);
  });

  it("qmultiply composes rotations (two 90deg = 180deg)", () => {
    const q = fromAxisAngle(vec3(0, 0, 1), Math.PI / 2);
    const q2 = qmultiply(q, q);
    const r = qrotate(q2, vec3(1, 0, 0));
    expect(r.x).toBeCloseTo(-1);
    expect(r.y).toBeCloseTo(0);
  });

  it("qinvert undoes a rotation", () => {
    const q = fromAxisAngle(normalize(vec3(1, 2, 3)), 1.1);
    const v = vec3(0.5, -0.3, 0.8);
    const back = qrotate(qinvert(q), qrotate(q, v));
    expect(back.x).toBeCloseTo(0.5);
    expect(back.y).toBeCloseTo(-0.3);
    expect(back.z).toBeCloseTo(0.8);
  });

  it("slerp endpoints and midpoint stay unit", () => {
    const a = fromAxisAngle(vec3(0, 1, 0), 0);
    const b = fromAxisAngle(vec3(0, 1, 0), Math.PI / 2);
    const start = qslerp(a, b, 0);
    const mid = qslerp(a, b, 0.5);
    expect(qrotate(start, vec3(1, 0, 0)).x).toBeCloseTo(1);
    // mid should be a 45deg rotation
    const r = qrotate(mid, vec3(1, 0, 0));
    expect(r.x).toBeCloseTo(Math.cos(Math.PI / 4));
    expect(r.z).toBeCloseTo(-Math.sin(Math.PI / 4));
  });

  it("euler round-trip", () => {
    const q = fromEuler(0.3, -0.5, 0.7);
    const e = toEuler(q);
    // rebuild and compare action on a vector (euler is multivalued)
    const q2 = fromEuler(e.x, e.y, e.z);
    const v = vec3(1, 0.5, -0.2);
    const r1 = qrotate(q, v);
    const r2 = qrotate(q2, v);
    expect(r1.x).toBeCloseTo(r2.x);
    expect(r1.y).toBeCloseTo(r2.y);
    expect(r1.z).toBeCloseTo(r2.z);
  });

  it("dihedral rotates `from` onto `to`", () => {
    const from = vec3(1, 0, 0);
    const to = normalize(vec3(0, 1, 1));
    const q = dihedral(from, to);
    const r = normalize(qrotate(q, from));
    expect(r.x).toBeCloseTo(to.x);
    expect(r.y).toBeCloseTo(to.y);
    expect(r.z).toBeCloseTo(to.z);
  });

  it("dihedral handles antiparallel", () => {
    const q = dihedral(vec3(1, 0, 0), vec3(-1, 0, 0));
    const r = qrotate(q, vec3(1, 0, 0));
    expect(r.x).toBeCloseTo(-1);
  });
});

describe("surface query VEX parity", () => {
  it("closestPointOnSegment clamps to endpoints", () => {
    const a = vec3(0, 0, 0);
    const b = vec3(2, 0, 0);
    expect(closestPointOnSegment(vec3(-1, 5, 0), a, b)).toEqual(a);
    expect(closestPointOnSegment(vec3(3, 5, 0), a, b)).toEqual(b);
    expect(closestPointOnSegment(vec3(1, 5, 0), a, b)).toEqual(vec3(1, 0, 0));
  });

  it("distancePointLine ignores along-axis position", () => {
    const d = distancePointLine(vec3(10, 3, 0), vec3(0, 0, 0), vec3(1, 0, 0));
    expect(d).toBeCloseTo(3);
  });

  it("closestPointOnTriangle projects onto the face interior", () => {
    const a = vec3(0, 0, 0);
    const b = vec3(1, 0, 0);
    const c = vec3(0, 1, 0);
    const r = closestPointOnTriangle(vec3(0.25, 0.25, 5), a, b, c);
    expect(r.position.z).toBeCloseTo(0);
    expect(r.position.x).toBeCloseTo(0.25);
    expect(r.position.y).toBeCloseTo(0.25);
  });

  it("closestPointOnMesh / xyzdist on a unit box", () => {
    const m = box(2, 2, 2); // spans -1..1
    const cp = closestPointOnMesh(m, vec3(5, 0, 0));
    expect(cp.position.x).toBeCloseTo(1);
    expect(cp.distance).toBeCloseTo(4);
    expect(xyzdist(m, vec3(0, 5, 0))).toBeCloseTo(4);
  });

  it("minpos lands on the surface", () => {
    const m = box(2, 2, 2);
    const p = minpos(m, vec3(0, 0, 10));
    expect(p.z).toBeCloseTo(1);
  });

  it("nearpoint returns a valid vertex index near the query", () => {
    const m = box(2, 2, 2);
    const idx = nearpoint(m, vec3(5, 5, 5));
    expect(idx).toBeGreaterThanOrEqual(0);
    const v = m.positions[idx]!;
    // nearest corner to (5,5,5) is (1,1,1)
    expect(v.x).toBeCloseTo(1);
    expect(v.y).toBeCloseTo(1);
    expect(v.z).toBeCloseTo(1);
  });
});
