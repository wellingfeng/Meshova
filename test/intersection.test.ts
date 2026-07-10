import { describe, it, expect } from "vitest";
import { buildIntersectionParts } from "../src/models/intersection.js";

const tris = (parts: ReturnType<typeof buildIntersectionParts>) =>
  parts.reduce((s, p) => s + p.mesh.indices.length, 0);

describe("road intersection", () => {
  it("builds a full four-arm crossroads with core parts", () => {
    const parts = buildIntersectionParts();
    const names = parts.map((p) => p.name);
    expect(names).toContain("asphalt");
    expect(names).toContain("lane_lines");
    expect(names).toContain("crosswalks");
    expect(names).toContain("sidewalks");
    expect(names).toContain("curbs");
  });

  it("is deterministic: same params -> identical geometry", () => {
    const a = buildIntersectionParts({ roadHalfWidth: 6, lanes: 3, seed: undefined } as never);
    const b = buildIntersectionParts({ roadHalfWidth: 6, lanes: 3 });
    expect(a.map((p) => p.name)).toEqual(b.map((p) => p.name));
    expect(tris(a)).toBe(tris(b));
  });

  it("omits an arm's asphalt when that arm is disabled (T-junction)", () => {
    const full = buildIntersectionParts();
    const tee = buildIntersectionParts({ arms: { north: true, south: true, east: true, west: false } });
    const asphaltTris = (parts: ReturnType<typeof buildIntersectionParts>) =>
      parts.find((p) => p.name === "asphalt")!.mesh.indices.length;
    expect(asphaltTris(tee)).toBeLessThan(asphaltTris(full));
  });

  it("adds more lane lines as lane count grows", () => {
    const two = buildIntersectionParts({ lanes: 2 });
    const four = buildIntersectionParts({ lanes: 4 });
    const laneTris = (parts: ReturnType<typeof buildIntersectionParts>) =>
      parts.find((p) => p.name === "lane_lines")!.mesh.indices.length;
    expect(laneTris(four)).toBeGreaterThan(laneTris(two));
  });

  it("can drop crosswalks and sidewalks", () => {
    const bare = buildIntersectionParts({ crosswalks: false, sidewalks: false });
    const names = bare.map((p) => p.name);
    expect(names).not.toContain("crosswalks");
    expect(names).not.toContain("sidewalks");
    expect(names).toContain("asphalt");
  });
});
