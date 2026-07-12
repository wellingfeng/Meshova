import {
  box,
  cylinder,
  lathe,
  merge,
  polyline,
  smoothCurve,
  sweep,
  torus,
  transform,
  type Mesh,
} from "../geometry/index.js";
import { vec2 } from "../math/vec2.js";
import { vec3 } from "../math/vec3.js";
import type {
  PolyHavenFinalLearningMeshPart,
  PolyHavenFinalLearningPropParams,
} from "./polyhaven-final-learning-props.js";

type RGB = [number, number, number];

export type PolyHavenDisplayPropKind = "pendant-lamp" | "standing-chalkboard";

const DARK_STEEL: RGB = [0.075, 0.08, 0.078];
const GALVANIZED: RGB = [0.38, 0.4, 0.39];
const WARM_GLASS: RGB = [0.78, 0.76, 0.68];
const WOOD: RGB = [0.42, 0.235, 0.095];
const BOARD: RGB = [0.035, 0.045, 0.043];

function part(
  name: string,
  label: string,
  mesh: Mesh,
  color: RGB,
  surfaceType: string,
  surfaceParams: Record<string, unknown> = {},
  doubleSided = false,
): PolyHavenFinalLearningMeshPart {
  return { name, label, mesh, color, surfaceType, surfaceParams, ...(doubleSided ? { doubleSided: true } : {}) };
}

function buildPendantLamp(p: PolyHavenFinalLearningPropParams): PolyHavenFinalLearningMeshPart[] {
  const radius = p.width * 0.5;
  const canopyHeight = p.height * 0.045;
  const globeBottom = p.height * 0.02;
  const globeTop = p.height * 0.46;
  const globeRadius = Math.min(radius, p.height * 0.24);
  const cableTop = p.height - canopyHeight;
  const cableBottom = globeTop + p.height * 0.08;
  const cableOffset = p.width * (p.variation - 0.5) * 0.05;
  const canopy = merge(
    transform(cylinder(radius * 0.22, canopyHeight, 28), { translate: vec3(0, p.height - canopyHeight * 0.5, 0) }),
    transform(torus(radius * 0.22, radius * 0.025, 28, 6), { translate: vec3(0, p.height - canopyHeight, 0) }),
  );
  const cable = sweep(smoothCurve(polyline([
    vec3(0, cableTop, 0),
    vec3(cableOffset, (cableTop + cableBottom) * 0.5, 0),
    vec3(0, cableBottom, 0),
  ]), 2), { radius: p.width * 0.008, sides: 8, caps: true });
  const glass = lathe([
    vec2(radius * 0.32, globeTop),
    vec2(globeRadius * 0.72, globeTop * 0.9),
    vec2(globeRadius * 0.94, globeTop * 0.75),
    vec2(globeRadius, (globeTop + globeBottom) * 0.52),
    vec2(globeRadius * 0.92, globeTop * 0.3),
    vec2(globeRadius * 0.62, globeBottom * 3.5),
    vec2(globeRadius * 0.26, globeBottom * 1.5),
    vec2(0, globeBottom),
  ], { segments: p.detail > 0 ? 40 : 20 });
  const shade = lathe([
    vec2(radius * 0.22, globeTop + p.height * 0.04),
    vec2(radius * 0.38, globeTop + p.height * 0.025),
    vec2(radius * 0.77, globeTop - p.height * 0.06),
    vec2(radius * 0.93, globeTop - p.height * 0.11),
  ], { segments: p.detail > 0 ? 36 : 18 });
  const socket = merge(
    transform(cylinder(radius * 0.18, p.height * 0.09, 24), { translate: vec3(0, globeTop + p.height * 0.045, 0) }),
    ...Array.from({ length: Math.max(2, Math.round(p.structure * 0.2)) }, (_, index) =>
      transform(torus(radius * 0.185, radius * 0.018, 22, 5), {
        translate: vec3(0, globeTop + p.height * (0.015 + index * 0.014), 0),
      })),
  );
  return [
    part("pendant_canopy", "吊灯吸顶盘与压线边", canopy, DARK_STEEL, "metal", { color: DARK_STEEL, roughness: 0.42 }),
    part("pendant_cable", "吊灯悬挂电缆", cable, [0.025, 0.025, 0.022], "rubber", { color: [0.025, 0.025, 0.022], roughness: 0.78 }),
    part("pendant_shade", "吊灯旋压金属上罩", shade, [0.2, 0.19, 0.17], "metal", { color: [0.2, 0.19, 0.17], roughness: 0.38, wear: p.damage }, true),
    part("pendant_glass", "吊灯球形磨砂玻璃罩", glass, WARM_GLASS, "glass", { color: WARM_GLASS, roughness: 0.24, transmission: 0.72 }, true),
    part("pendant_socket", "吊灯灯座与散热环", socket, GALVANIZED, "metal", { color: GALVANIZED, roughness: 0.4 }),
  ];
}

function buildStandingChalkboard(p: PolyHavenFinalLearningPropParams): PolyHavenFinalLearningMeshPart[] {
  const railWidth = p.width * 0.075;
  const panelWidth = p.width * 0.75;
  const panelHeight = p.height * 0.7;
  const panelY = p.height * 0.57;
  const spread = p.depth * (0.28 + p.variation * 0.22);
  const tube = (from: ReturnType<typeof vec3>, to: ReturnType<typeof vec3>, width = railWidth): Mesh =>
    sweep(polyline([from, to]), { radius: width * 0.5, sides: p.detail > 0 ? 8 : 5, caps: true });
  const frameMeshes: Mesh[] = [];
  for (const side of [-1, 1]) {
    frameMeshes.push(
      tube(vec3(side * p.width * 0.43, 0, spread), vec3(side * p.width * 0.38, p.height * 0.98, 0)),
      tube(vec3(side * p.width * 0.43, 0, -spread), vec3(side * p.width * 0.38, p.height * 0.98, 0)),
    );
  }
  frameMeshes.push(
    transform(box(p.width * 0.82, railWidth, railWidth), { translate: vec3(0, p.height * 0.95, 0) }),
    transform(box(p.width * 0.82, railWidth, railWidth), { translate: vec3(0, p.height * 0.16, spread * 0.62) }),
    transform(box(p.width * 0.82, railWidth, railWidth), { translate: vec3(0, p.height * 0.16, -spread * 0.62) }),
  );
  const panels = merge(
    transform(box(panelWidth, panelHeight, p.depth * 0.025), { translate: vec3(0, panelY, spread * 0.1) }),
    transform(box(panelWidth, panelHeight, p.depth * 0.025), { translate: vec3(0, panelY, -spread * 0.1) }),
  );
  const hinges = merge(
    transform(cylinder(railWidth * 0.72, p.width * 0.84, 18), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(0, p.height * 0.94, 0) }),
    tube(vec3(-p.width * 0.34, p.height * 0.34, -spread * 0.75), vec3(-p.width * 0.34, p.height * 0.34, spread * 0.75), railWidth * 0.22),
    tube(vec3(p.width * 0.34, p.height * 0.34, -spread * 0.75), vec3(p.width * 0.34, p.height * 0.34, spread * 0.75), railWidth * 0.22),
  );
  const glyphs: Record<string, Array<[number, number, number, number]>> = {
    M: [[0, 0, 0, 1], [1, 0, 1, 1], [0, 1, 0.5, 0.48], [0.5, 0.48, 1, 1]],
    E: [[0, 0, 0, 1], [0, 1, 1, 1], [0, 0.5, 0.82, 0.5], [0, 0, 1, 0]],
    N: [[0, 0, 0, 1], [1, 0, 1, 1], [0, 1, 1, 0]],
    U: [[0, 1, 0, 0.15], [1, 1, 1, 0.15], [0, 0.15, 0.22, 0], [0.22, 0, 0.78, 0], [0.78, 0, 1, 0.15]],
  };
  const chalkMeshes: Mesh[] = [];
  const word = "MENU";
  const glyphWidth = panelWidth * 0.14;
  const glyphHeight = panelHeight * 0.17;
  for (let letterIndex = 0; letterIndex < word.length; letterIndex++) {
    const x0 = (letterIndex - (word.length - 1) * 0.5) * glyphWidth * 1.35 - glyphWidth * 0.5;
    const y0 = panelY + panelHeight * 0.14;
    for (const [x1, y1, x2, y2] of glyphs[word[letterIndex]!]!) {
      chalkMeshes.push(tube(
        vec3(x0 + x1 * glyphWidth, y0 + y1 * glyphHeight, spread * 0.1 + p.depth * 0.018),
        vec3(x0 + x2 * glyphWidth, y0 + y2 * glyphHeight, spread * 0.1 + p.depth * 0.018),
        railWidth * 0.055,
      ));
    }
  }
  return [
    part("chalkboard_frame", "立式黑板前后木框与支腿", merge(...frameMeshes), WOOD, "wood", { color: WOOD, roughness: 0.78, wear: p.damage }),
    part("chalkboard_panels", "立式黑板双面书写板", panels, BOARD, "paint", { color: BOARD, roughness: 0.94, wear: p.damage }, true),
    part("chalkboard_hinges", "立式黑板顶部铰链与限位撑杆", hinges, DARK_STEEL, "metal", { color: DARK_STEEL, roughness: 0.58 }),
    part("chalkboard_chalk", "立式黑板程序化粉笔字 MENU", merge(...chalkMeshes), [0.78, 0.76, 0.66], "chalk", { color: [0.78, 0.76, 0.66], roughness: 1 }),
  ];
}

export function buildPolyHavenDisplayPropMeshes(
  kind: PolyHavenDisplayPropKind,
  params: PolyHavenFinalLearningPropParams,
): PolyHavenFinalLearningMeshPart[] {
  switch (kind) {
    case "pendant-lamp": return buildPendantLamp(params);
    case "standing-chalkboard": return buildStandingChalkboard(params);
  }
}
