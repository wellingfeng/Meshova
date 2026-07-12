import fs from "node:fs";
import path from "node:path";
import {
  buildHongKongCyberHouseParts,
  summarizeHongKongCyberHouse,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const outDir = path.resolve("out");
fs.mkdirSync(outDir, { recursive: true });

const parts = buildHongKongCyberHouseParts();
const { obj, mtl } = toOBJScene(parts, "hong-kong-cyber-house.mtl");
const model = toViewerModel(parts, "hong-kong-cyber-house");
const summary = summarizeHongKongCyberHouse(parts);

fs.writeFileSync(path.join(outDir, "hong-kong-cyber-house.obj"), obj);
fs.writeFileSync(path.join(outDir, "hong-kong-cyber-house.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "hong-kong-cyber-house.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    manifest = { models: [] };
  }
}
const entry = { id: "hong-kong-cyber-house", name: "香港赛博街屋", file: "hong-kong-cyber-house.json" };
manifest.models = [...manifest.models.filter((item) => item.id !== entry.id), entry];
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`香港赛博街屋：${summary.parts} 个部件，${summary.triangles} 个三角面，高 ${summary.height.toFixed(2)}`);
console.log("已写入：out/hong-kong-cyber-house.{obj,mtl,json} + out/models.json");
