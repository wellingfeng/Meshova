import { describe, it, expect } from "vitest";
import {
  polyline,
  bankedFrames,
  trackSurface,
  instanceAlongCurve,
  box,
  vec3,
  triangleCount,
  vertexCount,
  bounds,
  dot,
  type Mesh,
} from "../src/index.js";

function assertValid(m: Mesh) {
  expect(m.positions.length).toBeGreaterThan(0);
  expect(m.indices.length % 3).toBe(0);
  for (const i of m.indices) {
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(m.positions.length);
  }
  for (const p of m.positions) {
    expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
  }
}

// A gentle S-curve in the XZ plane (flat ground), enough resolution for banking.
function sCurve() {
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const x = t * 40;
    const z = Math.sin(t * Math.PI * 2) * 8;
    pts.push(vec3(x, 0, z));
  }
  return polyline(pts);
}

// A straight line — should produce zero banking.
function straight() {
  const pts = [];
  for (let i = 0; i <= 20; i++) pts.push(vec3(i * 2, 0, 0));
  return polyline(pts);
}

describe("bankedFrames (Auto-Bank)", () => {
  it("keeps a straight road flat (up stays world +Y)", () => {
    const frames = bankedFrames(straight(), { factor: 1 });
    for (const f of frames) {
      expect(f.normal.y).toBeGreaterThan(0.999);
    }
  });

  it("banks a curved road (normal tilts away from world up)", () => {
    const frames = bankedFrames(sCurve(), { factor: 1.5, smooth: 1 });
    const minUpY = Math.min(...frames.map((f) => f.normal.y));
    expect(minUpY).toBeLessThan(0.99); // some frames leaned
  });

  it("factor 0 disables banking", () => {
    const frames = bankedFrames(sCurve(), { factor: 0 });
    for (const f of frames) expect(f.normal.y).toBeGreaterThan(0.999);
  });

  it("respects maxAngle clamp", () => {
    const frames = bankedFrames(sCurve(), { factor: 100, maxAngle: 0.2, smooth: 0 });
    // cos(0.2) ~ 0.980; allow tiny numeric slack.
    for (const f of frames) expect(f.normal.y).toBeGreaterThanOrEqual(Math.cos(0.2) - 1e-3);
  });

  it("is deterministic", () => {
    const a = bankedFrames(sCurve(), { factor: 1 });
    const b = bankedFrames(sCurve(), { factor: 1 });
    for (let i = 0; i < a.length; i++) {
      expect(a[i]!.normal.x).toBe(b[i]!.normal.x);
      expect(a[i]!.normal.y).toBe(b[i]!.normal.y);
    }
  });
});

describe("trackSurface", () => {
  it("builds a valid flat road strip", () => {
    const m = trackSurface(straight(), { width: 4, bank: { factor: 0 } });
    assertValid(m);
    const b = bounds(m);
    // width 4 half-width => ~8 across the Z axis.
    expect(b.max.z - b.min.z).toBeGreaterThan(7.9);
    expect(b.max.z - b.min.z).toBeLessThan(8.1);
  });

  it("coving widens the cross-section and drops below the road plane", () => {
    const flat = trackSurface(straight(), { width: 4, bank: { factor: 0 } });
    const coved = trackSurface(straight(), { width: 4, coving: 2, covingDrop: 1.5, bank: { factor: 0 } });
    const fb = bounds(flat), cb = bounds(coved);
    expect(cb.max.z - cb.min.z).toBeGreaterThan(fb.max.z - fb.min.z); // wider
    expect(cb.min.y).toBeLessThan(-1.4); // skirt dips down ~1.5
    expect(triangleCount(coved)).toBeGreaterThan(triangleCount(flat));
  });

  it("banked road tilts vertices off the flat plane", () => {
    const flat = trackSurface(sCurve(), { width: 4, bank: { factor: 0 } });
    const banked = trackSurface(sCurve(), { width: 4, bank: { factor: 1.5, smooth: 1 } });
    const flatSpan = bounds(flat).max.y - bounds(flat).min.y;
    const bankSpan = bounds(banked).max.y - bounds(banked).min.y;
    expect(bankSpan).toBeGreaterThan(flatSpan + 0.1); // banking adds vertical range
  });
});

describe("instanceAlongCurve", () => {
  it("stamps evenly spaced boxes along the curve", () => {
    const post = box(0.3, 1, 0.3);
    const m = instanceAlongCurve(straight(), post, { spacing: 4 });
    assertValid(m);
    // straight length 40, spacing 4 => ~11 posts => 12 tris/box * count.
    const perBox = triangleCount(post);
    const count = triangleCount(m) / perBox;
    expect(count).toBeGreaterThanOrEqual(9);
    expect(count).toBeLessThanOrEqual(13);
  });

  it("offset pushes instances to one side", () => {
    const post = box(0.3, 1, 0.3);
    const center = instanceAlongCurve(straight(), post, { spacing: 4, offset: 0 });
    const right = instanceAlongCurve(straight(), post, { spacing: 4, offset: 3 });
    // Straight runs along +X, road sideways axis has a Z component => offset shifts Z.
    expect(Math.abs(bounds(right).max.z - bounds(center).max.z)).toBeGreaterThan(1);
  });

  it("endsOffset trims instances near the ends", () => {
    const post = box(0.3, 1, 0.3);
    const full = instanceAlongCurve(straight(), post, { spacing: 4, endsOffset: 0 });
    const trimmed = instanceAlongCurve(straight(), post, { spacing: 4, endsOffset: 2 });
    expect(triangleCount(trimmed)).toBeLessThan(triangleCount(full));
  });

  it("is deterministic", () => {
    const post = box(0.3, 1, 0.3);
    const a = instanceAlongCurve(sCurve(), post, { spacing: 3 });
    const b = instanceAlongCurve(sCurve(), post, { spacing: 3 });
    expect(vertexCount(a)).toBe(vertexCount(b));
    expect(a.positions[0]!.x).toBe(b.positions[0]!.x);
  });
});

