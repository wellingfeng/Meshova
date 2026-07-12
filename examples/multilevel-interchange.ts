import {
  buildMultilevelInterchangeParts,
  merge,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const parts = buildMultilevelInterchangeParts();
const { obj, mtl } = toOBJScene(parts, "multilevel-interchange.mtl");
const model = toViewerModel(parts, "multilevel-interchange");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "multilevel-interchange.obj"), obj);
fs.writeFileSync(path.join(outDir, "multilevel-interchange.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "multilevel-interchange.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    manifest = { models: [] };
  }
}
const entry = { id: "multilevel-interchange", name: "多层立体交通枢纽", file: "multilevel-interchange.json" };
manifest.models = manifest.models.filter((item) => item.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const merged = merge(...parts.map((part) => part.mesh));
console.log(`multilevel-interchange: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
console.log(`source vertices: ${merged.positions.length}`);
console.log("written: out/multilevel-interchange.{obj,mtl,json} + out/models.json");
