import fs from "node:fs";
import path from "node:path";
import {
  BLEND_REFERENCE_PLANTS,
  buildBlendReferencePlantParts,
} from "../src/models/blend-reference-plants.js";
import { toOBJScene, toViewerModel } from "../src/geometry/export.js";

const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });

for (const definition of BLEND_REFERENCE_PLANTS) {
  const parts = buildBlendReferencePlantParts({ kind: definition.defaults.kind });
  const { obj, mtl } = toOBJScene(parts, `${definition.id}.mtl`);
  const model = toViewerModel(parts, definition.id);
  fs.writeFileSync(path.join(outDir, `${definition.id}.obj`), obj);
  fs.writeFileSync(path.join(outDir, `${definition.id}.mtl`), mtl);
  fs.writeFileSync(path.join(outDir, `${definition.id}.json`), JSON.stringify(model));
  console.log(`${definition.name}: ${model.meta.parts} parts, ${model.meta.tris} tris`);
}

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const ids = new Set(BLEND_REFERENCE_PLANTS.map((entry) => entry.id));
manifest.models = manifest.models.filter((model) => !ids.has(model.id));
manifest.models.push(...BLEND_REFERENCE_PLANTS.map((entry) => ({ id: entry.id, name: entry.name, file: `${entry.id}.json` })));
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
