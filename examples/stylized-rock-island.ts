import fs from "node:fs";
import path from "node:path";
import {
  buildStylizedRockIslandParts,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const id = "stylized-rock-island";
const parts = buildStylizedRockIslandParts();
const model = toViewerModel(parts, id);
const { obj, mtl } = toOBJScene(parts, `${id}.mtl`);
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(model));
fs.writeFileSync(path.join(outDir, `${id}.obj`), obj);
fs.writeFileSync(path.join(outDir, `${id}.mtl`), mtl);

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    manifest = { models: [] };
  }
}
manifest.models = manifest.models.filter((entry) => entry.id !== id);
manifest.models.push({ id, name: "风格化浮岛岩", file: `${id}.json` });
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`${id}: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
