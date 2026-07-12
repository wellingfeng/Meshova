import fs from "node:fs";
import path from "node:path";
import { buildVineCoveredRockParts, toOBJScene, toViewerModel } from "../src/index.js";

const id = "vine-covered-rock";
const name = "藤蔓覆盖裂隙岩柱";
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });

const parts = buildVineCoveredRockParts({ seed: 73 });
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
manifest.models.push({ id, name, file: `${id}.json`, category: "meshova" });
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`${id}: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
