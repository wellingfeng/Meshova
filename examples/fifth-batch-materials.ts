import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  FIFTH_BATCH_MATERIAL_DEFINITIONS,
  FIFTH_BATCH_MATERIALS,
  exportOpenPBRMaterial,
  validateLayeredMaterial,
  type FifthBatchMaterialName,
} from "../src/index.js";

const size = Number(process.argv[2] ?? 256);
const requestedName = process.argv[3] as FifthBatchMaterialName | undefined;
const names = requestedName
  ? [requestedName]
  : Object.keys(FIFTH_BATCH_MATERIALS) as FifthBatchMaterialName[];
const outputRoot = path.resolve(process.cwd(), "out", "materials", "fifth-batch");

if (!Number.isInteger(size) || size < 16 || size > 2048) {
  throw new Error("尺寸必须是 16-2048 的整数。");
}
if (requestedName && !FIFTH_BATCH_MATERIALS[requestedName]) {
  throw new Error(`未知材质：${requestedName}`);
}

for (const name of names) {
  const material = FIFTH_BATCH_MATERIALS[name](size, {});
  const problems = validateLayeredMaterial(material);
  if (problems.length > 0) throw new Error(`${name}: ${problems.join("; ")}`);
  const directory = path.join(outputRoot, name);
  mkdirSync(directory, { recursive: true });
  for (const [filename, bytes] of Object.entries(exportOpenPBRMaterial(material, name).files)) {
    writeFileSync(path.join(directory, filename), bytes);
  }
  console.log(`${FIFTH_BATCH_MATERIAL_DEFINITIONS[name].label} -> ${directory}`);
}
