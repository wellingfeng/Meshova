/**
 * Red 90s T-top sports car built from Meshova procedural parts.
 *
 * Run: pnpm tsx examples/sports-car.ts
 */
import {
  buildSportsCarParts,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const parts = buildSportsCarParts();
const { obj, mtl } = toOBJScene(parts, "sports-car.mtl");
const model = toViewerModel(parts, "sports-car");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "sports-car.obj"), obj);
fs.writeFileSync(path.join(outDir, "sports-car.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "sports-car.json"), JSON.stringify(model));

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
const entry = { id: "sports-car", name: "红色T-top跑车", file: "sports-car.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(
  `sports car: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`,
);
console.log("written: out/sports-car.{obj,mtl,json} + out/models.json");
