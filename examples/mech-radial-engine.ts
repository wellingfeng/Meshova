/**
 * 9-cylinder radial aircraft engine — assembled purely from Meshova's own
 * mechanical parts kit + primitives (no external CAD source). A central round
 * crankcase, nine finned cylinders in a star pattern, domed heads, and a front
 * propeller-shaft hub.
 *
 * Run: pnpm radial-engine
 */
import {
  cylinder,
  sphere,
  boredPrism,
  regularPolygon,
  hexNut,
  transform,
  translateMesh,
  merge,
  toOBJScene,
  toViewerModel,
  vec3,
  type NamedPart,
  type Mesh,
} from "../src/index.js";

const parts: NamedPart[] = [];
const CYL = 9;                 // cylinders in the star
const CRANK_R = 0.9;           // crankcase radius
const CYL_LEN = 1.3;           // cylinder barrel length (radial reach)
const CYL_R = 0.28;            // cylinder bore radius
const FIN_COUNT = 7;           // cooling fins per cylinder

const engineMetal = { type: "brushedMetal", params: { color: [0.62, 0.63, 0.66] } };
const finMetal = { type: "metal", params: { color: [0.7, 0.71, 0.73], roughness: 0.4 } };
const headMetal = { type: "metal", params: { color: [0.5, 0.51, 0.55], roughness: 0.3 } };
const hubMetal = { type: "metal", params: { color: [0.35, 0.36, 0.4], roughness: 0.35 } };

// Engine axis is +Z (propeller axis, faces the camera). Parts are built along
// +Y then tipped so their axis lies along Z; cylinders then spin about Z to
// radiate in the XY plane like a real radial star.
const toZ = (m: Mesh) => transform(m, { rotate: vec3(Math.PI / 2, 0, 0) });

// Crankcase: a central drum (round prism) with a bored center, axis along Z.
const crankcase = toZ(boredPrism(regularPolygon(48, CRANK_R, false), 0.55, 0.32, 32));
parts.push({ name: "crankcase", mesh: crankcase, surface: engineMetal });

// A cover ring on the front face (+Z) for detail.
const coverRing = translateMesh(toZ(boredPrism(regularPolygon(48, CRANK_R * 0.7, false), 0.12, CRANK_R * 0.45, 32)), vec3(0, 0, 0.33));
parts.push({ name: "front_cover", mesh: coverRing, surface: headMetal });

/** Build one finned cylinder pointing along +X, to be rotated into the star. */
function buildCylinder(): { barrel: Mesh; fins: Mesh; head: Mesh } {
  // Barrel runs along Y then we tip it to point radially; base at crankcase.
  const barrel = cylinder(CYL_R, CYL_LEN, 24, true);
  // Cooling fins: thin discs stacked up the barrel.
  const finMeshes: Mesh[] = [];
  for (let i = 0; i < FIN_COUNT; i++) {
    const t = (i + 0.5) / FIN_COUNT;
    const y = -CYL_LEN / 2 + t * CYL_LEN * 0.82;
    const fin = translateMesh(cylinder(CYL_R * 1.7, 0.045, 24, true), vec3(0, y, 0));
    finMeshes.push(fin);
  }
  const fins = merge(...finMeshes);
  // Domed head at the outer end + a valve-cover bump.
  const dome = translateMesh(sphere(CYL_R * 1.15, 20, 14), vec3(0, CYL_LEN / 2 + 0.05, 0));
  const valve = translateMesh(cylinder(CYL_R * 0.4, 0.22, 16, true), vec3(CYL_R * 0.7, CYL_LEN / 2 + 0.12, 0));
  const head = merge(dome, valve);
  return { barrel, fins, head };
}

// Place nine cylinders evenly around the crankcase, pointing outward in the XZ
// plane (spin about Z so the barrel's +Y axis aims radially).
for (let i = 0; i < CYL; i++) {
  const ang = (i / CYL) * Math.PI * 2;
  const { barrel, fins, head } = buildCylinder();
  // Lift the barrel outward along +Y so its base sits on the crankcase rim,
  // then spin about Z by `ang` so it radiates in the XY plane (engine axis = Z).
  const radialLift = (m: Mesh) => translateMesh(m, vec3(0, CRANK_R + CYL_LEN / 2 - 0.15, 0));
  const orient = (m: Mesh) => transform(m, { rotate: vec3(0, 0, ang) });
  parts.push({ name: `cyl_${i}_barrel`, mesh: orient(radialLift(barrel)), surface: engineMetal });
  parts.push({ name: `cyl_${i}_fins`, mesh: orient(radialLift(fins)), surface: finMetal });
  parts.push({ name: `cyl_${i}_head`, mesh: orient(radialLift(head)), surface: headMetal });
}

// Propeller shaft hub at the front (+Z): a stepped stack of discs + shaft.
const hubBase = translateMesh(toZ(cylinder(0.4, 0.18, 32, true)), vec3(0, 0, 0.42));
const hubMid = translateMesh(toZ(cylinder(0.26, 0.16, 32, true)), vec3(0, 0, 0.56));
const shaft = translateMesh(toZ(cylinder(0.12, 0.5, 24, true)), vec3(0, 0, 0.85));
const shaftNut = translateMesh(toZ(hexNut({ acrossFlats: 0.3, height: 0.12, boreRadius: 0 })), vec3(0, 0, 1.08));
parts.push({ name: "hub_base", mesh: hubBase, surface: hubMetal });
parts.push({ name: "hub_mid", mesh: hubMid, surface: hubMetal });
parts.push({ name: "prop_shaft", mesh: shaft, surface: headMetal });
parts.push({ name: "shaft_nut", mesh: shaftNut, surface: engineMetal });

const { obj, mtl } = toOBJScene(parts, "mech-radial-engine.mtl");
const model = toViewerModel(parts, "mech-radial-engine");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "mech-radial-engine.obj"), obj);
fs.writeFileSync(path.join(outDir, "mech-radial-engine.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "mech-radial-engine.json"), JSON.stringify(model, null, 2));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { /* rebuild */ }
}
const entry = { id: "mech-radial-engine", name: "9缸星形航空发动机", file: "mech-radial-engine.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`radial engine: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);

