import { describe, expect, it } from "vitest";
import {
  bounds,
  buildCreamSofaParts,
  merge,
  triangleCount,
} from "../src/index.js";

describe("cream sofa procedural replicas", () => {
  it("matches measured quilted-sofa dimensions", () => {
    const parts = buildCreamSofaParts({ variant: "quilted" });
    const bb = bounds(merge(...parts.map((part) => part.mesh)));
    expect(bb.max.x - bb.min.x).toBeCloseTo(2.8, 1);
    expect(bb.max.y - bb.min.y).toBeCloseTo(0.8, 1);
    expect(bb.max.z - bb.min.z).toBeCloseTo(1.1, 1);
    expect(parts.map((part) => part.name)).toEqual(expect.arrayContaining([
      "sealed_quilted_seat",
      "segmented_backrest",
      "rounded_armrests",
      "loose_back_pillows",
    ]));
    expect(parts.every((part) => part.label && !part.label.includes("_"))).toBe(true);
  });

  it("builds wrap variant with three seats and flower cushion", () => {
    const parts = buildCreamSofaParts({ variant: "wrap" });
    const bb = bounds(merge(...parts.map((part) => part.mesh)));
    expect(bb.max.x - bb.min.x).toBeCloseTo(2.68, 1);
    expect(bb.max.y - bb.min.y).toBeCloseTo(0.806, 1);
    expect(bb.max.z - bb.min.z).toBeCloseTo(0.943, 1);
    expect(parts.map((part) => part.name)).toEqual(expect.arrayContaining([
      "sealed_seat_deck",
      "three_seat_cushions",
      "continuous_wrap_frame",
      "large_back_pillows",
      "flower_cushion",
    ]));
  });

  it("is deterministic and responds to dimensions", () => {
    const a = buildCreamSofaParts({ variant: "quilted", seatColumns: 7 });
    const b = buildCreamSofaParts({ variant: "quilted", seatColumns: 7 });
    expect(a.map((part) => part.mesh.positions)).toEqual(b.map((part) => part.mesh.positions));

    const narrow = merge(...buildCreamSofaParts({ variant: "wrap", width: 2.1 }).map((part) => part.mesh));
    const wide = merge(...buildCreamSofaParts({ variant: "wrap", width: 3.2 }).map((part) => part.mesh));
    expect(bounds(wide).max.x - bounds(wide).min.x).toBeGreaterThan(bounds(narrow).max.x - bounds(narrow).min.x);
    expect(triangleCount(wide)).toBe(triangleCount(narrow));
  });
});
