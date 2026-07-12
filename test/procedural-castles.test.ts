import { describe, expect, it } from "vitest";
import {
  bounds,
  buildProceduralCastleParts,
  critique,
  triangleCount,
  type CastleVariant,
} from "../src/index.js";

const variants: CastleVariant[] = ["concentric", "ridge", "river"];

describe("procedural castles", () => {
  it.each(variants)("builds semantic defensive layers for %s", (variant) => {
    const parts = buildProceduralCastleParts({ variant, detail: 0.65 });
    const names = new Set(parts.map((part) => part.name));

    expect(names).toContain("outer_curtain_walls");
    expect(names).toContain("flanking_towers");
    expect(names).toContain("gatehouses");
    expect(names).toContain("portcullises");
    expect(names).toContain("central_keep");
    expect(names).toContain("siege_well");
    expect(parts.every((part) => part.label && !part.label.includes("_"))).toBe(true);
    expect(parts.every((part) => triangleCount(part.mesh) > 0)).toBe(true);
    expect(parts.every((part) => part.metadata?.sourceStudy === "https://www.bilibili.com/video/BV18W411x7vc")).toBe(true);
  });

  it("is deterministic for a fixed seed", () => {
    const first = buildProceduralCastleParts({ variant: "ridge", seed: 81, detail: 0.7 });
    const second = buildProceduralCastleParts({ variant: "ridge", seed: 81, detail: 0.7 });

    expect(first.map((part) => part.name)).toEqual(second.map((part) => part.name));
    expect(first.map((part) => part.mesh.positions.length)).toEqual(second.map((part) => part.mesh.positions.length));
    expect(first.find((part) => part.name === "siege_stores")?.mesh.positions).toEqual(
      second.find((part) => part.name === "siege_stores")?.mesh.positions,
    );
  });

  it("scales the whole fortress and increases crenellation detail", () => {
    const compact = buildProceduralCastleParts({ scale: 0.7, detail: 0.55 });
    const large = buildProceduralCastleParts({ scale: 1.4, detail: 1.35 });
    const compactBounds = bounds(compact.find((part) => part.name === "terrain")!.mesh);
    const largeBounds = bounds(large.find((part) => part.name === "terrain")!.mesh);
    const compactBattlements = compact.find((part) => part.name === "battlements")!;
    const detailedBattlements = large.find((part) => part.name === "battlements")!;

    expect(largeBounds.max.x - largeBounds.min.x).toBeGreaterThan(
      (compactBounds.max.x - compactBounds.min.x) * 1.9,
    );
    expect(detailedBattlements.mesh.positions.length).toBeGreaterThan(compactBattlements.mesh.positions.length);
  });

  it.each(variants)("keeps weighted components supported for %s", (variant) => {
    const parts = buildProceduralCastleParts({ variant });
    const report = critique(parts, { goal: `${variant} medieval castle` });

    expect(report.issues.filter((issue) => /floating with no contact path/.test(issue.finding))).toEqual([]);
    expect(report.issues.filter((issue) => /coplanar same-facing/.test(issue.finding))).toEqual([]);
  });

  it("seats the ridge fortress on a flat-topped rock platform", () => {
    const parts = buildProceduralCastleParts({ variant: "ridge" });
    const platform = bounds(parts.find((part) => part.name === "terrain_platform")!.mesh);
    const walls = bounds(parts.find((part) => part.name === "outer_curtain_walls")!.mesh);

    expect(platform.max.y).toBeCloseTo(walls.min.y, 5);
    expect(platform.min.x).toBeLessThan(walls.min.x);
    expect(platform.max.x).toBeGreaterThan(walls.max.x);
    expect(platform.min.z).toBeLessThan(walls.min.z);
    expect(platform.max.z).toBeGreaterThan(walls.max.z);
  });
});
