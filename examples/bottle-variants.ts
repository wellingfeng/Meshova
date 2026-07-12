/**
 * Bottle variants — one script + a seed -> N distinct bottles.
 *
 * SideFX's Skylark ships ~200 bottle meshes; they are not hand-modeled, a
 * single Houdini digital asset spits out variants from parameters + a seed.
 * This is exactly Meshova's pitch: a low-dimensional profile revolved by
 * `lathe`, with a seeded RNG jittering body/shoulder/neck so every bottle is
 * recognizable yet unique. Deterministic: same seed -> same shelf, every run.
 *
 * Run: pnpm tsx examples/bottle-variants.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  lathe,
  transform,
  computeNormals,
  makeRng,
  vec2,
  vec3,
  toOBJScene,
  toViewerModel,
  type Rng,
  type NamedPart,
} from "../src/index.js";

const GLASS_COLORS: [number, number, number][] = [
  [0.18, 0.42, 0.35], // green
  [0.5, 0.3, 0.18],   // amber
  [0.2, 0.28, 0.45],  // cobalt
  [0.42, 0.42, 0.44], // clear-grey
  [0.4, 0.16, 0.2],   // wine
];

/**
 * Build one bottle silhouette (radius, height) from a seeded RNG. The profile
 * walks base -> body -> shoulder -> neck -> lip -> back to the axis, so `lathe`
 * closes into a solid revolve. All the "design decisions" are a handful of
 * jittered scalars — the shape an AI loop would optimize over.
 */
function bottleProfile(rng: Rng): { profile: ReturnType<typeof vec2>[]; height: number } {
  const bodyR = rng.range(0.28, 0.42);
  const bodyH = rng.range(0.55, 0.95);
  const shoulderH = rng.range(0.12, 0.28);
  const neckR = rng.range(0.09, 0.16);
  const neckH = rng.range(0.18, 0.42);
  const lipR = neckR + rng.range(0.015, 0.045);
  const belly = rng.range(0.0, 0.06); // slight bulge mid-body
  const shoulder = bodyH + shoulderH;
  const rim = shoulder + neckH;

  const profile = [
    vec2(0, 0),
    vec2(bodyR * 0.92, 0),          // base edge
    vec2(bodyR, bodyH * 0.15),      // lower body
    vec2(bodyR + belly, bodyH * 0.55), // belly
    vec2(bodyR, bodyH),             // top of body
    vec2(bodyR * 0.72, bodyH + shoulderH * 0.5), // shoulder curve
    vec2(neckR, shoulder),          // neck base
    vec2(neckR, rim - 0.02),        // neck
    vec2(lipR, rim),                // lip out
    vec2(lipR, rim + 0.02),         // lip top
    vec2(neckR * 0.85, rim + 0.02), // lip inner
    vec2(0, rim + 0.02),            // seal top
  ];
  return { profile, height: rim + 0.02 };
}

const COUNT = 12;
const COLS = 6;
const SPACING = 1.1;
const parts: NamedPart[] = [];

for (let i = 0; i < COUNT; i++) {
  const rng = makeRng(1000 + i * 7);
  const { profile } = bottleProfile(rng);
  const segments = 40 + Math.floor(rng.range(0, 8));
  const mesh = computeNormals(lathe(profile, { segments }), 40);
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const placed = transform(mesh, {
    translate: vec3((col - (COLS - 1) / 2) * SPACING, 0, row * SPACING),
  });
  const color = GLASS_COLORS[i % GLASS_COLORS.length]!;
  parts.push({ name: `bottle_${i}`, mesh: placed, color });
}

const { obj, mtl } = toOBJScene(parts, "bottle-variants.mtl");
const model = toViewerModel(parts, "bottle-variants");

const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "bottle-variants.obj"), obj);
fs.writeFileSync(path.join(outDir, "bottle-variants.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "bottle-variants.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "bottle-variants", name: "瓶子变体", file: "bottle-variants.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(
  `bottle variants: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`,
);
console.log("written: out/bottle-variants.{obj,mtl,json} + out/models.json");
