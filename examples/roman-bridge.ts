/**
 * Roman masonry bridge — a reproduction of the "cube -> bridge" Houdini demo
 * (roman_bridge, CGLTG tutorial BV19rkVY6ENb). The reference is a single giant
 * semicircular main span, a row of small relieving arches across the spandrel
 * wall above it, a crenellated parapet (merlons) along the deck edge, and vines
 * climbing the piers.
 *
 * Meshova builds it the same way the tutorial does: start from one solid brick
 * block, then BOOLEAN-CARVE the openings out of it (main arch + arcade), rather
 * than assembling separate pieces. Arch cutters = box leg + a half-cylinder cap
 * (cylinder rotated 90 deg so its axis runs along Z, through the bridge). One
 * `subtractAll` drills every opening in a single manifold cut. Deterministic.
 *
 * Run: pnpm tsx examples/roman-bridge.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  box, cylinder, transform, merge, computeNormals,
  subtractAll, unionAll, buildVinePreset, vec3, toOBJScene, toViewerModel,
  type Mesh, type NamedPart,
} from "../src/index.js";

// --- palette (weathered Roman brick / travertine) -------------------------
const BRICK: [number, number, number] = [0.60, 0.42, 0.30];
const CAP_STONE: [number, number, number] = [0.66, 0.55, 0.44];

// --- master dimensions (world units) --------------------------------------
const SPAN = 6.0;        // total width of the bridge block (X)
const DEPTH = 1.4;       // thickness through the bridge (Z)
const MAIN_R = 2.0;      // radius of the central main arch
const MAIN_SPRING = 1.3; // Y where the main arch springs from its piers
const DECK_Y = MAIN_SPRING + MAIN_R + 0.55; // top of the spandrel wall
const SEG = 48;          // cylinder resolution for clean arch intrados

// A half-cylinder arch cutter: barrel along Z (rotate the Y-axis cylinder
// 90deg about X), sitting on a rectangular leg so the cut is a full doorway.
// `legDown` = how far the straight jamb drops below the spring line. The main
// arch drops all the way to the ground (a full doorway); the small relieving
// arches only drop a little (window-like openings up in the spandrel).
function archCutter(cx: number, radius: number, springY: number, depth: number, legDown: number): Mesh {
  const barrel = transform(cylinder(radius, depth + 0.4, SEG, true), {
    rotate: vec3(Math.PI / 2, 0, 0),
    translate: vec3(cx, springY, 0),
  });
  // Leg top overlaps the barrel centre so the union is one clean D-shaped
  // solid. A raw `merge` here is non-manifold and makes the next CSG choke.
  const legTop = springY;
  const legBot = springY - legDown;
  const legH = legTop - legBot;
  const leg = transform(box(radius * 2, legH, depth + 0.4), {
    translate: vec3(cx, (legTop + legBot) / 2, 0),
  });
  return unionAll([barrel, leg]);
}
const parts: NamedPart[] = [];

// 1) The solid brick block the whole bridge is carved from.
const block = transform(box(SPAN, DECK_Y, DEPTH), {
  translate: vec3(0, DECK_Y / 2, 0),
});

// 2) Collect every opening as a cutter, then subtract once.
const cutters: Mesh[] = [];

// 2a) Central main arch — full doorway down to the ground.
cutters.push(archCutter(0, MAIN_R, MAIN_SPRING, DEPTH, MAIN_SPRING + 0.1));

// 2b) Arcade of small relieving arches across the spandrel wall, sitting on a
//     shared string-course above the main arch crown. Skip the middle ones that
//     would fall inside the main arch void.
const smallR = 0.42;
const arcadeSpring = MAIN_SPRING + MAIN_R + 0.12; // above the main crown
const arcadePitch = smallR * 2 + 0.34;
const arcadeCount = Math.floor((SPAN - 0.6) / arcadePitch);
const arcadeStart = -((arcadeCount - 1) * arcadePitch) / 2;
for (let i = 0; i < arcadeCount; i++) {
  const cx = arcadeStart + i * arcadePitch;
  // keep arches whose opening clears the main-arch void below
  if (Math.abs(cx) < MAIN_R + smallR) continue;
  cutters.push(archCutter(cx, smallR, arcadeSpring, DEPTH, 0.55));
}

const carved = computeNormals(subtractAll(block, cutters), 40);
parts.push({ name: "span", label: "桥体", mesh: carved, color: BRICK,
  surface: { type: "rough", params: { color: BRICK, roughness: 0.92 } } });

// 3) Deck cap slab + string course lip on top of the spandrel wall.
const deck = transform(box(SPAN + 0.3, 0.22, DEPTH + 0.24), {
  translate: vec3(0, DECK_Y + 0.11, 0),
});
parts.push({ name: "deck", label: "桥面", mesh: computeNormals(deck, 40), color: CAP_STONE });

// 4) Crenellated parapet: alternating merlons (blocks) along both deck edges.
const merlonW = 0.34, merlonGap = 0.34, merlonH = 0.42;
const merlonPitch = merlonW + merlonGap;
const merlonCount = Math.floor((SPAN + 0.3) / merlonPitch);
const merlonStart = -((merlonCount - 1) * merlonPitch) / 2;
const merlons: Mesh[] = [];
for (const side of [-1, 1] as const) {
  for (let i = 0; i < merlonCount; i++) {
    const mx = merlonStart + i * merlonPitch;
    merlons.push(transform(box(merlonW, merlonH, 0.2), {
      translate: vec3(mx, DECK_Y + 0.22 + merlonH / 2, side * (DEPTH / 2 + 0.02)),
    }));
  }
}
parts.push({ name: "parapet", label: "雉堞", mesh: computeNormals(merge(...merlons), 40), color: CAP_STONE });

// 5) Vines climbing the two main piers (deterministic preset, mirrored).
const pierX = MAIN_R - 0.15;
for (const side of [-1, 1] as const) {
  const vine = buildVinePreset("ivy", {
    seed: side < 0 ? 41 : 57,
    length: 2.4,
    origin: vec3(side * pierX, 0.2, DEPTH / 2 - 0.05),
    branches: 5,
    leafDensity: 7,
  });
  for (const p of vine) {
    parts.push({ ...p, name: `vine_${side < 0 ? "L" : "R"}_${p.name}` });
  }
}

// --- export ---------------------------------------------------------------
const { obj, mtl } = toOBJScene(parts, "roman-bridge.mtl");
const model = toViewerModel(parts, "roman-bridge");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "roman-bridge.obj"), obj);
fs.writeFileSync(path.join(outDir, "roman-bridge.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "roman-bridge.json"), JSON.stringify(model));
const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) { try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { /* rebuild */ } }
const entry = { id: "roman-bridge", name: "罗马拱桥", file: "roman-bridge.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`roman bridge: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);