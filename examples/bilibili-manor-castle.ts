import fs from "node:fs";
import path from "node:path";
import {
  buildBilibiliManorCastleParts,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const id = "bilibili-manor-castle";
const name = "水围庄园城堡";
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });

const parts = buildBilibiliManorCastleParts();
const { obj, mtl } = toOBJScene(parts, `${id}.mtl`);
fs.writeFileSync(path.join(outDir, `${id}.obj`), obj);
fs.writeFileSync(path.join(outDir, `${id}.mtl`), mtl);
fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(toViewerModel(parts, id), null, 2));

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

const now = new Date().toISOString();
const entry = { id, name, file: `${id}.json`, category: "程序化城堡" };
const index = manifest.models.findIndex((candidate) => candidate?.id === id);
if (index >= 0) manifest.models[index] = { ...manifest.models[index], ...entry, updatedAt: now };
else manifest.models.push({ ...entry, createdAt: now, updatedAt: now });

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`written: out/${id}.{obj,mtl,json}`);
