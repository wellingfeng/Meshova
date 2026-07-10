import { describe, it, expect } from "vitest";
import { buildTitanTrainParts, TITAN_TRAIN_DEFAULTS } from "../src/models/titan-train.js";

describe("titan-train (Tutorial_Train.hda + destructionfx)", () => {
  it("builds running-gear, body, panels and couplers with geometry", () => {
    const parts = buildTitanTrainParts();
    const names = parts.map((p) => p.name).sort();
    expect(names).toEqual(["body-shell", "couplers", "running-gear", "side-panels"]);
    for (const p of parts) expect(p.mesh.positions.length).toBeGreaterThan(0);
  });

  it("is deterministic — same params, identical geometry", () => {
    const a = buildTitanTrainParts({ wagons: 2, damage: 0.5 });
    const b = buildTitanTrainParts({ wagons: 2, damage: 0.5 });
    const pa = a.find((p) => p.name === "side-panels")!;
    const pb = b.find((p) => p.name === "side-panels")!;
    expect(pa.mesh.positions).toEqual(pb.mesh.positions);
  });

  it("more wagons => more running gear", () => {
    const few = buildTitanTrainParts({ wagons: 1 });
    const many = buildTitanTrainParts({ wagons: 5 });
    const fg = few.find((p) => p.name === "running-gear")!.mesh.positions.length;
    const mg = many.find((p) => p.name === "running-gear")!.mesh.positions.length;
    expect(mg).toBeGreaterThan(fg);
  });

  it("damage shatters the side panels into more geometry", () => {
    const intact = buildTitanTrainParts({ damage: 0 });
    const broken = buildTitanTrainParts({ damage: 0.8 });
    const ip = intact.find((p) => p.name === "side-panels")!.mesh.positions.length;
    const bp = broken.find((p) => p.name === "side-panels")!.mesh.positions.length;
    expect(bp).toBeGreaterThan(ip);
  });

  it("exposes HDA provenance metadata", () => {
    const parts = buildTitanTrainParts({ damage: 0.3 });
    const panels = parts.find((p) => p.name === "side-panels")!;
    expect(panels.metadata?.source).toContain("Tutorial_Train.hda");
  });

  it("defaults include the locomotive on top of the wagons", () => {
    expect(TITAN_TRAIN_DEFAULTS.wagons).toBe(3);
  });
});
