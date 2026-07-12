/**
 * Rock family — the five archetypeRock silhouettes laid out in a row so the
 * distinct forms read at a glance: boulder, slab, spire, eroded, strata. One
 * rule, five recipes, all seed-driven (no baked meshes).
 *
 * Run: pnpm tsx examples/rock-family.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  archetypeRock, transform, merge, vec3,
  toOBJScene, toViewerModel, type NamedPart, type Mesh,
} from "../src/index.js";

const kinds = ["boulder", "slab", "spire", "eroded", "strata"] as const;
const COLORS: Record<(typeof kinds)[number], [number, number, number]> = {
  boulder: [0.5, 0.48, 0.45],
  slab: [0.46, 0.44, 0.4],
  spire: [0.52, 0.5, 0.47],
  eroded: [0.48, 0.42, 0.36],
  strata: [0.55, 0.47, 0.38],
};

const parts: NamedPart[] = [];
const spacing = 3.2;
kinds.forEach((kind, i) => {
  const mesh: Mesh = archetypeRock(kind, { seed: (10 + i) >>> 0, radius: 1, detail: 3 });
  const placed = transform(mesh, { translate: vec3((i - (kinds.length - 1) / 2) * spacing, 0, 0) });
  parts.push({ name: kind, mesh: placed, color: COLORS[kind] });
});

const { obj, mtl } = toOBJScene(parts, "rock-family.mtl");
const model = toViewerModel(parts, "rock-family");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "rock-family.obj"), obj);
fs.writeFileSync(path.join(outDir, "rock-family.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "rock-family.json"), JSON.stringify(model));
const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string; category?: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) { try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { /* rebuild */ } }
const entry = { id: "rock-family", name: "岩石家族", file: "rock-family.json", category: "meshova" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`rock-family: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);

