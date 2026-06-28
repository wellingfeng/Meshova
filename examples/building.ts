/**
 * Procedural building — parametric architecture reference model.
 *
 * Demonstrates the standard procedural-building pipeline (footprint -> floors
 * -> facade grid -> window modules via copy-to-points -> roof). All params +
 * seed driven, so the same inputs always produce the same building.
 *
 * Run: pnpm building
 */
import {
  buildBuildingParts,
  merge,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const parts = buildBuildingParts({
  floors: 10,
  floorHeight: 1.0,
  width: 4.5,
  depth: 3.2,
  baysX: 4,
  baysZ: 3,
  windowRatio: 0.66,
  setback: 0.06,
  groundFloorScale: 1.4,
  roof: "flat",
  corners: true,
  balconyEvery: 3,
  canopy: true,
  seed: 7,
});

const { obj, mtl } = toOBJScene(parts, "building.mtl");
const model = toViewerModel(parts, "building");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "building.obj"), obj);
fs.writeFileSync(path.join(outDir, "building.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "building.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "building", name: "程序化建筑", file: "building.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const merged = merge(...parts.map((p) => p.mesh));
console.log(`building: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
console.log(`bbox source parts merged: ${merged.positions.length} verts`);
console.log("written: out/building.{obj,mtl,json} + out/models.json");
