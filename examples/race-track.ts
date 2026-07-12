/**
 * Race track — a closed rally circuit driven entirely by a centreline curve.
 * Distilled from the Houdini "Procedural Race Tracks" pattern (curve -> banked
 * sweep -> prop instancing), reimplemented from scratch on Meshova's kernel:
 *
 *   - trackSurface with auto-bank so corners lean, plus coving skirts flaring
 *     down to the ground (no floating road edge).
 *   - guard rails: a thin box profile instanced densely along each road edge.
 *   - road cones: small cone/leg props instanced sparsely on one shoulder.
 *
 * Everything is a re-runnable build from the same closed curve; nothing baked.
 *
 * Run: pnpm tsx examples/race-track.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  polyline, smoothCurve, trackSurface, instanceAlongCurve,
  box, cone, merge, transform, vec3,
  toOBJScene, toViewerModel, type NamedPart, type Mesh,
} from "../src/index.js";

const ASPHALT: [number, number, number] = [0.12, 0.12, 0.13];
const RAIL: [number, number, number] = [0.72, 0.72, 0.75];
const CONE: [number, number, number] = [0.86, 0.32, 0.08];

// Centreline: a closed "peanut" circuit with two hairpins and a long straight,
// so the auto-bank has real corners to lean into. Sampled parametrically, then
// smoothed so the road flows instead of faceting at each control point.
function circuit(): { points: ReturnType<typeof vec3>[]; closed: boolean } {
  const pts = [];
  const n = 48;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    // Lemniscate-ish loop scaled out to a drivable size.
    const r = 30 + 10 * Math.cos(t * 2);
    const x = Math.cos(t) * r;
    const z = Math.sin(t) * (r * 0.65);
    pts.push(vec3(x, 0, z));
  }
  return polyline(pts, true);
}

const bank = { factor: 1.2, maxAngle: 0.45, smooth: 3 };
const center = smoothCurve(circuit(), 4);

// Road surface: 5-wide half-width strip, coving skirt 2.5 long dropping 1.2.
const road = trackSurface(center, {
  width: 5,
  coving: 2.5,
  covingDrop: 1.2,
  bank,
});

// Guard rails: a stubby upright box stamped every 3 units on each edge (offset
// ±(width + a margin)), riding the banked sideways axis so it hugs corners.
const railPost: Mesh = box(0.4, 1.2, 0.4);
const railProfile: Mesh = box(3.0, 0.25, 0.4); // horizontal beam segment
const railSeg = merge(railPost, transform(railProfile, { translate: vec3(0, 0.9, 0) }));
const railL = instanceAlongCurve(center, railSeg, { spacing: 3, offset: 6.5, bank });
const railR = instanceAlongCurve(center, railSeg, { spacing: 3, offset: -6.5, bank });

// Road cones: little markers dotted along the inner shoulder, sparser spacing.
const coneMesh: Mesh = merge(
  box(0.5, 0.08, 0.5),                                  // base
  transform(cone(0.24, 0.7, 12), { translate: vec3(0, 0.4, 0) }), // body
);
const cones = instanceAlongCurve(center, coneMesh, {
  spacing: 8,
  offset: 4.6,
  endsOffset: 0,
  bank,
});

const parts: NamedPart[] = [
  { name: "road", mesh: road, color: ASPHALT },
  { name: "rail_left", mesh: railL, color: RAIL },
  { name: "rail_right", mesh: railR, color: RAIL },
  { name: "cones", mesh: cones, color: CONE },
];

const { obj, mtl } = toOBJScene(parts, "race-track.mtl");
const model = toViewerModel(parts, "race-track");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "race-track.obj"), obj);
fs.writeFileSync(path.join(outDir, "race-track.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "race-track.json"), JSON.stringify(model));
const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string; category?: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) { try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { /* rebuild */ } }
const entry = { id: "race-track", name: "赛道", file: "race-track.json", category: "meshova" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`race-track: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);

