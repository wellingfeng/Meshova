import {
  buildCropoutIslandPresetParts,
  merge,
  toOBJScene,
  toViewerModel,
  type CropoutIslandPreset,
} from "../src/index.js";

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });

const library: Array<{ preset: CropoutIslandPreset; id: string; name: string }> = [
  { preset: "pasture", id: "cropout-pasture-island", name: "Cropout 牧场岛" },
  { preset: "longshore", id: "cropout-longshore-island", name: "Cropout 长湾岛" },
  { preset: "twin", id: "cropout-twin-islands", name: "Cropout 双生岛" },
  { preset: "archipelago", id: "cropout-archipelago", name: "Cropout 群岛" },
  { preset: "rocky", id: "cropout-rocky-islands", name: "Cropout 岩岸岛" },
  { preset: "lush", id: "cropout-lush-islands", name: "Cropout 密林岛" },
];

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    manifest = { models: [] };
  }
}

const ids = new Set(library.map((entry) => entry.id));
manifest.models = manifest.models.filter((entry) => !ids.has(entry.id));

for (const entry of library) {
  const parts = buildCropoutIslandPresetParts(entry.preset);
  const model = toViewerModel(parts, entry.id);
  const { obj, mtl } = toOBJScene(parts, `${entry.id}.mtl`);
  fs.writeFileSync(path.join(outDir, `${entry.id}.obj`), obj);
  fs.writeFileSync(path.join(outDir, `${entry.id}.mtl`), mtl);
  fs.writeFileSync(path.join(outDir, `${entry.id}.json`), JSON.stringify(model, null, 2));
  manifest.models.push({ id: entry.id, name: entry.name, file: `${entry.id}.json` });
  const merged = merge(...parts.map((part) => part.mesh));
  console.log(`${entry.id}: ${parts.length} parts, ${merged.positions.length} verts`);
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log("written: six Cropout island presets + out/models.json");
