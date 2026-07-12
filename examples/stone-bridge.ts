/**
 * Bilibili BV15LZhBdE8u stone arch bridge reproduction.
 *
 * Run: pnpm stone-bridge
 */
import fs from "node:fs";
import path from "node:path";
import {
  buildStoneArchBridgeParts,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const parts = buildStoneArchBridgeParts();
const { obj, mtl } = toOBJScene(parts, "stone-bridge.mtl");
const model = toViewerModel(parts, "stone-bridge");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "stone-bridge.obj"), obj);
fs.writeFileSync(path.join(outDir, "stone-bridge.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "stone-bridge.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    manifest = { models: [] };
  }
}
const entry = {
  id: "stone-bridge",
  name: "七跨石拱桥",
  file: "stone-bridge.json",
  category: "建筑",
};
manifest.models = manifest.models.filter((item) => item.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`stone bridge: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
