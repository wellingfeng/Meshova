import {
  buildStylizedTacticalIslandParts,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
const id = "stylized-tactical-island";
const parts = buildStylizedTacticalIslandParts();

fs.mkdirSync(outDir, { recursive: true });
const { obj, mtl } = toOBJScene(parts, `${id}.mtl`);
fs.writeFileSync(path.join(outDir, `${id}.obj`), obj);
fs.writeFileSync(path.join(outDir, `${id}.mtl`), mtl);
fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(toViewerModel(parts, id)));

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
const now = new Date().toISOString();
const entry = { id, name: "风格化战术悬浮岛", file: `${id}.json`, category: "meshova" };
const index = manifest.models.findIndex((candidate) => candidate?.id === id);
if (index >= 0) manifest.models[index] = { ...manifest.models[index], ...entry, updatedAt: now };
else manifest.models.push({ ...entry, createdAt: now, updatedAt: now });
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log(`written: out/${id}.{obj,mtl,json}`);
