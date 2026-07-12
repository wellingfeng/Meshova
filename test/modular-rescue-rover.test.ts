import { describe, expect, it } from "vitest";
import {
  buildModularRescueRover,
  validateAssemblyState,
  VEHICLE_MODULES,
} from "../src/index.js";

describe("modular rescue rover", () => {
  it("builds deterministic rescue capability and semantic parts", () => {
    const first = buildModularRescueRover();
    const second = buildModularRescueRover();

    expect(first.state).toEqual(second.state);
    expect(first.state.placements.map((placement) => placement.moduleId)).toEqual([
      "engine-performance",
      "cabin-crew",
      "rear-rescue-command",
    ]);
    expect(first.summary).toMatchObject({
      peakTorqueNm: 560,
      fuelCapacityLiters: 78,
      seats: 7,
      payloadKg: 480,
    });
    expect(first.summary.anchors.map((anchor) => anchor.label)).toContain("无人机起降位");
    expect(first.parts.some((part) => part.label === "救援指挥模块")).toBe(true);
    expect(validateAssemblyState(first.state, first.slots, VEHICLE_MODULES)).toEqual([]);
  });

  it("keeps rescue module fixed while dimensions remain configurable", () => {
    const build = buildModularRescueRover({ length: 6.1, width: 2.25, seed: 99 });
    expect(build.state.seed).toBe(99);
    expect(build.state.placements.at(-1)?.moduleId).toBe("rear-rescue-command");
    expect(build.parts.length).toBeGreaterThan(20);
  });
});
