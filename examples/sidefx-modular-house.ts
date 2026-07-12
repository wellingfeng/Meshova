/**
 * SideFX-inspired procedural building from modules.
 *
 * Run: pnpm sidefx-modular-house
 */
import {
  buildSidefxModularHouseParts,
  scoreSidefxModularHouse,
  summarizeSidefxModularHouse,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const parts = buildSidefxModularHouseParts({
  floors: 2,
  baysX: 6,
  baysZ: 3,
  bayWidth: 1.12,
  floorHeight: 1.18,
  layout: "lWing",
  wingBays: 3,
  wingDepthBays: 3,
  roofPitch: 0.78,
  roofOverhang: 0.32,
  balconyDensity: 0.28,
  shutterDensity: 0.72,
  seed: 77,
});

const { obj, mtl } = toOBJScene(parts, "sidefx-modular-house.mtl");
const model = toViewerModel(parts, "sidefx-modular-house");
const score = scoreSidefxModularHouse(parts);
const summary = summarizeSidefxModularHouse(parts);

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "sidefx-modular-house.obj"), obj);
fs.writeFileSync(path.join(outDir, "sidefx-modular-house.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "sidefx-modular-house.json"), JSON.stringify(model, null, 2));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "sidefx-modular-house", name: "SideFX 模块化房屋", file: "sidefx-modular-house.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`sidefx modular house: ${summary.parts} parts, ${summary.triangles} tris, height ${summary.height.toFixed(2)}`);
console.log(score.feedback);
console.log("written: out/sidefx-modular-house.{obj,mtl,json} + out/models.json");
