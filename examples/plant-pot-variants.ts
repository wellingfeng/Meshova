/**
 * Plant pot variants — lathe revolve, one script -> N pots.
 *
 * Skylark ships 9 plant pots; like the bottles they are one revolve tool with
 * jittered parameters. Same recipe as bottle-variants but a short, open,
 * flared silhouette with a rim lip. Proves the variant loop again on a second
 * revolve family. Deterministic per seed.
 *
 * Run: pnpm tsx examples/plant-pot-variants.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  lathe, transform, computeNormals, makeRng, vec2, vec3,
  toOBJScene, toViewerModel, type Rng, type NamedPart,
} from "../src/index.js";

const CLAY_COLORS: [number, number, number][] = [
  [0.62, 0.32, 0.22], [0.5, 0.28, 0.2], [0.7, 0.55, 0.42], [0.45, 0.45, 0.42], [0.55, 0.4, 0.5],
];

function potProfile(rng: Rng): ReturnType<typeof vec2>[] {
  const baseR = rng.range(0.22, 0.34);
  const topR = baseR + rng.range(0.08, 0.2); // flare out to the rim
  const height = rng.range(0.4, 0.7);
  const lip = rng.range(0.02, 0.05);
  const wall = rng.range(0.03, 0.05);
  const rimR = topR + lip;
  return [
    vec2(0, 0),
    vec2(baseR * 0.9, 0),        // base edge
    vec2(baseR, 0.04),
    vec2(topR, height),          // flared wall to rim
    vec2(rimR, height),          // rim out
    vec2(rimR, height + lip),    // rim top
    vec2(topR - wall, height + lip), // rim inner
    vec2(topR - wall, height - 0.02), // inner wall down
    vec2(baseR - wall, 0.05),    // inner base
    vec2(0, 0.05),               // inner floor
  ];
}

const COUNT = 9;
const COLS = 5;
const SPACING = 0.95;
const parts: NamedPart[] = [];
for (let i = 0; i < COUNT; i++) {
  const rng = makeRng(500 + i * 11);
  const mesh = computeNormals(lathe(potProfile(rng), { segments: 40 }), 40);
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const placed = transform(mesh, { translate: vec3((col - (COLS - 1) / 2) * SPACING, 0, row * SPACING) });
  parts.push({ name: `pot_${i}`, mesh: placed, color: CLAY_COLORS[i % CLAY_COLORS.length]! });
}

const { obj, mtl } = toOBJScene(parts, "plant-pot-variants.mtl");
const model = toViewerModel(parts, "plant-pot-variants");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "plant-pot-variants.obj"), obj);
fs.writeFileSync(path.join(outDir, "plant-pot-variants.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "plant-pot-variants.json"), JSON.stringify(model));
const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) { try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { /* rebuild */ } }
const entry = { id: "plant-pot-variants", name: "花盆变体", file: "plant-pot-variants.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`plant pots: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
