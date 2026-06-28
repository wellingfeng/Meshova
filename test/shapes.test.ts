import { describe, it, expect } from "vitest";
import {
  lathe,
  profileSweep,
  loft,
  capsule,
  roundedBox,
  rectProfile,
  lProfile,
  polyline,
  toTopo,
  diagnose,
  triangleCount,
  bounds,
  length,
  vec2,
  vec3,
  type Mesh,
} from "../src/index.js";

function assertValid(m: Mesh) {
  expect(m.normals.length).toBe(m.positions.length);
  expect(m.uvs.length).toBe(m.positions.length);
  expect(m.indices.length % 3).toBe(0);
  expect(m.indices.length).toBeGreaterThan(0);
  for (const idx of m.indices) {
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(m.positions.length);
  }
  for (const n of m.normals) expect(length(n)).toBeCloseTo(1, 3);
}

describe("lathe", () => {
  it("revolves a profile into a closed solid of revolution", () => {
    // A simple cup-ish profile: radius grows then a lip.
    const profile = [vec2(0, -0.5), vec2(0.4, -0.5), vec2(0.4, 0.5), vec2(0.45, 0.5), vec2(0, 0.5)];
    const m = lathe(profile, { segments: 24 });
    assertValid(m);
    const b = bounds(m);
    expect(b.max.x).toBeCloseTo(0.45, 2);
    expect(b.max.y).toBeCloseTo(0.5, 4);
    expect(b.min.y).toBeCloseTo(-0.5, 4);
  });

  it("partial sweep with caps stays valid", () => {
    const profile = [vec2(0.2, -0.3), vec2(0.4, 0), vec2(0.2, 0.3)];
    const m = lathe(profile, { segments: 12, angle: Math.PI, caps: true });
    assertValid(m);
  });
});

describe("profileSweep", () => {
  it("sweeps a rectangle along a straight line", () => {
    const curve = polyline([vec3(0, 0, 0), vec3(0, 1, 0), vec3(0, 2, 0)]);
    const m = profileSweep(curve, rectProfile(0.1, 0.05), { caps: true });
    assertValid(m);
    expect(bounds(m).max.y).toBeCloseTo(2, 4);
  });

  it("L-profile rail along a curve produces geometry", () => {
    const curve = polyline([vec3(0, 0, 0), vec3(1, 0, 0), vec3(2, 0, 1)]);
    const m = profileSweep(curve, lProfile(0.2, 0.2, 0.05));
    assertValid(m);
    expect(triangleCount(m)).toBeGreaterThan(0);
  });
});

describe("loft", () => {
  it("skins through three square rings of equal point count", () => {
    const sq = (y: number, s: number) =>
      [vec3(-s, y, -s), vec3(s, y, -s), vec3(s, y, s), vec3(-s, y, s)];
    const m = loft([sq(0, 1), sq(1, 0.6), sq(2, 1)], { caps: true });
    assertValid(m);
    expect(bounds(m).max.y).toBeCloseTo(2, 4);
  });

  it("rejects mismatched ring sizes", () => {
    const m = loft([[vec3(0, 0, 0), vec3(1, 0, 0)], [vec3(0, 1, 0)]]);
    expect(m.indices.length).toBe(0);
  });
});

describe("capsule", () => {
  it("is a watertight pill of the requested extent", () => {
    const m = capsule(0.4, 1.4, 24, 6);
    assertValid(m);
    const b = bounds(m);
    expect(b.max.y).toBeCloseTo(0.7, 1);
    expect(b.max.x).toBeCloseTo(0.4, 1);
    expect(diagnose(toTopo(m)).isClosed).toBe(true);
  });
});

describe("roundedBox", () => {
  it("fits the requested dimensions and rounds the corners", () => {
    const m = roundedBox({ width: 2, height: 1, depth: 1, radius: 0.2, steps: 3 });
    assertValid(m);
    const b = bounds(m);
    expect(b.max.x).toBeCloseTo(1, 2);
    expect(b.max.y).toBeCloseTo(0.5, 2);
    // A corner vertex should be pulled in from the sharp-cube corner (1,0.5,0.5).
    const sharp = vec3(1, 0.5, 0.5);
    const minCornerDist = Math.min(
      ...m.positions.map((p) => length(vec3(p.x - sharp.x, p.y - sharp.y, p.z - sharp.z))),
    );
    expect(minCornerDist).toBeGreaterThan(0.05);
  });

  it("clamps radius to half the smallest dimension", () => {
    const m = roundedBox({ width: 1, height: 1, depth: 1, radius: 5 });
    assertValid(m);
    expect(bounds(m).max.x).toBeLessThanOrEqual(0.5 + 1e-6);
  });
});
