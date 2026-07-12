import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  ADVANCED_MATERIAL_DEFINITIONS,
  ADVANCED_MATERIALS,
  exportPBR,
  validateMaterial,
  type AdvancedMaterialName,
} from "../src/index.js";

const size = Number(process.argv[2] ?? 256);
const requestedName = process.argv[3] as AdvancedMaterialName | undefined;
const names = requestedName
  ? [requestedName]
  : Object.keys(ADVANCED_MATERIALS) as AdvancedMaterialName[];
const outputRoot = path.resolve(process.cwd(), "out", "materials", "advanced-second-batch");

if (!Number.isInteger(size) || size < 16 || size > 2048) {
  throw new Error("尺寸必须是 16–2048 的整数。");
}
if (requestedName && !ADVANCED_MATERIALS[requestedName]) {
  throw new Error(`未知材质：${requestedName}`);
}

for (const name of names) {
  const material = ADVANCED_MATERIALS[name](size, {});
  const problems = validateMaterial(material);
  if (problems.length > 0) throw new Error(`${name}: ${problems.join("; ")}`);
  const directory = path.join(outputRoot, name);
  mkdirSync(directory, { recursive: true });
  for (const [filename, bytes] of Object.entries(exportPBR(material, name).files)) {
    writeFileSync(path.join(directory, filename), bytes);
  }
  console.log(`${ADVANCED_MATERIAL_DEFINITIONS[name].label} -> ${directory}`);
}
