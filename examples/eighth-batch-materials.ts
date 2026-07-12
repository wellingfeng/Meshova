import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  EIGHTH_BATCH_MATERIAL_DEFINITIONS,
  EIGHTH_BATCH_MATERIALS,
  exportRealtimeMaterialBundle,
  type EighthBatchMaterialName,
} from "../src/texture/index.js";

const size = Math.max(16, Number.parseInt(process.argv[2] ?? "256", 10));
const requestedName = process.argv[3] as EighthBatchMaterialName | undefined;
const names = requestedName
  ? [requestedName]
  : Object.keys(EIGHTH_BATCH_MATERIALS) as EighthBatchMaterialName[];
const outputRoot = path.resolve(process.cwd(), "out", "materials", "eighth-batch");

if (requestedName && !EIGHTH_BATCH_MATERIALS[requestedName]) {
  throw new Error(`unknown eighth batch material: ${requestedName}`);
}

for (const name of names) {
  const material = EIGHTH_BATCH_MATERIALS[name](size, {});
  const exported = exportRealtimeMaterialBundle(material, name);
  const directory = path.join(outputRoot, name);
  await mkdir(directory, { recursive: true });
  for (const [filename, bytes] of Object.entries(exported.files)) {
    await writeFile(path.join(directory, filename), bytes);
  }
  console.log(`${EIGHTH_BATCH_MATERIAL_DEFINITIONS[name].label} -> ${directory}`);
}
