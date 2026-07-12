import { describe, expect, it } from "vitest";
import { BLENDER_119_SCENES, buildBlender119SceneParts } from "../src/index.js";
import { BLENDER_119_PALETTES } from "../src/models/blender-119-palettes.js";

describe("Blender 119 scene library", () => {
  it("registers one unique model per playlist page", () => {
    expect(BLENDER_119_SCENES).toHaveLength(119);
    expect(new Set(BLENDER_119_SCENES.map((scene) => scene.id)).size).toBe(119);
    expect(BLENDER_119_SCENES.map((scene) => scene.page)).toEqual(Array.from({ length: 119 }, (_, index) => index + 1));
  });

  it("builds representative themes deterministically", () => {
    for (const page of [1, 7, 13, 24, 42, 57, 71, 84, 97, 106, 116, 117]) {
      const first = buildBlender119SceneParts(page, { seed: 42 });
      const second = buildBlender119SceneParts(page, { seed: 42 });
      expect(first.length).toBeGreaterThanOrEqual(2);
      expect(first.map((part) => part.name)).toEqual(second.map((part) => part.name));
      expect(first.map((part) => part.mesh.positions.length)).toEqual(second.map((part) => part.mesh.positions.length));
      expect(first.every((part) => part.label && !part.label.startsWith("blender-119"))).toBe(true);
      expect(first.every((part) => part.colors?.length === part.mesh.positions.length * 3)).toBe(true);
    }
  });

  it("uses one bounded reference palette per video", () => {
    expect(BLENDER_119_PALETTES).toHaveLength(119);
    expect(new Set(BLENDER_119_PALETTES.map((palette) => JSON.stringify(palette))).size).toBeGreaterThan(105);
    expect(BLENDER_119_PALETTES.every((palette) =>
      Object.values(palette).flat().every((channel) => channel >= 0 && channel <= 1),
    )).toBe(true);
  });

  it("keeps generated scene colors visible and semantically separated", () => {
    for (const scene of BLENDER_119_SCENES) {
      const colors = buildBlender119SceneParts(scene).map((part) => part.color).filter((color) => color !== undefined);
      expect(colors.every((color) => color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722 >= 0.085)).toBe(true);
      expect(new Set(colors.map((color) => color.map((channel) => channel.toFixed(3)).join(","))).size).toBeGreaterThan(1);
    }
  });

  it("reuses matching procedural library assets", () => {
    for (const page of [15, 16, 17, 36, 51, 71, 106]) {
      const parts = buildBlender119SceneParts(page);
      expect(parts.some((part) => typeof part.metadata?.reusedFrom === "string")).toBe(true);
    }
  });

  it("uses detailed procedural buildings instead of box placeholders", () => {
    for (const page of [2, 4, 5, 9, 14, 34, 70]) {
      const structures = buildBlender119SceneParts(page).find((part) => part.name.endsWith("_structures"));
      expect(structures).toBeTruthy();
      expect(structures!.mesh.positions.length).toBeGreaterThan(1_000);
      expect(structures!.mesh.indices.length / 3).toBeGreaterThan(500);
    }
  });

  it("builds all 119 pages as distinct studied scenes", () => {
    const signatures = new Set<string>();
    for (const scene of BLENDER_119_SCENES) {
      const parts = buildBlender119SceneParts(scene);
      expect(parts.length).toBeGreaterThanOrEqual(2);
      expect(parts.every((part) => part.label && !part.label.startsWith("blender-119"))).toBe(true);
      expect(parts.every((part) => part.colors?.length === part.mesh.positions.length * 3)).toBe(true);
      expect(parts.every((part) => part.metadata?.sourceStudy === "https://www.bilibili.com/video/BV1nx421972j")).toBe(true);

      const signature = parts
        .flatMap((part) => part.mesh.positions)
        .map((position) => `${position.x.toFixed(4)},${position.y.toFixed(4)},${position.z.toFixed(4)}`)
        .join(";");
      signatures.add(signature);
    }
    expect(signatures.size).toBe(119);
  });

  it("rejects unknown scenes", () => {
    expect(() => buildBlender119SceneParts("missing-scene")).toThrow("Unknown Blender 119 scene");
  });
});
