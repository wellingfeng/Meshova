/**
 * Birdhouse variants — box body + boolean entrance hole, one script -> N.
 *
 * Skylark ships 5 birdhouses; the recipe is trivial and perfect for proving
 * the "seed -> variant" loop on a hard-surface prop: a box body with a
 * subtracted cylindrical entrance, a two-slope roof, a perch dowel, all
 * jittered by a seeded RNG. Deterministic: same seed -> same shelf.
 *
 * Run: pnpm tsx examples/birdhouse-variants.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  box, cylinder, transform, merge, subtract, computeNormals, makeRng,
  vec3, toOBJScene, toViewerModel, type Rng, type NamedPart,
} from "../src/index.js";

const BODY_COLORS: [number, number, number][] = [
  [0.72, 0.4, 0.28], [0.5, 0.55, 0.4], [0.44, 0.5, 0.62], [0.7, 0.62, 0.4], [0.6, 0.4, 0.46],
];
const ROOF: [number, number, number] = [0.35, 0.2, 0.14];
const WOOD: [number, number, number] = [0.3, 0.2, 0.12];

function buildBirdhouse(rng: Rng): { body: ReturnType<typeof box>; roof: ReturnType<typeof box>; perch: ReturnType<typeof box> } {
  const w = rng.range(0.5, 0.75);
  const h = rng.range(0.7, 1.0);
  const d = rng.range(0.45, 0.65);
  const holeR = rng.range(0.08, 0.13);
  const holeY = h * rng.range(0.55, 0.7);

  // Body with a subtracted entrance hole on the +Z face.
  const shell = box(w, h, d);
  const hole = transform(cylinder(holeR, d * 1.5, 20), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(0, holeY, 0) });
  const body = computeNormals(subtract(shell, hole), 40);

  // Two-slope roof: two tilted slabs meeting at a ridge.
  const pitch = rng.range(0.5, 0.8);
  const slabW = w * 0.62;
  const left = transform(box(slabW, 0.05, d + 0.12), { rotate: vec3(0, 0, pitch), translate: vec3(-w * 0.22, h + 0.12, 0) });
  const right = transform(box(slabW, 0.05, d + 0.12), { rotate: vec3(0, 0, -pitch), translate: vec3(w * 0.22, h + 0.12, 0) });
  const roof = computeNormals(merge(left, right), 40);

  // Perch dowel under the hole.
  const perch = computeNormals(transform(cylinder(0.02, 0.18, 8), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(0, holeY - holeR - 0.05, d / 2 + 0.06) }), 40);
  return { body, roof, perch };
}

const COUNT = 5;
const SPACING = 1.3;
const parts: NamedPart[] = [];
for (let i = 0; i < COUNT; i++) {
  const rng = makeRng(200 + i * 13);
  const { body, roof, perch } = buildBirdhouse(rng);
  const dx = (i - (COUNT - 1) / 2) * SPACING;
  const shift = { translate: vec3(dx, 0, 0) };
  parts.push({ name: `body_${i}`, mesh: transform(body, shift), color: BODY_COLORS[i % BODY_COLORS.length]! });
  parts.push({ name: `roof_${i}`, mesh: transform(roof, shift), color: ROOF });
  parts.push({ name: `perch_${i}`, mesh: transform(perch, shift), color: WOOD });
}

const { obj, mtl } = toOBJScene(parts, "birdhouse-variants.mtl");
const model = toViewerModel(parts, "birdhouse-variants");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "birdhouse-variants.obj"), obj);
fs.writeFileSync(path.join(outDir, "birdhouse-variants.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "birdhouse-variants.json"), JSON.stringify(model));
const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) { try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { /* rebuild */ } }
const entry = { id: "birdhouse-variants", name: "鸟屋变体", file: "birdhouse-variants.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`birdhouses: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
