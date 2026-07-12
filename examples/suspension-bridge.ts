import fs from "node:fs";
import path from "node:path";
import { buildSuspensionBridgeParts, toOBJScene, toViewerModel } from "../src/index.js";

const parts = buildSuspensionBridgeParts();
const { obj, mtl } = toOBJScene(parts, "suspension-bridge.mtl");
const model = toViewerModel(parts, "suspension-bridge");
const outDir = path.resolve(process.cwd(), "out");

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "suspension-bridge.obj"), obj);
fs.writeFileSync(path.join(outDir, "suspension-bridge.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "suspension-bridge.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    manifest = { models: [] };
  }
}

const entry = { id: "suspension-bridge", name: "程序化悬索桥", file: "suspension-bridge.json" };
manifest.models = manifest.models.filter((item) => item.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`suspension bridge: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
console.log("written: out/suspension-bridge.{obj,mtl,json} + out/models.json");
