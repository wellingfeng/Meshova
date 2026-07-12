/**
 * Fabcafe Houdini Lectures clean-room reproductions.
 *
 * Run: tsx examples/fabcafe-houdini.ts
 */
import {
  buildFabcafeHoudiniShowcaseParts,
  buildFabcafeTwistTowerParts,
  buildFabcafeWavySurfaceParts,
  summarizeFabcafeHoudini,
  toOBJScene,
  toViewerModel,
  type NamedPart,
} from "../src/index.js";

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });

interface ManifestEntry {
  id: string;
  name: string;
  file: string;
  category?: string;
}

interface SceneSpec {
  id: string;
  name: string;
  description: string;
  parts: NamedPart[];
}

const category = "Fabcafe Houdini复刻";
const scenes: SceneSpec[] = [
  {
    id: "fabcafe-wavy-surface",
    name: "Fabcafe 波浪实例面",
    description: "grid -> noise attrs -> delete -> copy boxes -> scale/color",
    parts: buildFabcafeWavySurfaceParts(),
  },
  {
    id: "fabcafe-twist-tower",
    name: "Fabcafe 扭转塔",
    description: "controller -> twisted particles -> metaball/VDB union -> feedback copies",
    parts: buildFabcafeTwistTowerParts(),
  },
  {
    id: "fabcafe-houdini",
    name: "Fabcafe Houdini 两例总览",
    description: "Fabcafe Houdini Lectures intro examples as Meshova-native recipes",
    parts: buildFabcafeHoudiniShowcaseParts(),
  },
];

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: ManifestEntry[] } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}

const entries: ManifestEntry[] = [];
for (const scene of scenes) {
  const { obj, mtl } = toOBJScene(scene.parts, `${scene.id}.mtl`);
  const model = toViewerModel(scene.parts, scene.id);
  model.meta.category = category;
  model.meta.description = scene.description;
  model.meta.source = "Fabcafe-Houdini-Lectures clean-room Meshova rewrite";
  fs.writeFileSync(path.join(outDir, `${scene.id}.obj`), obj);
  fs.writeFileSync(path.join(outDir, `${scene.id}.mtl`), mtl);
  fs.writeFileSync(path.join(outDir, `${scene.id}.json`), JSON.stringify(model, null, 2));
  entries.push({ id: scene.id, name: scene.name, file: `${scene.id}.json`, category });
}

const ids = new Set(entries.map((entry) => entry.id));
manifest.models = manifest.models.filter((m) => !ids.has(m.id));
manifest.models.push(...entries);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

for (const scene of scenes) {
  const summary = summarizeFabcafeHoudini(scene.parts);
  console.log(`${scene.id}: ${summary.partCount} parts, ${summary.vertexCount} verts, ${summary.triangleCount} tris`);
}
console.log(`registered ${entries.length} Fabcafe models into out/models.json`);
