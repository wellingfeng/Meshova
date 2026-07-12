import { describe, expect, it } from "vitest";
import {
  applyModifierStack,
  arrayModifier,
  bounds,
  box,
  cross,
  defineModifier,
  dot,
  evaluateModifierStack,
  mirrorMesh,
  setModifierEnabled,
  subdivisionModifier,
  sub,
  transformModifier,
  triangleCount,
  updateModifier,
  vec3,
} from "../src/index.js";

describe("modifier stack", () => {
  it("evaluates modifiers in list order", () => {
    const source = box(1, 1, 1);
    const translate = transformModifier({ translate: vec3(1, 0, 0) });
    const scale = transformModifier({ scale: 2 });

    const translateThenScale = bounds(applyModifierStack(source, [translate, scale]));
    const scaleThenTranslate = bounds(applyModifierStack(source, [scale, translate]));

    expect(translateThenScale.min.x).toBeCloseTo(1);
    expect(translateThenScale.max.x).toBeCloseTo(3);
    expect(scaleThenTranslate.min.x).toBeCloseTo(0);
    expect(scaleThenTranslate.max.x).toBeCloseTo(2);
  });

  it("skips disabled modifiers and records stages", () => {
    const source = box(1, 1, 1);
    const disabled = setModifierEnabled(
      transformModifier({ translate: vec3(10, 0, 0) }),
      false,
    );
    const array = arrayModifier({ count: 2, step: 2 });
    const evaluation = evaluateModifierStack(source, [disabled, array]);

    expect(evaluation.stages).toHaveLength(2);
    expect(evaluation.stages[0]!.applied).toBe(false);
    expect(evaluation.stages[0]!.output).toBe(source);
    expect(evaluation.stages[1]!.applied).toBe(true);
    expect(triangleCount(evaluation.mesh)).toBe(triangleCount(source) * 2);
  });

  it("updates parameters without changing the original modifier", () => {
    const original = arrayModifier({ count: 2, step: 1 });
    const updated = updateModifier(original, { count: 4 });

    expect(original.parameters.count).toBe(2);
    expect(updated.parameters.count).toBe(4);
    expect(triangleCount(applyModifierStack(box(1, 1, 1), [updated]))).toBe(48);
  });

  it("keeps disabled state when parameters change", () => {
    const disabled = setModifierEnabled(arrayModifier({ count: 2 }), false);
    const updated = updateModifier(disabled, { count: 5 });

    expect(updated.enabled).toBe(false);
    expect(applyModifierStack(box(1, 1, 1), [updated]).positions).toHaveLength(24);
  });

  it("supports custom modifiers and adds stack context to failures", () => {
    const broken = defineModifier({
      type: "broken",
      name: "Broken test",
      category: "deform",
      parameters: {},
      apply: () => {
        throw new Error("kernel failed");
      },
    });

    expect(() => applyModifierStack(box(1, 1, 1), [broken])).toThrow(
      'modifier "Broken test" (broken) failed at index 0: kernel failed',
    );
  });

  it("wraps existing subdivision kernels", () => {
    const source = box(1, 1, 1);
    const modifier = subdivisionModifier({ mode: "simple", levels: 2 });
    const result = applyModifierStack(source, [modifier]);
    expect(triangleCount(result)).toBe(triangleCount(source) * 16);
  });
});

describe("mirror modifier kernel", () => {
  it("keeps source, creates reflected copy, and preserves outward winding", () => {
    const source = applyModifierStack(box(1, 1, 1), [
      transformModifier({ translate: vec3(1, 0, 0) }),
    ]);
    const mirrored = mirrorMesh(source, { axis: "x" });
    const resultBounds = bounds(mirrored);

    expect(resultBounds.min.x).toBeCloseTo(-1.5);
    expect(resultBounds.max.x).toBeCloseTo(1.5);
    expect(triangleCount(mirrored)).toBe(triangleCount(source) * 2);

    for (let index = source.indices.length; index < mirrored.indices.length; index += 3) {
      const ia = mirrored.indices[index]!;
      const ib = mirrored.indices[index + 1]!;
      const ic = mirrored.indices[index + 2]!;
      const faceNormal = cross(
        sub(mirrored.positions[ib]!, mirrored.positions[ia]!),
        sub(mirrored.positions[ic]!, mirrored.positions[ia]!),
      );
      expect(dot(faceNormal, mirrored.normals[ia]!)).toBeGreaterThan(0);
    }
  });
});
