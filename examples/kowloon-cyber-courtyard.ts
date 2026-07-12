import fs from "node:fs";
import path from "node:path";
import {
  buildKowloonCyberCourtyardParts,
  summarizeKowloonCyberCourtyard,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const outDir = path.resolve("out");
fs.mkdirSync(outDir, { recursive: true });

const parts = buildKowloonCyberCourtyardParts();
const { obj, mtl } = toOBJScene(parts, "kowloon-cyber-courtyard.mtl");
const model = toViewerModel(parts, "kowloon-cyber-courtyard");
const summary = summarizeKowloonCyberCourtyard(parts);

fs.writeFileSync(path.join(outDir, "kowloon-cyber-courtyard.obj"), obj);
fs.writeFileSync(path.join(outDir, "kowloon-cyber-courtyard.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "kowloon-cyber-courtyard.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest = Array.isArray(parsed) ? { models: parsed } : parsed;
    if (!Array.isArray(manifest.models)) manifest.models = [];
  } catch {
    manifest = { models: [] };
  }
}
const entry = { id: "kowloon-cyber-courtyard", name: "九龙城·夜雨赛博天井", file: "kowloon-cyber-courtyard.json" };
manifest.models = [...manifest.models.filter((item) => item.id !== entry.id), entry];
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`九龙城夜雨天井：${summary.parts} 个部件，${summary.triangles} 个三角面，高 ${summary.height.toFixed(2)}`);
console.log("已写入：out/kowloon-cyber-courtyard.{obj,mtl,json} + out/models.json");
