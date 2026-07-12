import { describe, expect, it } from "vitest";
import {
  applyMorphTargets,
  bounds,
  buildStylizedHumanoidParts,
  buildStylizedHumanoidTemplate,
  canonicalizeHumanoidPartsToTPose,
  canonicalizeHumanoidTPose,
  extractRegionMesh,
  length,
  merge,
  recomputeNormals,
  triangleCount,
  validateCharacterTemplate,
  vertexCount,
  vec3,
  sphere,
  transform,
  type Mesh,
  type NamedPart,
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
    expect(parts.find((p) => p.name === "iris_l")?.surface?.type).toBe("glossPaint");
    expect(parts.length).toBeGreaterThan(12);
    for (const part of parts) assertValidMesh(part.mesh);
  });
});

describe("humanoid T-pose canonicalization", () => {
  const armEndpointY = (mesh: Mesh, side: "left" | "right") => {
    const sign = side === "left" ? -1 : 1;
    let best = mesh.positions[0]!;
    for (const p of mesh.positions) {
      if (sign * p.x > sign * best.x) best = p;
    }
    return best.y;
  };

  function droopingHumanoidParts(): NamedPart[] {
    const skin: [number, number, number] = [0.8, 0.55, 0.42];
    const torso = transform(sphere(1, 24, 16), {
      scale: vec3(0.45, 1.05, 0.28),
      translate: vec3(0, 1.55, 0),
    });
    const head = transform(sphere(0.28, 16, 10), {
      translate: vec3(0, 2.78, 0),
    });
    const leftArm = transform(sphere(1, 18, 12), {
      scale: vec3(0.16, 0.7, 0.14),
      rotate: vec3(0, 0, -0.42),
      translate: vec3(-0.62, 1.35, 0),
    });
    const rightArm = transform(sphere(1, 18, 12), {
      scale: vec3(0.16, 0.7, 0.14),
      rotate: vec3(0, 0, 0.42),
      translate: vec3(0.62, 1.35, 0),
    });
    const leftLeg = transform(sphere(1, 16, 10), {
      scale: vec3(0.18, 0.72, 0.16),
      translate: vec3(-0.22, 0.35, 0),
    });
    const rightLeg = transform(sphere(1, 16, 10), {
      scale: vec3(0.18, 0.72, 0.16),
      translate: vec3(0.22, 0.35, 0),
    });
    return [
      { name: "torso", mesh: torso, color: skin },
      { name: "head", mesh: head, color: skin },
      { name: "left_arm", mesh: leftArm, color: skin },
      { name: "right_arm", mesh: rightArm, color: skin },
      { name: "left_leg", mesh: leftLeg, color: skin },
      { name: "right_leg", mesh: rightLeg, color: skin },
    ];
  }

  it("raises drooping humanoid arms toward a T-pose", () => {
    const parts = droopingHumanoidParts();
    const source = recomputeNormals(merge(...parts.map((p) => p.mesh)));
    const beforeLeftY = armEndpointY(source, "left");
    const beforeRightY = armEndpointY(source, "right");

    const result = canonicalizeHumanoidTPose(source);
    const afterLeftY = armEndpointY(result.mesh, "left");
    const afterRightY = armEndpointY(result.mesh, "right");

    assertValidMesh(result.mesh);
    expect(result.confidence).toBeGreaterThan(0.55);
    expect(afterLeftY).toBeGreaterThan(beforeLeftY + 0.25);
    expect(afterRightY).toBeGreaterThan(beforeRightY + 0.25);
    expect(Math.abs(afterLeftY - result.joints.left!.shoulder.y)).toBeLessThan(0.35);
    expect(Math.abs(afterRightY - result.joints.right!.shoulder.y)).toBeLessThan(0.35);
  });

  it("keeps named parts and records diagnostics", () => {
    const parts = droopingHumanoidParts();
    const result = canonicalizeHumanoidPartsToTPose(parts);

    expect(result.parts.map((p) => p.name)).toEqual(parts.map((p) => p.name));
    expect(result.confidence).toBeGreaterThan(0.55);
    expect(result.parts[0]!.metadata?.tpose).toBeTruthy();
    for (const part of result.parts) assertValidMesh(part.mesh);
  });
});
