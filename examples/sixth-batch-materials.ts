import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  SIXTH_BATCH_MATERIAL_DEFINITIONS,
  SIXTH_BATCH_MATERIALS,
  exportOpenPBRMaterial,
  extractReferenceFeatures,
  validateLayeredMaterial,
} from "../src/index.js";

const size = Math.max(16, Number(process.argv[2] ?? 512));
const requestedName = process.argv[3];
const names = requestedName ? [requestedName] : Object.keys(SIXTH_BATCH_MATERIALS);
const outputRoot = path.resolve(process.cwd(), "out", "materials", "sixth-batch");

if (requestedName && !SIXTH_BATCH_MATERIALS[requestedName as keyof typeof SIXTH_BATCH_MATERIALS]) {
  throw new Error(`未知第六批材质: ${requestedName}`);
}

for (const name of names as Array<keyof typeof SIXTH_BATCH_MATERIALS>) {
  const material = SIXTH_BATCH_MATERIALS[name](size, {});
  const problems = validateLayeredMaterial(material);
  if (problems.length) throw new Error(`${name}: ${problems.join("; ")}`);
  const directory = path.join(outputRoot, name);
  await mkdir(directory, { recursive: true });
  const exported = exportOpenPBRMaterial(material, name);
  for (const [filename, bytes] of Object.entries(exported.files)) {
    await writeFile(path.join(directory, filename), bytes);
  }
  const report = {
    material: name,
    label: SIXTH_BATCH_MATERIAL_DEFINITIONS[name].label,
    focus: SIXTH_BATCH_MATERIAL_DEFINITIONS[name].focus,
    size,
    features: extractReferenceFeatures(material.height),
    validation: problems,
  };
  await writeFile(path.join(directory, `${name}_replication-report.json`), JSON.stringify(report, null, 2));
  console.log(`${SIXTH_BATCH_MATERIAL_DEFINITIONS[name].label} -> ${directory}`);
}
