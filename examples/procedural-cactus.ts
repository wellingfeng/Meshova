/**
 * Procedural cactus — SideFX-style curve/ramp/random attribute recipe.
 *
 * Run: pnpm tsx examples/procedural-cactus.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  buildProceduralCactusParts,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const parts = buildProceduralCactusParts();
const { obj, mtl } = toOBJScene(parts, "procedural-cactus.mtl");
const model = toViewerModel(parts, "程序化仙人掌");

const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "procedural-cactus.obj"), obj);
fs.writeFileSync(path.join(outDir, "procedural-cactus.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "procedural-cactus.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild */
  }
}
const entry = { id: "procedural-cactus", name: "程序化仙人掌", file: "procedural-cactus.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`procedural-cactus: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
