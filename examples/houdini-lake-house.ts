/**
 * Houdini lake-house reconstruction.
 *
 * Run: pnpm lake-house
 */
import fs from "node:fs";
import path from "node:path";
import {
  buildHoudiniLakeHouseParts,
  HOUDINI_LAKE_HOUSE_DEFAULTS,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const id = "houdini-lake-house";
const parts = buildHoudiniLakeHouseParts(HOUDINI_LAKE_HOUSE_DEFAULTS);
const model = toViewerModel(parts, id);
const { obj, mtl } = toOBJScene(parts, `${id}.mtl`);
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `${id}.obj`), obj);
fs.writeFileSync(path.join(outDir, `${id}.mtl`), mtl);
fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(model, null, 2));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string; category?: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id, name: "Houdini 湖边小屋", file: `${id}.json`, category: "建筑" };
manifest.models = manifest.models.filter((item) => item.id !== id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`${id}: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
console.log(`written: out/${id}.{obj,mtl,json} + out/models.json`);
