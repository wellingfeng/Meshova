import { describe, expect, it } from "vitest";
import {
  bounds,
  buildStoneArchBridgeParts,
  triangleCount,
  zFightingReport,
} from "../src/index.js";

describe("stone arch bridge", () => {
  it("builds semantic structural and decorative parts", () => {
    const parts = buildStoneArchBridgeParts({ arches: 3, archSegments: 16 });
    expect(parts.map((part) => part.name)).toEqual([
      "bridge_body",
      "arch_rings",
      "deck_cap",
      "paving",
      "railings",
      "cutwater_buttresses",
      "guardian_stones",
    ]);
    expect(parts.every((part) => part.label && !part.label.includes("_"))).toBe(true);
    expect(parts.every((part) => triangleCount(part.mesh) > 0)).toBe(true);
  });

  it("widens deterministically when arch count increases", () => {
    const three = buildStoneArchBridgeParts({ arches: 3, archSegments: 16, guardianStones: false });
    const five = buildStoneArchBridgeParts({ arches: 5, archSegments: 16, guardianStones: false });
    const threeBounds = bounds(three.find((part) => part.name === "bridge_body")!.mesh);
    const fiveBounds = bounds(five.find((part) => part.name === "bridge_body")!.mesh);
    expect(fiveBounds.max.x - fiveBounds.min.x).toBeGreaterThan(threeBounds.max.x - threeBounds.min.x);

    const repeated = buildStoneArchBridgeParts({ arches: 3, archSegments: 16, guardianStones: false });
    expect(repeated.map((part) => triangleCount(part.mesh))).toEqual(
      three.map((part) => triangleCount(part.mesh)),
    );
  });

  it("keeps decorative arch rings proud of the bridge body", () => {
    const report = zFightingReport(buildStoneArchBridgeParts(), {
      includeSamePart: false,
      maxTriangles: Number.POSITIVE_INFINITY,
    });
    expect(report.pairs).toBe(0);
  });
});
