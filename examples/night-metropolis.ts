/** Large procedural night metropolis. Run: pnpm night-metropolis */
import { buildNightMetropolisParts, toOBJScene, toViewerModel } from "../src/index.js";

const parts = buildNightMetropolisParts();
const { obj, mtl } = toOBJScene(parts, "night-metropolis.mtl");
const model = toViewerModel(parts, "night-metropolis");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "night-metropolis.obj"), obj);
fs.writeFileSync(path.join(outDir, "night-metropolis.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "night-metropolis.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "night-metropolis", name: "夜间都市天际线", file: "night-metropolis.json" };
manifest.models = manifest.models.filter((item) => item.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`night metropolis: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
console.log("written: out/night-metropolis.{obj,mtl,json} + out/models.json");
