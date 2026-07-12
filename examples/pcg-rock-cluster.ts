import fs from "node:fs";
import path from "node:path";
import { buildPcgRockClusterParts, toOBJScene, toViewerModel } from "../src/index.js";

const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });

const id = "pcg-rock-cluster";
const parts = buildPcgRockClusterParts({
  seed: 17,
  clusterCount: 5,
  rocksPerCluster: 22,
  areaSize: 14,
  clusterRadius: 2,
  heroScale: 1,
  falloff: 1.35,
});
const { obj, mtl } = toOBJScene(parts, `${id}.mtl`);
const model = toViewerModel(parts, id);

fs.writeFileSync(path.join(outDir, `${id}.obj`), obj);
fs.writeFileSync(path.join(outDir, `${id}.mtl`), mtl);
fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(model, null, 2));

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
manifest.models.push({ id, name: "PCG 岩石群落", file: `${id}.json`, category: "meshova" });
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`${id}: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
