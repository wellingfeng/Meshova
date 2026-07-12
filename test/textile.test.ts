import { describe, expect, it } from "vitest";
import {
  DECORATIVE_TEXTILE_LIBRARY,
  DECORATIVE_TEXTILE_STYLES,
  TEXTILE_LIBRARY,
  TEXTILE_PATTERNS,
  decorativeTextileFields,
  materialFromFields,
  sampleYarnLayer,
  validateMaterial,
  wovenTextileFields,
} from "../src/index.js";

describe("procedural textile library", () => {
  it("contains eight video-derived weave variants", () => {
    expect(TEXTILE_PATTERNS).toEqual([
      "plain",
      "twill",
      "herringbone",
      "basket",
      "satin",
      "denim",
      "chevron",
      "pinstripe",
    ]);
    expect(Object.keys(TEXTILE_LIBRARY)).toHaveLength(8);
  });

  it("bakes every weave to valid deterministic PBR fields", () => {
    for (const recipe of Object.values(TEXTILE_LIBRARY)) {
      const first = materialFromFields(32, recipe({ seed: 23 }));
      const second = materialFromFields(32, recipe({ seed: 23 }));
      expect(validateMaterial(first)).toEqual([]);
      expect(Array.from(first.height.data)).toEqual(Array.from(second.height.data));
    }
  });

  it("keeps all patterns tileable", () => {
    for (const pattern of TEXTILE_PATTERNS) {
      const fields = wovenTextileFields({ pattern, seed: 7, scale: 48 });
      for (const t of [0.13, 0.37, 0.71]) {
        expect(fields.height!(0, t)).toBeCloseTo(fields.height!(1, t), 8);
        expect(fields.height!(t, 0)).toBeCloseTo(fields.height!(t, 1), 8);
        const left = fields.baseColor!(0, t);
        const right = fields.baseColor!(1, t);
        for (let channel = 0; channel < 3; channel++) {
          expect(left[channel]).toBeCloseTo(right[channel]!, 8);
        }
      }
    }
  });

  it("produces visually distinct pattern signatures", () => {
    const signatures = TEXTILE_PATTERNS.map((pattern) => {
      const fields = wovenTextileFields({ pattern, seed: 5, scale: 24 });
      const samples: string[] = [];
      for (let y = 0; y < 19; y++) {
        for (let x = 0; x < 19; x++) {
          const u = (x + 0.37) / 19;
          const v = (y + 0.61) / 19;
          const color = fields.baseColor!(u, v);
          samples.push(fields.height!(u, v).toFixed(3), color[0].toFixed(3));
        }
      }
      return samples.join(",");
    });
    expect(new Set(signatures).size).toBe(TEXTILE_PATTERNS.length);
  });
});

describe("decorative textile library", () => {
  it("contains eight pattern-driven textile variants", () => {
    expect(DECORATIVE_TEXTILE_STYLES).toEqual([
      "jacquard",
      "brocade",
      "lace",
      "ribKnit",
      "corduroy",
      "mesh",
      "twistedRope",
      "pleatedSilk",
    ]);
    expect(Object.keys(DECORATIVE_TEXTILE_LIBRARY)).toHaveLength(8);
  });

  it("bakes deterministic physically valid PBR sets", () => {
    for (const recipe of Object.values(DECORATIVE_TEXTILE_LIBRARY)) {
      const first = materialFromFields(24, recipe({ seed: 41 }));
      const second = materialFromFields(24, recipe({ seed: 41 }));
      expect(validateMaterial(first)).toEqual([]);
      expect(Array.from(first.height.data)).toEqual(Array.from(second.height.data));
      expect(Array.from(first.baseColor.data)).toEqual(Array.from(second.baseColor.data));
    }
  });

  it("keeps every decorative textile tileable", () => {
    for (const style of DECORATIVE_TEXTILE_STYLES) {
      const fields = decorativeTextileFields({ style, seed: 43, scale: 24, repeat: 4 });
      for (const t of [0.17, 0.41, 0.73]) {
        expect(fields.height!(0, t)).toBeCloseTo(fields.height!(1, t), 8);
        expect(fields.height!(t, 0)).toBeCloseTo(fields.height!(t, 1), 8);
        expect(fields.roughness!(0, t)).toBeCloseTo(fields.roughness!(1, t), 8);
        expect(fields.metallic!(t, 0)).toBeCloseTo(fields.metallic!(t, 1), 8);
      }
    }
  });

  it("produces distinct material signatures", () => {
    const signatures = DECORATIVE_TEXTILE_STYLES.map((style) => {
      const fields = decorativeTextileFields({ style, seed: 47, scale: 24, repeat: 4 });
      const samples: string[] = [];
      for (let y = 0; y < 13; y++) {
        for (let x = 0; x < 13; x++) {
          const u = (x + 0.31) / 13;
          const v = (y + 0.57) / 13;
          const color = fields.baseColor!(u, v);
          samples.push(
            fields.height!(u, v).toFixed(3),
            fields.roughness!(u, v).toFixed(3),
            fields.metallic!(u, v).toFixed(3),
            color[0].toFixed(3),
          );
        }
      }
      return samples.join(",");
    });
    expect(new Set(signatures).size).toBe(DECORATIVE_TEXTILE_STYLES.length);
  });

  it("uses a deterministic tile-safe shared yarn primitive", () => {
    const params = {
      direction: [1, -1] as [number, number],
      count: 12,
      width: 0.4,
      seed: 53,
      distortion: 0.12,
      twist: 5,
    };
    const first = sampleYarnLayer(0.23, 0.67, params);
    expect(sampleYarnLayer(0.23, 0.67, params)).toEqual(first);
    expect(sampleYarnLayer(0, 0.37, params).profile).toBeCloseTo(
      sampleYarnLayer(1, 0.37, params).profile,
      8,
    );
    expect(sampleYarnLayer(0.61, 0, params).profile).toBeCloseTo(
      sampleYarnLayer(0.61, 1, params).profile,
      8,
    );
  });

  it("reserves metallic yarn for brocade ornament", () => {
    const brocade = decorativeTextileFields({ style: "brocade", repeat: 3 });
    const jacquard = decorativeTextileFields({ style: "jacquard", repeat: 3 });
    let brocadeMetal = 0;
    let jacquardMetal = 0;
    for (let y = 0; y < 11; y++) {
      for (let x = 0; x < 11; x++) {
        brocadeMetal = Math.max(brocadeMetal, brocade.metallic!((x + 0.5) / 11, (y + 0.5) / 11));
        jacquardMetal = Math.max(jacquardMetal, jacquard.metallic!((x + 0.5) / 11, (y + 0.5) / 11));
      }
    }
    expect(brocadeMetal).toBeGreaterThan(0.5);
    expect(jacquardMetal).toBe(0);
  });
});
