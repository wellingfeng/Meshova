/**
 * Windmill — a stone tower (lathe) with radially arrayed sail blades.
 *
 * Skylark's SM_Windmill_Base + SM_Windmill_Top + BP_Windmill: a tapered tower
 * body, a cap, and N sails copied around the hub axis. Meshova builds the same
 * from a revolved silhouette (tower taper) + a loop that rotates one blade
 * around +Z into a fan. `bladeAngle` spins the whole rotor — the animatable
 * parameter an AI loop or a viewer slider would drive.
 *
 * Run: pnpm tsx examples/windmill.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  lathe,
  box,
  cone,
  cylinder,
  transform,
  merge,
  computeNormals,
  vec2,
  vec3,
  toOBJScene,
  toViewerModel,
  type NamedPart,
} from "../src/index.js";

const STONE: [number, number, number] = [0.62, 0.6, 0.55];
const ROOF: [number, number, number] = [0.45, 0.22, 0.18];
const WOOD: [number, number, number] = [0.5, 0.34, 0.2];
const SAIL: [number, number, number] = [0.82, 0.78, 0.66];

const BLADES = 4;
const BLADE_LEN = 1.6;
const bladeAngle = 0.35; // radians; spins the whole rotor
const parts: NamedPart[] = [];

// 1) Tower: a tapered silhouette revolved around Y (wide base -> narrow top).
const towerProfile = [
  vec2(0, 0), vec2(0.85, 0), vec2(0.78, 0.6), vec2(0.62, 1.6),
  vec2(0.55, 2.2), vec2(0.58, 2.25), vec2(0, 2.25),
];
const tower = computeNormals(lathe(towerProfile, { segments: 40 }), 40);
parts.push({ name: "tower", mesh: tower, color: STONE });

// 2) Conical roof cap sitting on the tower top.
const roof = transform(computeNormals(cone(0.72, 0.7, 32), 40), { translate: vec3(0, 2.25, 0) });
parts.push({ name: "roof", mesh: roof, color: ROOF });

// 3) Hub: a short cylinder poking out the front (+Z) where blades mount.
const hub = transform(computeNormals(cylinder(0.14, 0.3, 16), 40), {
  rotate: vec3(Math.PI / 2, 0, 0),
  translate: vec3(0, 1.95, 0.62),
});
parts.push({ name: "hub", mesh: hub, color: WOOD });

// 4) Blades: one sail (spar + canvas) rotated around +Z into a radial fan.
const bladeMeshes = [];
for (let i = 0; i < BLADES; i++) {
  const a = bladeAngle + (i / BLADES) * Math.PI * 2;
  const spar = box(0.06, BLADE_LEN, 0.06);
  const canvas = transform(box(0.34, BLADE_LEN * 0.82, 0.02), { translate: vec3(0.24, 0, 0) });
  // Blade authored pointing +Y from origin; shift so root sits at hub, then rotate about Z.
  const blade = transform(merge(spar, canvas), { translate: vec3(0, BLADE_LEN / 2, 0) });
  const placed = transform(blade, { rotate: vec3(0, 0, a), translate: vec3(0, 1.95, 0.78) });
  bladeMeshes.push(placed);
}
parts.push({ name: "sails", mesh: computeNormals(merge(...bladeMeshes), 40), color: SAIL });

const { obj, mtl } = toOBJScene(parts, "windmill.mtl");
const model = toViewerModel(parts, "windmill");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "windmill.obj"), obj);
fs.writeFileSync(path.join(outDir, "windmill.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "windmill.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { /* rebuild */ }
}
const entry = { id: "windmill", name: "风车", file: "windmill.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`windmill: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
