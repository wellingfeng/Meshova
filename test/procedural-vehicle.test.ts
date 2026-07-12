import { describe, expect, it } from "vitest";
import {
  bounds,
  buildProceduralVehicleFleet,
  buildProceduralVehicleParts,
  buildProceduralVehicleVariant,
  PROCEDURAL_VEHICLE_PRESETS,
  PROCEDURAL_VEHICLE_VARIANTS,
  triangleCount,
} from "../src/index.js";

describe("procedural vehicle generator", () => {
  it("builds five deterministic vehicle classes", () => {
    const first = buildProceduralVehicleFleet(31);
    const second = buildProceduralVehicleFleet(31);
    expect(Object.keys(first)).toEqual(["sedan", "suv", "pickup", "van", "bus"]);
    for (const style of Object.keys(first) as Array<keyof typeof first>) {
      expect(first[style].map((part) => part.name)).toEqual(second[style].map((part) => part.name));
      expect(first[style].every((part) => part.label && part.label.length > 0)).toBe(true);
      expect(first[style].reduce((sum, part) => sum + triangleCount(part.mesh), 0)).toBeGreaterThan(1000);
    }
  });

  it("adds style-specific pickup and bus structure", () => {
    const pickup = buildProceduralVehicleParts({ style: "pickup" });
    const bus = buildProceduralVehicleParts({ style: "bus" });
    expect(pickup.some((part) => part.name === "pickup_bed_floor")).toBe(true);
    expect(pickup.some((part) => part.name === "pickup_tailgate")).toBe(true);
    expect(bus.filter((part) => part.name.startsWith("side_window_")).length).toBe(14);
    expect(bus.some((part) => part.name.startsWith("pickup_"))).toBe(false);
  });

  it("tracks requested vehicle dimensions", () => {
    const parts = buildProceduralVehicleParts({ style: "suv", length: 5.4, width: 2.15, height: 1.92, wheelBase: 3.2 });
    const partBounds = parts.map((part) => bounds(part.mesh));
    const minX = Math.min(...partBounds.map((value) => value.min.x));
    const maxX = Math.max(...partBounds.map((value) => value.max.x));
    const minZ = Math.min(...partBounds.map((value) => value.min.z));
    const maxZ = Math.max(...partBounds.map((value) => value.max.z));
    expect(maxX - minX).toBeGreaterThan(2.15);
    expect(maxZ - minZ).toBeGreaterThan(5.35);
  });

  it("keeps geometry finite and indexed", () => {
    const parts = buildProceduralVehicleParts({ style: "van", seed: 99 });
    for (const part of parts) {
      expect(part.mesh.indices.length % 3).toBe(0);
      expect(part.mesh.positions.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z))).toBe(true);
      expect(part.mesh.indices.every((index) => index >= 0 && index < part.mesh.positions.length)).toBe(true);
    }
  });

  it("cuts windows from the body surface and recesses the glass", () => {
    const parts = buildProceduralVehicleParts({ style: "suv" });
    const body = parts.find((part) => part.name === "body_shell");
    const rightWindow = parts.find((part) => part.name === "side_window_1_0");
    const leftWindow = parts.find((part) => part.name === "side_window_-1_0");
    const frontWindow = parts.find((part) => part.name === "front_windshield");
    const rearWindow = parts.find((part) => part.name === "rear_windshield");
    expect(body && rightWindow && leftWindow && frontWindow && rearWindow).toBeTruthy();
    const bodyBounds = bounds(body!.mesh);
    expect(bounds(rightWindow!.mesh).max.x).toBeLessThan(bodyBounds.max.x - 0.001);
    expect(bounds(leftWindow!.mesh).min.x).toBeGreaterThan(bodyBounds.min.x + 0.001);
    expect(bounds(frontWindow!.mesh).min.z).toBeGreaterThan(bodyBounds.min.z + 0.001);
    expect(bounds(rearWindow!.mesh).max.z).toBeLessThan(bodyBounds.max.z - 0.001);
    for (const window of parts.filter((part) => part.name.includes("window") || part.name.includes("windshield"))) {
      expect(triangleCount(window.mesh)).toBeGreaterThan(0);
    }
  });

  it("rests roof rails on the generated roof", () => {
    const parts = buildProceduralVehicleParts({ style: "suv" });
    const bodyBounds = bounds(parts.find((part) => part.name === "body_shell")!.mesh);
    for (const rail of parts.filter((part) => part.name.startsWith("roof_rail_"))) {
      const railBounds = bounds(rail.mesh);
      expect(railBounds.min.y).toBeGreaterThan(bodyBounds.max.y - 0.06);
      expect(railBounds.min.y).toBeLessThan(bodyBounds.max.y + 0.01);
      expect(railBounds.max.y).toBeGreaterThan(bodyBounds.max.y);
    }
  });

  it("keeps every body style within a realistic low roof crown", () => {
    const roofRatios = { sedan: 0.94, suv: 0.96, pickup: 0.95, van: 0.97, bus: 0.98 } as const;
    for (const style of Object.keys(PROCEDURAL_VEHICLE_PRESETS) as Array<keyof typeof roofRatios>) {
      const params = PROCEDURAL_VEHICLE_PRESETS[style];
      const body = buildProceduralVehicleParts({ style }).find((part) => part.name === "body_shell")!;
      const nominalRoof = params.rideHeight + params.height * roofRatios[style];
      const roofOvershoot = bounds(body.mesh).max.y - nominalRoof;
      expect(roofOvershoot).toBeGreaterThanOrEqual(0);
      expect(roofOvershoot / params.height).toBeLessThan(0.025);
    }
  });

  it("builds library variants from shared body topology", () => {
    expect(PROCEDURAL_VEHICLE_VARIANTS.map((variant) => variant.id)).toEqual([
      "vehicle-city-sedan",
      "vehicle-adventure-suv",
      "vehicle-crew-pickup",
      "vehicle-delivery-van",
      "vehicle-city-bus",
    ]);
    for (const variant of PROCEDURAL_VEHICLE_VARIANTS) {
      const parts = buildProceduralVehicleVariant(variant.id);
      expect(parts.some((part) => part.name === "body_shell")).toBe(true);
      expect(parts.some((part) => part.name === "front_windshield")).toBe(true);
      expect(parts.reduce((sum, part) => sum + triangleCount(part.mesh), 0)).toBeGreaterThan(1000);
    }
  });
});
