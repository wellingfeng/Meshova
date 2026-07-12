import fs from "node:fs";
import path from "node:path";
import {
  buildLunarCraterSurfaceParts,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const id = "lunar-crater-surface";
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });

const parts = buildLunarCraterSurfaceParts();
const { obj, mtl } = toOBJScene(parts, `${id}.mtl`);
const viewerModel = toViewerModel(parts, id);

fs.writeFileSync(path.join(outDir, `${id}.obj`), obj);
fs.writeFileSync(path.join(outDir, `${id}.mtl`), mtl);
fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(viewerModel));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string; category?: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    manifest = { models: [] };
  }
}
manifest.models = manifest.models.filter((model) => model.id !== id);
manifest.models.push({ id, name: "月球陨石坑表面", file: `${id}.json`, category: "地形" });
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`${id}: ${viewerModel.meta.verts} verts, ${viewerModel.meta.tris} tris`);
