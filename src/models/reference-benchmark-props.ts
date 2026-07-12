/** Procedural props used to validate the real-image fitting loop end to end. */
import {
  box,
  capsule,
  cylinder,
  lathe,
  merge,
  polyline,
  prism,
  roundedBox,
  smoothCurve,
  sphere,
  sweep,
  torus,
  transform,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import { vec2 } from "../math/vec2.js";
import { vec3, type Vec3 } from "../math/vec3.js";

type RGB = [number, number, number];

export type ReferenceBenchmarkPropKind =
  | "magnifying-glass"
  | "headphones"
  | "electric-kettle"
  | "scissors";

export interface ReferenceBenchmarkPropParams {
  kind: ReferenceBenchmarkPropKind;
  width: number;
  depth: number;
  height: number;
  detail: number;
  variation: number;
  structure: number;
  wear: number;
  seed: number;
}

export interface ReferenceBenchmarkDefinition {
  id: string;
  name: string;
  kind: ReferenceBenchmarkPropKind;
  sourceProvider: "Poly Haven" | "Wikimedia Commons";
  sourceAssetId?: string;
  sourceName: string;
  sourcePage: string;
  sourceImage: string;
  sourceLicense: string;
  sourceDimensionsMm: [number, number, number];
  defaults: ReferenceBenchmarkPropParams;
  benchmarkSignals: string[];
}

export const REFERENCE_BENCHMARK_MODELS: ReferenceBenchmarkDefinition[] = [
  {
    id: "benchmark-magnifying-glass",
    name: "实图闭环基准 · 放大镜",
    kind: "magnifying-glass",
    sourceProvider: "Poly Haven",
    sourceAssetId: "magnifying_glass_01",
    sourceName: "Magnifying Glass 01",
    sourcePage: "https://polyhaven.com/a/magnifying_glass_01",
    sourceImage: "https://cdn.polyhaven.com/asset_img/thumbs/magnifying_glass_01.png?width=512&height=512",
    sourceLicense: "CC0",
    sourceDimensionsMm: [132.138, 26.718, 271.572],
    defaults: { kind: "magnifying-glass", width: 0.132, depth: 0.027, height: 0.272, detail: 1, variation: 0.5, structure: 16, wear: 0.22, seed: 811 },
    benchmarkSignals: ["玻璃透射", "镜片厚度", "镜框贴合", "细长手柄剪影"],
  },
  {
    id: "benchmark-headphones",
    name: "实图闭环基准 · 头戴耳机",
    kind: "headphones",
    sourceProvider: "Wikimedia Commons",
    sourceName: "Headphones-2852336 640",
    sourcePage: "https://commons.wikimedia.org/wiki/File:Headphones-2852336_640.png",
    sourceImage: "https://upload.wikimedia.org/wikipedia/commons/3/34/Headphones-2852336_640.png",
    sourceLicense: "CC0",
    sourceDimensionsMm: [190, 90, 210],
    defaults: { kind: "headphones", width: 0.19, depth: 0.09, height: 0.21, detail: 1, variation: 0.42, structure: 12, wear: 0.05, seed: 831 },
    benchmarkSignals: ["双侧镜像约束", "曲线头梁", "软垫厚度", "伸缩关节"],
  },
  {
    id: "benchmark-electric-kettle",
    name: "实图闭环基准 · 电热水壶",
    kind: "electric-kettle",
    sourceProvider: "Wikimedia Commons",
    sourceName: "2023 Czajnik elektryczny Bosch (1)",
    sourcePage: "https://commons.wikimedia.org/wiki/File:2023_Czajnik_elektryczny_Bosch_(1).jpg",
    sourceImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/2023_Czajnik_elektryczny_Bosch_%281%29.jpg/960px-2023_Czajnik_elektryczny_Bosch_%281%29.jpg",
    sourceLicense: "CC BY-SA 4.0",
    sourceDimensionsMm: [220, 180, 250],
    defaults: { kind: "electric-kettle", width: 0.22, depth: 0.18, height: 0.25, detail: 1, variation: 0.48, structure: 14, wear: 0.04, seed: 841 },
    benchmarkSignals: ["旋转壳体", "壶嘴连续性", "曲线把手", "空腔暗示"],
  },
  {
    id: "benchmark-scissors",
    name: "实图闭环基准 · 剪刀",
    kind: "scissors",
    sourceProvider: "Wikimedia Commons",
    sourceName: "Pair of scissors with black handle, 2015-06-07",
    sourcePage: "https://commons.wikimedia.org/wiki/File:Pair_of_scissors_with_black_handle,_2015-06-07.jpg",
    sourceImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Pair_of_scissors_with_black_handle%2C_2015-06-07.jpg/960px-Pair_of_scissors_with_black_handle%2C_2015-06-07.jpg",
    sourceLicense: "CC BY-SA 4.0",
    sourceDimensionsMm: [210, 12, 82],
    defaults: { kind: "scissors", width: 0.21, depth: 0.012, height: 0.082, detail: 1, variation: 0.42, structure: 12, wear: 0.12, seed: 851 },
    benchmarkSignals: ["转轴约束", "开合联动", "薄刃几何", "双环握柄"],
  },
];

const DARK: RGB = [0.025, 0.028, 0.03];
const STEEL: RGB = [0.52, 0.55, 0.57];
const GLASS: RGB = [0.68, 0.82, 0.86];
const RUBBER: RGB = [0.05, 0.055, 0.06];
const KETTLE: RGB = [0.58, 0.6, 0.59];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function definitionFor(kind: ReferenceBenchmarkPropKind): ReferenceBenchmarkDefinition {
  return REFERENCE_BENCHMARK_MODELS.find((entry) => entry.kind === kind) ?? REFERENCE_BENCHMARK_MODELS[0]!;
}

function part(
  definition: ReferenceBenchmarkDefinition,
  name: string,
  label: string,
  mesh: Mesh,
  color: RGB,
  surfaceType: string,
  surfaceParams: Record<string, unknown> = {},
  doubleSided = false,
): NamedPart {
  return {
    name,
    label,
    mesh,
    color,
    surface: { type: surfaceType, params: { color, ...surfaceParams } },
    metadata: {
      benchmark: "real-image-fitting",
      benchmarkSignals: definition.benchmarkSignals,
      referenceProvider: definition.sourceProvider,
      referencePage: definition.sourcePage,
      referenceImage: definition.sourceImage,
      referenceModel: definition.sourceName,
      referenceLicense: definition.sourceLicense,
      referenceDimensionsMm: definition.sourceDimensionsMm,
      reconstruction: "procedural-from-public-reference-image",
      sourceMeshUsed: false,
      sourceTexturesUsed: false,
    },
    ...(doubleSided ? { doubleSided: true } : {}),
  };
}

function tube(points: Vec3[], radius: number, sides: number): Mesh {
  const path = points.length > 2 ? smoothCurve(polyline(points), 3) : polyline(points);
  return sweep(path, { radius, sides, caps: true });
}

function planarPrism(outline: ReturnType<typeof vec2>[], thickness: number): Mesh {
  return transform(prism(outline, thickness), { rotate: vec3(-Math.PI / 2, 0, 0) });
}

function buildMagnifyingGlass(definition: ReferenceBenchmarkDefinition, p: ReferenceBenchmarkPropParams): NamedPart[] {
  const outerRadius = p.width * 0.48;
  const innerRadius = outerRadius * 0.82;
  const centerY = p.height - outerRadius;
  const handleAngle = (p.variation - 0.5) * 0.18;
  const handleLength = Math.max(p.height - outerRadius * 1.9, p.height * 0.38);
  const handleY = centerY - outerRadius - handleLength * 0.46;
  const ring = merge(
    transform(torus((outerRadius + innerRadius) * 0.5, (outerRadius - innerRadius) * 0.5, p.detail > 0 ? 48 : 24, 8), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(0, centerY, 0),
    }),
    transform(box(p.width * 0.18, p.height * 0.07, p.depth * 0.7), {
      rotate: vec3(0, 0, handleAngle),
      translate: vec3(0, centerY - outerRadius * 0.91, 0),
    }),
  );
  const lens = transform(sphere(innerRadius * 1.01, p.detail > 0 ? 36 : 20, p.detail > 0 ? 18 : 10), {
    scale: vec3(1, 1, clamp(p.depth / (innerRadius * 7), 0.04, 0.11)),
    translate: vec3(0, centerY, 0),
  });
  const handle = transform(capsule(p.width * 0.095, handleLength, p.detail > 0 ? 24 : 14, 5), {
    rotate: vec3(0, 0, handleAngle),
    translate: vec3(Math.sin(handleAngle) * handleLength * 0.16, handleY, 0),
  });
  const collar = transform(cylinder(p.width * 0.105, p.height * 0.075, 20), {
    rotate: vec3(0, 0, handleAngle),
    translate: vec3(0, centerY - outerRadius * 1.03, 0),
  });
  return [
    part(definition, "magnifier_frame", "放大镜金属镜框与柄座", ring, STEEL, "metal", { roughness: 0.28, wear: p.wear }),
    part(definition, "magnifier_lens", "放大镜双凸透明镜片", lens, GLASS, "glass", { roughness: 0.08, transmission: 0.94, ior: 1.52 }, true),
    part(definition, "magnifier_handle", "放大镜防滑手柄", handle, DARK, "rubber", { roughness: 0.78, wear: p.wear }),
    part(definition, "magnifier_collar", "放大镜手柄金属套环", collar, STEEL, "metal", { roughness: 0.32 }),
  ];
}

function buildHeadphones(definition: ReferenceBenchmarkDefinition, p: ReferenceBenchmarkPropParams): NamedPart[] {
  const halfWidth = p.width * 0.42;
  const cupY = p.height * (0.31 - p.variation * 0.08);
  const cupRadius = p.height * 0.18;
  const archTop = p.height * 0.97;
  const headband = tube([
    vec3(-halfWidth, cupY + cupRadius * 0.45, 0),
    vec3(-halfWidth * 0.92, p.height * 0.78, 0),
    vec3(-halfWidth * 0.48, archTop, 0),
    vec3(0, p.height, 0),
    vec3(halfWidth * 0.48, archTop, 0),
    vec3(halfWidth * 0.92, p.height * 0.78, 0),
    vec3(halfWidth, cupY + cupRadius * 0.45, 0),
  ], p.width * 0.035, p.detail > 0 ? 12 : 7);
  const innerBand = tube([
    vec3(-halfWidth * 0.78, p.height * 0.78, 0),
    vec3(0, p.height * 0.91, 0),
    vec3(halfWidth * 0.78, p.height * 0.78, 0),
  ], p.width * 0.024, 9);
  const cups: Mesh[] = [];
  const cushions: Mesh[] = [];
  const yokes: Mesh[] = [];
  const sliders: Mesh[] = [];
  for (const side of [-1, 1]) {
    const x = side * halfWidth;
    cups.push(transform(cylinder(cupRadius, p.depth * 0.62, p.detail > 0 ? 32 : 18), {
      rotate: vec3(Math.PI / 2, 0, 0),
      scale: vec3(0.82, 1.08, 1),
      translate: vec3(x, cupY, 0),
    }));
    cushions.push(transform(torus(cupRadius * 0.67, cupRadius * 0.22, 28, 8), {
      rotate: vec3(Math.PI / 2, 0, 0),
      scale: vec3(0.82, 1.08, 1),
      translate: vec3(x, cupY, p.depth * 0.36),
    }));
    yokes.push(tube([
      vec3(x - side * cupRadius * 0.72, cupY + cupRadius * 0.7, 0),
      vec3(x - side * cupRadius * 0.96, cupY + cupRadius * 1.2, 0),
      vec3(x, cupY + cupRadius * 1.36, 0),
      vec3(x + side * cupRadius * 0.72, cupY + cupRadius * 0.7, 0),
    ], p.width * 0.018, 8));
    sliders.push(transform(roundedBox({ width: p.width * 0.055, height: p.height * (0.13 + p.variation * 0.12), depth: p.depth * 0.25, radius: p.width * 0.012, steps: 2 }), {
      translate: vec3(x, cupY + cupRadius * 1.65, 0),
    }));
  }
  return [
    part(definition, "headphones_headband", "头戴耳机外头梁与内侧软带", merge(headband, innerBand), DARK, "plastic", { roughness: 0.5, wear: p.wear }),
    part(definition, "headphones_sliders", "头戴耳机双侧伸缩滑轨", merge(...sliders), STEEL, "metal", { roughness: 0.34 }),
    part(definition, "headphones_yokes", "头戴耳机耳罩转动支架", merge(...yokes), STEEL, "metal", { roughness: 0.38 }),
    part(definition, "headphones_earcups", "头戴耳机左右声学腔体", merge(...cups), DARK, "plastic", { roughness: 0.56, wear: p.wear }),
    part(definition, "headphones_cushions", "头戴耳机椭圆记忆棉耳垫", merge(...cushions), RUBBER, "fabric", { roughness: 0.92 }),
  ];
}

function buildElectricKettle(definition: ReferenceBenchmarkDefinition, p: ReferenceBenchmarkPropParams): NamedPart[] {
  const bodyRadius = Math.min(p.width * 0.39, p.depth * 0.48);
  const bodyBottom = p.height * 0.08;
  const bodyTop = p.height * 0.83;
  const body = lathe([
    vec2(bodyRadius * 0.72, bodyBottom),
    vec2(bodyRadius * 0.94, bodyBottom + p.height * 0.04),
    vec2(bodyRadius, p.height * 0.3),
    vec2(bodyRadius * 0.96, p.height * 0.62),
    vec2(bodyRadius * 0.77, bodyTop),
  ], { segments: p.detail > 0 ? 40 : 22 });
  const base = merge(
    transform(cylinder(bodyRadius * 1.02, p.height * 0.07, 36), { translate: vec3(0, p.height * 0.035, 0) }),
    transform(torus(bodyRadius * 0.96, bodyRadius * 0.035, 32, 6), { translate: vec3(0, p.height * 0.07, 0) }),
  );
  const lid = merge(
    transform(cylinder(bodyRadius * 0.76, p.height * 0.04, 32), { translate: vec3(0, bodyTop + p.height * 0.025, 0) }),
    transform(roundedBox({ width: p.width * 0.12, height: p.height * 0.035, depth: p.depth * 0.13, radius: p.width * 0.018, steps: 2 }), { translate: vec3(0, bodyTop + p.height * 0.065, 0) }),
  );
  const spoutLift = p.height * (0.69 + p.variation * 0.1);
  const spout = merge(
    tube([
      vec3(bodyRadius * 0.72, p.height * 0.52, 0),
      vec3(p.width * 0.47, p.height * 0.6, 0),
      vec3(p.width * 0.56, spoutLift, 0),
    ], p.width * 0.055, p.detail > 0 ? 14 : 8),
    transform(torus(p.width * 0.058, p.width * 0.012, 20, 6), {
      rotate: vec3(0, Math.PI / 2, 0),
      translate: vec3(p.width * 0.56, spoutLift, 0),
    }),
  );
  const handle = tube([
    vec3(-bodyRadius * 0.74, p.height * 0.67, 0),
    vec3(-p.width * 0.52, p.height * 0.75, 0),
    vec3(-p.width * 0.57, p.height * 0.48, 0),
    vec3(-p.width * 0.5, p.height * 0.24, 0),
    vec3(-bodyRadius * 0.78, p.height * 0.2, 0),
  ], p.width * 0.045, p.detail > 0 ? 14 : 8);
  const window = transform(capsule(p.width * 0.035, p.height * 0.38, 18, 5), {
    translate: vec3(0, p.height * 0.43, bodyRadius * 0.98),
  });
  const switchMesh = transform(roundedBox({ width: p.width * 0.07, height: p.height * 0.13, depth: p.depth * 0.055, radius: p.width * 0.015, steps: 2 }), {
    rotate: vec3(0, 0, -0.14 + p.variation * 0.28),
    translate: vec3(-p.width * 0.39, p.height * 0.17, p.depth * 0.18),
  });
  return [
    part(definition, "kettle_body", "电热水壶旋转成形壶身", body, KETTLE, "metal", { roughness: 0.32, wear: p.wear }),
    part(definition, "kettle_base", "电热水壶供电底座与定位环", base, DARK, "plastic", { roughness: 0.6 }),
    part(definition, "kettle_lid", "电热水壶顶盖与开盖按钮", lid, DARK, "plastic", { roughness: 0.5 }),
    part(definition, "kettle_spout", "电热水壶连续出水嘴与壶口", spout, KETTLE, "metal", { roughness: 0.34, wear: p.wear }),
    part(definition, "kettle_handle", "电热水壶隔热曲线把手", handle, DARK, "plastic", { roughness: 0.58 }),
    part(definition, "kettle_window", "电热水壶透明水位窗", window, GLASS, "glass", { roughness: 0.12, transmission: 0.8 }, true),
    part(definition, "kettle_switch", "电热水壶联动电源拨杆", switchMesh, [0.72, 0.08, 0.035], "plastic", { roughness: 0.52 }),
  ];
}

function scissorsMember(p: ReferenceBenchmarkPropParams, side: number, angle: number): { blade: Mesh; edge: Mesh; handle: Mesh } {
  const bladeLength = p.width * 0.59;
  const bladeWidth = p.height * 0.22;
  const bladeOutline = [
    vec2(0, -bladeWidth * 0.45),
    vec2(bladeLength * 0.86, -bladeWidth * 0.25),
    vec2(bladeLength, 0),
    vec2(bladeLength * 0.13, bladeWidth * 0.5),
  ];
  const edgeOutline = [
    vec2(bladeLength * 0.08, -bladeWidth * 0.48),
    vec2(bladeLength, 0),
    vec2(bladeLength * 0.82, -bladeWidth * 0.08),
  ];
  const blade = transform(planarPrism(bladeOutline, p.depth * 0.42), { rotate: vec3(0, 0, angle) });
  const edge = transform(planarPrism(edgeOutline, p.depth * 0.16), {
    rotate: vec3(0, 0, angle),
    translate: vec3(0, 0, side * p.depth * 0.22),
  });
  const loopRadius = p.height * (side > 0 ? 0.24 : 0.19);
  const loopCenter = vec3(-p.width * 0.23, side * p.height * 0.28, side * p.depth * 0.18);
  const handle = merge(
    transform(torus(loopRadius, p.height * 0.075, p.detail > 0 ? 28 : 16, 7), {
      rotate: vec3(Math.PI / 2, 0, 0),
      scale: vec3(1.35, 1, 1),
      translate: loopCenter,
    }),
    tube([vec3(loopCenter.x * 0.76, loopCenter.y * 0.72, 0), vec3(0, 0, 0)], p.height * 0.055, 8),
  );
  return { blade, edge, handle: transform(handle, { rotate: vec3(0, 0, angle) }) };
}

function buildScissors(definition: ReferenceBenchmarkDefinition, p: ReferenceBenchmarkPropParams): NamedPart[] {
  const openAngle = 0.05 + p.variation * 0.72;
  const upper = scissorsMember(p, 1, openAngle * 0.5);
  const lower = scissorsMember(p, -1, -openAngle * 0.5);
  const pivot = merge(
    transform(cylinder(p.height * 0.105, p.depth * 1.35, 24), { rotate: vec3(Math.PI / 2, 0, 0) }),
    transform(cylinder(p.height * 0.045, p.depth * 1.5, 20), { rotate: vec3(Math.PI / 2, 0, 0) }),
  );
  return [
    part(definition, "scissors_blades", "剪刀联动交叉薄刃", merge(upper.blade, lower.blade), STEEL, "metal", { roughness: 0.24, wear: p.wear }),
    part(definition, "scissors_edges", "剪刀双侧刃口", merge(upper.edge, lower.edge), [0.78, 0.8, 0.8], "metal", { roughness: 0.16 }),
    part(definition, "scissors_handles", "剪刀大小双环握柄", merge(upper.handle, lower.handle), DARK, "plastic", { roughness: 0.62, wear: p.wear }),
    part(definition, "scissors_pivot", "剪刀中心转轴与铆钉", pivot, STEEL, "metal", { roughness: 0.3 }),
  ];
}

export function buildReferenceBenchmarkParts(input: Partial<ReferenceBenchmarkPropParams> = {}): NamedPart[] {
  const kind = input.kind ?? "magnifying-glass";
  const definition = definitionFor(kind);
  const p: ReferenceBenchmarkPropParams = {
    ...definition.defaults,
    ...input,
    kind,
    width: clamp(input.width ?? definition.defaults.width, 0.04, 1),
    depth: clamp(input.depth ?? definition.defaults.depth, 0.004, 0.6),
    height: clamp(input.height ?? definition.defaults.height, 0.04, 1),
    detail: clamp(Math.round(input.detail ?? definition.defaults.detail), 0, 1),
    variation: clamp(input.variation ?? definition.defaults.variation, 0, 1),
    structure: clamp(Math.round(input.structure ?? definition.defaults.structure), 3, 32),
    wear: clamp(input.wear ?? definition.defaults.wear, 0, 1),
    seed: Math.max(0, Math.floor(input.seed ?? definition.defaults.seed)),
  };
  switch (kind) {
    case "magnifying-glass": return buildMagnifyingGlass(definition, p);
    case "headphones": return buildHeadphones(definition, p);
    case "electric-kettle": return buildElectricKettle(definition, p);
    case "scissors": return buildScissors(definition, p);
  }
}
