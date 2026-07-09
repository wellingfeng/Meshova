/**
 * Mountain-village overworld — reference-image reproduction.
 *
 * Square sandy plateau + winding dirt mountain roads draped on the terrain +
 * dense central cluster of macaron low-poly buildings + surrounding conifers.
 *
 * Run: pnpm mountain-village   (writes out/mountain-village.{obj,mtl,json})
 */
import { buildMountainVillageParts, toOBJScene, toViewerModel } from "../src/index.js";

const parts = buildMountainVillageParts({
  size: 12,
  resolution: 128,
  height: 1.6,
  roads: 9,
  buildings: 190,
  trees: 60,
  seed: 21,
});

const { obj, mtl } = toOBJScene(parts, "mountain-village.mtl");
const model = toViewerModel(parts, "mountain-village");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "mountain-village.obj"), obj);
fs.writeFileSync(path.join(outDir, "mountain-village.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "mountain-village.json"), JSON.stringify(model, null, 2));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "mountain-village", name: "山村聚落", file: "mountain-village.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`mountain village: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
console.log("written: out/mountain-village.{obj,mtl,json} + out/models.json");
