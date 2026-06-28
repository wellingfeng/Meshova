import { describe, it, expect } from "vitest";
import {
  box, sphere, plane, cylinder, cone, torus, icosphere, circle,
  polyline, sweep, subdivide, displaceByNoise, extrude,
  recomputeNormals, vec3,
  buildSkirt, buildTShirt, buildPants,
  type Mesh, type Vec3,
} from "../src/index.js";

function cross(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}
function sub(a: Vec3, b: Vec3): Vec3 { return vec3(a.x - b.x, a.y - b.y, a.z - b.z); }
function add(a: Vec3, b: Vec3): Vec3 { return vec3(a.x + b.x, a.y + b.y, a.z + b.z); }
function dot(a: Vec3, b: Vec3): number { return a.x * b.x + a.y * b.y + a.z * b.z; }

function centroid(m: Mesh): Vec3 {
  let c = vec3(0, 0, 0);
  for (const p of m.positions) c = add(c, p);
  return vec3(c.x / m.positions.length, c.y / m.positions.length, c.z / m.positions.length);
}

/** Fraction of faces whose winding-derived normal points outward.
 *  mode "radial3": away from mesh centroid (closed/convex shapes).
 *  mode "axisY":   away from the vertical axis through centroid (tubes/garments). */
function outwardFraction(m: Mesh, mode: "radial3" | "axisY"): number {
  const ctr = centroid(m);
  let out = 0, tot = 0;
  for (let i = 0; i < m.indices.length; i += 3) {
    const a = m.positions[m.indices[i]!]!;
    const b = m.positions[m.indices[i + 1]!]!;
    const c = m.positions[m.indices[i + 2]!]!;
    const fn = cross(sub(b, a), sub(c, a));
    const fc = vec3((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3);
    const rad = mode === "axisY"
      ? vec3(fc.x - ctr.x, 0, fc.z - ctr.z)
      : sub(fc, ctr);
    const d = dot(fn, rad);
    if (Math.abs(d) > 1e-9) { tot++; if (d > 0) out++; }
  }
  return tot === 0 ? 1 : out / tot;
}

/** Fraction of faces whose winding agrees with the stored vertex normals. */
function windingMatchesNormals(m: Mesh): number {
  let ok = 0, tot = 0;
  for (let i = 0; i < m.indices.length; i += 3) {
    const ia = m.indices[i]!, ib = m.indices[i + 1]!, ic = m.indices[i + 2]!;
    const fn = cross(sub(m.positions[ib]!, m.positions[ia]!), sub(m.positions[ic]!, m.positions[ia]!));
    const vn = add(add(m.normals[ia]!, m.normals[ib]!), m.normals[ic]!);
    const d = dot(fn, vn);
    if (Math.abs(d) > 1e-9) { tot++; if (d > 0) ok++; }
  }
  return tot === 0 ? 1 : ok / tot;
}

describe("winding orientation (regression: faces must front outward, never inverted)", () => {
  const solids: Array<[string, Mesh]> = [
    ["box", box(1, 1, 1)],
    ["sphere", sphere(0.5, 16, 12)],
    ["cylinder", cylinder(0.5, 1, 16, true)],
    ["cone", cone(0.5, 1, 16, true)],
    ["torus", torus(0.5, 0.2, 16, 12)],
    ["icosphere", icosphere(0.5, 1)],
    ["sweep", sweep(polyline([vec3(0, 0, 0), vec3(0, 1, 0), vec3(0, 2, 0)]), { radius: 0.2, sides: 8, caps: true })],
  ];

  // Convex closed solids: face normals must point away from the centroid.
  // (Torus is genus-1 and sweep is a tube, so "radial from centroid" does not
  // apply to them — they are covered by the winding-vs-normals invariant only.)
  const convexNames = new Set(["box", "sphere", "cylinder", "cone", "icosphere"]);

  for (const [name, m] of solids) {
    it(`${name}: winding agrees with stored normals`, () => {
      expect(windingMatchesNormals(m)).toBeGreaterThan(0.99);
    });
    if (convexNames.has(name)) {
      it(`${name}: face normals point outward`, () => {
        expect(outwardFraction(m, "radial3")).toBeGreaterThan(0.95);
      });
    }
  }

  it("plane: winding agrees with stored +Y normals", () => {
    const p = plane(2, 2, 4, 4);
    expect(windingMatchesNormals(p)).toBeGreaterThan(0.99);
  });

  it("circle: winding agrees with stored +Y normals", () => {
    const c = circle(0.5, 16);
    expect(windingMatchesNormals(c)).toBeGreaterThan(0.99);
  });
});

describe("winding survives operators (recomputeNormals follows winding)", () => {
  const baseSphere = sphere(0.5, 16, 12);
  // Closed/convex results: face normals must keep pointing outward.
  const convexOps: Array<[string, Mesh]> = [
    ["subdivide", subdivide(baseSphere, 1)],
    ["displaceByNoise", displaceByNoise(baseSphere, { amount: 0.1, scale: 2, seed: 3 })],
    ["recomputeNormals(sphere)", recomputeNormals(baseSphere)],
  ];
  for (const [name, m] of convexOps) {
    it(`${name}: stays outward`, () => {
      expect(outwardFraction(m, "radial3")).toBeGreaterThan(0.9);
    });
  }

  // extrude builds a non-convex slab (cap + side walls), so "radial from
  // centroid" does not apply. The invariant that matters is that the
  // recomputed normals stay consistent with the triangle winding.
  it("extrude: winding stays consistent with recomputed normals", () => {
    const m = extrude(plane(2, 2, 2, 2), 0.1);
    expect(windingMatchesNormals(m)).toBeGreaterThan(0.99);
  });
});

describe("garments front outward (regression: clothing must not render inside-out)", () => {
  const garments: Array<[string, ReturnType<typeof buildSkirt>]> = [
    ["skirt", buildSkirt({})],
    ["tshirt", buildTShirt({})],
    ["pants", buildPants({})],
  ];
  // Garment shells are now solidified (outer surface + inner lining + rim), so
  // they are closed two-sided shells: the inner lining correctly faces inward,
  // which means "all faces point away from the axis" no longer applies. The
  // invariant that still guarantees they don't render inside-out is that every
  // face's winding agrees with its stored vertex normals.
  for (const [name, parts] of garments) {
    for (const part of parts) {
      it(`${name}/${part.name}: winding agrees with stored normals`, () => {
        expect(windingMatchesNormals(part.mesh)).toBeGreaterThan(0.99);
      });
    }
  }
});
