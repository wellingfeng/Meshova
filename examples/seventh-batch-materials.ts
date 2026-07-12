import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildSeventhBatchMaterialWithLifecycle,
  exportAssetReadyMaterial,
  SEVENTH_BATCH_MATERIAL_DEFINITIONS,
  SEVENTH_BATCH_MATERIALS,
  type SeventhBatchMaterialName,
} from "../src/texture/index.js";

const size = Math.max(16, Number.parseInt(process.argv[2] ?? "256", 10));
const requestedName = process.argv[3] as SeventhBatchMaterialName | undefined;
const names = requestedName
  ? [requestedName]
  : Object.keys(SEVENTH_BATCH_MATERIALS) as SeventhBatchMaterialName[];
const outputRoot = path.resolve(process.cwd(), "out", "materials", "seventh-batch");

if (requestedName && !SEVENTH_BATCH_MATERIALS[requestedName]) {
  throw new Error(`unknown seventh batch material: ${requestedName}`);
}

for (const name of names) {
  const { material, lifecycle } = buildSeventhBatchMaterialWithLifecycle(name, size, {});
  const exported = exportAssetReadyMaterial(material, name, lifecycle);
  const directory = path.join(outputRoot, name);
  await mkdir(directory, { recursive: true });
  for (const [filename, bytes] of Object.entries(exported.files)) {
    await writeFile(path.join(directory, filename), bytes);
  }
  console.log(`${SEVENTH_BATCH_MATERIAL_DEFINITIONS[name].label} -> ${directory}`);
}
