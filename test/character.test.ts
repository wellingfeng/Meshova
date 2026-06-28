import { describe, expect, it } from "vitest";
import {
  applyMorphTargets,
  bounds,
  buildStylizedHumanoidParts,
  buildStylizedHumanoidTemplate,
  extractRegionMesh,
  length,
  triangleCount,
  validateCharacterTemplate,
  vertexCount,
  type Mesh,
} from "../src/index.js";

function assertValidMesh(mesh: Mesh) {
  expect(mesh.normals.length).toBe(mesh.positions.length);
  expect(mesh.uvs.length).toBe(mesh.positions.length);
  expect(mesh.indices.length % 3).toBe(0);
  for (const idx of mesh.indices) {
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(mesh.positions.length);
  }
  for (const n of mesh.normals) {
    expect(length(n)).toBeCloseTo(1, 5);
  }
}

describe("CharacterKit stylized humanoid", () => {
  it("builds a valid fixed-topology template", () => {
    const template = buildStylizedHumanoidTemplate();
    validateCharacterTemplate(template);
    assertValidMesh(template.baseMesh);
    expect(template.id).toBe("stylized-humanoid-v0");
    expect(template.morphTargets.length).toBeGreaterThanOrEqual(8);
    expect(template.skeleton.joints.some((j) => j.id === "head")).toBe(true);
    expect(template.regions.some((r) => r.name === "face")).toBe(true);
  });

  it("applies morphs without changing topology", () => {
    const template = buildStylizedHumanoidTemplate();
    const base = template.baseMesh;
    const morphed = applyMorphTargets(template, {
      "body.height": 0.8,
      "head.size": 0.6,
      "style.chibi": 0.4,
    });

    assertValidMesh(morphed);
    expect(vertexCount(morphed)).toBe(vertexCount(base));
    expect(triangleCount(morphed)).toBe(triangleCount(base));
    expect(morphed.indices).toEqual(base.indices);
    expect(bounds(morphed).max.y).toBeGreaterThan(bounds(base).max.y);
  });

  it("extracts conformed clothing regions from the morphed body", () => {
    const template = buildStylizedHumanoidTemplate();
    const body = applyMorphTargets(template, { "body.waist": -0.5 });
    const suit = extractRegionMesh(template, body, ["torso", "pelvis"], 0.02);

    assertValidMesh(suit);
    expect(vertexCount(suit)).toBeGreaterThan(100);
    expect(triangleCount(suit)).toBeGreaterThan(100);
  });

  it("builds renderable character parts", () => {
    const parts = buildStylizedHumanoidParts({
      chibi: 0.25,
      eyeSize: 0.5,
      noseBridge: 0.35,
    });
    expect(parts.some((p) => p.name === "body_template_morph")).toBe(true);
    expect(parts.some((p) => p.name === "conformed_body_suit")).toBe(true);
    expect(parts.length).toBeGreaterThan(12);
    for (const part of parts) assertValidMesh(part.mesh);
  });
});
