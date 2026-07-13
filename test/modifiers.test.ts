import { describe, expect, it } from "vitest";
import {
  applyModifierStack,
  arrayModifier,
  booleanModifier,
  bounds,
  box,
  buildModifier,
  castModifier,
  cleanModifier,
  clothModifier,
  correctiveSmoothModifier,
  cross,
  decimateModifier,
  defineModifier,
  dot,
  edgeSplitModifier,
  evaluateModifierStack,
  curveDeformModifier,
  latticeModifier,
  laplacianSmoothModifier,
  maskModifier,
  mirrorMesh,
  plane,
  polyline,
  setModifierEnabled,
  screwModifier,
  shrinkwrapModifier,
  skinModifier,
  smoothModifier,
  sphere,
  subdivisionModifier,
  sub,
  surfaceScatterModifier,
  transformModifier,
  triangleCount,
  updateModifier,
  vec3,
  vertexCount,
  voxelRemeshModifier,
  waveModifier,
  weightedNormalModifier,
  wireframeModifier,
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

  it("passes shared context to custom modifiers", () => {
    const modifier = defineModifier({
      type: "context-test",
      category: "attribute",
      parameters: {},
      apply: (mesh, _parameters, context) => context.meshes?.target ?? mesh,
    });
    const target = sphere(0.5, 8, 6);
    expect(applyModifierStack(box(), [modifier], { meshes: { target } })).toBe(target);
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

  it("supports multiple axes and optional seam welding", () => {
    const source = applyModifierStack(box(0.5, 0.5, 0.5), [
      transformModifier({ translate: vec3(0.5, 0.5, 0) }),
    ]);
    const mirrored = mirrorMesh(source, { axes: ["x", "y"] });
    const welded = mirrorMesh(source, { axes: ["x", "y"], merge: true });

    expect(triangleCount(mirrored)).toBe(triangleCount(source) * 4);
    expect(triangleCount(welded)).toBeGreaterThan(0);
    expect(bounds(welded).min.x).toBeCloseTo(-0.75);
    expect(bounds(welded).max.y).toBeCloseTo(0.75);
  });

  it("bisects the source and clips the welded seam", () => {
    const source = applyModifierStack(box(2, 1, 1), [
      transformModifier({ translate: vec3(-0.25, 0, 0) }),
    ]);
    const result = mirrorMesh(source, {
      axis: "x",
      bisect: true,
      clip: true,
      mergeTolerance: 1e-6,
    });

    expect(bounds(result).min.x).toBeCloseTo(-0.75);
    expect(bounds(result).max.x).toBeCloseTo(0.75);
    expect(result.positions.some((position) => position.x === 0)).toBe(true);
  });
});

describe("built-in modifier library", () => {
  it("resolves external meshes for boolean and reports missing context keys", () => {
    const cutter = applyModifierStack(box(1, 1, 1), [
      transformModifier({ translate: vec3(0.4, 0, 0) }),
    ]);
    const modifier = booleanModifier({ operation: "subtract", target: "cutter" });
    const result = applyModifierStack(box(1, 1, 1), [modifier], { meshes: { cutter } });

    expect(triangleCount(result)).toBeGreaterThan(0);
    expect(() => applyModifierStack(box(), [modifier])).toThrow(
      'Boolean target mesh "cutter" was not found in modifier context',
    );
  });

  it("wraps cleanup and voxel remesh kernels", () => {
    const source = box(1, 1, 1);
    const cleaned = applyModifierStack(source, [cleanModifier()]);
    const remeshed = applyModifierStack(source, [voxelRemeshModifier({ resolution: 8 })]);

    expect(triangleCount(cleaned)).toBe(triangleCount(source));
    expect(triangleCount(remeshed)).toBeGreaterThan(0);
  });

  it("deforms through referenced lattice point sets", () => {
    const base = [vec3(-1, 0, -1), vec3(1, 0, -1), vec3(-1, 0, 1), vec3(1, 0, 1)];
    const edited = base.map((point, index) => index === 3 ? vec3(point.x, 1, point.z) : point);
    const modifier = latticeModifier({
      rows: 2,
      columns: 2,
      basePoints: "base",
      editedPoints: "edited",
    });
    const result = applyModifierStack(plane(2, 2, 2, 2), [modifier], {
      pointSets: { base, edited },
    });

    expect(bounds(result).max.y).toBeCloseTo(1);
  });

  it("runs deterministic cloth and surface scatter modifiers", () => {
    const cloth = clothModifier({ iterations: 2, passes: 1, gravity: 0.01 });
    const clothInput = plane(1, 1, 2, 2);
    const first = applyModifierStack(clothInput, [cloth]);
    const second = applyModifierStack(clothInput, [cloth]);
    expect(first.positions).toEqual(second.positions);
    expect(bounds(first).max.y).toBeLessThan(0);

    const scatter = surfaceScatterModifier({ instance: "instance", count: 3, seed: 9 });
    const scattered = applyModifierStack(plane(2, 2), [scatter], {
      meshes: { instance: box(0.1, 0.1, 0.1) },
    });
    expect(triangleCount(scattered)).toBe(triangleCount(box()) * 3);
  });

  it("adds smooth, decimate, wireframe, and shrinkwrap", () => {
    const raised = plane(2, 2, 2, 2);
    const positions = raised.positions.map((point, index) =>
      index === 4 ? vec3(point.x, 1, point.z) : point,
    );
    const bumped = { ...raised, positions };
    const smoothed = applyModifierStack(bumped, [smoothModifier({ factor: 1 })]);
    expect(bounds(smoothed).max.y).toBeLessThan(1);

    const dense = sphere(1, 20, 14);
    const decimated = applyModifierStack(dense, [decimateModifier({ ratio: 0.35 })]);
    expect(vertexCount(decimated)).toBeLessThan(vertexCount(dense));
    expect(triangleCount(decimated)).toBeGreaterThan(0);

    const wireframe = applyModifierStack(box(), [wireframeModifier({ sides: 4 })]);
    expect(triangleCount(wireframe)).toBeGreaterThan(triangleCount(box()));

    const target = plane(4, 4, 2, 2);
    const floating = applyModifierStack(plane(1, 1), [
      transformModifier({ translate: vec3(0, 2, 0) }),
    ]);
    const wrapped = applyModifierStack(
      floating,
      [shrinkwrapModifier({ target: "ground", offset: 0.2 })],
      { meshes: { ground: target } },
    );
    expect(bounds(wrapped).min.y).toBeCloseTo(0.2);
    expect(bounds(wrapped).max.y).toBeCloseTo(0.2);
  });

  it("adds weighted normals, edge splitting, curve deform, and build", () => {
    const weighted = applyModifierStack(box(1, 2, 3), [
      weightedNormalModifier({ mode: "face-area", sharpAngle: 180 }),
    ]);
    expect(weighted.normals).toHaveLength(weighted.positions.length);
    expect(weighted.normals[0]!.x ** 2 + weighted.normals[0]!.y ** 2 + weighted.normals[0]!.z ** 2)
      .toBeCloseTo(1);

    const sharp = applyModifierStack(box(), [edgeSplitModifier({ angle: 30 })]);
    const smooth = applyModifierStack(box(), [edgeSplitModifier({ angle: 180 })]);
    expect(vertexCount(sharp)).toBeGreaterThan(vertexCount(smooth));

    const guide = polyline([vec3(0, 0, 0), vec3(0, 2, 0)]);
    const deformed = applyModifierStack(
      box(2, 0.2, 0.2),
      [curveDeformModifier({ curve: "guide", axis: "x", initialNormal: vec3(1, 0, 0) })],
      { curves: { guide } },
    );
    expect(bounds(deformed).min.y).toBeCloseTo(0);
    expect(bounds(deformed).max.y).toBeCloseTo(2);

    const halfBuilt = applyModifierStack(box(), [buildModifier({ factor: 0.5 })]);
    expect(triangleCount(halfBuilt)).toBe(triangleCount(box()) / 2);
    expect(triangleCount(applyModifierStack(box(), [buildModifier({ factor: 0 })]))).toBe(0);
  });

  it("masks stable face sets from modifier context", () => {
    const source = box();
    const visible = applyModifierStack(
      source,
      [maskModifier({ faceSet: "front" })],
      { faceSets: { front: [0, 1] } },
    );
    const hidden = applyModifierStack(
      source,
      [maskModifier({ faceSet: "front", invert: true })],
      { faceSets: { front: [0, 1] } },
    );

    expect(triangleCount(visible)).toBe(2);
    expect(triangleCount(hidden)).toBe(triangleCount(source) - 2);
    expect(() => applyModifierStack(source, [maskModifier({ faceSet: "missing" })])).toThrow(
      'Mask face set "missing" was not found in modifier context',
    );
  });

  it("adds screw and skin topology generators", () => {
    const profile = plane(0.4, 1);
    const screw = screwModifier({ steps: 8, screwOffset: 2, axis: "y" });
    const first = applyModifierStack(profile, [screw]);
    const second = applyModifierStack(profile, [screw]);

    expect(first).toEqual(second);
    expect(triangleCount(first)).toBeGreaterThan(triangleCount(profile));
    expect(bounds(first).min.y).toBeCloseTo(0);
    expect(bounds(first).max.y).toBeCloseTo(2);

    const skin = applyModifierStack(profile, [skinModifier({ radius: 0.08, sides: 6 })]);
    expect(triangleCount(skin)).toBeGreaterThan(triangleCount(profile));
    expect(bounds(skin).max.y).toBeGreaterThan(0);
  });

  it("adds cast and time-driven wave deformation", () => {
    const cast = applyModifierStack(box(1, 2, 3), [
      castModifier({ shape: "sphere", radius: 2 }),
    ]);
    for (const point of cast.positions) {
      expect(Math.hypot(point.x, point.y, point.z)).toBeCloseTo(2);
    }
    const cylinder = applyModifierStack(box(1, 2, 3), [
      castModifier({ shape: "cylinder", axis: "x", radius: 2 }),
    ]);
    for (const point of cylinder.positions) {
      expect(Math.hypot(point.y, point.z)).toBeCloseTo(2);
    }

    const source = plane(2, 2, 2, 2);
    const wave = waveModifier({ amplitude: 0.5, wavelength: 2, speed: 1 });
    const atStart = applyModifierStack(source, [wave], { time: 0 });
    const later = applyModifierStack(source, [wave], { time: 0.25 });
    expect(atStart.positions).not.toEqual(later.positions);
    expect(later.positions).toEqual(applyModifierStack(source, [wave], { time: 0.25 }).positions);
  });

  it("adds Laplacian and rest-shape corrective smoothing", () => {
    const rest = plane(2, 2, 2, 2);
    const deformed = {
      ...rest,
      positions: rest.positions.map((point, index) => index === 4 ? vec3(point.x, 1, point.z) : point),
    };
    const laplacian = applyModifierStack(deformed, [
      laplacianSmoothModifier({ iterations: 2, factor: 0.5 }),
    ]);
    expect(bounds(laplacian).max.y).toBeLessThan(1);

    const corrected = applyModifierStack(
      deformed,
      [correctiveSmoothModifier({ rest: "rest", iterations: 1, factor: 1 })],
      { meshes: { rest } },
    );
    expect(bounds(corrected).max.y).toBeCloseTo(0);
    expect(() => applyModifierStack(
      deformed,
      [correctiveSmoothModifier({ rest: "wrong" })],
      { meshes: { wrong: box() } },
    )).toThrow("rest mesh topology does not match input topology");
  });
});
