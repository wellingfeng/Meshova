import { describe, it, expect } from "vitest";
import {
  plane,
  sphere,
  withAttributes,
  storeAttribute,
  attribute,
  displaceAlongNormal,
  displaceField,
  indentCreases,
  colorField,
  selectField,
  py,
  mulF,
  remapF,
  bakeVertexColors,
  weatheredColor,
  withAttributes as withAttr,
  bounds,
  vec3,
  type FieldContext,
} from "../src/index.js";

describe("attribute storage + lookup", () => {
  it("stores a scalar attribute and reads it back as a field", () => {
    const am = withAttributes(plane(2, 2, 4, 4));
    const stored = storeAttribute(am, "h", (ctx) => ctx.position.x);
    expect(stored.attributes.h!.length).toBe(stored.mesh.positions.length);
    // reading attribute("h") returns the same values
    const read = attribute("h");
    stored.mesh.positions.forEach((p, i) => {
      expect(read({ index: i, position: p, normal: vec3(0, 1, 0), uv: { x: 0, y: 0 }, attributes: stored.attributes } as FieldContext)).toBeCloseTo(p.x, 6);
    });
  });
});

describe("field-driven displacement", () => {
  it("displaceAlongNormal with constant inflates a sphere", () => {
    const am = withAttributes(sphere(1, 24, 16));
    const before = bounds(am.mesh).max.x;
    const out = displaceAlongNormal(am, 0.5);
    expect(bounds(out.mesh).max.x).toBeGreaterThan(before);
  });

  it("indentCreases presses a soft groove into a surface", () => {
    const base = plane(2, 2, 20, 20);
    const out = indentCreases(
      base,
      [{ from: vec3(0, 0, -1), to: vec3(0, 0, 1), depth: 0.2, width: 0.08 }],
      { direction: vec3(0, -1, 0), surfaceNormal: vec3(0, 1, 0) },
    );
    let centerY = 0;
    let edgeY = 0;
    for (const p of out.positions) {
      if (Math.abs(p.x) < 1e-6 && Math.abs(p.z) < 1e-6) centerY = p.y;
      if (Math.abs(p.x - 1) < 1e-6 && Math.abs(p.z) < 1e-6) edgeY = p.y;
    }
    expect(centerY).toBeLessThan(-0.15);
    expect(edgeY).toBeCloseTo(0, 4);
  });

  it("scalar field varies displacement across the surface", () => {
    const am = withAttributes(plane(2, 2, 8, 8));
    // push up by height proportional to x position
    const out = displaceField(am, vec3(0, 1, 0), (ctx) => ctx.position.x);
    // a vertex at +x should be higher than one at -x
    let hiX = -Infinity, loX = Infinity, hiY = 0, loY = 0;
    out.mesh.positions.forEach((p) => {
      if (p.x > hiX) { hiX = p.x; hiY = p.y; }
      if (p.x < loX) { loX = p.x; loY = p.y; }
    });
    expect(hiY).toBeGreaterThan(loY);
  });

  it("chains attribute write -> read in a later operator", () => {
    let am = withAttributes(plane(2, 2, 4, 4));
    am = storeAttribute(am, "lift", (ctx) => (ctx.position.x > 0 ? 0.5 : 0));
    am = displaceField(am, vec3(0, 1, 0), attribute("lift"));
    // +x half lifted, -x half flat
    const lifted = am.mesh.positions.filter((p) => p.y > 0.4).length;
    expect(lifted).toBeGreaterThan(0);
  });
});

describe("field combinators", () => {
  it("remap + mul compose", () => {
    const f = mulF(remapF(py, -1, 1, 0, 1), 2);
    const ctx = { index: 0, position: vec3(0, 1, 0), normal: vec3(0, 1, 0), uv: { x: 0, y: 0 }, attributes: {} } as FieldContext;
    expect(typeof f === "function" ? f(ctx) : f).toBeCloseTo(2, 6); // py=1 -> remap=1 -> *2 =2
  });
});

describe("color + select fields", () => {
  it("colorField writes rgb attributes", () => {
    const am = colorField(withAttributes(plane(1, 1, 2, 2)), (ctx) => vec3(ctx.uv.x, ctx.uv.y, 0));
    expect(am.attributes["color.r"]!.length).toBe(am.mesh.positions.length);
    expect(am.attributes["color.g"]).toBeDefined();
  });
  it("selectField builds a 0/1 mask", () => {
    const am = selectField(withAttributes(plane(2, 2, 4, 4)), (ctx) => (ctx.position.x > 0 ? 1 : 0), 0.5);
    const ones = am.attributes.mask!.filter((m) => m === 1).length;
    expect(ones).toBeGreaterThan(0);
    expect(ones).toBeLessThan(am.attributes.mask!.length);
  });
});

describe("shape-aligned material (object-space color)", () => {
  it("bakeVertexColors returns verts*3 values", () => {
    const am = withAttr(sphere(1, 16, 12));
    const colors = bakeVertexColors(am, () => vec3(0.5, 0.2, 0.1));
    expect(colors.length).toBe(am.mesh.positions.length * 3);
    expect(colors[0]).toBeCloseTo(0.5, 6);
  });

  it("weatheredColor puts top color on upward faces, base on downward", () => {
    const fn = weatheredColor({ base: vec3(0.2, 0.2, 0.2), topColor: vec3(1, 1, 1), topThreshold: 0.5, topSoftness: 0.1 });
    const top = fn({ index: 0, position: vec3(0, 1, 0), normal: vec3(0, 1, 0), uv: { x: 0, y: 0 }, attributes: {} } as FieldContext);
    const bottom = fn({ index: 0, position: vec3(0, -1, 0), normal: vec3(0, -1, 0), uv: { x: 0, y: 0 }, attributes: {} } as FieldContext);
    expect(top.x).toBeGreaterThan(0.9);
    expect(bottom.x).toBeCloseTo(0.2, 5);
  });

  it("baking weatheredColor on a sphere yields top brighter than bottom", () => {
    const am = withAttr(sphere(1, 24, 16));
    const colors = bakeVertexColors(am, weatheredColor({ topColor: vec3(1, 1, 1), base: vec3(0.3, 0.25, 0.2) }));
    let topR = 0, botR = 0, topN = 0, botN = 0;
    am.mesh.positions.forEach((p, i) => {
      if (p.y > 0.7) { topR += colors[i * 3]!; topN++; }
      if (p.y < -0.7) { botR += colors[i * 3]!; botN++; }
    });
    expect(topR / topN).toBeGreaterThan(botR / botN);
  });
});
