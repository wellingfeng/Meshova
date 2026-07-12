import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  exportPBR,
  textureToPNG,
  trimSheetPipelineResult,
  validateMaterial,
} from "../src/index.js";

const size = Number(process.argv[2] ?? 512);
if (!Number.isInteger(size) || size < 16 || size > 2048) {
  throw new Error("尺寸必须是 16–2048 的整数。");
}

const result = trimSheetPipelineResult(size);
const problems = validateMaterial(result.material);
if (problems.length > 0) throw new Error(problems.join("; "));

const outputDirectory = path.resolve(process.cwd(), "out", "materials", "trim-sheet-pipeline");
mkdirSync(outputDirectory, { recursive: true });
for (const [filename, bytes] of Object.entries(exportPBR(result.material, "trim-sheet").files)) {
  writeFileSync(path.join(outputDirectory, filename), bytes);
}
for (const [name, mask] of Object.entries(result.masks)) {
  writeFileSync(path.join(outputDirectory, `trim-sheet_mask-${name}.png`), textureToPNG(mask));
}
for (const [name, mask] of Object.entries(result.regionMasks)) {
  writeFileSync(path.join(outputDirectory, `trim-sheet_region-${name}.png`), textureToPNG(mask));
}
for (const [name, mask] of Object.entries(result.weatherMasks)) {
  writeFileSync(path.join(outputDirectory, `trim-sheet_weather-${name}.png`), textureToPNG(mask));
}
writeFileSync(
  path.join(outputDirectory, "trim-sheet-bands.json"),
  JSON.stringify(result.bands, null, 2),
);

console.log(`烘焙 Trim Sheet：${size}x${size}，7 张 PBR + 5 张核心遮罩 + ${result.bands.length} 张区域遮罩 + 5 张天气遮罩 -> ${outputDirectory}`);
