/**
 * Planetary (epicyclic) gearbox — the classic complex-machine assembly from
 * CADAM's "Complex machines & assemblies": one central sun gear, a ring gear
 * housing with internal teeth, and N planet gears meshing between them, carried
 * on a rotating carrier plate. Everything is a real gear built from Meshova's
 * mech kit, sized so the tooth counts satisfy the planetary constraint
 * (ring = sun + 2*planet) and the planets sit on the shared pitch circle.
 *
 * Run: pnpm planetary-gearbox
 */
import {
  gear,
  ringGear,
  flange,
  cylinder,
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

// --- Planetary tooth math -------------------------------------------------
// Pick sun/planet counts, then ring is fixed by ring = sun + 2*planet so all
// three mesh on a common module. Planet centers ride the sun+planet pitch sum.
const MODULE = 0.05;
const SUN_TEETH = 18;
const PLANET_TEETH = 18;
const RING_TEETH = SUN_TEETH + 2 * PLANET_TEETH; // 54
const PLANET_COUNT = 3;
const THICK = 0.22;

const sunPitchR = (MODULE * SUN_TEETH) / 2;
const planetPitchR = (MODULE * PLANET_TEETH) / 2;
const orbitR = sunPitchR + planetPitchR; // planet center distance from axis

const parts: NamedPart[] = [];

// Lay the whole train flat: gears are built standing along +Y, tip them so the
// disk faces lie in the XZ plane (gear axis = +Y already, so no rotation — the
// teeth are in XZ, which is exactly the plane we want the train to spin in).

// Ring gear housing (internal teeth), centered at origin.
const ring = ringGear({ teeth: RING_TEETH, module: MODULE, thickness: THICK, rimWidth: MODULE * 3 });
parts.push({ name: "ring_gear", mesh: ring, surface: { type: "brushedMetal", params: { color: [0.5, 0.52, 0.56] } } });

// Sun gear at the center, with a bore for the output shaft.
const sun = gear({ teeth: SUN_TEETH, module: MODULE, thickness: THICK, boreRadius: sunPitchR * 0.35 });
parts.push({ name: "sun_gear", mesh: sun, surface: { type: "metal", params: { color: [0.85, 0.62, 0.32], roughness: 0.3 } } });

// Planet gears on the orbit circle, each with a pin bore.
// Phase each planet so its teeth mesh cleanly (rotate by its own angular offset
// scaled to the tooth pitch) — visually the flanks interlock rather than clash.
for (let i = 0; i < PLANET_COUNT; i++) {
  const ang = (i / PLANET_COUNT) * Math.PI * 2;
  const cx = Math.cos(ang) * orbitR;
  const cz = Math.sin(ang) * orbitR;
  // Mesh phasing: a planet at angle `ang` must rotate by -ang*(ring/planet) mod
  // tooth pitch so its teeth line up with the ring/sun it straddles.
  const meshPhase = -ang * (RING_TEETH / PLANET_TEETH);
  const planet = transform(
    gear({ teeth: PLANET_TEETH, module: MODULE, thickness: THICK, boreRadius: planetPitchR * 0.3 }),
    { rotate: vec3(0, meshPhase, 0), translate: vec3(cx, 0, cz) },
  );
  parts.push({ name: `planet_${i}`, mesh: planet, surface: { type: "metal", params: { color: [0.78, 0.79, 0.82], roughness: 0.35 } } });

  // Planet pin (a short post the carrier rides on).
  const pin = translateMesh(cylinder(planetPitchR * 0.28, THICK * 1.6, 20, true), vec3(cx, 0, cz));
  parts.push({ name: `planet_pin_${i}`, mesh: pin, surface: { type: "metal", params: { color: [0.3, 0.31, 0.34], roughness: 0.4 } } });
}

// Carrier plate below the gears, tying the planet pins together. A flange disk
// with a bore for the sun shaft, holes at each planet pin.
const carrier: Mesh = flange({
  radius: orbitR + planetPitchR * 0.6,
  thickness: 0.06,
  boreRadius: sunPitchR * 0.4,
  boltHoles: PLANET_COUNT,
  boltHoleRadius: planetPitchR * 0.28,
  boltCircleRadius: orbitR,
});
parts.push({ name: "carrier_plate", mesh: translateMesh(carrier, vec3(0, -THICK / 2 - 0.05, 0)), surface: { type: "brushedMetal", params: { color: [0.42, 0.43, 0.47] } } });

// Output shaft through the sun bore + retaining nut on top.
const shaft = translateMesh(cylinder(sunPitchR * 0.32, THICK * 3, 24, true), vec3(0, 0, 0));
parts.push({ name: "output_shaft", mesh: shaft, surface: { type: "metal", params: { color: [0.36, 0.37, 0.4], roughness: 0.3 } } });
const nut = translateMesh(hexNut({ acrossFlats: sunPitchR * 0.9, height: 0.08, boreRadius: sunPitchR * 0.32 }), vec3(0, THICK * 1.5, 0));
parts.push({ name: "retaining_nut", mesh: nut, surface: { type: "brushedMetal", params: { color: [0.5, 0.5, 0.52] } } });

// --- Write out ------------------------------------------------------------
const { obj, mtl } = toOBJScene(parts, "mech-planetary-gearbox.mtl");
const model = toViewerModel(parts, "mech-planetary-gearbox");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "mech-planetary-gearbox.obj"), obj);
fs.writeFileSync(path.join(outDir, "mech-planetary-gearbox.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "mech-planetary-gearbox.json"), JSON.stringify(model, null, 2));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { /* rebuild */ }
}
const entry = { id: "mech-planetary-gearbox", name: "行星齿轮减速器", file: "mech-planetary-gearbox.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`planetary gearbox: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
console.log(`  sun=${SUN_TEETH} planet=${PLANET_TEETH}x${PLANET_COUNT} ring=${RING_TEETH} module=${MODULE}`);
