/**
 * Terrain scenes — three distinct heightfield+rock builds that each lean on a
 * different corner of the terrain HDA, so the library shows the toolkit's range
 * rather than one recipe:
 *
 *   1. river-canyon   — fbm base + deep hydraulic erosion carves a gorge; a
 *                        winding river centreline is pressed flat (raise<0) to
 *                        cut the channel, then strata rocks line the banks.
 *   2. crater-atoll    — ring of crater stamps around a lagoon, thermal-slumped
 *                        into a reef; a closed loop road rims the caldera.
 *   3. boulder-coast   — gentle dunes with a hard tidal shelf plateau, dense
 *                        boulder + slab scatter above the waterline.
 *
 * All deterministic, re-runnable from seeds; no baked terrain.
 * Run: pnpm tsx examples/terrain-scenes.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  fbmHeightfield, stampHeightfield, thermalErode, hydraulicErode,
  flattenUnderCurve, heightfieldToMesh, sampleHeight, type Heightfield,
  archetypeRock, type RockArchetype, polyline, smoothCurve, transform, merge, vec3,
  toOBJScene, toViewerModel, makeRng, type NamedPart, type Mesh,
} from "../src/index.js";

const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });

interface SceneEntry { id: string; name: string; file: string; category?: string }
const entries: SceneEntry[] = [];

function writeScene(id: string, name: string, parts: NamedPart[]): void {
  const { obj, mtl } = toOBJScene(parts, `${id}.mtl`);
  const model = toViewerModel(parts, id);
  fs.writeFileSync(path.join(outDir, `${id}.obj`), obj);
  fs.writeFileSync(path.join(outDir, `${id}.mtl`), mtl);
  fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(model));
  entries.push({ id, name, file: `${id}.json`, category: "地形" });
  console.log(`${id}: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
}

/** Scatter archetype rocks that sit on the terrain, above an optional waterline. */
function scatterRocks(
  hf: Heightfield, count: number, seed: number, size: number,
  kinds: readonly RockArchetype[], radius: [number, number], minY = -Infinity,
): Mesh {
  const rng = makeRng(seed >>> 0);
  const meshes: Mesh[] = [];
  let tries = 0;
  while (meshes.length < count && tries < count * 6) {
    tries++;
    const x = rng.range(-size / 2 + 8, size / 2 - 8);
    const z = rng.range(-size / 2 + 8, size / 2 - 8);
    const y = sampleHeight(hf, x, z);
    if (y < minY) continue;
    const kind = kinds[rng.int(0, kinds.length - 1)]!;
    const r = rng.range(radius[0], radius[1]);
    let m = archetypeRock(kind, { seed: (seed + meshes.length * 131) >>> 0, radius: r, detail: 2 });
    m = transform(m, { rotate: vec3(0, rng.range(0, Math.PI * 2), 0), translate: vec3(x, y - r * 0.15, z) });
    meshes.push(m);
  }
  return merge(...meshes);
}

const ROCK: [number, number, number] = [0.46, 0.44, 0.41];

// ---------------------------------------------------------------------------
// 1. River canyon — hydraulic-carved gorge with a river channel cut in.
// ---------------------------------------------------------------------------
{
  const SIZE = 220;
  let hf = fbmHeightfield({ cols: 170, rows: 170, size: SIZE, amplitude: 34, featureScale: 62, ridged: 0.7, seed: 91 });
  // Deep water carving to dig valley networks, then thermal to soften cliffs.
  hf = hydraulicErode(hf, { iterations: 70, rain: 0.03, capacity: 0.35, solubility: 0.6, evaporation: 0.25 });
  hf = thermalErode(hf, { iterations: 25, talus: 1.1, strength: 0.5 });

  // A river snaking down the terrain; flatten with raise<0 to sink a channel.
  const raw = [];
  for (let i = 0; i <= 28; i++) {
    const t = i / 28;
    const x = (t - 0.5) * SIZE * 0.85;
    const z = Math.sin(t * Math.PI * 1.6) * 55 + Math.cos(t * Math.PI * 4) * 10;
    raw.push(vec3(x, sampleHeight(hf, x, z) - 4, z));
  }
  const river = smoothCurve(polyline(raw), 3);
  hf = flattenUnderCurve(hf, river, { width: 5, falloff: 20, raise: -2 });

  const ground = heightfieldToMesh(hf, { cusp: 52 });
  const rocks = scatterRocks(hf, 46, 301, SIZE, ["strata", "slab", "eroded"], [1.6, 4.5]);
  writeScene("terrain-river-canyon", "地形：河谷峡湾", [
    { name: "canyon", mesh: ground, color: [0.4, 0.33, 0.24] },
    { name: "bank_rocks", mesh: rocks, color: [0.4, 0.4, 0.38] },
  ]);
}

// ---------------------------------------------------------------------------
// 2. Crater atoll — ring of craters around a lagoon, closed rim road.
// ---------------------------------------------------------------------------
{
  const SIZE = 200;
  let hf = fbmHeightfield({ cols: 150, rows: 150, size: SIZE, amplitude: 10, featureScale: 90, ridged: 0.2, seed: 44 });
  // Ring of crater + dome stamps forming an atoll rim around a central lagoon.
  const ringN = 8;
  const stamps = [];
  for (let i = 0; i < ringN; i++) {
    const a = (i / ringN) * Math.PI * 2;
    stamps.push({ x: Math.cos(a) * 55, z: Math.sin(a) * 55, radius: 34, height: 26, shape: "dome" as const });
  }
  stamps.push({ x: 0, z: 0, radius: 60, height: -18, shape: "crater" as const });
  hf = stampHeightfield(hf, stamps);
  hf = thermalErode(hf, { iterations: 35, talus: 0.9, strength: 0.5 });

  // Closed loop road riding the atoll rim.
  const rim = [];
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const x = Math.cos(a) * 55, z = Math.sin(a) * 55;
    rim.push(vec3(x, sampleHeight(hf, x, z) + 1, z));
  }
  const loop = smoothCurve(polyline(rim, true), 2);
  hf = flattenUnderCurve(hf, loop, { width: 4, falloff: 10, raise: 0.5 });

  const ground = heightfieldToMesh(hf, { cusp: 58 });
  const rocks = scatterRocks(hf, 34, 402, SIZE, ["boulder", "spire", "eroded"], [1.4, 3.6], 4);
  writeScene("terrain-crater-atoll", "地形：环形火山礁湖", [
    { name: "atoll", mesh: ground, color: [0.35, 0.4, 0.3] },
    { name: "reef_rocks", mesh: rocks, color: ROCK },
  ]);
}

// ---------------------------------------------------------------------------
// 3. Boulder coast — dunes + tidal shelf plateau, dense boulder scatter.
// ---------------------------------------------------------------------------
{
  const SIZE = 200;
  let hf = fbmHeightfield({ cols: 150, rows: 150, size: SIZE, amplitude: 14, featureScale: 48, ridged: 0.15, seed: 63 });
  // A broad tidal shelf plateau on one side, a low headland dome on the other.
  hf = stampHeightfield(hf, [
    { x: 45, z: 0, radius: 90, height: 8, shape: "plateau" },
    { x: -55, z: -40, radius: 42, height: 18, shape: "dome" },
  ]);
  hf = hydraulicErode(hf, { iterations: 30, rain: 0.02, evaporation: 0.35 });
  hf = thermalErode(hf, { iterations: 20, talus: 1.0, strength: 0.4 });

  const ground = heightfieldToMesh(hf, { cusp: 60 });
  // Dense boulder + slab field above the tide line (minY gates the beach).
  const rocks = scatterRocks(hf, 60, 503, SIZE, ["boulder", "slab", "strata"], [1.2, 3.8], 3);
  writeScene("terrain-boulder-coast", "地形：巨石海岸", [
    { name: "coast", mesh: ground, color: [0.62, 0.57, 0.44] },
    { name: "boulders", mesh: rocks, color: [0.48, 0.46, 0.43] },
  ]);
}

// ---------------------------------------------------------------------------
// Register all scenes into the viewer manifest.
// ---------------------------------------------------------------------------
const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string; category?: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) { try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { /* rebuild */ } }
for (const e of entries) {
  manifest.models = manifest.models.filter((m) => m.id !== e.id);
  manifest.models.push(e);
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`registered ${entries.length} scenes into out/models.json`);
