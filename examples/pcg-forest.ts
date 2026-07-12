import { buildPcgForestParts, summarizePcgForest, toOBJScene, toViewerModel } from "../src/index.js";

const parts = buildPcgForestParts();
const { obj, mtl } = toOBJScene(parts, "pcg-forest.mtl");
const model = toViewerModel(parts, "pcg-forest");
const summary = summarizePcgForest(parts);

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "pcg-forest.obj"), obj);
fs.writeFileSync(path.join(outDir, "pcg-forest.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "pcg-forest.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "pcg-forest", name: "程序化混交森林", file: "pcg-forest.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`pcg forest: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
console.log(`trees: ${summary.treeCount}, shrubs: ${summary.shrubCount}, rocks: ${summary.rockCount}, logs: ${summary.deadwoodCount}`);
console.log("written: out/pcg-forest.{obj,mtl,json} + out/models.json");



