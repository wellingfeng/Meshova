import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  FOURTH_BATCH_MATERIAL_DEFINITIONS,
  FOURTH_BATCH_MATERIALS,
  exportLayeredPBR,
  validateLayeredMaterial,
  type FourthBatchMaterialName,
} from "../src/index.js";

const size = Number(process.argv[2] ?? 256);
const requestedName = process.argv[3] as FourthBatchMaterialName | undefined;
const names = requestedName
  ? [requestedName]
  : Object.keys(FOURTH_BATCH_MATERIALS) as FourthBatchMaterialName[];
const outputRoot = path.resolve(process.cwd(), "out", "materials", "fourth-batch");

if (!Number.isInteger(size) || size < 16 || size > 2048) {
  throw new Error("尺寸必须是 16–2048 的整数。");
}
if (requestedName && !FOURTH_BATCH_MATERIALS[requestedName]) {
  throw new Error(`未知材质：${requestedName}`);
}

for (const name of names) {
  const material = FOURTH_BATCH_MATERIALS[name](size, {});
  const problems = validateLayeredMaterial(material);
  if (problems.length > 0) throw new Error(`${name}: ${problems.join("; ")}`);
  const directory = path.join(outputRoot, name);
  mkdirSync(directory, { recursive: true });
  for (const [filename, bytes] of Object.entries(exportLayeredPBR(material, name).files)) {
    writeFileSync(path.join(directory, filename), bytes);
  }
  console.log(`${FOURTH_BATCH_MATERIAL_DEFINITIONS[name].label} -> ${directory}`);
}
