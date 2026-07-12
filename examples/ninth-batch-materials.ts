import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  NINTH_BATCH_MATERIAL_DEFINITIONS,
  NINTH_BATCH_MATERIALS,
  exportNinthBatchMaterialBundle,
  type NinthBatchMaterialName,
} from "../src/texture/index.js";

const size = Math.max(16, Number.parseInt(process.argv[2] ?? "256", 10));
const requestedName = process.argv[3] as NinthBatchMaterialName | undefined;
const names = requestedName
  ? [requestedName]
  : Object.keys(NINTH_BATCH_MATERIALS) as NinthBatchMaterialName[];
const outputRoot = path.resolve(process.cwd(), "out", "materials", "ninth-batch");

if (requestedName && !NINTH_BATCH_MATERIALS[requestedName]) {
  throw new Error(`unknown ninth batch material: ${requestedName}`);
}

for (const name of names) {
  const material = NINTH_BATCH_MATERIALS[name](size, {});
  const exported = exportNinthBatchMaterialBundle(material, name);
  const directory = path.join(outputRoot, name);
  await mkdir(directory, { recursive: true });
  for (const [filename, bytes] of Object.entries(exported.files)) {
    await writeFile(path.join(directory, filename), bytes);
  }
  console.log(`${NINTH_BATCH_MATERIAL_DEFINITIONS[name].label} -> ${directory}`);
}
