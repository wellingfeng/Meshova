import { describe, expect, it } from "vitest";
import {
  CONTROL_PANEL_CONTROLS,
  controlPanelIconSdf,
  controlPanelMaterialResult,
  rasterizeSdf,
  validateMaterial,
  type ControlPanelIcon,
} from "../src/index.js";

function maximum(values: Float32Array): number {
  let result = -Infinity;
  for (const value of values) result = Math.max(result, value);
  return result;
}

function sum(values: Float32Array): number {
  let result = 0;
  for (const value of values) result += value;
  return result;
}

describe("control panel material", () => {
  it("builds deterministic physical maps and semantic controls", () => {
    const params = { seed: 19, activeControl: 4, alarm: 0.7, wear: 0.6, dirt: 0.5 };
    const first = controlPanelMaterialResult(96, params);
    const second = controlPanelMaterialResult(96, params);
    expect(first.material.baseColor.data).toEqual(second.material.baseColor.data);
    expect(first.material.emission.data).toEqual(second.material.emission.data);
    expect(first.masks.controlId.data).toEqual(second.masks.controlId.data);
    expect(validateMaterial(first.material)).toEqual([]);
    expect(first.controls).toEqual(CONTROL_PANEL_CONTROLS);
    expect(new Set(first.controls.map((control) => control.label)).size).toBe(10);
  });

  it("separates display, buttons, indicators, icons, and state masks", () => {
    const result = controlPanelMaterialResult(128, { activeControl: 2, alarm: 1, glow: 1 });
    expect(maximum(result.masks.display.data)).toBe(1);
    expect(maximum(result.masks.button.data)).toBe(1);
    expect(maximum(result.masks.indicator.data)).toBe(1);
    expect(maximum(result.masks.icon.data)).toBeGreaterThan(0.9);
    expect(maximum(result.masks.displayGlyph.data)).toBeGreaterThan(0.9);
    expect(maximum(result.masks.active.data)).toBeGreaterThan(0.9);
    expect(maximum(result.masks.alarm.data)).toBeGreaterThan(0.9);
    expect(maximum(result.material.emission.data)).toBeGreaterThan(0.8);
  });

  it("moves active emission between semantic button regions", () => {
    const first = controlPanelMaterialResult(96, { activeControl: 0, alarm: 0 });
    const last = controlPanelMaterialResult(96, { activeControl: 5, alarm: 0 });
    expect(first.masks.active.data).not.toEqual(last.masks.active.data);
    expect(sum(first.masks.active.data)).toBeGreaterThan(10);
    expect(sum(last.masks.active.data)).toBeGreaterThan(10);
  });

  it("provides rasterizable SDF icons for every semantic button", () => {
    const icons: ControlPanelIcon[] = ["power", "warning", "arrowUp", "arrowDown", "check", "stop"];
    for (const icon of icons) {
      const texture = rasterizeSdf(64, 64, controlPanelIconSdf(icon));
      expect(maximum(texture.data)).toBeGreaterThan(0.9);
      expect(sum(texture.data)).toBeGreaterThan(20);
      expect(sum(texture.data)).toBeLessThan(64 * 64 * 0.7);
    }
  });

  it("disables all emission when glow is zero", () => {
    const result = controlPanelMaterialResult(64, { glow: 0, alarm: 1 });
    expect(maximum(result.material.emission.data)).toBe(0);
  });
});
