import {
  buildLowPolyCloudValleyParts,
  buildLowPolyTropicalIslandParts,
  buildLowPolyTreeKitParts,
  buildLowPolyVillageParts,
  toOBJScene,
  toViewerModel,
  type NamedPart,
} from "../src/index.js";

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });

const scenes: Array<{ id: string; name: string; build: () => NamedPart[] }> = [
  { id: "low-poly-village", name: "Low Poly 村落", build: () => buildLowPolyVillageParts() },
  { id: "low-poly-cloud-valley", name: "Low Poly 山谷云景", build: () => buildLowPolyCloudValleyParts() },
  { id: "low-poly-tropical-island", name: "Low Poly 热带岛", build: () => buildLowPolyTropicalIslandParts() },
  { id: "low-poly-tree-kit", name: "Low Poly 树木 Kit", build: () => buildLowPolyTreeKitParts() },
];

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

for (const scene of scenes) {
  const parts = scene.build();
  const { obj, mtl } = toOBJScene(parts, `${scene.id}.mtl`);
  fs.writeFileSync(path.join(outDir, `${scene.id}.obj`), obj);
  fs.writeFileSync(path.join(outDir, `${scene.id}.mtl`), mtl);
  fs.writeFileSync(path.join(outDir, `${scene.id}.json`), JSON.stringify(toViewerModel(parts, scene.id)));

  const now = new Date().toISOString();
  const entry = { id: scene.id, name: scene.name, file: `${scene.id}.json`, category: "meshova" };
  const index = manifest.models.findIndex((candidate) => candidate?.id === scene.id);
  if (index >= 0) manifest.models[index] = { ...manifest.models[index], ...entry, updatedAt: now };
  else manifest.models.push({ ...entry, createdAt: now, updatedAt: now });
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log("written: out/low-poly-{village,cloud-valley,tropical-island,tree-kit}.{obj,mtl,json}");
