import {
  buildTownscaperScene,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const town = buildTownscaperScene();
const { obj, mtl } = toOBJScene(town.parts, "townscaper-harbour.mtl");
const model = toViewerModel(town.parts, "townscaper-harbour");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "townscaper-harbour.obj"), obj);
fs.writeFileSync(path.join(outDir, "townscaper-harbour.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "townscaper-harbour.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<Record<string, unknown>> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    manifest = { models: [] };
  }
}
if (!Array.isArray(manifest.models)) manifest.models = [];
const entry = {
  id: "townscaper-harbour",
  name: "Townscaper灵感·彩色港湾",
  file: "townscaper-harbour.json",
  category: "meshova",
};
const index = manifest.models.findIndex((item) => item && item.id === entry.id);
if (index >= 0) manifest.models[index] = { ...manifest.models[index], ...entry };
else manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log(
  `townscaper harbour: ${town.summary.occupiedCells} cells, ${town.summary.maxHeight} floors, ${town.summary.archCount} arches, ${town.summary.bridgeCount} bridges`,
);
console.log("written: out/townscaper-harbour.{obj,mtl,json} + out/models.json");
