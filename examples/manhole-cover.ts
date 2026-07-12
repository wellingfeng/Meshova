import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  exportPBR,
  manholeCover,
  materialFromFields,
  validateMaterial,
} from "../src/index.js";

const size = Number(process.argv[2] ?? 512);
if (!Number.isInteger(size) || size < 16 || size > 2048) {
  throw new Error("尺寸必须是 16–2048 的整数。");
}

const material = materialFromFields(size, manholeCover({ seed: 43 }));
const problems = validateMaterial(material);
if (problems.length > 0) throw new Error(problems.join("; "));

const outputDirectory = path.resolve(process.cwd(), "out", "materials", "manhole-cover");
mkdirSync(outputDirectory, { recursive: true });
for (const [filename, bytes] of Object.entries(exportPBR(material, "manhole-cover").files)) {
  writeFileSync(path.join(outputDirectory, filename), bytes);
}
console.log(`参数化井盖：${size}x${size} -> ${outputDirectory}`);
