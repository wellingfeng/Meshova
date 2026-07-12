/**
 * Ruin sites — composite scenes that assemble the parametric architecture
 * generators (archway / column / pavilion / bridgeWall) onto eroded terrain
 * with scattered archetype rocks. Shows the toolkit's modules composing into a
 * finished, re-runnable scene rather than isolated parts:
 *
 *   1. hilltop-temple — a domed pavilion on a flattened hilltop pad, ringed by
 *                       fallen/standing column stumps and an entrance archway,
 *                       eroded boulders scattered on the slopes.
 *   2. bridge-gate    — a gorge spanned by a balustrade bridge run leading to a
 *                       pointed gate archway flanked by columns.
 *
 * Deterministic (seeded), immutable at the mesh boundary, no baked geometry.
 * Run: pnpm tsx examples/ruin-sites.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  fbmHeightfield, stampHeightfield, thermalErode, hydraulicErode,
  flattenUnderCurve, heightfieldToMesh, sampleHeight, type Heightfield,
  archetypeRock, type RockArchetype, polyline, smoothCurve,
  archway, column, pavilion, bridgeWall,
  transform, merge, vec3, makeRng, toOBJScene, toViewerModel,
  type NamedPart, type Mesh,
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
  entries.push({ id, name, file: `${id}.json`, category: "建筑" });
  console.log(`${id}: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
}

/** Sit a mesh on the terrain at world XZ, with optional Y rotation + sink. */
function place(hf: Heightfield, m: Mesh, x: number, z: number, ry = 0, sink = 0): Mesh {
  const y = sampleHeight(hf, x, z) - sink;
  return transform(m, { rotate: vec3(0, ry, 0), translate: vec3(x, y, z) });
}

function meshMinY(mesh: Mesh): number {
  let minY = Infinity;
  for (const position of mesh.positions) minY = Math.min(minY, position.y);
  return Number.isFinite(minY) ? minY : 0;
}

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
    const groundOffset = y - meshMinY(m) - r * 0.12;
    m = transform(m, { rotate: vec3(0, rng.range(0, Math.PI * 2), 0), translate: vec3(x, groundOffset, z) });
    meshes.push(m);
  }
  return merge(...meshes);
}

const STONE: [number, number, number] = [0.72, 0.69, 0.62];
const ROCK: [number, number, number] = [0.46, 0.44, 0.41];

// ---------------------------------------------------------------------------
// 1. Hilltop temple — domed pavilion on a flattened hill, ringed by columns.
// ---------------------------------------------------------------------------
{
  const SIZE = 160;
  let hf = fbmHeightfield({ cols: 150, rows: 150, size: SIZE, amplitude: 16, featureScale: 60, ridged: 0.35, seed: 12 });
  hf = stampHeightfield(hf, [{ x: 0, z: 0, radius: 55, height: 30, shape: "dome" }]);
  hf = thermalErode(hf, { iterations: 30, talus: 1.0, strength: 0.5 });
  hf = hydraulicErode(hf, { iterations: 25, rain: 0.02, evaporation: 0.3 });

  // Flatten a circular pad at the summit for the temple footprint.
  const padPts = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    padPts.push(vec3(Math.cos(a) * 16, sampleHeight(hf, 0, 0), Math.sin(a) * 16));
  }
  hf = flattenUnderCurve(hf, polyline(padPts, true), { width: 16, falloff: 10, raise: 0.5 });
  const padY = sampleHeight(hf, 0, 0);

  const ground = heightfieldToMesh(hf, { cusp: 55 });

  // Temple: domed pavilion at centre + entrance archway + ring of columns,
  // some standing, some toppled (rotated flat) for a ruined read.
  const structs: Mesh[] = [];
  structs.push(transform(pavilion({ size: 6, columnHeight: 5, columnRadius: 0.4, columnsPerSide: 3, roof: "dome", roofRise: 3.2, platform: true }),
    { translate: vec3(0, padY, 0) }));
  structs.push(place(hf, archway({ span: 3, pierHeight: 3.5, archStyle: "round", keystone: true }), 0, 12, 0));

  const rng = makeRng(88);
  const colTemplate = column({ height: 4.5, radius: 0.35, flutes: 12, fluteDepth: 0.06 });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const x = Math.cos(a) * 11, z = Math.sin(a) * 11;
    const toppled = rng.next() < 0.35;
    if (toppled) {
      // Lay the column on its side and half-bury it.
      structs.push(place(hf, transform(colTemplate, { rotate: vec3(Math.PI / 2, a, 0) }), x, z, 0, -0.4));
    } else {
      structs.push(place(hf, colTemplate, x, z, 0));
    }
  }
  const stone = merge(...structs);
  const rocks = scatterRocks(hf, 28, 121, SIZE, ["boulder", "eroded", "slab"], [1.2, 3.2], padY - 12);

  writeScene("ruin-hilltop-temple", "废墟：山顶神殿", [
    { name: "terrain", mesh: ground, color: [0.42, 0.36, 0.26] },
    { name: "temple", mesh: stone, color: STONE },
    { name: "rubble", mesh: rocks, color: ROCK },
  ]);
}

// ---------------------------------------------------------------------------
// 2. Bridge gate — gorge crossing to a pointed gate archway.
// ---------------------------------------------------------------------------
{
  const SIZE = 180;
  let hf = fbmHeightfield({ cols: 160, rows: 160, size: SIZE, amplitude: 30, featureScale: 55, ridged: 0.6, seed: 34 });
  hf = hydraulicErode(hf, { iterations: 55, rain: 0.03, capacity: 0.35, solubility: 0.6, evaporation: 0.25 });
  hf = thermalErode(hf, { iterations: 20, talus: 1.1, strength: 0.5 });

  // Cut a gorge straight across the middle (X axis) via a sunk channel.
  const gorge = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const x = (t - 0.5) * SIZE * 0.9;
    gorge.push(vec3(x, sampleHeight(hf, x, 0) - 12, 0));
  }
  hf = flattenUnderCurve(hf, smoothCurve(polyline(gorge), 2), { width: 8, falloff: 22, raise: -6 });

  const ground = heightfieldToMesh(hf, { cusp: 52 });

  // A bridge deck + balustrade walls spanning the gorge along Z, at deck level.
  const deckY = Math.max(sampleHeight(hf, 0, -30), sampleHeight(hf, 0, 30)) - 2;
  const structs: Mesh[] = [];
  const spanLen = 60;
  // Deck slab.
  structs.push(transform(
    transform(bridgeWall({ length: spanLen, height: 0.6, thickness: 6, style: "solid", coping: false }), { rotate: vec3(0, Math.PI / 2, 0) }),
    { translate: vec3(0, deckY, 0) }));
  // Two balustrade parapets flanking the deck.
  for (const side of [-1, 1] as const) {
    structs.push(transform(
      transform(bridgeWall({ length: spanLen, height: 1.4, thickness: 0.4, openings: 9, style: "baluster" }), { rotate: vec3(0, Math.PI / 2, 0) }),
      { translate: vec3(side * 2.8, deckY + 0.6, 0) }));
  }
  // Pointed gate archway at the far end, flanked by two columns.
  structs.push(transform(archway({ span: 4, pierHeight: 5, pierWidth: 0.8, depth: 1.2, archStyle: "pointed", keystone: true }),
    { translate: vec3(0, deckY + 0.6, spanLen / 2 + 2) }));
  const gateCol = column({ height: 6, radius: 0.45, flutes: 16, fluteDepth: 0.07 });
  for (const side of [-1, 1] as const) {
    structs.push(transform(gateCol, { translate: vec3(side * 4.5, deckY + 0.6, spanLen / 2 + 2) }));
  }
  const stone = merge(...structs);
  const rocks = scatterRocks(hf, 34, 234, SIZE, ["strata", "slab", "spire"], [1.4, 4], deckY - 20);

  writeScene("ruin-bridge-gate", "废墟：峡谷桥门", [
    { name: "terrain", mesh: ground, color: [0.38, 0.32, 0.24] },
    { name: "bridge", mesh: stone, color: STONE },
    { name: "rocks", mesh: rocks, color: ROCK },
  ]);
}

// ---------------------------------------------------------------------------
// Register scenes into the viewer manifest.
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
