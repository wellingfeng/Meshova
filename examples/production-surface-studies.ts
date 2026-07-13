import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  PRODUCTION_STUDY_DEFINITIONS,
  PRODUCTION_STUDY_MATERIALS,
  exportPBR,
  materialFromFields,
  validateMaterial,
  type ProductionStudyName,
} from "../src/index.js";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const size = Number(args[0] ?? 256);
const requestedName = args[1] as ProductionStudyName | undefined;
const names = requestedName
  ? [requestedName]
  : Object.keys(PRODUCTION_STUDY_MATERIALS) as ProductionStudyName[];
const outputRoot = path.resolve(process.cwd(), "out", "materials", "production-surface-studies");

if (!Number.isInteger(size) || size < 16 || size > 2048) {
  throw new Error("尺寸必须是 16-2048 的整数。");
}
if (requestedName && !PRODUCTION_STUDY_MATERIALS[requestedName]) {
  throw new Error(`未知材质：${requestedName}`);
}

for (const name of names) {
  const material = materialFromFields(size, PRODUCTION_STUDY_MATERIALS[name]({}));
  const problems = validateMaterial(material);
  if (problems.length > 0) throw new Error(`${name}: ${problems.join("; ")}`);
  const directory = path.join(outputRoot, name);
  mkdirSync(directory, { recursive: true });
  for (const [filename, bytes] of Object.entries(exportPBR(material, name).files)) {
    writeFileSync(path.join(directory, filename), bytes);
  }
  console.log(`${PRODUCTION_STUDY_DEFINITIONS[name].label} -> ${directory}`);
}
