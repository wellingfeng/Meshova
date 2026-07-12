import { describe, expect, it } from "vitest";
import {
  buildHoudiniCityFacadeReplica,
  buildHoudiniGrotReplica,
  buildHoudiniWoodTrimReplica,
  triangleCount,
  validateMaterial,
} from "../src/index.js";

describe("Houdini downloads replicas", () => {
  it("builds city facade from grammar and GPU instance groups", () => {
    const replica = buildHoudiniCityFacadeReplica({ width: 12, floors: 5, seed: 4 });
    expect(replica.parts.map((part) => part.label)).not.toContain(undefined);
    expect(replica.facadeGrammar.at(-1)!.end).toBeCloseTo(6);
    expect(replica.facadeGrammar[0]!.start).toBeCloseTo(-6);
    expect(replica.instanceBuffers).toHaveLength(2);
    expect(replica.instanceBuffers.every((buffer) => buffer.count > 0)).toBe(true);
    expect(replica.parts.every((part) => triangleCount(part.mesh) > 0)).toBe(true);
  });

  it("builds connected GROT network with embedded terminal instances", () => {
    const replica = buildHoudiniGrotReplica({ pointCount: 32, seed: 8 });
    expect(replica.growth.nodes).toHaveLength(32);
    expect(replica.growth.edges).toHaveLength(31);
    expect(replica.growth.droppedPointIndices).toEqual([]);
    expect(replica.instanceBuffers[0]!.count).toBeGreaterThan(1);
    expect(replica.parts.find((part) => part.name === "grot_vascular_network")).toBeDefined();
  });

  it("bakes Wood_trim_sheet geometry into physical material maps", () => {
    const replica = buildHoudiniWoodTrimReplica(64);
    expect(replica.primitiveIds).toHaveLength(triangleCount(replica.parts[0]!.mesh));
    expect(Math.max(...replica.bake.coverage.data)).toBe(1);
    expect(Math.max(...replica.bake.height.data)).toBeGreaterThan(0.5);
    expect(validateMaterial(replica.material)).toEqual([]);
  });
});
