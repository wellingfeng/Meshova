import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  exportPBR,
  facadeMaterialPipelineResult,
  textureToPNG,
  validateMaterial,
} from "../src/index.js";

const size = Number(process.argv[2] ?? 512);
if (!Number.isInteger(size) || size < 16 || size > 2048) {
  throw new Error("尺寸必须是 16–2048 的整数。");
}

const result = facadeMaterialPipelineResult(size);
const problems = validateMaterial(result.material);
if (problems.length > 0) throw new Error(problems.join("; "));

const outputDirectory = path.resolve(process.cwd(), "out", "materials", "facade-material-pipeline");
mkdirSync(outputDirectory, { recursive: true });
for (const [filename, bytes] of Object.entries(exportPBR(result.material, "facade").files)) {
  writeFileSync(path.join(outputDirectory, filename), bytes);
}
for (const [name, mask] of Object.entries(result.masks)) {
  writeFileSync(path.join(outputDirectory, `facade_semantic-${name}.png`), textureToPNG(mask));
}
for (const [name, mask] of Object.entries(result.weatherMasks)) {
  writeFileSync(path.join(outputDirectory, `facade_weather-${name}.png`), textureToPNG(mask));
}

console.log(`烘焙建筑立面：${size}x${size}，7 张 PBR + 10 张语义遮罩 + 5 张天气遮罩 -> ${outputDirectory}`);
