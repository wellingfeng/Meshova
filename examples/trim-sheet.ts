/**
 * Trim-sheet demo — one atlas dresses many parts (the SKYLARK / SideFX
 * "M_Trim_Base" workflow, made procedural).
 *
 * We build a little kiosk from flat panels. Instead of a separate material per
 * panel, we pack four material bands (wood, plank, metal, plaster) into ONE
 * trim atlas, bake it ONCE, then point each panel's UVs at the band it needs
 * and sample the shared atlas into per-vertex colors. Every panel reuses the
 * same texture — the memory + draw-call win trim sheets are famous for.
 *
 * Run: pnpm tsx examples/trim-sheet.ts
 */
import {
  architecturalTrim,
  bakeTrimSheet,
  trimStripBand,
  mapUVToTrimBand,
  box,
  boxUV,
  translateMesh,
  sample,
  bounds,
  withAttributes,
  bakeVertexColors,
  trimBlendColorField,
  vec3,
  type NamedPart,
  type Mesh,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const ATLAS = 256;
const sheet = architecturalTrim({ seed: 5 });
const atlas = bakeTrimSheet(sheet, ATLAS);

/** Sample the shared atlas baseColor at each vertex UV -> flat per-vertex colors. */
function vertexColorsFromAtlas(mesh: Mesh): number[] {
  const colors: number[] = [];
  for (const uv of mesh.uvs) {
    // wrap U (strip tiles), clamp V (strip band)
    const u = ((uv.x % 1) + 1) % 1;
    const v = Math.min(1, Math.max(0, uv.y));
    const x = Math.min(ATLAS - 1, Math.floor(u * ATLAS));
    const y = Math.min(ATLAS - 1, Math.floor((1 - v) * ATLAS)); // buffer row 0 = top
    colors.push(sample(atlas.baseColor, x, y, 0), sample(atlas.baseColor, x, y, 1), sample(atlas.baseColor, x, y, 2));
  }
  return colors;
}

/** Make one panel: box -> boxUV -> squeeze into a named trim band. */
function panel(w: number, h: number, d: number, band: string, at: [number, number, number], uTile = 1): NamedPart {
  const b = trimStripBand(sheet, band)!;
  const mesh = translateMesh(
    mapUVToTrimBand(boxUV(box(w, h, d)), { v0: b.v0, v1: b.v1, uTile }),
    { x: at[0], y: at[1], z: at[2] },
  );
  return { name: band + "_panel", label: `${band} 面板`, mesh, colors: vertexColorsFromAtlas(mesh) };
}

/**
 * M_Trim_Vertex demo: ONE wall that fades wood (bottom) -> plaster (top) by
 * per-vertex height weight, blended across the SAME shared atlas. No extra
 * texture — the transition is baked to vertex colors from the trim strips.
 */
function blendWall(): NamedPart {
  const mesh = translateMesh(boxUV(box(2.0, 1.4, 0.1)), { x: 0, y: 1.0, z: 0.6 });
  const b = bounds(mesh);
  const span = b.max.y - b.min.y || 1;
  // per-vertex "up" weight: 0 at the base, 1 at the top
  const up = mesh.positions.map((p) => (p.y - b.min.y) / span);
  const field = trimBlendColorField(
    sheet,
    [
      { strip: "wood", weight: (c) => 1 - (c.attributes["up"]?.[c.index] ?? 0) },
      { strip: "plaster", weight: "up" },
    ],
    { uFrom: "u", uTile: 2 },
  );
  const colors = bakeVertexColors(withAttributes(mesh, { up }), (c) => {
    const [r, g, bl] = field(c);
    return vec3(r, g, bl);
  });
  return { name: "blend_wall", label: "顶点混合墙(木→灰泥)", mesh, colors };
}

// A kiosk: plaster walls, a wood base band, a metal roof edge, plank counter,
// plus one vertex-blended front wall (M_Trim_Vertex).
const parts: NamedPart[] = [
  panel(2.0, 1.4, 0.1, "plaster", [0, 1.0, -0.6], 2),   // back wall
  panel(0.1, 1.4, 1.2, "plaster", [-1.0, 1.0, 0], 1.5),  // left wall
  panel(0.1, 1.4, 1.2, "plaster", [1.0, 1.0, 0], 1.5),   // right wall
  panel(2.0, 0.3, 1.3, "wood", [0, 0.15, 0], 3),         // base band
  panel(2.2, 0.15, 1.4, "metal", [0, 1.8, 0], 4),        // roof edge
  panel(2.0, 0.1, 0.6, "plank", [0, 0.95, 0.5], 3),      // front counter
  blendWall(),                                            // vertex-blend front wall
];

const { obj, mtl } = toOBJScene(parts, "trim-sheet.mtl");
const model = toViewerModel(parts, "trim-sheet");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "trim-sheet.obj"), obj);
fs.writeFileSync(path.join(outDir, "trim-sheet.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "trim-sheet.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { /* rebuild */ }
}
const entry = { id: "trim-sheet", name: "Trim 图集复用", file: "trim-sheet.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`trim sheet: 1 atlas (${ATLAS}x${ATLAS}) shared by ${parts.length} panels`);
console.log(`model: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
console.log("written: out/trim-sheet.{obj,mtl,json} + out/models.json");
