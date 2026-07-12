import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  URBAN_MATERIAL_DEFINITIONS,
  URBAN_MATERIALS,
  bakeProductionMaterial,
  exportPBR,
  validateMaterial,
  type UrbanMaterialName,
} from "../src/index.js";

const size = Number(process.argv[2] ?? 512);
const requestedName = process.argv[3] as UrbanMaterialName | undefined;
const names = requestedName
  ? [requestedName]
  : Object.keys(URBAN_MATERIALS) as UrbanMaterialName[];
const outputRoot = path.resolve(process.cwd(), "out", "materials", "bilibili-urban-5");

if (!Number.isInteger(size) || size < 16 || size > 2048) {
  throw new Error("尺寸必须是 16–2048 的整数。");
}
if (requestedName && !URBAN_MATERIALS[requestedName]) {
  throw new Error(`未知材质：${requestedName}`);
}

for (const name of names) {
  const bake = bakeProductionMaterial(name, size);
  const material = bake.material;
  const problems = validateMaterial(material);
  if (problems.length > 0) throw new Error(`${name}: ${problems.join("; ")}`);
  const directory = path.join(outputRoot, name);
  mkdirSync(directory, { recursive: true });
  for (const [filename, bytes] of Object.entries(exportPBR(material, name).files)) {
    writeFileSync(path.join(directory, filename), bytes);
  }
  console.log(`${URBAN_MATERIAL_DEFINITIONS[name].label} -> ${directory} (${bake.mipmaps.height.length} Mip)`);
}
