/**
 * Grass clusters — billboard cross-quad clusters, the Skylark FT_Grass recipe.
 *
 * Skylark's grass is a few crossed alpha cards per clump (a billboard cluster),
 * shaded with a wind + subsurface material. Meshova builds the geometry side:
 * each clump fans several `crossQuad` cards outward with a slight bend, seeded
 * so clumps differ; a `windPhase` param leans the blades to fake a gust (the
 * value a vertex-wind shader would drive at runtime). Alpha/subsurface is a
 * material concern handled separately by the texture module.
 *
 * Run: pnpm tsx examples/grass-clusters.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  crossQuad, transform, merge, computeNormals, makeRng,
  vec3, toOBJScene, toViewerModel, type Rng, type Mesh, type NamedPart,
} from "../src/index.js";

const GRASS: [number, number, number] = [0.3, 0.5, 0.18];
const GRASS_DRY: [number, number, number] = [0.55, 0.55, 0.28];

const windPhase = 0.18; // radians; leans blades to fake a gust

/** One clump: N crossed cards fanned around the base with height/lean jitter. */
function buildClump(rng: Rng, base: [number, number, number]): Mesh {
  const blades = 4 + rng.int(0, 3);
  const cards: Mesh[] = [];
  for (let i = 0; i < blades; i++) {
    const h = rng.range(0.28, 0.5);
    const w = rng.range(0.06, 0.11);
    const ox = rng.range(-0.08, 0.08);
    const oz = rng.range(-0.08, 0.08);
    const lean = windPhase + rng.range(-0.15, 0.15);
    const yaw = rng.range(0, Math.PI);
    // A vertical cross-quad centred at half-height, then leaned + placed.
    let card = crossQuad(vec3(0, h / 2, 0), vec3(0, 0, 1), vec3(0, 1, 0), w, h);
    card = transform(card, {
      rotate: vec3(0, yaw, lean),
      translate: vec3(base[0] + ox, base[1], base[2] + oz),
    });
    cards.push(card);
  }
  return merge(...cards);
}

// Scatter clumps on a grid patch with jittered positions (seeded).
const CLUMPS = 24;
const PATCH = 3.0;
const parts: NamedPart[] = [];
const grassMeshes: Mesh[] = [];
const dryMeshes: Mesh[] = [];
const layout = makeRng(42);
for (let i = 0; i < CLUMPS; i++) {
  const x = layout.range(-PATCH / 2, PATCH / 2);
  const z = layout.range(-PATCH / 2, PATCH / 2);
  const clump = buildClump(makeRng(1000 + i * 5), [x, 0, z]);
  // Sprinkle ~1/4 of clumps as dry grass for colour variation.
  if (layout.next() < 0.25) dryMeshes.push(clump);
  else grassMeshes.push(clump);
}
parts.push({ name: "grass", mesh: computeNormals(merge(...grassMeshes), 60), color: GRASS });
if (dryMeshes.length > 0) {
  parts.push({ name: "grass_dry", mesh: computeNormals(merge(...dryMeshes), 60), color: GRASS_DRY });
}

const { obj, mtl } = toOBJScene(parts, "grass-clusters.mtl");
const model = toViewerModel(parts, "grass-clusters");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "grass-clusters.obj"), obj);
fs.writeFileSync(path.join(outDir, "grass-clusters.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "grass-clusters.json"), JSON.stringify(model));
const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) { try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { /* rebuild */ } }
const entry = { id: "grass-clusters", name: "草簇", file: "grass-clusters.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`grass clusters: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
