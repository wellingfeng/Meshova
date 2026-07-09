/**
 * Procedural cumulus cloud — Blender geometry-node recipe, self-rewritten.
 * scatter blobs -> fuse iso-surface -> smooth -> noise puff displacement.
 *
 * Emits a single cumulus, each named preset, and a multi-cloud sky.
 *
 * Run: pnpm cloud
 */
import { toOBJScene, toViewerModel } from "../src/index.js";
import {
  buildCloudParts,
  buildCloudPreset,
  buildCloudSkyParts,
  CLOUD_PRESETS,
  scoreCloud,
} from "../src/models/cloud.js";

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
function register(id: string, name: string, file: string) {
  manifest.models = manifest.models.filter((m) => m.id !== id);
  manifest.models.push({ id, name, file });
}

function emit(id: string, name: string, parts: ReturnType<typeof buildCloudParts>) {
  const { obj, mtl } = toOBJScene(parts);
  const model = toViewerModel(parts, id);
  fs.writeFileSync(path.join(outDir, `${id}.obj`), obj);
  fs.writeFileSync(path.join(outDir, `${id}.mtl`), mtl);
  fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(model, null, 2));
  register(id, name, `${id}.json`);
  console.log(`${id}: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris — ${scoreCloud(parts).feedback}`);
}

// single fair-weather cumulus
emit("cloud", "程序化积云", buildCloudParts());

// each named preset shape
const presetNames: Record<string, string> = {
  cumulus: "积云", towering: "浓积云", puffy: "棉花云", stratus: "层积云", wispy: "碎积云",
};
for (const name of Object.keys(CLOUD_PRESETS)) {
  emit(`cloud-${name}`, `云·${presetNames[name] ?? name}`, buildCloudPreset(name));
}

// a small sky of several clouds
emit("cloud-sky", "程序化云海", buildCloudSkyParts());

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log("written: out/cloud*.{obj,mtl,json} + out/models.json");
