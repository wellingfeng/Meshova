/**
 * CharacterKit MVP: fixed-topology stylized humanoid with morph sliders and
 * conformed clothing layers.
 *
 * Run: pnpm humanoid
 */
import {
  buildStylizedHumanoidParts,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const parts = buildStylizedHumanoidParts({
  height: 0.08,
  shoulderWidth: 0.15,
  waist: -0.22,
  legLength: 0.18,
  armLength: 0.05,
  headSize: 0.08,
  jawWidth: -0.15,
  noseBridge: 0.25,
  chibi: 0.06,
  eyeSize: 0.22,
});
const { obj, mtl } = toOBJScene(parts, "stylized-humanoid.mtl");
const model = toViewerModel(parts, "stylized-humanoid");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "stylized-humanoid.obj"), obj);
fs.writeFileSync(path.join(outDir, "stylized-humanoid.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "stylized-humanoid.json"), JSON.stringify(model));

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
const entry = { id: "stylized-humanoid", name: "CharacterKit风格化人形", file: "stylized-humanoid.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(
  `stylized humanoid: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`,
);
console.log("written: out/stylized-humanoid.{obj,mtl,json} + out/models.json");
