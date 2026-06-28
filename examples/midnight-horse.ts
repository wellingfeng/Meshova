/**
 * Midnight black horse, procedurally modeled with the quadruped skeleton +
 * cross-section skin template and procedural surface refs.
 *
 * Run: pnpm horse
 */
import {
  buildMidnightHorseParts,
  scoreHorseAnatomy,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const parts = buildMidnightHorseParts();
const quality = scoreHorseAnatomy(parts);

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
const qualityDir = path.join(outDir, "quality");
fs.mkdirSync(qualityDir, { recursive: true });
fs.writeFileSync(path.join(qualityDir, "midnight-horse-quality.json"), JSON.stringify(quality, null, 2));
if (quality.score < 0.78) {
  throw new Error(`midnight horse quality gate failed: ${quality.feedback}`);
}

const { obj, mtl } = toOBJScene(parts, "midnight-horse.mtl");
const model = toViewerModel(parts, "midnight-horse");
fs.writeFileSync(path.join(outDir, "midnight-horse.obj"), obj);
fs.writeFileSync(path.join(outDir, "midnight-horse.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "midnight-horse.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = {
  models: [],
};
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "midnight-horse", name: "午夜黑马", file: "midnight-horse.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(
  `midnight horse: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`,
);
console.log(quality.feedback);
console.log("written: out/midnight-horse.{obj,mtl,json} + out/models.json");
