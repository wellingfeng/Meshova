/**
 * Road-network city blocks — the Houdini "cut land with roads, drop the
 * slivers" workflow (BV1iz42117sz) on Meshova's kernel.
 *
 * Recursively splits a land polygon into convex blocks, filters out tiny
 * parcels by area/perimeter, then insets each block by half the street width
 * so the roads open up between them.
 *
 * Run: pnpm city-roadnet
 */
import { cityBlocks, merge, toOBJScene, toViewerModel } from "../src/index.js";
import { vec3 } from "../src/math/vec3.js";

// An irregular convex plot of land (a rough hexagon), 220 units across.
const land = [
  vec3(-110, 0, -60),
  vec3(-40, 0, -100),
  vec3(90, 0, -80),
  vec3(120, 0, 20),
  vec3(50, 0, 95),
  vec3(-80, 0, 80),
];

const { blocks, mesh } = cityBlocks(land, {
  targetArea: 700,      // stop cutting once a block is ~26x26
  minArea: 250,         // drop slivers smaller than this
  minPerimeter: 60,     // and skinny leftovers
  streetWidth: 7,       // road gap between blocks
  splitJitter: 0.18,    // off-center cuts for varied block sizes
  irregularity: 0.12,   // occasional early stop -> uneven grid
  blockLift: 0.06,
  seed: 42,
});

console.log(`generated ${blocks.length} city blocks`);

const parts = [{ name: "city", mesh, color: [0.55, 0.55, 0.58] as [number, number, number] }];
const { obj, mtl } = toOBJScene(parts, "city-roadnet.mtl");
const model = toViewerModel(parts, "city-roadnet");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "city-roadnet.obj"), obj);
fs.writeFileSync(path.join(outDir, "city-roadnet.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "city-roadnet.json"), JSON.stringify(model));
console.log("wrote out/city-roadnet.obj");
