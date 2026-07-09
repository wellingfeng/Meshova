/**
 * Inline-4 piston engine — a complex kinematic assembly in the CADAM
 * "complex machines" spirit: a crankshaft with four throws phased 0/180/180/0,
 * connecting rods, pistons riding in a cylinder block, and a bolted head with
 * a valve-cover, all built from Meshova primitives + the mech kit.
 *
 * The pistons are placed at their true positions for the chosen crank angle, so
 * the assembly reads as a real slider-crank mechanism frozen mid-cycle rather
 * than four identical parts stacked in a row.
 *
 * Run: pnpm inline-engine
 */
import {
  cylinder,
  box,
  roundedBox,
  bolt,
  transform,
  translateMesh,
  merge,
  toOBJScene,
  toViewerModel,
  vec3,
  type NamedPart,
  type Mesh,
} from "../src/index.js";

const CYL = 4;
const BORE = 0.34;          // cylinder bore radius
const SPACING = 0.95;       // cylinder-to-cylinder pitch along X
const STROKE = 0.5;         // full piston travel
const CRANK_R = STROKE / 2; // crank throw radius
const ROD_LEN = 1.1;        // connecting-rod length (center to center)
const DECK = 1.3;           // cylinder-head deck height (piston TDC reference)
const CRANK_ANGLE = Math.PI * 0.35; // frozen crank angle for the whole engine

// Firing order phasing for an inline-4: crankpins at 0/180/180/0 degrees.
const PHASE = [0, Math.PI, Math.PI, 0];

const parts: NamedPart[] = [];
const blockMetal = { type: "brushedMetal", params: { color: [0.55, 0.56, 0.6] } };
const crankMetal = { type: "metal", params: { color: [0.72, 0.73, 0.76], roughness: 0.3 } };
const rodMetal = { type: "metal", params: { color: [0.66, 0.67, 0.7], roughness: 0.35 } };
const pistonMetal = { type: "metal", params: { color: [0.82, 0.6, 0.32], roughness: 0.3 } };
const headMetal = { type: "metal", params: { color: [0.48, 0.49, 0.53], roughness: 0.3 } };

const engineLen = SPACING * (CYL - 1);
const x0 = -engineLen / 2; // first cylinder X

// --- Cylinder block: a slab with four bores punched cosmetically as sleeves ---
const block = roundedBox({ width: engineLen + BORE * 2 + 0.3, height: 0.9, depth: BORE * 2 + 0.35, radius: 0.06, steps: 3 });
parts.push({ name: "engine_block", mesh: translateMesh(block, vec3(0, DECK * 0.5, 0)), surface: blockMetal });

// --- Crankshaft: a main journal rod along X, with throws (crankpins) offset ---
// Main shaft runs along X; build along +Y then rotate to lie on X.
const toX = (m: Mesh) => transform(m, { rotate: vec3(0, 0, Math.PI / 2) });
const mainShaft = toX(cylinder(0.09, engineLen + 0.6, 24, true));
parts.push({ name: "crank_main", mesh: mainShaft, surface: crankMetal });

for (let i = 0; i < CYL; i++) {
  const cx = x0 + i * SPACING;
  const theta = CRANK_ANGLE + PHASE[i]!;
  // Crankpin position in the YZ plane (crank rotates about X).
  const pinY = Math.cos(theta) * CRANK_R;
  const pinZ = Math.sin(theta) * CRANK_R;

  // Two crank webs (counterweight cheeks) flanking the pin.
  for (const off of [-0.11, 0.11]) {
    const web = translateMesh(box(0.07, CRANK_R * 2.4, 0.34), vec3(cx + off, pinY * 0.5, pinZ * 0.5));
    parts.push({ name: `crank_web_${i}_${off > 0 ? "b" : "a"}`, mesh: web, surface: crankMetal });
  }
  // Crankpin (journal the rod big-end wraps).
  const pin = translateMesh(toX(cylinder(0.07, 0.24, 20, true)), vec3(cx, pinY, pinZ));
  parts.push({ name: `crank_pin_${i}`, mesh: pin, surface: crankMetal });

  // --- Slider-crank: solve piston height and rod angle for this crank angle ---
  // Piston moves only along +Y; crankpin is at (pinY, pinZ). Rod length is fixed.
  const dz = pinZ; // horizontal offset the rod must span
  const rodDy = Math.sqrt(Math.max(0.0001, ROD_LEN * ROD_LEN - dz * dz));
  const pistonY = pinY + rodDy; // piston pin height above crank axis
  const pistonTop = DECK;       // deck reference
  const skirtY = Math.min(pistonY, pistonTop - 0.12);

  // Connecting rod: a beam from the crankpin to the piston pin. Orient it along
  // the pin->piston vector using two Euler-free steps (place then rotate in ZY).
  const rodAngle = Math.atan2(dz, rodDy); // tilt in the ZY plane about X
  const rodMid = vec3(cx, (pinY + pistonY) / 2, pinZ / 2);
  const rod = transform(box(0.11, ROD_LEN, 0.06), { rotate: vec3(rodAngle, 0, 0), translate: rodMid });
  parts.push({ name: `rod_${i}`, mesh: rod, surface: rodMetal });

  // Piston: a capped cylinder sliding in the bore, riding at its solved height.
  const piston = translateMesh(cylinder(BORE * 0.92, 0.3, 24, true), vec3(cx, skirtY, 0));
  parts.push({ name: `piston_${i}`, mesh: piston, surface: pistonMetal });

  // Wrist-pin boss (little link between rod small-end and piston).
  const wrist = translateMesh(toX(cylinder(0.05, 0.18, 16, true)), vec3(cx, pistonY, pinZ * 0));
  parts.push({ name: `wrist_pin_${i}`, mesh: wrist, surface: crankMetal });
}

// --- Cylinder head + valve cover on top of the deck ---
const head = roundedBox({ width: engineLen + BORE * 2 + 0.3, height: 0.22, depth: BORE * 2 + 0.35, radius: 0.04, steps: 2 });
parts.push({ name: "cylinder_head", mesh: translateMesh(head, vec3(0, DECK + 0.16, 0)), surface: headMetal });
const cover = roundedBox({ width: engineLen + 0.1, height: 0.16, depth: BORE * 1.4, radius: 0.05, steps: 2 });
parts.push({ name: "valve_cover", mesh: translateMesh(cover, vec3(0, DECK + 0.35, 0)), surface: { type: "metal", params: { color: [0.75, 0.2, 0.18], roughness: 0.25 } } });

// Head bolts down each side.
for (let i = 0; i <= CYL; i++) {
  const bx = x0 - SPACING * 0.5 + i * SPACING;
  for (const bz of [-(BORE + 0.12), BORE + 0.12]) {
    const b = transform(bolt({ radius: 0.035, length: 0.2, headAcrossFlats: 0.13, headHeight: 0.06 }), {
      translate: vec3(bx, DECK + 0.2, bz),
    });
    parts.push({ name: `head_bolt_${i}_${bz > 0 ? "b" : "a"}`, mesh: b, surface: { type: "metal", params: { color: [0.3, 0.31, 0.34], roughness: 0.4 } } });
  }
}

// --- Write out ------------------------------------------------------------
const { obj, mtl } = toOBJScene(parts, "mech-inline-engine.mtl");
const model = toViewerModel(parts, "mech-inline-engine");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "mech-inline-engine.obj"), obj);
fs.writeFileSync(path.join(outDir, "mech-inline-engine.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "mech-inline-engine.json"), JSON.stringify(model, null, 2));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { /* rebuild */ }
}
const entry = { id: "mech-inline-engine", name: "直列四缸活塞发动机", file: "mech-inline-engine.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const merged = merge(...parts.map((p) => p.mesh));
console.log(`inline-4 engine: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
console.log(`  merged: ${merged.positions.length} verts, crank angle ${(CRANK_ANGLE * 180 / Math.PI).toFixed(0)}deg`);
