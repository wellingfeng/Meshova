/**
 * Wooden bridge — a parametric span assembled by curve sweep + plank layout.
 *
 * Skylark ships ~23 wooden-bridge meshes; the Houdini pattern is a single
 * bridge tool where the deck follows a curve and planks/posts are copied onto
 * resampled segments (the same Rail/Fence "copy to segments" step Meshova
 * mirrors in `layoutPiecesOnCurve`). Here the deck sags like a real rope-and-
 * plank bridge via `catenaryCurve` (analytic, deterministic — no sim), the
 * side stringers are `profileSweep` rails, planks are laid across the span, and
 * seeded jitter makes each plank slightly unique. Change `SPAN`/`SAG`/`SEED`
 * and you get a new bridge — the low-dimensional variant space an AI loop tunes.
 *
 * Run: pnpm tsx examples/wooden-bridge.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  catenaryCurve,
  profileSweep,
  layoutPiecesOnCurve,
  rectProfile,
  box,
  cylinder,
  transform,
  merge,
  computeNormals,
  makeRng,
  vec2,
  vec3,
  toOBJScene,
  toViewerModel,
  type Curve,
  type NamedPart,
} from "../src/index.js";

const WOOD_DECK: [number, number, number] = [0.46, 0.31, 0.18];
const WOOD_RAIL: [number, number, number] = [0.38, 0.25, 0.14];
const ROPE: [number, number, number] = [0.55, 0.47, 0.32];

const SPAN = 6;        // horizontal distance between the two banks
const SAG = 0.12;      // deck droop as a fraction of span
const DECK_WIDTH = 1.2;
const SEED = 7;

const parts: NamedPart[] = [];
const rng = makeRng(SEED);

// 1) Deck centre-line: a catenary from the left bank to the right bank.
const a = vec3(-SPAN / 2, 0, 0);
const b = vec3(SPAN / 2, 0, 0);
const deckCurve: Curve = catenaryCurve(a, b, { segments: 40, sag: SAG });

// 2) Side stringers: a small rectangular beam swept along each edge of the deck.
//    Offset the deck curve left/right by half the width along world Z.
function offsetCurve(c: Curve, dz: number): Curve {
  return { points: c.points.map((p) => vec3(p.x, p.y, p.z + dz)), closed: c.closed };
}
const railProfile = rectProfile(0.05, 0.07); // 10cm x 14cm beam
for (const side of [-1, 1] as const) {
  const edge = offsetCurve(deckCurve, side * DECK_WIDTH / 2);
  const beam = computeNormals(profileSweep(edge, railProfile, { caps: true }), 40);
  parts.push({ name: `stringer_${side < 0 ? "L" : "R"}`, mesh: beam, color: WOOD_RAIL });
}

// 3) Planks: copy a plank box onto resampled segments of the deck curve.
//    The piece spans +Z (along-curve); rigid keeps its depth so gaps appear
//    between planks. Local X = across-deck width, local Y = thickness.
const PLANK_COUNT = 26;
const plankPiece = box(DECK_WIDTH, 0.06, 0.16); // width, thickness, along-curve depth
const planks = layoutPiecesOnCurve(deckCurve, {
  count: PLANK_COUNT,
  pieces: [plankPiece],
  pieceLengths: [0.16],
  rigid: true,
});
parts.push({ name: "planks", mesh: computeNormals(planks, 40), color: WOOD_DECK });

// 4) Posts + hand-rope: vertical posts rise from the deck edges; a second,
//    higher catenary is the hand-rope the posts hold up.
const POST_COUNT = 7;
const POST_H = 0.9;
const postMeshes = [];
for (const side of [-1, 1] as const) {
  for (let i = 0; i < POST_COUNT; i++) {
    const t = i / (POST_COUNT - 1);
    const idx = Math.round(t * (deckCurve.points.length - 1));
    const base = deckCurve.points[idx]!;
    const jitterH = POST_H + rng.range(-0.04, 0.04);
    const post = transform(cylinder(0.045, jitterH, 8), {
      translate: vec3(base.x, base.y + jitterH / 2, base.z + side * DECK_WIDTH / 2),
    });
    postMeshes.push(post);
  }
  // Hand-rope: a catenary lifted to post height, swept as a thin tube-ish rect.
  const ropeCurve = catenaryCurve(
    vec3(a.x, a.y + POST_H, side * DECK_WIDTH / 2),
    vec3(b.x, b.y + POST_H, side * DECK_WIDTH / 2),
    { segments: 40, sag: SAG * 1.15 },
  );
  const rope = computeNormals(profileSweep(ropeCurve, rectProfile(0.03, 0.03), { caps: true }), 40);
  parts.push({ name: `handrope_${side < 0 ? "L" : "R"}`, mesh: rope, color: ROPE });
}
parts.push({ name: "posts", mesh: computeNormals(merge(...postMeshes), 40), color: WOOD_RAIL });

// 5) Export: OBJ+MTL for DCC, ViewerModel JSON for the web viewer.
const { obj, mtl } = toOBJScene(parts, "wooden-bridge.mtl");
const model = toViewerModel(parts, "wooden-bridge");

const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "wooden-bridge.obj"), obj);
fs.writeFileSync(path.join(outDir, "wooden-bridge.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "wooden-bridge.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "wooden-bridge", name: "木桥", file: "wooden-bridge.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(
  `wooden bridge: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`,
);
console.log("written: out/wooden-bridge.{obj,mtl,json} + out/models.json");
