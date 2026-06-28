/**
 * Procedural city block — a grid of seeded building variants.
 *
 * Each lot draws random floors / roof / balconies from one master seed, so the
 * whole street is deterministic: same seed -> same block. Parts are merged by
 * name across buildings to keep the scene to a few material groups.
 *
 * Run: pnpm city-block
 */
import {
  buildCityBlockParts,
  merge,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const parts = buildCityBlockParts({
  cols: 5,
  rows: 2,
  lotX: 5.5,
  lotZ: 4.5,
  minFloors: 3,
  maxFloors: 14,
  ground: true,
  seed: 11,
});

const { obj, mtl } = toOBJScene(parts, "city-block.mtl");
const model = toViewerModel(parts, "city-block");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "city-block.obj"), obj);
fs.writeFileSync(path.join(outDir, "city-block.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "city-block.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "city-block", name: "程序化街区", file: "city-block.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const merged = merge(...parts.map((p) => p.mesh));
console.log(`city block: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
console.log(`bbox source parts merged: ${merged.positions.length} verts`);
console.log("written: out/city-block.{obj,mtl,json} + out/models.json");
