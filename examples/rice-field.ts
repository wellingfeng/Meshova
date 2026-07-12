import fs from "node:fs";
import path from "node:path";
import {
  buildRiceField,
  merge,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const field = buildRiceField();
const { obj, mtl } = toOBJScene(field.parts, "rice-field.mtl");
const model = toViewerModel(field.parts, "rice-field");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "rice-field.obj"), obj);
fs.writeFileSync(path.join(outDir, "rice-field.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "rice-field.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<Record<string, unknown>> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    manifest = { models: [] };
  }
}
if (!Array.isArray(manifest.models)) manifest.models = [];
const entry = { id: "rice-field", name: "程序化稻田", file: "rice-field.json", category: "植被" };
const index = manifest.models.findIndex((candidate) => candidate?.id === entry.id);
if (index >= 0) manifest.models[index] = { ...manifest.models[index], ...entry };
else manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

const merged = merge(...field.parts.map((part) => part.mesh));
console.log(`rice field: ${field.summary.plots} plots, ${field.summary.riceClumps} clumps, ${field.summary.palms} palms`);
console.log(`scene: ${merged.positions.length} verts, ${merged.indices.length / 3} tris`);
console.log("written: out/rice-field.{obj,mtl,json} + out/models.json");
