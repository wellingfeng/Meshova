/**
 * Rule-tree showcase — three small models built with the new RuleProcessor-style
 * layers (point-query + rule tree), sized light enough for the live viewer.
 * Each writes a viewer JSON to out/ and registers into out/models.json.
 *
 * Run: pnpm rule-tree-showcase
 */
import {
  scatterGrid,
  storePointAttribute,
  pointAttribute,
  filter,
  iterate,
  emitNode,
  evalRuleTree,
  partition,
  where,
  aggregate,
  buildBuildingParts,
  box,
  cylinder,
  cone,
  sphere,
  translateMesh,
  scaleMesh,
  merge,
  toViewerModel,
  makeRng,
  vec3,
  type NamedPart,
  type PointCloud,
  type RuleNode,
} from "../src/index.js";

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });

/** Merge parts sharing a name so scenes stay to a few material groups. */
function mergeByName(raw: NamedPart[]): NamedPart[] {
  const byName = new Map<string, NamedPart[]>();
  for (const p of raw) {
    const g = byName.get(p.name);
    if (g) g.push(p);
    else byName.set(p.name, [p]);
  }
  const out: NamedPart[] = [];
  for (const [name, group] of byName) {
    const first = group[0]!;
    const merged: NamedPart = { name, mesh: merge(...group.map((p) => p.mesh)) };
    if (first.color) merged.color = first.color;
    if (first.surface) merged.surface = first.surface;
    out.push(merged);
  }
  return out;
}

const manifestPath = path.join(outDir, "models.json");
function register(id: string, name: string, parts: NamedPart[]): void {
  const model = toViewerModel(parts, id);
  fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(model));
  let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
  if (fs.existsSync(manifestPath)) {
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { /* rebuild */ }
  }
  const entry = { id, name, file: `${id}.json` };
  manifest.models = manifest.models.filter((m) => m.id !== entry.id);
  manifest.models.push(entry);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`${id}: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris -> out/${id}.json`);
}

// ===========================================================================
// MODEL 1 — "rule-tree district": a 4x3 lot grid split by lot size (FILTER),
// big lots ITERATE by style into low towers, small lots into gable houses.
// Light params keep the mesh viewer-friendly.
// ===========================================================================
{
  const SEED = 5;
  const rng = makeRng(SEED);
  let lots: PointCloud = scatterGrid({ cols: 4, rows: 3, cellX: 11, cellZ: 11, y: 0 });
  lots = storePointAttribute(lots, "lotSize", () => rng.next());
  const styleRng = rng.fork();
  lots = storePointAttribute(lots, "style", () => Math.floor(styleRng.next() * 2));

  const towerLeaf: RuleNode<NamedPart> = emitNode((pc) => {
    const out: NamedPart[] = [];
    for (let i = 0; i < pc.points.length; i++) {
      const p = pc.points[i]!;
      const floors = 6 + Math.round((pc.attributes["lotSize"]?.[i] ?? 0.5) * 6);
      const roof = (pc.attributes["style"]?.[i] ?? 0) < 0.5 ? "flat" : "hip";
      const parts = buildBuildingParts({
        floors, floorHeight: 1, width: 6, depth: 6, baysX: 3, baysZ: 3,
        roof: roof as "flat" | "hip", seed: SEED + i,
      });
      for (const part of parts) {
        out.push({ ...part, name: `tower_${part.name}`, mesh: translateMesh(part.mesh, vec3(p.x, 0, p.z)) });
      }
    }
    return out;
  }, "tower");

  const houseLeaf: RuleNode<NamedPart> = emitNode((pc) => {
    const out: NamedPart[] = [];
    for (let i = 0; i < pc.points.length; i++) {
      const p = pc.points[i]!;
      const floors = 2 + Math.round((pc.attributes["lotSize"]?.[i] ?? 0.3) * 2);
      const parts = buildBuildingParts({
        floors, floorHeight: 1, width: 5, depth: 4, baysX: 2, baysZ: 2,
        roof: "gable", roofHeight: 1.4, seed: SEED + 50 + i,
      });
      for (const part of parts) {
        out.push({ ...part, name: `house_${part.name}`, mesh: translateMesh(part.mesh, vec3(p.x, 0, p.z)) });
      }
    }
    return out;
  }, "house");

  const tree: RuleNode<NamedPart> = filter(
    (ctx) => (ctx.attributes["lotSize"]?.[ctx.index] ?? 0) >= 0.5,
    { inside: iterate(pointAttribute("style"), towerLeaf, "byStyle"), outside: houseLeaf },
    "byLotSize",
  );

  // a ground slab under the whole block
  const ground: NamedPart = {
    name: "ground",
    mesh: scaleMesh(box(1, 0.4, 1), vec3(50, 1, 40)),
    color: [0.22, 0.23, 0.25],
  };
  const parts = mergeByName([ground, ...evalRuleTree(lots, tree)]);
  register("rt-district", "规则树街区", parts);
}

// ===========================================================================
// MODEL 2 — "partition plaza": one grid of points, partition() splits into a
// circular inner zone vs the outer ring. Inner zone gets tall trees, outer ring
// gets low bollards. Pure query-layer partition driving two instance sets.
// ===========================================================================
{
  const grid: PointCloud = scatterGrid({ cols: 12, rows: 12, cellX: 2.2, cellZ: 2.2, y: 0 });
  const R = 8; // inner radius
  const { inside, outside } = partition(grid, (ctx) => {
    const p = ctx.point;
    return Math.hypot(p.x, p.z) <= R;
  });

  // simple low-poly tree = trunk + cone canopy
  function treeAt(x: number, z: number, h: number): NamedPart[] {
    const trunk = translateMesh(scaleMesh(cylinder(0.18, h * 0.4, 8), vec3(1, 1, 1)), vec3(x, h * 0.2, z));
    const canopy = translateMesh(cone(1.1, h * 0.8, 10), vec3(x, h * 0.4 + h * 0.4, z));
    return [
      { name: "tree_trunk", mesh: trunk, color: [0.35, 0.24, 0.14] },
      { name: "tree_canopy", mesh: canopy, color: [0.18, 0.42, 0.2] },
    ];
  }
  function bollardAt(x: number, z: number): NamedPart {
    return { name: "bollard", mesh: translateMesh(cylinder(0.16, 0.9, 8), vec3(x, 0.45, z)), color: [0.5, 0.52, 0.55] };
  }

  const raw: NamedPart[] = [];
  const trng = makeRng(9);
  for (const p of inside.points) {
    if (Math.hypot(p.x, p.z) < 1.2) continue; // clear the very center
    raw.push(...treeAt(p.x, p.z, 2.5 + trng.next() * 1.5));
  }
  for (const p of outside.points) raw.push(bollardAt(p.x, p.z));

  // circular plaza slab (disc) via a squashed low-poly sphere cap -> just a big cylinder
  const slab: NamedPart = { name: "plaza", mesh: scaleMesh(cylinder(1, 0.3, 48), vec3(R + 4, 1, R + 4)), color: [0.6, 0.58, 0.52] };
  const fountain: NamedPart = { name: "fountain", mesh: translateMesh(sphere(1, 16, 12), vec3(0, 0.9, 0)), surface: { type: "water" } };

  console.log(`plaza: inner ${inside.points.length} pts (trees), outer ${outside.points.length} pts (bollards)`);
  register("rt-plaza", "分区广场", mergeByName([slab, fountain, ...raw]));
}

// ===========================================================================
// MODEL 3 — "query skyline": a row of lots gets a seeded height column, then
// where() keeps only the tall ones for towers, aggregate() reports the mean,
// and each tower is a tapered box + antenna. Shows the query layer picking a
// subset and reading stats back (the RuleProcessor SQL idea, tiny).
// ===========================================================================
{
  const SEED = 3;
  const rng = makeRng(SEED);
  let row: PointCloud = scatterGrid({ cols: 14, rows: 1, cellX: 3.2, cellZ: 3.2, y: 0 });
  row = storePointAttribute(row, "h", () => 2 + rng.next() * 10);

  const stats = aggregate(row, pointAttribute("h"));
  console.log(`skyline heights: mean ${stats.mean.toFixed(2)}, min ${stats.min.toFixed(2)}, max ${stats.max.toFixed(2)}`);

  // tall lots (>= mean) become real towers; short ones stay as podium blocks
  const tall = where(row, (c) => (c.attributes["h"]?.[c.index] ?? 0) >= stats.mean);
  const short = where(row, (c) => (c.attributes["h"]?.[c.index] ?? 0) < stats.mean);

  const raw: NamedPart[] = [];
  for (let i = 0; i < tall.points.length; i++) {
    const p = tall.points[i]!;
    const h = tall.attributes["h"]?.[i] ?? 6;
    const body = translateMesh(scaleMesh(box(1, 1, 1), vec3(2, h, 2)), vec3(p.x, h / 2, p.z));
    const antenna = translateMesh(cylinder(0.08, h * 0.3, 6), vec3(p.x, h + h * 0.15, p.z));
    raw.push({ name: "tower_body", mesh: body, surface: { type: "glassTower" } });
    raw.push({ name: "tower_antenna", mesh: antenna, color: [0.7, 0.7, 0.75] });
  }
  for (let i = 0; i < short.points.length; i++) {
    const p = short.points[i]!;
    const h = short.attributes["h"]?.[i] ?? 3;
    raw.push({ name: "podium", mesh: translateMesh(scaleMesh(box(1, 1, 1), vec3(2.4, h, 2.4)), vec3(p.x, h / 2, p.z)), color: [0.55, 0.5, 0.45] });
  }
  const ground: NamedPart = { name: "ground", mesh: scaleMesh(box(1, 0.4, 1), vec3(52, 1, 12)), color: [0.2, 0.21, 0.23] };
  console.log(`skyline: ${tall.points.length} towers, ${short.points.length} podiums`);
  register("rt-skyline", "查询天际线", mergeByName([ground, ...raw]));
}

console.log("\nall three showcase models written + registered in out/models.json");
