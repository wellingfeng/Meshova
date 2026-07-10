/**
 * Construction material stack — CitySample Kit_Pallet/Lumber/Plywood/SandBag.
 * Emits OBJ + viewer JSON and registers into out/models.json.
 *
 * Run: pnpm tsx examples/material-stack.ts
 */
import { toOBJScene, toViewerModel } from "../src/index.js";
import { buildMaterialStackParts, type NamedPart } from "../src/index.js";

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
function register(id: string, name: string, file: string) {
  manifest.models = manifest.models.filter((m) => m.id !== id);
  manifest.models.push({ id, name, file });
}
function emit(id: string, name: string, parts: NamedPart[]) {
  const { obj, mtl } = toOBJScene(parts);
  const model = toViewerModel(parts, id);
  fs.writeFileSync(path.join(outDir, `${id}.obj`), obj);
  fs.writeFileSync(path.join(outDir, `${id}.mtl`), mtl);
  fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(model, null, 2));
  register(id, name, `${id}.json`);
  console.log(`${id}: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
}

emit("material-stack", "施工物料堆", buildMaterialStackParts({ pallets: 3, cargo: "mixed" }));

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
