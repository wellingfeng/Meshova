/**
 * Architecture kit — showcases every new Elderwood-derived capability and
 * writes several models into the library:
 *   - standalone parametric pieces (arch / column / pavilion / bridge wall)
 *   - a vine-covered ruin grown on an ARBITRARY mesh via meshSurface()
 *   - a rock cluster whose bases pick up the ground color (groundBlendColorField)
 *
 * All re-authored from public procedural technique; no UE asset copied.
 * Run: pnpm tsx examples/architecture-kit.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  archway, column, pavilion, bridgeWall, ruinify, rockVariants,
  meshSurface, buildClimbingVineParts,
  terrainAutoMaterial, groundBlendColorField, bakeVertexColors, withAttributes,
  transform, merge, vec3, toOBJScene, toViewerModel,
  type NamedPart, type Vec3, type Mesh,
} from "../src/index.js";

const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string; category?: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) { try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { /* rebuild */ } }
function emit(id: string, name: string, parts: NamedPart[]) {
  const { obj, mtl } = toOBJScene(parts, `${id}.mtl`);
  const model = toViewerModel(parts, id);
  fs.writeFileSync(path.join(outDir, `${id}.obj`), obj);
  fs.writeFileSync(path.join(outDir, `${id}.mtl`), mtl);
  fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(model));
  manifest.models = manifest.models.filter((m) => m.id !== id);
  manifest.models.push({ id, name, file: `${id}.json`, category: "meshova" });
  console.log(`${id}: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
}

const STONE: [number, number, number] = [0.64, 0.61, 0.55];
const DIRT: [number, number, number] = [0.42, 0.32, 0.2];

// 1) Standalone parametric pieces laid out in a row.
emit("arch-column-pavilion", "建筑构件套组", [
  { name: "pavilion", mesh: transform(pavilion({ size: 3, roof: "dome", columnsPerSide: 3 }), { translate: vec3(0, 0, 0) }), color: STONE },
  { name: "arch", mesh: transform(archway({ span: 2.5, archStyle: "pointed" }), { translate: vec3(-8, 0, 0) }), color: STONE },
  { name: "column", mesh: transform(column({ height: 5, flutes: 20 }), { translate: vec3(8, 0, 0) }), color: STONE },
  { name: "wall", mesh: transform(bridgeWall({ length: 6, openings: 6, style: "baluster" }), { translate: vec3(0, 0, -6) }), color: STONE },
]);

// 2) Vine-covered ruin: ruinify an arch, then grow ivy on the ACTUAL mesh.
const ruinArch = ruinify(archway({ span: 3, pierHeight: 3.2, depth: 0.9, archStyle: "pointed" }),
  { seed: 9, crumble: 0.4, erosion: 0.5, chunks: 7 });
const ivy = buildClimbingVineParts(meshSurface(ruinArch), { seed: 3, strands: 7, leafDensity: 10, branches: 3 });
emit("vine-ruin-arch", "藤蔓废墟拱门", [
  { name: "arch", mesh: ruinArch, color: STONE },
  ...ivy,
]);

// 3) Rock cluster with RVT-style ground blend at the base.
const groundColor = terrainAutoMaterial(
  [{ color: DIRT, minSlope: 0 }, { color: [0.3, 0.4, 0.22], minSlope: 0.6 }],
  { breakup: 0.4, seed: 5 },
);
const rockField = groundBlendColorField(
  () => [0.46, 0.44, 0.42] as [number, number, number],
  (p: Vec3) => groundColor(p, vec3(0, 1, 0)),
  { groundY: 0, fade: 0.5, strength: 0.9, seed: 5 },
);
const rocks = rockVariants(7, { seed: 60, radius: 0.7, detail: 3, flatBase: 0.35 });
const rockParts: NamedPart[] = rocks.map((r, i) => {
  const ang = i * 2.399963;
  const rad = 1.5 + (i % 3) * 0.9;
  const placed: Mesh = transform(r, { translate: vec3(Math.cos(ang) * rad, 0, Math.sin(ang) * rad), scale: 0.7 + (i % 3) * 0.25 });
  const colors = bakeVertexColors(withAttributes(placed), (ctx) => rockField(ctx.position, ctx.normal));
  return { name: `rock_${i}`, mesh: placed, colors };
});
emit("ground-blend-rocks", "地表融合岩石群", rockParts);

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log("written architecture kit + models.json");
