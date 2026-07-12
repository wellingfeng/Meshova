import { describe, expect, it } from "vitest";
import {
  cableGenerator,
  crackGenerator,
  panelGenerator,
} from "../src/index.js";

describe("reusable material generators", () => {
  it("builds deterministic branched cracks with region masks", () => {
    const options = {
      seed: 17,
      count: 3,
      branches: 6,
      regionMask: (uCoord: number) => uCoord < 0.75 ? 1 : 0,
    };
    const first = crackGenerator(options);
    const second = crackGenerator(options);
    const samples = Array.from({ length: 32 * 32 }, (_, index) => {
      const uCoord = (index % 32 + 0.5) / 32;
      const vCoord = (Math.floor(index / 32) + 0.5) / 32;
      return first(uCoord, vCoord);
    });
    expect(first(0.3, 0.4)).toEqual(second(0.3, 0.4));
    expect(Math.max(...samples.map((sample) => sample.crack))).toBeGreaterThan(0.2);
    expect(first(0.9, 0.5).crack).toBe(0);
  });

  it("builds panel seams, bolts, insets and vents", () => {
    const panels = panelGenerator({ seed: 23, columns: 4, rows: 4, ventChance: 1 });
    const samples = Array.from({ length: 48 * 48 }, (_, index) => (
      panels((index % 48 + 0.5) / 48, (Math.floor(index / 48) + 0.5) / 48)
    ));
    expect(Math.max(...samples.map((sample) => sample.seam))).toBeGreaterThan(0.5);
    expect(Math.max(...samples.map((sample) => sample.inset))).toBeGreaterThan(0.5);
    expect(Math.max(...samples.map((sample) => sample.bolts))).toBeGreaterThan(0.5);
    expect(Math.max(...samples.map((sample) => sample.vents))).toBeGreaterThan(0.5);
  });

  it("builds curved crossing cables with contact shadows", () => {
    const cables = cableGenerator({
      seed: 31,
      count: 4,
      width: 0.035,
      amplitude: 0.06,
      orientation: "crossed",
    });
    const samples = Array.from({ length: 64 * 64 }, (_, index) => (
      cables((index % 64 + 0.5) / 64, (Math.floor(index / 64) + 0.5) / 64)
    ));
    expect(Math.max(...samples.map((sample) => sample.cable))).toBeGreaterThan(0.8);
    expect(Math.max(...samples.map((sample) => sample.shadow))).toBeGreaterThan(0.2);
    expect(Math.max(...samples.map((sample) => sample.crossing))).toBeGreaterThan(0.1);
    expect(cables(0.4, 0.6)).toEqual(cableGenerator({
      seed: 31,
      count: 4,
      width: 0.035,
      amplitude: 0.06,
      orientation: "crossed",
    })(0.4, 0.6));
  });
});
