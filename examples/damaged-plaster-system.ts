import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  damagedPlasterSystemResult,
  exportPBR,
  textureToPNG,
  validateMaterial,
} from "../src/index.js";

const size = Number(process.argv[2] ?? 512);
if (!Number.isInteger(size) || size < 16 || size > 2048) {
  throw new Error("尺寸必须是 16–2048 的整数。");
}

const result = damagedPlasterSystemResult(size);
const problems = validateMaterial(result.material);
if (problems.length > 0) throw new Error(problems.join("; "));

const outputDirectory = path.resolve(process.cwd(), "out", "materials", "damaged-plaster-system");
mkdirSync(outputDirectory, { recursive: true });
for (const [filename, bytes] of Object.entries(exportPBR(result.material, "damaged-plaster").files)) {
  writeFileSync(path.join(outputDirectory, filename), bytes);
}
for (const [name, mask] of Object.entries(result.masks)) {
  writeFileSync(path.join(outputDirectory, `damaged-plaster_mask-${name}.png`), textureToPNG(mask));
}

console.log(`烘焙破损灰泥系统：${size}x${size}，7 张 PBR + ${Object.keys(result.masks).length} 张遮罩 -> ${outputDirectory}`);
