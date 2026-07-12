/**
 * Japanese low-rise street building generated from a semantic module kit.
 *
 * Run: pnpm japanese-street-building
 */
import {
  buildJapaneseStreetBuildingParts,
  scoreJapaneseStreetBuilding,
  summarizeJapaneseStreetBuilding,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const parts = buildJapaneseStreetBuildingParts({
  floors: 5,
  width: 7.2,
  depth: 5.2,
  signDensity: 0.95,
  balconyDensity: 0.75,
  utilityDensity: 0.55,
  roofClutter: 1,
  seed: 23,
});

const { obj, mtl } = toOBJScene(parts, "japanese-street-building.mtl");
const model = toViewerModel(parts, "japanese-street-building");
const score = scoreJapaneseStreetBuilding(parts);
const summary = summarizeJapaneseStreetBuilding(parts);

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "japanese-street-building.obj"), obj);
fs.writeFileSync(path.join(outDir, "japanese-street-building.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "japanese-street-building.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "japanese-street-building", name: "日式模块化街屋", file: "japanese-street-building.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`japanese street building: ${summary.parts} parts, ${summary.triangles} tris, height ${summary.height.toFixed(2)}`);
console.log(score.feedback);
console.log("written: out/japanese-street-building.{obj,mtl,json} + out/models.json");
