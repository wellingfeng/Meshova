import {
  buildStylizedOceanEnvironmentParts,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
const id = "stylized-ocean-environment";
const name = "风格化广阔海洋环境";
fs.mkdirSync(outDir, { recursive: true });

const parts = buildStylizedOceanEnvironmentParts();
const { obj, mtl } = toOBJScene(parts, `${id}.mtl`);
const viewerModel = toViewerModel(parts, id);
fs.writeFileSync(path.join(outDir, `${id}.obj`), obj);
fs.writeFileSync(path.join(outDir, `${id}.mtl`), mtl);
fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(viewerModel, null, 2));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string; category?: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    manifest = { models: [] };
  }
}
manifest.models = manifest.models.filter((entry) => entry.id !== id);
manifest.models.push({ id, name, file: `${id}.json`, category: "地形与环境" });
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`written: out/${id}.{obj,mtl,json} + out/models.json`);
console.log("interactive: http://localhost:5173/web/stylized-ocean.html");
