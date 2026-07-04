/**
 * Regenerate a SpeedTree-style library from local folder/file names.
 *
 * Reads only inventory names from SPEEDTREE_LIBRARY_SOURCE or --source.
 * Does not parse/import/copy SpeedTree geometry, textures, or .spm internals.
 *
 * Run:
 *   pnpm speedtree:library -- --limit 40
 *   pnpm speedtree:library -- --granularity variant --source "E:\\...\\SpeedTree Library树库" --obj
 */
import {
  buildSpeedTreeLibraryPlant,
  defaultSpeedTreeLibraryParams,
  inferSpeedTreeLibraryRecipe,
  speedTreeLibraryRepresentativeScore,
  speedTreeLibraryId,
  speedTreeLibraryVisualKey,
  toOBJScene,
  toViewerModel,
  type SpeedTreeLibraryEntry,
} from "../src/index.js";

const fs = await import("node:fs");
const path = await import("node:path");

const DEFAULT_SOURCE = process.env.SPEEDTREE_LIBRARY_SOURCE
  ?? String.raw`E:\BaiduNetdiskDownload\speedtree教程软件树库\speedtree树库\解压后11.1GB树库\SpeedTree Library树库`;

const args = parseArgs(process.argv.slice(2));
const sourceDir = path.resolve(String(args.source ?? DEFAULT_SOURCE));
const outRoot = path.resolve(String(args.out ?? "out"));
const manifestPath = path.join(outRoot, "models.json");
const inventoryPath = path.join(outRoot, "speedtree-library-inventory.json");
const categoryFilter = args.category ? new Set(String(args.category).split(",").map((v) => v.trim().toLowerCase()).filter(Boolean)) : null;
const extFilter = new Set(String(args.ext ?? ".spm").split(",").map((v) => normalizeExt(v.trim())).filter(Boolean));
const limit = args.limit === undefined ? Infinity : Math.max(1, Number(args.limit));
const quality = args.quality === "medium" || args.quality === "high" ? args.quality : "proxy";
const granularity = args.granularity === "variant" ? "variant" : "species";
const writeObj = Boolean(args.obj);
const cleanGenerated = args.clean !== "false";
const dedupeMode = args.dedupe === "false" ? "none" : "visual";

if (!fs.existsSync(sourceDir)) {
  throw new Error(`SpeedTree library source dir not found: ${sourceDir}`);
}

fs.mkdirSync(outRoot, { recursive: true });
if (cleanGenerated) cleanGeneratedSpeedTreeFiles(outRoot);

const collectedEntries = collectEntries(sourceDir, { extFilter, categoryFilter }).slice(0, limit);
const dedupeResult = dedupeMode === "visual"
  ? dedupeVisualEntries(collectedEntries)
  : { entries: collectedEntries, groups: [] as DuplicateGroup[] };
const entries = dedupeResult.entries;
const inventory = {
  sourceDir,
  generatedAt: new Date().toISOString(),
  ext: [...extFilter],
  quality,
  granularity,
  dedupe: dedupeMode,
  scannedCount: collectedEntries.length,
  count: entries.length,
  removedDuplicates: collectedEntries.length - entries.length,
  duplicateGroups: dedupeResult.groups,
  entries,
};
fs.writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);

let manifest: { models: Array<{ id: string; name: string; file: string; category?: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    manifest = { models: [] };
  }
}
manifest.models = manifest.models.filter((m) => !String(m.category ?? "").startsWith("SpeedTree库/"));

let totalVerts = 0;
let totalTris = 0;
for (const [i, entry] of entries.entries()) {
  const id = speedTreeLibraryId(entry);
  const parts = buildSpeedTreeLibraryPlant(entry, { quality });
  const model = toViewerModel(parts, `Meshova树库 ${entry.species.replace(/_/g, " ")}`);
  model.meta.source = entry.relPath ?? `${entry.category}/${entry.species}`;
  model.meta.generator = "meshova-speedtree-library-regenerator";
  model.meta.notice = "procedural approximation; no SpeedTree asset copied";
  model.meta.visualKey = speedTreeLibraryVisualKey(entry);
  model.meta.procedural = {
    type: "speedtree-library",
    id,
    name: model.name,
    entry,
    quality,
    defaultParams: defaultSpeedTreeLibraryParams(entry, { quality }),
    recipe: inferSpeedTreeLibraryRecipe(entry, { quality }),
  };
  totalVerts += Number(model.meta.verts);
  totalTris += Number(model.meta.tris);

  const file = `${id}.json`;
  fs.writeFileSync(path.join(outRoot, file), JSON.stringify(model));

  if (writeObj) {
    const obj = toOBJScene(parts, `${id}.mtl`);
    fs.writeFileSync(path.join(outRoot, `${id}.obj`), obj.obj);
    fs.writeFileSync(path.join(outRoot, `${id}.mtl`), obj.mtl);
  }

  manifest.models = manifest.models.filter((m) => m.id !== id);
  manifest.models.push({ id, name: model.name, file, category: `SpeedTree库/${entry.category}` });
  if ((i + 1) % 25 === 0 || i === entries.length - 1) {
    console.log(`${i + 1}/${entries.length}: ${id} verts=${model.meta.verts} tris=${model.meta.tris}`);
  }
}

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`generated: ${entries.length} models`);
console.log(`dedupe: ${collectedEntries.length - entries.length} removed, ${dedupeResult.groups.length} groups`);
console.log(`verts: ${totalVerts}, tris: ${totalTris}`);
console.log(`inventory: ${inventoryPath}`);
console.log(`manifest: ${manifestPath}`);

function collectEntries(
  root: string,
  opts: { extFilter: Set<string>; categoryFilter: Set<string> | null },
): SpeedTreeLibraryEntry[] {
  const excluded = new Set(["common_files", "renders", "treebrowser_win"]);
  const categories = fs.readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => !excluded.has(d.name.toLowerCase()))
    .filter((d) => !opts.categoryFilter || opts.categoryFilter.has(d.name.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  const out: SpeedTreeLibraryEntry[] = [];
  for (const category of categories) {
    const categoryDir = path.join(root, category.name);
    const speciesDirs = fs.readdirSync(categoryDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    for (const species of speciesDirs) {
      const speciesDir = path.join(categoryDir, species.name);
      const files = walkFiles(speciesDir)
        .filter((file) => opts.extFilter.has(path.extname(file).toLowerCase()))
        .sort((a, b) => a.localeCompare(b, "zh-CN"));
      if (files.length === 0) {
        out.push({ category: category.name, species: species.name });
        continue;
      }
      if (granularity === "species") {
        out.push({
          category: category.name,
          species: species.name,
          relPath: path.relative(root, representativeFile(species.name, files)),
        });
        continue;
      }
      for (const file of files) {
        out.push({
          category: category.name,
          species: species.name,
          variant: path.basename(file, path.extname(file)),
          relPath: path.relative(root, file),
        });
      }
    }
  }
  return dedupe(out);
}

interface DuplicateGroup {
  visualKey: string;
  kept: string;
  removed: string[];
}

function dedupeVisualEntries(entries: SpeedTreeLibraryEntry[]): { entries: SpeedTreeLibraryEntry[]; groups: DuplicateGroup[] } {
  const byKey = new Map<string, SpeedTreeLibraryEntry[]>();
  for (const entry of entries) {
    const key = speedTreeLibraryVisualKey(entry);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(entry);
    else byKey.set(key, [entry]);
  }
  const keep = new Set<string>();
  const groups: DuplicateGroup[] = [];
  for (const [visualKey, group] of byKey) {
    const sorted = [...group].sort((a, b) => {
      const ds = speedTreeLibraryRepresentativeScore(b) - speedTreeLibraryRepresentativeScore(a);
      if (ds !== 0) return ds;
      return speedTreeLibraryId(a).localeCompare(speedTreeLibraryId(b), "zh-CN");
    });
    const chosen = sorted[0]!;
    keep.add(speedTreeLibraryId(chosen));
    if (sorted.length > 1) {
      groups.push({
        visualKey,
        kept: speedTreeLibraryId(chosen),
        removed: sorted.slice(1).map(speedTreeLibraryId),
      });
    }
  }
  return {
    entries: entries.filter((entry) => keep.has(speedTreeLibraryId(entry))),
    groups,
  };
}

function cleanGeneratedSpeedTreeFiles(outRoot: string): void {
  for (const entry of fs.readdirSync(outRoot, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (/^speedtree-library-.*\.(json|obj|mtl)$/i.test(entry.name)) {
      fs.unlinkSync(path.join(outRoot, entry.name));
    }
  }
  const shotsDir = path.join(outRoot, "shots");
  if (!fs.existsSync(shotsDir)) return;
  for (const entry of fs.readdirSync(shotsDir, { withFileTypes: true })) {
    if (entry.isFile() && /^speedtree-library-.*\.png$/i.test(entry.name)) {
      fs.unlinkSync(path.join(shotsDir, entry.name));
    }
  }
}

function walkFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  return out;
}

function representativeFile(species: string, files: string[]): string {
  const speciesSlug = species.replace(/[_\s-]+/g, "").toLowerCase();
  return files.find((file) => path.basename(file, path.extname(file)).replace(/[_\s-]+/g, "").toLowerCase() === speciesSlug)
    ?? files.find((file) => /(^|[_-])rt($|[_-])/i.test(path.basename(file, path.extname(file))))
    ?? files.find((file) => /(^|[_-])med($|[_-])/i.test(path.basename(file, path.extname(file))))
    ?? files[0]!;
}

function dedupe(entries: SpeedTreeLibraryEntry[]): SpeedTreeLibraryEntry[] {
  const seen = new Set<string>();
  const out: SpeedTreeLibraryEntry[] = [];
  for (const entry of entries) {
    const id = speedTreeLibraryId(entry);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(entry);
  }
  return out;
}

function normalizeExt(value: string): string {
  if (!value) return "";
  return value.startsWith(".") ? value.toLowerCase() : `.${value.toLowerCase()}`;
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}
