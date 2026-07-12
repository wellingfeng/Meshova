/**
 * Large-scale procedural city district — a red-brick warehouse grid.
 *
 * Scales the single block up to a multi-block city separated by a street
 * network, with perimeter-style buildings around each block (fronts to the
 * street, inner courtyards). Inspired by the Houdini city tutorial
 * (wangtaian, BV1kk4y1t75G), rebuilt on Meshova's deterministic kernel.
 *
 * Run: pnpm city-district
 */
import {
  buildCityDistrictParts,
  merge,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const parts = buildCityDistrictParts({
  blocksX: 5,
  blocksZ: 4,
  blockX: 34,
  blockZ: 26,
  streetWidth: 9,
  lotWidth: 12,
  lotDepth: 7,
  minFloors: 3,
  maxFloors: 10,
  waterTowers: 0.35,
  streetTrees: true,
  streetFurniture: true,
  propSpacing: 14,
  crosswalks: true,
  lotJitter: 0.25,
  base: { baysX: 2, baysZ: 2 },
  seed: 42,
});

const { obj, mtl } = toOBJScene(parts, "city-district.mtl");
const model = toViewerModel(parts, "city-district");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "city-district.obj"), obj);
fs.writeFileSync(path.join(outDir, "city-district.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "city-district.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "city-district", name: "大规模程序化城区", file: "city-district.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const merged = merge(...parts.map((p) => p.mesh));
console.log(`city district: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
console.log(`merged bbox source: ${merged.positions.length} verts`);
console.log("written: out/city-district.{obj,mtl,json} + out/models.json");
