/**
 * Oak tree — a broad, gnarled hardwood in the spirit of Elderwood Overlook's
 * SM_Oak_Branch_* library (a trunk + tiered branch set + leaf cards). Rather
 * than shipping baked branch meshes, we drive Meshova's recursive `tree()`
 * generator with oak-shaped authoring params (thick low trunk, wide umbrella
 * canopy, many secondary branches) and emit matched wind weights.
 *
 * Re-authored from public procedural technique; no UE asset copied.
 *
 * Run: pnpm tsx examples/oak-tree.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  tree, windChannels, toOBJScene, toViewerModel, type NamedPart,
} from "../src/index.js";

const BARK: [number, number, number] = [0.33, 0.26, 0.19];
const LEAF: [number, number, number] = [0.28, 0.42, 0.18];

const oak = tree({
  seed: 11,
  height: 6,
  trunkRadius: 0.45,
  gnarl: 0.35,
  branchCount: 7,
  depth: 4,
  branchAngle: 55,
  branchPhototropism: 0.35,
  branchGravity: 0.25,
  branchLengthScale: 0.72,
  leafDensity: 6,
  leafSize: 0.35,
  canopy: { shape: "umbrella", strength: 0.6 },
});

const parts: NamedPart[] = [];
parts.push({
  name: "wood", mesh: oak.wood, color: BARK,
  windWeight: windChannels(oak.wood, { kind: "wood", seed: 11 }).combined,
});
if (oak.leaves.positions.length > 0) {
  parts.push({
    name: "leaves", mesh: oak.leaves, color: LEAF,
    windWeight: windChannels(oak.leaves, { kind: "foliage", seed: 12 }).combined,
  });
}

const { obj, mtl } = toOBJScene(parts, "oak-tree.mtl");
const model = toViewerModel(parts, "oak-tree");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "oak-tree.obj"), obj);
fs.writeFileSync(path.join(outDir, "oak-tree.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "oak-tree.json"), JSON.stringify(model));
const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string; category?: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) { try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { /* rebuild */ } }
const entry = { id: "oak-tree", name: "橡树", file: "oak-tree.json", category: "meshova" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`oak: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
