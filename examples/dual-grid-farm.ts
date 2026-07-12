import {
  buildDualGridFarm,
  merge,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const farm = buildDualGridFarm();
const { obj, mtl } = toOBJScene(farm.parts, "dual-grid-farm.mtl");
const model = toViewerModel(farm.parts, "dual-grid-farm");
const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "dual-grid-farm.obj"), obj);
fs.writeFileSync(path.join(outDir, "dual-grid-farm.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "dual-grid-farm.json"), JSON.stringify(model));

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
const entry = {
  id: "dual-grid-farm",
  name: "双网格农场",
  file: "dual-grid-farm.json",
  category: "meshova",
};
const at = manifest.models.findIndex((candidate) => candidate && candidate.id === entry.id);
if (at >= 0) manifest.models[at] = { ...manifest.models[at], ...entry, updatedAt: now };
else manifest.models.push({ ...entry, createdAt: now, updatedAt: now });
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

const merged = merge(...farm.parts.map((part) => part.mesh));
console.log(`dual grid farm: ${farm.summary.dualCells} cells, ${farm.summary.grassTransitions} grass transitions, ${farm.summary.pavingTransitions} paving transitions`);
console.log(`scene: ${farm.summary.crops} crops, ${farm.summary.trees} trees, ${merged.positions.length} verts`);
console.log("written: out/dual-grid-farm.{obj,mtl,json} + out/models.json");
