import {
  buildDualGridScene,
  merge,
  toOBJScene,
  toViewerModel,
  type DualGridSceneKind,
} from "../src/index.js";

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });

const scenes: Array<{ kind: DualGridSceneKind; id: string; name: string; seed: number }> = [
  { kind: "forest-camp", id: "dual-grid-forest-camp", name: "双网格·林间营地", seed: 4821 },
  { kind: "river-mill", id: "dual-grid-river-mill", name: "双网格·河岸水磨", seed: 7314 },
  { kind: "hill-shrine", id: "dual-grid-hill-shrine", name: "双网格·山顶神社", seed: 2206 },
  { kind: "marsh-ruins", id: "dual-grid-marsh-ruins", name: "双网格·沼泽遗迹", seed: 9091 },
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

for (const config of scenes) {
  const scene = buildDualGridScene(config.kind, { seed: config.seed });
  const { obj, mtl } = toOBJScene(scene.parts, `${config.id}.mtl`);
  fs.writeFileSync(path.join(outDir, `${config.id}.obj`), obj);
  fs.writeFileSync(path.join(outDir, `${config.id}.mtl`), mtl);
  fs.writeFileSync(path.join(outDir, `${config.id}.json`), JSON.stringify(toViewerModel(scene.parts, config.id)));

  const now = new Date().toISOString();
  const entry = { id: config.id, name: config.name, file: `${config.id}.json`, category: "meshova" };
  const at = manifest.models.findIndex((candidate) => candidate && candidate.id === entry.id);
  if (at >= 0) manifest.models[at] = { ...manifest.models[at], ...entry, updatedAt: now };
  else manifest.models.push({ ...entry, createdAt: now, updatedAt: now });

  const merged = merge(...scene.parts.map((part) => part.mesh));
  console.log(`${config.name}: ${scene.summary.transitions} transitions, ${scene.summary.props} props, ${merged.positions.length} verts`);
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log("written: out/dual-grid-{forest-camp,river-mill,hill-shrine,marsh-ruins}.{obj,mtl,json}");
