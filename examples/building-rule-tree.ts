/**
 * Building layers via a SliceAndDice rule TREE — the CitySample RuleProcessor
 * pattern ported to Meshova. Instead of a flat loop over lots, we drive a whole
 * city block through a branching rule tree:
 *
 *   grid of lots (point cloud, each point = a lot with a "lotSize" attribute)
 *     -> FILTER by lot size:
 *          big lots   -> ITERATOR by seeded style -> GENERATOR: tall urban tower
 *          small lots -> GENERATOR: low walk-up building
 *
 * Each generator leaf calls the existing parametric building generators and
 * translates the returned parts onto the lot. The tree flattens to a NamedPart[]
 * scene. Everything is seeded, so the same block reproduces exactly.
 *
 * Run: pnpm building-rule-tree
 */
import {
  scatterGrid,
  storePointAttribute,
  pointAttribute,
  filter,
  iterate,
  emitNode,
  evalRuleTree,
  describeRuleTree,
  buildUrbanBuildingParts,
  buildBuildingParts,
  translateMesh,
  vec3,
  makeRng,
  merge,
  toOBJScene,
  toViewerModel,
  type NamedPart,
  type PointCloud,
  type RuleNode,
} from "../src/index.js";

// --- layout: a 5x3 grid of lots, each tagged with a seeded "lotSize" 0..1 ---
const SEED = 7;
const rng = makeRng(SEED);
let lots: PointCloud = scatterGrid({ cols: 5, rows: 3, cellX: 14, cellZ: 14, y: 0 });
// bake a per-lot size and a per-lot style index (both seeded, deterministic)
lots = storePointAttribute(lots, "lotSize", () => rng.next());
const styleRng = rng.fork();
lots = storePointAttribute(lots, "style", () => Math.floor(styleRng.next() * 3));

const URBAN_STYLES = ["artDeco", "glassTower", "corporate"] as const;

/** GENERATOR: a tall modular tower on a big lot, positioned at the lot point. */
function towerLeaf(): RuleNode<NamedPart> {
  return emitNode((pc) => {
    const out: NamedPart[] = [];
    for (let i = 0; i < pc.points.length; i++) {
      const p = pc.points[i]!;
      const styleIdx = Math.floor(pc.attributes["style"]?.[i] ?? 0);
      const style = URBAN_STYLES[styleIdx % URBAN_STYLES.length]!;
      const floors = 12 + Math.round((pc.attributes["lotSize"]?.[i] ?? 0.5) * 18);
      const parts = buildUrbanBuildingParts({ style, floors, width: 8, depth: 8, seed: SEED + i });
      for (const part of parts) {
        out.push({ ...part, name: `tower_${style}_${part.name}`, mesh: translateMesh(part.mesh, vec3(p.x, 0, p.z)) });
      }
    }
    return out;
  }, "tower");
}

/** GENERATOR: a low walk-up building on a small lot. */
function walkupLeaf(): RuleNode<NamedPart> {
  return emitNode((pc) => {
    const out: NamedPart[] = [];
    for (let i = 0; i < pc.points.length; i++) {
      const p = pc.points[i]!;
      const floors = 2 + Math.round((pc.attributes["lotSize"]?.[i] ?? 0.3) * 4);
      const parts = buildBuildingParts({ floors, width: 7, depth: 6, roof: "gable", seed: SEED + 100 + i });
      for (const part of parts) {
        out.push({ ...part, name: `walkup_${part.name}`, mesh: translateMesh(part.mesh, vec3(p.x, 0, p.z)) });
      }
    }
    return out;
  }, "walkup");
}

// --- the rule tree: big lots -> (per style) towers; small lots -> walk-ups ---
const tree: RuleNode<NamedPart> = filter(
  (ctx) => (ctx.attributes["lotSize"]?.[ctx.index] ?? 0) >= 0.5,
  {
    inside: iterate(pointAttribute("style"), towerLeaf(), "byStyle"),
    outside: walkupLeaf(),
  },
  "byLotSize",
);

console.log("rule tree:\n" + describeRuleTree(tree));

const rawParts = evalRuleTree(lots, tree);

// merge parts sharing a name so the scene stays to a handful of material groups
const byName = new Map<string, NamedPart[]>();
for (const part of rawParts) {
  const g = byName.get(part.name);
  if (g) g.push(part);
  else byName.set(part.name, [part]);
}
const parts: NamedPart[] = [];
for (const [name, group] of byName) {
  const first = group[0]!;
  const mesh = merge(...group.map((p) => p.mesh));
  const merged: NamedPart = { name, mesh };
  if (first.color) merged.color = first.color;
  if (first.surface) merged.surface = first.surface;
  parts.push(merged);
}

const { obj, mtl } = toOBJScene(parts, "building-rule-tree.mtl");
const model = toViewerModel(parts, "building-rule-tree");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "building-rule-tree.obj"), obj);
fs.writeFileSync(path.join(outDir, "building-rule-tree.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "building-rule-tree.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "building-rule-tree", name: "规则树街区", file: "building-rule-tree.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`rule-tree block: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
console.log("written: out/building-rule-tree.{obj,mtl,json} + out/models.json");
