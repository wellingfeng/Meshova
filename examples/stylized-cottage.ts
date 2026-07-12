/**
 * Stylized cottage — a procedural rebuild of the UE "Project Skylark" toon look,
 * material-first. Simple blocked-out house geometry dressed entirely in the new
 * stylized surfaces: painter-vertex walls, cel roof tiles, plaster base, toon
 * metal chimney, toon foliage. All the "hand-painted" light is baked into the
 * texture fields — no shader changes, standard MeshPhysicalMaterial path.
 *
 * Run: pnpm tsx examples/stylized-cottage.ts
 */
import {
  box,
  cone,
  cylinder,
  translateMesh,
  scaleMesh,
  vec3,
  toViewerModel,
  type NamedPart,
} from "../src/index.js";

const parts: NamedPart[] = [];

// plaster base plinth
parts.push({
  name: "base",
  mesh: translateMesh(box(2.6, 0.4, 2.2), vec3(0, 0.2, 0)),
  surface: { type: "stylizedPlaster", params: { color: [0.78, 0.74, 0.66] } },
});

// main wall body — the flagship painter-vertex toon color
parts.push({
  name: "walls",
  mesh: translateMesh(box(2.4, 1.6, 2.0), vec3(0, 1.2, 0)),
  surface: { type: "painterVertex", params: { color: [0.86, 0.62, 0.32], bands: 3, shadow: 0.5 } },
});

// hipped roof — cel-shaded curved tiles
parts.push({
  name: "roof",
  mesh: translateMesh(cone(1.9, 1.1, 4, true), vec3(0, 2.55, 0)),
  surface: { type: "stylizedRoof", params: { color: [0.6, 0.24, 0.18], rows: 8 } },
});

// chimney — toon metal
parts.push({
  name: "chimney",
  mesh: translateMesh(box(0.34, 0.9, 0.34), vec3(0.7, 2.7, 0.4)),
  surface: { type: "stylizedMetal", params: { color: [0.5, 0.52, 0.58], bands: 3 } },
});

// door — brush-painted accent
parts.push({
  name: "door",
  mesh: translateMesh(box(0.55, 1.0, 0.08), vec3(0, 0.9, 1.01)),
  surface: { type: "brushPainted", params: { color: [0.3, 0.42, 0.55], bands: 2 } },
});

// two shrubs — toon foliage blobs
for (let i = 0; i < 2; i++) {
  const x = i === 0 ? -1.5 : 1.5;
  parts.push({
    name: `shrub_${i}`,
    mesh: translateMesh(scaleMesh(cone(0.5, 0.9, 12, true), vec3(1, 1, 1)), vec3(x, 0.45, 1.0)),
    surface: { type: "stylizedFoliage", params: { color: [0.26, 0.48, 0.2], bands: 3, seed: 21 + i } },
  });
}

const model = toViewerModel(parts, "stylized-cottage");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "stylized-cottage.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: { id: string; name: string; file: string }[] } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch {}
}
const entry = { id: "stylized-cottage", name: "卡通小屋", file: "stylized-cottage.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`stylized-cottage: ${model.meta.verts} verts, ${parts.length} parts -> out/stylized-cottage.json`);

