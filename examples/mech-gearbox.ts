/**
 * Mechanical parts kit demo — a bolted gear plate: a flange base with a bolt-
 * hole ring, two meshing spur gears on posts, and hex bolts around the rim.
 * Shows the hard-surface "assemble parametric parts + boolean" workflow that
 * mirrors CADAM/OpenSCAD but stays in Meshova's TS kernel with matched PBR.
 *
 * Run: pnpm mech
 */
import {
  gear,
  bolt,
  hexNut,
  flange,
  boltHoleCircle,
  transform,
  translateMesh,
  merge,
  toOBJScene,
  toViewerModel,
  vec3,
  type NamedPart,
} from "../src/index.js";

const parts: NamedPart[] = [];

// Base plate: a flange disk with 8 bolt holes.
const base = flange({ radius: 1.4, thickness: 0.18, boreRadius: 0.35, boltHoles: 8, boltHoleRadius: 0.09, boltCircleRadius: 1.1 });
parts.push({ name: "base_plate", mesh: base, surface: { type: "brushedMetal", params: { color: [0.55, 0.57, 0.6] } } });

// Two meshing spur gears standing on the plate (lay them flat: rotate 90° about X).
const gearA = transform(gear({ teeth: 24, module: 0.06, thickness: 0.16, boreRadius: 0.12 }), {
  rotate: vec3(Math.PI / 2, 0, 0),
  translate: vec3(-0.42, 0.28, 0),
});
const gearB = transform(gear({ teeth: 16, module: 0.06, thickness: 0.16, boreRadius: 0.1 }), {
  rotate: vec3(Math.PI / 2, 0, 0),
  translate: vec3(0.46, 0.28, 0),
});
parts.push({ name: "gear_large", mesh: gearA, surface: { type: "metal", params: { color: [0.8, 0.78, 0.72], roughness: 0.35 } } });
parts.push({ name: "gear_small", mesh: gearB, surface: { type: "metal", params: { color: [0.82, 0.6, 0.35], roughness: 0.3 } } });

// Hex bolts around the bolt-hole circle, heads up.
const boltCenters = boltHoleCircle(8, 1.1, 0);
boltCenters.forEach((c, i) => {
  const b = transform(bolt({ radius: 0.07, length: 0.34, headAcrossFlats: 0.22, headHeight: 0.1 }), {
    translate: vec3(c.x, 0.17, c.z),
  });
  parts.push({ name: `bolt_${i}`, mesh: b, surface: { type: "metal", params: { color: [0.3, 0.31, 0.33], roughness: 0.4 } } });
});

// A hex nut sitting on the central bore.
const nut = translateMesh(hexNut({ acrossFlats: 0.5, height: 0.2, boreRadius: 0.16 }), vec3(0, 0.19, 0));
parts.push({ name: "center_nut", mesh: nut, surface: { type: "brushedMetal", params: { color: [0.5, 0.5, 0.52] } } });

const { obj, mtl } = toOBJScene(parts, "mech-gearbox.mtl");
const model = toViewerModel(parts, "mech-gearbox");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "mech-gearbox.obj"), obj);
fs.writeFileSync(path.join(outDir, "mech-gearbox.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "mech-gearbox.json"), JSON.stringify(model, null, 2));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { /* rebuild */ }
}
const entry = { id: "mech-gearbox", name: "机械齿轮法兰组件", file: "mech-gearbox.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const merged = merge(...parts.map((p) => p.mesh));
console.log(`mech gearbox: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
console.log(`merged: ${merged.positions.length} verts`);
