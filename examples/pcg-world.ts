/**
 * PCG overworld — a 3D take on the reference Cocos PCG tile map.
 *
 * Pipeline: fbm heightfield (existing terrain core) -> discrete biome
 * classification by elevation thresholds -> best-candidate blue-noise resource
 * scatter on land -> colored 3D mesh + resource markers for the viewer.
 *
 * Run: pnpm tsx examples/pcg-world.ts
 */
import {
  buildTerrainField,
  classifyBiomes,
  overworldBiomeTable,
  scatterPointsOnField,
  box,
  translateMesh,
  merge,
  toOBJScene,
  toViewerModel,
  type NamedPart,
} from "../src/index.js";
import { vec3 } from "../src/math/vec3.js";

const SIZE = 12;
const RESOLUTION = 128;
const SEED = 7;

// 1. Heightfield + derived masks (slope/water) from the terrain core.
const terrain = buildTerrainField({
  size: SIZE,
  resolution: RESOLUTION,
  seed: SEED,
  height: 2.9,
  noiseScale: 1.05,
  ridgeStrength: 0.28,
  islandFalloff: 2.3,
  terraceStrength: 0.82,
  terraceSteps: 11,
  iterations: 3,
  waterLevel: 0.3,
  shoreWidth: 0.04,
});

// 2. Discrete biome classification (highest-threshold-first table walk).
const table = overworldBiomeTable();
const biomes = classifyBiomes(terrain.height, table, {
  water: terrain.masks.water,
  slope: terrain.masks.slope,
});

// 3. Recolor the terrain mesh with discrete biome colors (row-major, matches
//    the mesh vertex order emitted by heightfieldToTerrainMesh).
const W = terrain.height.width;
const H = terrain.height.height;
const half = SIZE * 0.5;

const terrainPart: NamedPart = {
  name: "terrain",
  label: "地形",
  mesh: terrain.mesh,
  colors: biomes.colors.slice(),
};

// 4. Best-candidate blue-noise resource scatter, kept on land only.
const resourcePoints = scatterPointsOnField(terrain.masks.water, {
  width: W,
  height: H,
  count: 30,
  seed: SEED + 500,
  accept: (water) => water < 0.4,
});

const markerMeshes = resourcePoints.map((p) => {
  const tx = p.x / (W - 1);
  const tz = p.y / (H - 1);
  const wx = -half + tx * SIZE;
  const wz = -half + tz * SIZE;
  // Sample terrain height at the nearest cell for grounding.
  const gx = Math.min(W - 1, Math.max(0, Math.round(p.x)));
  const gy = Math.min(H - 1, Math.max(0, Math.round(p.y)));
  const wy = terrain.height.data[gy * W + gx]! + 0.09;
  return translateMesh(box(0.1, 0.18, 0.1), vec3(wx, wy, wz));
});

const parts: NamedPart[] = [terrainPart];
if (markerMeshes.length > 0) {
  parts.push({
    name: "resources",
    label: "资源点",
    mesh: markerMeshes.length === 1 ? markerMeshes[0]! : merge(...markerMeshes),
    color: [0.82, 0.72, 0.95],
  });
}

// 5. Export OBJ + viewer JSON + manifest entry.
const { obj, mtl } = toOBJScene(parts, "pcg-world.mtl");
const model = toViewerModel(parts, "pcg-world");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "pcg-world.obj"), obj);
fs.writeFileSync(path.join(outDir, "pcg-world.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "pcg-world.json"), JSON.stringify(model, null, 2));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "pcg-world", name: "PCG 生物群系世界", file: "pcg-world.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`pcg world: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
console.log(`biome histogram:`, biomes.histogram);
console.log(`resource points placed: ${resourcePoints.length}`);
console.log("written: out/pcg-world.{obj,mtl,json} + out/models.json");
