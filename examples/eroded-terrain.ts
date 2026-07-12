/**
 * Eroded terrain — the full heightfield pipeline in one build, in the spirit of
 * the Houdini "Procedural Race Tracks" terrain HDA:
 *
 *   fbm base landscape -> stamp two mountains + a crater -> thermal + hydraulic
 *   erosion -> flatten a buildable pad under a track centreline -> triangulate,
 *   then scatter archetype rocks that sit on the eroded surface.
 *
 * Everything is deterministic and re-runnable from seeds; no baked terrain.
 *
 * Run: pnpm tsx examples/eroded-terrain.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  fbmHeightfield, stampHeightfield, thermalErode, hydraulicErode,
  flattenUnderCurve, heightfieldToMesh, sampleHeight,
  archetypeRock, polyline, smoothCurve, transform, merge, vec3,
  makeRng, toOBJScene, toViewerModel, type NamedPart, type Mesh,
} from "../src/index.js";

const GROUND: [number, number, number] = [0.34, 0.29, 0.22];
const ROCK: [number, number, number] = [0.44, 0.43, 0.4];

const SIZE = 240;

// 1. Base landscape + stamps (two ridged peaks and an impact crater).
let hf = fbmHeightfield({ cols: 160, rows: 160, size: SIZE, amplitude: 22, featureScale: 70, ridged: 0.55, seed: 21 });
hf = stampHeightfield(hf, [
  { x: -60, z: -40, radius: 55, height: 40, shape: "cone" },
  { x: 55, z: 50, radius: 48, height: 30, shape: "dome" },
  { x: 20, z: -70, radius: 30, height: 12, shape: "crater" },
]);

// 2. Erosion — thermal slumps the stamp cliffs, hydraulic carves drainage.
hf = thermalErode(hf, { iterations: 40, talus: 1.0, strength: 0.5 });
hf = hydraulicErode(hf, { iterations: 45, rain: 0.02, evaporation: 0.3 });

// 3. A track centreline weaving across the valley, flattened into a pad. The
//    road Y follows the eroded ground so the pad hugs the terrain height.
const raw = [];
for (let i = 0; i <= 24; i++) {
  const t = i / 24;
  const x = (t - 0.5) * SIZE * 0.8;
  const z = Math.sin(t * Math.PI * 2) * 45;
  raw.push(vec3(x, sampleHeight(hf, x, z), z));
}
const center = smoothCurve(polyline(raw), 3);
hf = flattenUnderCurve(hf, center, { width: 8, falloff: 14, raise: 0.4 });

const ground: Mesh = heightfieldToMesh(hf, { cusp: 55 });

// 4. Scatter archetype rocks on the eroded surface (seeded, sitting on ground).
const rng = makeRng(77);
const kinds = ["boulder", "slab", "spire", "eroded", "strata"] as const;
const rockMeshes: Mesh[] = [];
for (let i = 0; i < 40; i++) {
  const x = rng.range(-SIZE / 2 + 10, SIZE / 2 - 10);
  const z = rng.range(-SIZE / 2 + 10, SIZE / 2 - 10);
  const y = sampleHeight(hf, x, z);
  const kind = kinds[rng.int(0, kinds.length - 1)]!;
  const r = rng.range(1.5, 5);
  let m = archetypeRock(kind, { seed: (100 + i) >>> 0, radius: r, detail: 2 });
  m = transform(m, { rotate: vec3(0, rng.range(0, Math.PI * 2), 0), translate: vec3(x, y, z) });
  rockMeshes.push(m);
}
const rocks = merge(...rockMeshes);

const parts: NamedPart[] = [
  { name: "terrain", mesh: ground, color: GROUND },
  { name: "rocks", mesh: rocks, color: ROCK },
];

const { obj, mtl } = toOBJScene(parts, "eroded-terrain.mtl");
const model = toViewerModel(parts, "eroded-terrain");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "eroded-terrain.obj"), obj);
fs.writeFileSync(path.join(outDir, "eroded-terrain.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "eroded-terrain.json"), JSON.stringify(model));
const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string; category?: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) { try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { /* rebuild */ } }
const entry = { id: "eroded-terrain", name: "侵蚀地形", file: "eroded-terrain.json", category: "meshova" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`eroded-terrain: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);

