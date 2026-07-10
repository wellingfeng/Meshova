import { describe, it, expect } from "vitest";
import { buildTitanBuildingParts, TITAN_BUILDING_DEFAULTS } from "../src/models/titan-building.js";

describe("titan-building (Tutorial_Building_Generator.hda)", () => {
  it("builds walls, frames, windows, doors and roof", () => {
    const parts = buildTitanBuildingParts();
    const names = parts.map((p) => p.name);
    expect(names).toContain("walls");
    expect(names).toContain("windows");
    expect(names).toContain("doors");
    expect(names).toContain("roof");
    for (const p of parts) expect(p.mesh.positions.length).toBeGreaterThan(0);
  });

  it("more floors => more facade geometry", () => {
    const low = buildTitanBuildingParts({ floors: 2 });
    const high = buildTitanBuildingParts({ floors: 8 });
    expect(high.find((p) => p.name === "walls")!.mesh.positions.length).toBeGreaterThan(
      low.find((p) => p.name === "walls")!.mesh.positions.length,
    );
  });

  it("more bays (smaller bayWidth) => more windows", () => {
    const wide = buildTitanBuildingParts({ bayWidth: 4 });
    const tight = buildTitanBuildingParts({ bayWidth: 1.5 });
    expect(tight.find((p) => p.name === "windows")!.mesh.positions.length).toBeGreaterThan(
      wide.find((p) => p.name === "windows")!.mesh.positions.length,
    );
  });

  it("roof=false drops the roof", () => {
    expect(buildTitanBuildingParts({ roof: false }).find((p) => p.name === "roof")).toBeUndefined();
  });

  it("windows use a glass surface", () => {
    expect(buildTitanBuildingParts().find((p) => p.name === "windows")!.surface?.type).toBe("glass");
  });

  it("is deterministic", () => {
    const a = buildTitanBuildingParts({ width: 10 });
    const b = buildTitanBuildingParts({ width: 10 });
    expect(a.find((p) => p.name === "walls")!.mesh.positions).toEqual(
      b.find((p) => p.name === "walls")!.mesh.positions,
    );
  });

  it("pattern controls facade — all-wall pattern removes windows on upper floors", () => {
    const walls = buildTitanBuildingParts({ pattern: "w" });
    // ground floor still has a door; upper floors are solid wall so windows are
    // only the ground-floor ones (none, since centre is door) -> fewer windows.
    const mixed = buildTitanBuildingParts({ pattern: "WwWWwW" });
    const wq = walls.find((p) => p.name === "windows");
    const mq = mixed.find((p) => p.name === "windows")!;
    const wCount = wq ? wq.mesh.positions.length : 0;
    expect(mq.mesh.positions.length).toBeGreaterThan(wCount);
  });

  it("default is 4 floors", () => {
    expect(TITAN_BUILDING_DEFAULTS.floors).toBe(4);
  });
});
