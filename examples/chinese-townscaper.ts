import {
  buildChineseTownscaperScene,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const scene = buildChineseTownscaperScene();
const { obj, mtl } = toOBJScene(scene.parts, "chinese-townscaper.mtl");
const model = toViewerModel(scene.parts, "chinese-townscaper");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "chinese-townscaper.obj"), obj);
fs.writeFileSync(path.join(outDir, "chinese-townscaper.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "chinese-townscaper.json"), JSON.stringify(model));

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
  id: "chinese-townscaper",
  name: "中式城镇叠叠乐·重檐岛",
  file: "chinese-townscaper.json",
  category: "meshova",
};
const index = manifest.models.findIndex((item) => item && item.id === entry.id);
if (index >= 0) manifest.models[index] = { ...manifest.models[index], ...entry };
else manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log(
  `chinese townscaper: ${scene.summary.moduleCount} modules, ${scene.summary.doubleEaveCount} double-eave halls, ${scene.summary.bridgeCount} bridges`,
);
console.log("written: out/chinese-townscaper.{obj,mtl,json} + out/models.json");
