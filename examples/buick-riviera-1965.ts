/**
 * 1963-1965 Buick Riviera inspired personal luxury coupe.
 *
 * Procedural approximation only: no Sketchfab mesh import, no downloaded art.
 *
 * Run: pnpm riviera
 */
import {
  buildBuickRiviera1965Parts,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const parts = buildBuickRiviera1965Parts();
const { obj, mtl } = toOBJScene(parts, "buick-riviera-1965.mtl");
const model = toViewerModel(parts, "buick-riviera-1965");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "buick-riviera-1965.obj"), obj);
fs.writeFileSync(path.join(outDir, "buick-riviera-1965.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "buick-riviera-1965.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = {
  models: [],
};
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "buick-riviera-1965", name: "Buick Riviera 1963-1965", file: "buick-riviera-1965.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(
  `buick riviera 1965: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`,
);
console.log("written: out/buick-riviera-1965.{obj,mtl,json} + out/models.json");
