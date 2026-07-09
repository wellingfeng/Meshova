/**
 * Procedural streetscene — a dressed street segment built from the modular
 * street-furniture kit (Meshova's take on CitySample's street props), scattered
 * along the sidewalk edges by a SliceAndDice-style placement rule.
 *
 * All params + seed driven: same seed -> same street dressing.
 *
 * Run: pnpm streetscene
 */
import {
  buildStreetsceneParts,
  merge,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const parts = buildStreetsceneParts({
  length: 26,
  roadHalfWidth: 3.2,
  sidewalkWidth: 2.0,
  spacing: 3.0,
  jitter: 0.35,
  bothSides: true,
  ground: true,
  seed: 21,
});

const { obj, mtl } = toOBJScene(parts, "streetscene.mtl");
const model = toViewerModel(parts, "streetscene");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "streetscene.obj"), obj);
fs.writeFileSync(path.join(outDir, "streetscene.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "streetscene.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "streetscene", name: "程序化街景", file: "streetscene.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const merged = merge(...parts.map((p) => p.mesh));
console.log(`streetscene: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
console.log(`bbox source parts merged: ${merged.positions.length} verts`);
console.log("written: out/streetscene.{obj,mtl,json} + out/models.json");
