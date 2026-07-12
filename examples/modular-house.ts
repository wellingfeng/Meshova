/**
 * Modular house kit — the highest-value pattern in Skylark's asset set.
 *
 * Skylark ships 17 building blueprints plus a Blockout kit (18 roof/wall
 * modules) and a bag of attachments (door, window, balcony, canopy, rainpipe,
 * chimney, stairs). None of those are hand-modelled one-offs: they are LEGO
 * bricks stamped by rule. This script reproduces that idea in Meshova —
 * parametric wall/floor/roof/attachment builders assembled by a seeded rule,
 * so `SEED`/`FLOORS`/`ROOF`/attachment density define the whole variant space
 * an AI loop tunes. Same seed -> same house, every run.
 *
 * Run: pnpm modular-house
 */
import fs from "node:fs";
import path from "node:path";
import {
  box,
  prism,
  cylinder,
  transform,
  translateMesh,
  planeCut,
  merge,
  computeNormals,
  makeRng,
  vec2,
  vec3,
  toOBJScene,
  toViewerModel,
  type Mesh,
  type NamedPart,
  type Rng,
} from "../src/index.js";

// --- palette (stylized Skylark-ish warm plaster + wood + terracotta) ---
const WALL: [number, number, number] = [0.86, 0.78, 0.62];
const WALL_ALT: [number, number, number] = [0.79, 0.62, 0.48];
const TRIM: [number, number, number] = [0.42, 0.28, 0.18];
const ROOF_COL: [number, number, number] = [0.68, 0.28, 0.22];
const WOOD: [number, number, number] = [0.46, 0.31, 0.18];
const GLASS: [number, number, number] = [0.55, 0.72, 0.78];
const STONE: [number, number, number] = [0.55, 0.53, 0.5];

// --- parameters: the low-dimensional knobs that define a house ---
const SEED = 7;
const FLOORS = 3; // number of stacked storeys
const WIDTH = 2.4; // footprint X
const DEPTH = 2.0; // footprint Z
const FLOOR_H = 1.15; // storey height
const ROOF = (process.env.ROOF as "sharp" | "sloped" | "round") ?? "sharp";

const rng = makeRng(SEED);
const parts: NamedPart[] = [];

// ---------------------------------------------------------------------------
// Module builders — each returns a mesh in its own local frame (Y-up, origin at
// the module's natural anchor). The assembler places them.
// ---------------------------------------------------------------------------

/** A wall slab with a slight outward taper feel (just a box here, cheap). */
function wallModule(w: number, h: number, t = 0.12): Mesh {
  return box(w, h, t);
}

/** A window: recessed frame (dark trim) + glass pane. Returns merged mesh. */
function windowModule(): { frame: Mesh; glass: Mesh } {
  const fw = 0.42,
    fh = 0.58,
    ft = 0.16;
  const frame = box(fw, fh, ft);
  const glass = transform(box(fw * 0.72, fh * 0.72, ft * 0.5), {
    translate: vec3(0, 0, 0.02),
  });
  return { frame, glass };
}

/** A door: taller frame + slab. */
function doorModule(): { frame: Mesh; slab: Mesh } {
  const dw = 0.5,
    dh = 0.92,
    dt = 0.18;
  const frame = box(dw, dh, dt);
  const slab = transform(box(dw * 0.78, dh * 0.86, dt * 0.55), {
    translate: vec3(0, -dh * 0.04, 0.03),
  });
  return { frame, slab };
}

/** A chimney: a small stone stack with a cap. */
function chimneyModule(rng: Rng): Mesh {
  const w = 0.28 + rng.range(-0.03, 0.05);
  const h = 0.55 + rng.range(-0.05, 0.15);
  const stack = box(w, h, w);
  const cap = transform(box(w * 1.3, 0.1, w * 1.3), { translate: vec3(0, h / 2 + 0.05, 0) });
  return merge(stack, cap);
}

/** A rainpipe: a thin vertical cylinder run down a corner. */
function rainpipeModule(h: number): Mesh {
  return cylinder(0.045, h, 8);
}

/** Roof by type: a prism ridge (sharp), a low slope, or a rounded loft. */
function roofModule(kind: typeof ROOF, w: number, d: number): Mesh {
  if (kind === "round") {
    // Barrel roof: a cylinder laid along X (ridge runs across the width), then
    // sliced through its axis so only the top half remains — a true half-barrel
    // instead of a fat full tube. Cap the flat underside so it reads solid.
    const barrel = transform(cylinder(d / 2, w, 24, true), {
      rotate: vec3(0, 0, Math.PI / 2),
    });
    return planeCut(barrel, { point: vec3(0, 0, 0), normal: vec3(0, 1, 0) }, {
      keep: "positive",
      cap: true,
    });
  }
  // Gable/hip: extrude a triangular outline along Z (ridge runs along Z).
  const peak = kind === "sharp" ? d * 0.62 : d * 0.32;
  const tri = prism(
    [vec2(-w / 2, 0), vec2(w / 2, 0), vec2(0, peak)],
    d,
  );
  // prism extrudes along Y by default with outline in X/ ... orient ridge along Z
  return transform(tri, { rotate: vec3(Math.PI / 2, 0, 0) });
}

// ---------------------------------------------------------------------------
// Assembler — stack floors, punch a door on the ground floor, sprinkle windows
// per floor by a seeded rule, run a rainpipe down a corner, cap with a roof,
// and add a chimney if the seed says so.
// ---------------------------------------------------------------------------

const walls: Mesh[] = [];
const trims: Mesh[] = [];
const glasses: Mesh[] = [];
const woods: Mesh[] = [];

for (let f = 0; f < FLOORS; f++) {
  const y0 = f * FLOOR_H;
  const cy = y0 + FLOOR_H / 2;
  // Four walls of this storey (front/back along Z faces, sides along X faces).
  const front = transform(wallModule(WIDTH, FLOOR_H), { translate: vec3(0, cy, DEPTH / 2) });
  const back = transform(wallModule(WIDTH, FLOOR_H), { translate: vec3(0, cy, -DEPTH / 2) });
  const left = transform(wallModule(DEPTH, FLOOR_H), {
    rotate: vec3(0, Math.PI / 2, 0),
    translate: vec3(-WIDTH / 2, cy, 0),
  });
  const right = transform(wallModule(DEPTH, FLOOR_H), {
    rotate: vec3(0, Math.PI / 2, 0),
    translate: vec3(WIDTH / 2, cy, 0),
  });
  walls.push(front, back, left, right);

  // Floor slab under each storey.
  walls.push(transform(box(WIDTH, 0.1, DEPTH), { translate: vec3(0, y0, 0) }));

  // Windows: a seeded count per storey placed across the front wall.
  const winCount = rng.int(1, 3);
  for (let i = 0; i < winCount; i++) {
    const t = winCount === 1 ? 0.5 : i / (winCount - 1);
    const x = (t - 0.5) * (WIDTH - 0.7);
    const { frame, glass } = windowModule();
    const z = DEPTH / 2 + 0.02;
    trims.push(transform(frame, { translate: vec3(x, cy + 0.05, z) }));
    glasses.push(transform(glass, { translate: vec3(x, cy + 0.05, z + 0.02) }));
  }

  // Ground floor gets a door instead of a centred window.
  if (f === 0) {
    const { frame, slab } = doorModule();
    const z = DEPTH / 2 + 0.03;
    trims.push(transform(frame, { translate: vec3(0, y0 + 0.46, z) }));
    woods.push(transform(slab, { translate: vec3(0, y0 + 0.42, z + 0.02) }));
  }
}

// Rainpipe down the front-right corner, full building height.
const totalH = FLOORS * FLOOR_H;
woods.push(
  transform(rainpipeModule(totalH), {
    translate: vec3(WIDTH / 2 - 0.06, totalH / 2, DEPTH / 2 - 0.06),
  }),
);

// Roof capping the top storey.
const roof = roofModule(ROOF, WIDTH + 0.2, DEPTH + 0.2);
parts.push({ name: "roof", mesh: computeNormals(translateMesh(roof, vec3(0, totalH, 0)), 40), color: ROOF_COL });

// Chimney (seeded): sits on the roof toward the back.
if (rng.next() > 0.35) {
  const chim = chimneyModule(rng);
  woods.push(
    transform(chim, { translate: vec3(WIDTH * 0.22, totalH + 0.4, -DEPTH * 0.2) }),
  );
}

// Merge by material class so the viewer shows tidy parts.
parts.push({ name: "walls", mesh: computeNormals(merge(...walls), 40), color: rng.next() > 0.5 ? WALL : WALL_ALT });
parts.push({ name: "trim", mesh: computeNormals(merge(...trims), 40), color: TRIM });
parts.push({ name: "glass", mesh: computeNormals(merge(...glasses), 40), color: GLASS });
parts.push({ name: "woodwork", mesh: computeNormals(merge(...woods), 40), color: WOOD });

// A small stone stoop at the door for read.
parts.push({
  name: "stoop",
  mesh: computeNormals(transform(box(0.7, 0.12, 0.4), { translate: vec3(0, 0.06, DEPTH / 2 + 0.15) }), 40),
  color: STONE,
});

// --- export: OBJ+MTL + ViewerModel JSON + manifest entry ---
const { obj, mtl } = toOBJScene(parts, "modular-house.mtl");
const model = toViewerModel(parts, "modular-house");

const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "modular-house.obj"), obj);
fs.writeFileSync(path.join(outDir, "modular-house.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "modular-house.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "modular-house", name: "模块化房屋", file: "modular-house.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(
  `modular house: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`,
);
console.log("written: out/modular-house.{obj,mtl,json} + out/models.json");

