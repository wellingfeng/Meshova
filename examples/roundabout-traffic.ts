import fs from "node:fs";
import path from "node:path";
import {
  buildRoundaboutTrafficParts,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const parts = buildRoundaboutTrafficParts();
const { obj, mtl } = toOBJScene(parts, "roundabout-traffic.mtl");
const model = toViewerModel(parts, "roundabout-traffic");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "roundabout-traffic.obj"), obj);
fs.writeFileSync(path.join(outDir, "roundabout-traffic.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "roundabout-traffic.json"), JSON.stringify(model));

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
const entry = {
  id: "roundabout-traffic",
  name: "参考图复刻·六臂交通环岛",
  file: "roundabout-traffic.json",
  category: "meshova",
};
manifest.models = manifest.models.filter((item) => item.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log(`roundabout-traffic: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
console.log("written: out/roundabout-traffic.{obj,mtl,json} + out/models.json");
