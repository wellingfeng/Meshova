/** Daylight garden metropolis. Run: pnpm garden-metropolis */
import { buildGardenMetropolisParts, toOBJScene, toViewerModel } from "../src/index.js";

const parts = buildGardenMetropolisParts();
const { obj, mtl } = toOBJScene(parts, "garden-metropolis.mtl");
const model = toViewerModel(parts, "garden-metropolis");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "garden-metropolis.obj"), obj);
fs.writeFileSync(path.join(outDir, "garden-metropolis.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "garden-metropolis.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "garden-metropolis", name: "湖畔花园都市群", file: "garden-metropolis.json" };
manifest.models = manifest.models.filter((item) => item.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`garden metropolis: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
console.log("written: out/garden-metropolis.{obj,mtl,json} + out/models.json");
