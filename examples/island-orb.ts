/**
 * Floating island orb — the signature silhouette of Skylark's sky world.
 *
 * Skylark's Base_Elements ship SM_Island_Orb + SM_Mountain + a set of rocks.
 * The look is a grassy disc on top with an inverted, jagged rock cone hanging
 * below — a chunk of land torn from the ground and floating. It's cheap and
 * high-recognition: a lathe profile gives the orb its cone/dome silhouette,
 * seeded noise displacement roughens the rock underside, and a handful of
 * scattered boulders sit on the grass. Everything is seeded and deterministic.
 *
 * Run: pnpm island-orb
 */
import fs from "node:fs";
import path from "node:path";
import {
  lathe,
  icosphere,
  displaceByNoise,
  transform,
  merge,
  computeNormals,
  makeRng,
  vec2,
  vec3,
  toOBJScene,
  toViewerModel,
  type Mesh,
  type NamedPart,
  type Rng,
} from "../src/index.js";

const GRASS: [number, number, number] = [0.42, 0.62, 0.28];
const SOIL: [number, number, number] = [0.4, 0.28, 0.18];
const ROCK: [number, number, number] = [0.46, 0.43, 0.4];
const ROCK_DK: [number, number, number] = [0.34, 0.31, 0.29];

const SEED = 11;
const RADIUS = 2.2; // top disc radius
const DROP = 3.4; // how far the rock cone hangs below
const BOULDERS = 6;

const rng = makeRng(SEED);
const parts: NamedPart[] = [];

// 1) Orb body: a lathe profile. Top is a slightly domed grass disc; below the
//    rim the profile pinches inward and down to a rough point — the torn cone.
//    Profile points are (radius, height), revolved around Y.
function orbProfile(): ReturnType<typeof vec2>[] {
  return [
    vec2(0, 0.18 * RADIUS), // domed grass top centre
    vec2(RADIUS * 0.5, 0.14 * RADIUS),
    vec2(RADIUS * 0.9, 0.05 * RADIUS),
    vec2(RADIUS, 0), // rim
    vec2(RADIUS * 0.82, -0.35), // soil lip just under the rim
    vec2(RADIUS * 0.6, -DROP * 0.35),
    vec2(RADIUS * 0.32, -DROP * 0.7),
    vec2(RADIUS * 0.12, -DROP * 0.92),
    vec2(0, -DROP), // hanging point
  ];
}

const orbRaw = lathe(orbProfile(), { segments: 48 });
// Roughen the whole orb, then we colour top vs bottom by splitting the mesh is
// overkill — instead build two lathes: a smooth grass cap + a noisy rock body.

// Grass cap: just the top rings of the profile, kept smooth.
const capProfile = [
  vec2(0, 0.18 * RADIUS),
  vec2(RADIUS * 0.5, 0.14 * RADIUS),
  vec2(RADIUS * 0.9, 0.05 * RADIUS),
  vec2(RADIUS, 0),
];
const grassCap = computeNormals(lathe(capProfile, { segments: 48 }), 50);
parts.push({ name: "grass_cap", mesh: grassCap, color: GRASS });

// Rock body: the lower profile, displaced by noise for a rugged underside.
const rockProfile = [
  vec2(RADIUS, 0),
  vec2(RADIUS * 0.82, -0.35),
  vec2(RADIUS * 0.6, -DROP * 0.35),
  vec2(RADIUS * 0.32, -DROP * 0.7),
  vec2(RADIUS * 0.12, -DROP * 0.92),
  vec2(0, -DROP),
];
const rockBody = computeNormals(
  displaceByNoise(lathe(rockProfile, { segments: 48 }), { amount: 0.22, scale: 1.8, seed: SEED }),
  50,
);
parts.push({ name: "rock_body", mesh: rockBody, color: ROCK });

// A thin soil band right under the rim, coloured darker, for the torn-earth read.
const soilProfile = [vec2(RADIUS, 0), vec2(RADIUS * 1.02, -0.12), vec2(RADIUS * 0.82, -0.35)];
const soilBand = computeNormals(lathe(soilProfile, { segments: 48 }), 50);
parts.push({ name: "soil_band", mesh: soilBand, color: SOIL });

// 2) Boulders: noise-displaced icospheres scattered on the grass disc.
function boulder(rng: Rng): Mesh {
  const r = rng.range(0.14, 0.34);
  const s = icosphere(r, 1);
  return computeNormals(
    displaceByNoise(s, { amount: r * 0.4, scale: 3.5, seed: rng.int(1, 9999) }),
    50,
  );
}
const boulderMeshes: Mesh[] = [];
for (let i = 0; i < BOULDERS; i++) {
  const ang = rng.range(0, Math.PI * 2);
  const rad = rng.range(0.2, RADIUS * 0.8);
  const b = transform(boulder(rng), {
    translate: vec3(Math.cos(ang) * rad, 0.12 * RADIUS + 0.05, Math.sin(ang) * rad),
  });
  boulderMeshes.push(b);
}
parts.push({ name: "boulders", mesh: computeNormals(merge(...boulderMeshes), 50), color: ROCK_DK });

// --- export ---
const { obj, mtl } = toOBJScene(parts, "island-orb.mtl");
const model = toViewerModel(parts, "island-orb");

const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "island-orb.obj"), obj);
fs.writeFileSync(path.join(outDir, "island-orb.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "island-orb.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "island-orb", name: "浮空岛", file: "island-orb.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(
  `island orb: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`,
);
console.log("written: out/island-orb.{obj,mtl,json} + out/models.json");
