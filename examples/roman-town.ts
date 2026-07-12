/** Generate the traditional Roman neighbourhood example. Run: pnpm roman-town */
import {
  buildRomanTownParts,
  summarizeRomanTown,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const parts = buildRomanTownParts({
  blocksX: 3,
  blocksZ: 3,
  blockSize: 21,
  streetWidth: 4.2,
  minFloors: 4,
  maxFloors: 6,
  shopDensity: 0.62,
  shutterDensity: 0.72,
  balconyDensity: 0.24,
  roofTerraceDensity: 0.42,
  piazza: true,
  seed: 1703,
});

const { obj, mtl } = toOBJScene(parts, "roman-town.mtl");
const model = toViewerModel(parts, "roman-town");
const summary = summarizeRomanTown(parts);
const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "roman-town.obj"), obj);
fs.writeFileSync(path.join(outDir, "roman-town.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "roman-town.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    // Rebuild malformed local manifest.
  }
}
const entry = { id: "roman-town", name: "传统罗马街区", file: "roman-town.json" };
manifest.models = manifest.models.filter((item) => item.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`roman town: ${summary.parts} parts, ${summary.triangles} tris, ${summary.width.toFixed(1)} × ${summary.depth.toFixed(1)}`);
console.log("written: out/roman-town.{obj,mtl,json} + out/models.json");

