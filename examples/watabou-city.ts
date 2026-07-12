import {
  buildWatabouCity,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const city = buildWatabouCity();
const { obj, mtl } = toOBJScene(city.parts, "watabou-city.mtl");
const model = toViewerModel(city.parts, "watabou-city");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "watabou-city.obj"), obj);
fs.writeFileSync(path.join(outDir, "watabou-city.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "watabou-city.json"), JSON.stringify(model));

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
  id: "watabou-city",
  name: "Watabou 河谷城市复刻",
  file: "watabou-city.json",
  category: "meshova",
};
const index = manifest.models.findIndex((item) => item && item.id === entry.id);
if (index >= 0) manifest.models[index] = { ...manifest.models[index], ...entry };
else manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log(
  `watabou city: ${city.summary.roadCount} roads, ${city.summary.fieldCount} fields, ${city.summary.treeCount} trees, ${city.summary.buildingCount} buildings`,
);
console.log("written: out/watabou-city.{obj,mtl,json} + out/models.json");
