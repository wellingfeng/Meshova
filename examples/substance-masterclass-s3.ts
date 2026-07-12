import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  bakeOrganicCellScales,
  bakeSciFiHullHeightSystem,
  bakeSciFiHullMaterialSystem,
  bakeStylizedCellRock,
  exportPBR,
  heightLayerStack,
  materialFromFields,
  pathStroke,
  radialArray,
  semanticMaskPack,
  type Material,
  type TextureBuffer,
  textureToPNG,
  validateMaterial,
} from "../src/index.js";

const size = Number(process.argv[2] ?? 512);
if (!Number.isInteger(size) || size < 16 || size > 2048) {
  throw new Error("尺寸必须是 16–2048 的整数。");
}

function writeBake(
  name: string,
  result: { material: Material; masks: Readonly<Record<string, TextureBuffer>> },
): string {
  const output = path.resolve(process.cwd(), "out", "materials", "substance-masterclass-s3", name);
  const problems = validateMaterial(result.material);
  if (problems.length > 0) throw new Error(`${name}: ${problems.join("; ")}`);
  mkdirSync(output, { recursive: true });
  for (const [filename, bytes] of Object.entries(exportPBR(result.material, name).files)) {
    writeFileSync(path.join(output, filename), bytes);
  }
  for (const [maskName, mask] of Object.entries(result.masks)) {
    writeFileSync(path.join(output, `${name}_mask-${maskName}.png`), textureToPNG(mask));
  }
  return output;
}

const rockOutput = writeBake("stylized-cell-rock", bakeStylizedCellRock(size));
const scalesOutput = writeBake("organic-cell-scales", bakeOrganicCellScales(size));
const hullOutput = writeBake("sci-fi-hull-height", bakeSciFiHullHeightSystem(size));
const hullMaterialOutput = writeBake("sci-fi-hull-material", bakeSciFiHullMaterialSystem(size));
const turbine = radialArray({
  count: 12,
  innerRadius: 0.16,
  outerRadius: 0.42,
  gap: 0.22,
  rotation: Math.PI / 12,
  element: (x, y) => Math.hypot(x * 0.68, y) <= 1 ? 1 : 0,
});
const pipe = pathStroke([
  { u: 0.08, v: 0.18, width: 0.018 },
  { u: 0.34, v: 0.18, width: 0.028 },
  { u: 0.34, v: 0.46, width: 0.028 },
], {
  height: 0.12,
  branches: [{ points: [[0.34, 0.32], [0.66, 0.32], [0.74, 0.42]] }],
});
const heightStack = heightLayerStack(0.28, [
  { name: "turbine", mask: turbine.mask, height: 0.2, mode: "raise" },
  { name: "pipe", mask: pipe.mask, height: pipe.height, mode: "raise", priority: 10 },
]);
const grammarMasks = semanticMaskPack({
  panels: turbine.mask,
  fasteners: turbine.segmentId,
  pipes: pipe.mask,
  materialId: (u, v) => Math.max(turbine.segmentId(u, v), pipe.pathId(u, v)),
  occupancy: (u, v) => Math.max(turbine.mask(u, v), pipe.mask(u, v)),
  pathProgress: pipe.progress,
});
const grammarMaterial = materialFromFields(size, {
  baseColor: (u, v) => {
    const fan = turbine.mask(u, v);
    const cable = pipe.mask(u, v);
    return [0.075 + fan * 0.2, 0.09 + fan * 0.22, 0.11 + fan * 0.24 + cable * 0.08];
  },
  metallic: () => 0.92,
  roughness: (u, v) => 0.28 + pipe.mask(u, v) * 0.18,
  ao: () => 1,
  height: heightStack.height,
  emission: () => [0, 0, 0],
  normalStrength: 6,
});
const grammarOutput = writeBake("shape-grammar", {
  material: grammarMaterial,
  masks: grammarMasks.bake(size, size),
});
console.log(`风格化细胞苔藓岩石 -> ${rockOutput}`);
console.log(`有机细胞鳞片 -> ${scalesOutput}`);
console.log(`共用形状语法 -> ${grammarOutput}`);
console.log(`科幻船壳高度系统 -> ${hullOutput}`);
console.log(`科幻船壳智能材质 -> ${hullMaterialOutput}`);
