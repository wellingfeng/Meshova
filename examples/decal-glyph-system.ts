import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  decalGlyphSystemResult,
  exportPBR,
  textureToPNG,
  validateMaterial,
} from "../src/index.js";

const size = Number(process.argv[2] ?? 512);
if (!Number.isInteger(size) || size < 16 || size > 2048) {
  throw new Error("尺寸必须是 16–2048 的整数。");
}

const result = decalGlyphSystemResult(size);
const problems = validateMaterial(result.material);
if (problems.length > 0) throw new Error(problems.join("; "));

const outputDirectory = path.resolve(process.cwd(), "out", "materials", "decal-glyph-system");
mkdirSync(outputDirectory, { recursive: true });
for (const [filename, bytes] of Object.entries(exportPBR(result.material, "decal-glyph").files)) {
  writeFileSync(path.join(outputDirectory, filename), bytes);
}
for (const [name, mask] of Object.entries(result.masks)) {
  writeFileSync(path.join(outputDirectory, `decal-glyph_mask-${name}.png`), textureToPNG(mask));
}
for (const [name, mask] of Object.entries(result.layerMasks)) {
  writeFileSync(path.join(outputDirectory, `decal-glyph_layer-${name}.png`), textureToPNG(mask));
}
writeFileSync(
  path.join(outputDirectory, "decal-glyph-layers.json"),
  JSON.stringify(result.layers, null, 2),
);

console.log(`烘焙贴花字形系统：${size}x${size}，7 张 PBR + 9 张核心遮罩 + ${result.layers.length} 张语义层遮罩 -> ${outputDirectory}`);
