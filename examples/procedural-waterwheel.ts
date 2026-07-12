/**
 * Procedural waterwheel study. Emits OBJ + viewer JSON and registers the model.
 *
 * Run: pnpm waterwheel
 */
import fs from "node:fs";
import path from "node:path";
import {
  buildProceduralWaterwheelParts,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const id = "procedural-waterwheel";
const name = "程序化水车";
const parts = buildProceduralWaterwheelParts();
const { obj, mtl } = toOBJScene(parts, `${id}.mtl`);
const model = toViewerModel(parts, id);
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `${id}.obj`), obj);
fs.writeFileSync(path.join(outDir, `${id}.mtl`), mtl);
fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(model, null, 2));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
manifest.models = manifest.models.filter((entry) => entry.id !== id);
manifest.models.push({ id, name, file: `${id}.json` });
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`${id}: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
