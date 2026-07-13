import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  STYLE_CASE_DEFINITIONS,
  STYLE_CASE_MATERIALS,
  exportPBR,
  materialFromFields,
  validateMaterial,
  type StyleCaseName,
} from "../src/index.js";

const size = Number(process.argv[2] ?? 256);
const requestedName = process.argv[3] as StyleCaseName | undefined;
const names = requestedName
  ? [requestedName]
  : Object.keys(STYLE_CASE_MATERIALS) as StyleCaseName[];
const outputRoot = path.resolve(process.cwd(), "out", "materials", "bilibili-style-cases-26");

if (!Number.isInteger(size) || size < 16 || size > 2048) {
  throw new Error("尺寸必须是 16-2048 的整数。");
}
if (requestedName && !STYLE_CASE_MATERIALS[requestedName]) {
  throw new Error(`未知材质：${requestedName}`);
}

for (const name of names) {
  const material = materialFromFields(size, STYLE_CASE_MATERIALS[name]({}));
  const problems = validateMaterial(material);
  if (problems.length > 0) throw new Error(`${name}: ${problems.join("; ")}`);
  const directory = path.join(outputRoot, name);
  mkdirSync(directory, { recursive: true });
  for (const [filename, bytes] of Object.entries(exportPBR(material, name).files)) {
    writeFileSync(path.join(directory, filename), bytes);
  }
  const definition = STYLE_CASE_DEFINITIONS[name];
  console.log(`${String(definition.episode).padStart(2, "0")} ${definition.label} -> ${directory}`);
}

