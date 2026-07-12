/**
 * Full procedural city district — road network + buildings.
 *
 * Combines the new parcel-subdivision road network (road-network.ts) with the
 * existing urban-building kit: cut a plot of land into blocks with streets,
 * inset each block to open the roads, then drop one style-matched building onto
 * every buildable block, aligned to the block's oriented bounding box.
 *
 * Everything is seed-driven and deterministic.
 *
 * Run: pnpm city-district-roadnet
 */
import {
  cityBlocks,
  parcelOBB,
  polygonCentroidXZ,
  buildUrbanBuildingParts,
  transform,
  merge,
  toOBJScene,
  toViewerModel,
  vec3,
  makeRng,
  type NamedPart,
  type UrbanStyle,
} from "../src/index.js";

// ---- 1. The land: a CONCAVE L-shaped plot (shows off non-convex slicing) ---
// The notch in the +X/+Z corner is a park / river bend the city wraps around.
const land = [
  vec3(-120, 0, -90),
  vec3(120, 0, -90),
  vec3(120, 0, 10),
  vec3(20, 0, 10),
  vec3(20, 0, 100),
  vec3(-120, 0, 100),
];

// ---- 2. Road network: cut land into blocks, filter slivers, sweep roads ----
const STREET_WIDTH = 9;
const { blocks, insetRings, streets, roadParts, baseMesh } = cityBlocks(land, {
  targetArea: 900,     // ~30x30 blocks
  minArea: 320,        // drop slivers (the tutorial's perimeter/area filter)
  minPerimeter: 70,
  streetWidth: STREET_WIDTH,
  sidewalkWidth: 2.2,
  splitJitter: 0.16,
  irregularity: 0.12,
  blockLift: 0.05,
  groundSlab: true,
  realRoads: true,     // sweep asphalt, markings, sidewalks and junctions
  roundabouts: true,
  roadCurveAmount: 2.0,
  streetTaper: 0.85,
  seed: 42,
});
console.log(`road network: ${blocks.length} blocks, ${streets.length} streets`);

// Road network gets separate materials so lane paint / sidewalks / curbs read.
const parts: NamedPart[] = [
  { name: "ground_blocks", mesh: baseMesh, color: [0.34, 0.4, 0.33] },
  { name: "road_asphalt", mesh: merge(roadParts.asphaltMesh, roadParts.intersectionMesh, roadParts.roundaboutMesh), color: [0.11, 0.11, 0.12] },
  { name: "road_markings", mesh: merge(roadParts.markingMesh, roadParts.crosswalkMesh), color: [0.9, 0.88, 0.76] },
  { name: "sidewalks", mesh: roadParts.sidewalkMesh, color: [0.55, 0.55, 0.53] },
  { name: "curbs", mesh: roadParts.curbMesh, color: [0.68, 0.68, 0.66] },
  { name: "roundabout_islands", mesh: roadParts.islandMesh, color: [0.24, 0.34, 0.18] },
];

// ---- 3. Pick a style per block by size, place aligned to block OBB --------
// Bigger blocks -> taller towers; small blocks -> low-rise walk-ups.
function styleForArea(area: number, r: () => number): UrbanStyle {
  if (area > 1400) return r() < 0.5 ? "glassTower" : "corporate";
  if (area > 800) return r() < 0.5 ? "modernOffice" : "artDeco";
  return r() < 0.5 ? "brickWalkup" : "brownstone";
}

const rng = makeRng(7);
blocks.forEach((block, i) => {
  const inset = insetRings[i]!;
  const obb = parcelOBB(inset);

  const r = rng.fork();
  const style = styleForArea(block.area, () => r.next());
  // Tiered skyline + footprint scaling: towers on big blocks don't fill the
  // whole parcel (they'd read as squat boxes), they take a slimmer footprint
  // and leave plaza space around them; low-rise fills most of its small block.
  // Bays stay coarse (3) so window tessellation doesn't blow up viewer JSON.
  let floors: number;
  let footprint: number; // fraction of the block the building footprint covers
  if (block.area > 1400) {
    floors = Math.round(r.range(24, 40));
    footprint = r.range(0.5, 0.65);
  } else if (block.area > 800) {
    floors = Math.round(r.range(10, 18));
    footprint = r.range(0.65, 0.8);
  } else {
    floors = Math.round(r.range(3, 6));
    footprint = r.range(0.8, 0.92);
  }
  const width = Math.max(4, obb.extU * footprint);
  const depth = Math.max(4, obb.extV * footprint);

  const bParts = buildUrbanBuildingParts({
    style,
    width,
    depth,
    floors: Math.max(2, floors),
    baysX: 3,
    baysZ: 3,
    seed: 100 + i,
  });

  const c = polygonCentroidXZ(inset);
  for (const bp of bParts) {
    const placed = transform(bp.mesh, {
      rotate: vec3(0, obb.angleY, 0),
      translate: vec3(c.x, 0, c.z),
    });
    parts.push({ ...bp, name: `block${i}_${style}_${bp.name}`, mesh: placed });
  }
});

// ---- 4. Export OBJ + viewer JSON ------------------------------------------
const { obj, mtl } = toOBJScene(parts, "city-district-roadnet.mtl");
const model = toViewerModel(parts, "city-district-roadnet");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "city-district-roadnet.obj"), obj);
fs.writeFileSync(path.join(outDir, "city-district-roadnet.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "city-district-roadnet.json"), JSON.stringify(model));

// ---- 5. Register in the web gallery manifest (out/models.json) ------------
// category "meshova" is what the gallery whitelist shows.
const manifestPath = path.join(outDir, "models.json");
let manifest: { models: any[] } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    manifest = { models: [] };
  }
}
if (!Array.isArray(manifest.models)) manifest.models = [];
const now = new Date().toISOString();
const entry = {
  id: "city-district-roadnet",
  name: "路网城区(路面+建筑)",
  file: "city-district-roadnet.json",
  category: "meshova",
};
const at = manifest.models.findIndex((m) => m && m.id === entry.id);
if (at >= 0) manifest.models[at] = { ...manifest.models[at], ...entry, updatedAt: now };
else manifest.models.push({ ...entry, createdAt: now, updatedAt: now });
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log(`wrote out/city-district-roadnet.obj (${parts.length} parts) + registered in gallery`);
