/**
 * 2023 GMC Canyon AT4X inspired pickup.
 *
 * Procedural approximation only: no Sketchfab mesh import, no downloaded art.
 *
 * Run: pnpm canyon
 */
import {
  buildGmcCanyonAt4xParts,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const parts = buildGmcCanyonAt4xParts();
const { obj, mtl } = toOBJScene(parts, "gmc-canyon-at4x.mtl");
const model = toViewerModel(parts, "gmc-canyon-at4x");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "gmc-canyon-at4x.obj"), obj);
fs.writeFileSync(path.join(outDir, "gmc-canyon-at4x.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "gmc-canyon-at4x.json"), JSON.stringify(model));

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
const entry = { id: "gmc-canyon-at4x", name: "GMC Canyon AT4X 皮卡", file: "gmc-canyon-at4x.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(
  `gmc canyon at4x: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`,
);
console.log("written: out/gmc-canyon-at4x.{obj,mtl,json} + out/models.json");
