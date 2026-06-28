/**
 * Reference-inspired dog, procedurally modeled from the quadruped dog preset.
 *
 * Run: pnpm dog
 */
import {
  buildReferenceDogParts,
  scoreDogAnatomy,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const parts = buildReferenceDogParts();
const quality = scoreDogAnatomy(parts);

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
const qualityDir = path.join(outDir, "quality");
fs.mkdirSync(qualityDir, { recursive: true });
fs.writeFileSync(path.join(qualityDir, "reference-dog-quality.json"), JSON.stringify(quality, null, 2));
if (quality.score < 0.78) {
  throw new Error(`reference dog quality gate failed: ${quality.feedback}`);
}

const { obj, mtl } = toOBJScene(parts, "reference-dog.mtl");
const model = toViewerModel(parts, "reference-dog");
fs.writeFileSync(path.join(outDir, "reference-dog.obj"), obj);
fs.writeFileSync(path.join(outDir, "reference-dog.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "reference-dog.json"), JSON.stringify(model));

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
const entry = { id: "reference-dog", name: "参考黄犬", file: "reference-dog.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(
  `reference dog: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`,
);
console.log(quality.feedback);
console.log("written: out/reference-dog.{obj,mtl,json} + out/models.json");
