/**
 * Audit the whole Meshova model library with the critique layer.
 * Enumerates every build*Parts() export, runs the deterministic critic
 * (geometry + proportion + rubric) on each, and prints a ranked report.
 * No VLM: this is the free A/C-tier sweep.
 */
import * as M from "../src/index.js";
import { critique, meshMetrics, rubricForGoal, type NamedPart } from "../src/index.js";

// Map builder name -> a goal string so the rubric can be picked. When no
// keyword matches, the generic rubric applies (still checks geometry + scale).
const GOAL_HINTS: Record<string, string> = {
  buildSportsCarParts: "a sports car",
  buildBuickRiviera1965Parts: "a car",
  buildGmcCanyonAt4xParts: "a truck",
  buildQuadrupedParts: "a quadruped animal",
  buildReferenceDogParts: "a dog",
  buildMidnightHorseParts: "a horse",
  buildParkBenchParts: "a park bench",
  buildUmbrellaTableParts: "a table",
  buildStreetTreeParts: "a tree",
  buildTitanTreeParts: "a tree",
  buildTitanShrubParts: "a bush",
  buildWaterTowerParts: "a water tower",
  buildStreetLampParts: "a street lamp",
  // "mech pilot" contains no rubric keyword on its own but "car"-ish tokens can
  // slip in via the name split; pin it to generic so a humanoid isn't judged as
  // a car's proportions.
  buildCartoonMechPilotParts: "a cartoon mech pilot humanoid",
};

function goalFor(name: string): string {
  if (GOAL_HINTS[name]) return GOAL_HINTS[name]!;
  // Derive a rough goal from the builder name: buildFooBarParts -> "foo bar".
  const core = name.replace(/^build/, "").replace(/Parts$/, "").replace(/Model$/, "");
  return core.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

interface Row {
  name: string;
  category: string;
  parts: number;
  tris: number;
  overall: number;
  geometry: number;
  proportion: number;
  hard: number;
  soft: number;
  flippedParts: number;
  openParts: number;
  degenParts: number;
  unsupported: number;
  supportIssues: string[];
  topIssues: string[];
  error?: string;
}

// Builders that require a mandatory argument (a surface, a curve, etc.) and so
// can't be swept with a no-arg call. They aren't standalone library models.
const REQUIRES_ARGS = new Set<string>(["buildClimbingVineParts"]);

const rows: Row[] = [];
const mod = M as unknown as Record<string, unknown>;
const builders = Object.keys(mod)
  .filter((k) => /^build[A-Za-z]*Parts$/.test(k) && typeof mod[k] === "function" && !REQUIRES_ARGS.has(k))
  .sort();

for (const name of builders) {
  const fn = mod[name] as (...a: unknown[]) => unknown;
  try {
    const parts = fn() as NamedPart[];
    if (!Array.isArray(parts) || parts.length === 0) {
      rows.push(emptyRow(name, "no parts returned"));
      continue;
    }
    const goal = goalFor(name);
    const rep = critique(parts, { goal });
    let flippedParts = 0, openParts = 0, degenParts = 0, tris = 0;
    for (const p of parts) {
      const mm = meshMetrics(p.mesh);
      tris += mm.triangles;
      if (mm.flippedFaces > mm.triangles * 0.15) flippedParts++;
      if (!mm.watertight && mm.boundaryEdges / Math.max(1, mm.triangles) > 0.5) openParts++;
      if (mm.degenerateFaces > 0) degenParts++;
    }
    const hard = rep.issues.filter((i) => i.severity === "hard");
    const soft = rep.issues.filter((i) => i.severity === "soft");
    const unsupported = rep.issues.filter((i) => /floating with no contact path/.test(i.finding)).length;
    const supportIssues = rep.issues
      .filter((i) => /floating with no contact path/.test(i.finding))
      .map((i) => `${i.part ?? "assembly"}: ${i.finding}`);
    const topIssues = [...rep.issues]
      .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "hard" ? -1 : 1))
      .slice(0, 3)
      .map((i) => `${i.severity === "hard" ? "!" : "."}[${i.axis}]${i.part ? ` ${i.part}:` : ""} ${i.finding}`);
    rows.push({
      name, category: rep.category, parts: parts.length, tris,
      overall: rep.scores.overall, geometry: rep.scores.geometry, proportion: rep.scores.proportion,
      hard: hard.length, soft: soft.length, flippedParts, openParts, degenParts, topIssues,
      unsupported, supportIssues,
    });
  } catch (e) {
    rows.push(emptyRow(name, (e as Error).message));
  }
}

function emptyRow(name: string, error: string): Row {
  return { name, category: "-", parts: 0, tris: 0, overall: 0, geometry: 0, proportion: 0,
    hard: 0, soft: 0, flippedParts: 0, openParts: 0, degenParts: 0, unsupported: 0, supportIssues: [], topIssues: [], error };
}

rows.sort((a, b) => a.overall - b.overall);

console.log("\n=== Meshova model library audit (deterministic A/C tier) ===\n");
const pad = (s: string, n: number) => (s + " ".repeat(n)).slice(0, n);
console.log(pad("model", 30), pad("cat", 10), pad("parts", 6), pad("tris", 8), pad("overall", 8), pad("geo", 6), pad("prop", 6), pad("H/S/F", 9), "flip/open/degen");
console.log("-".repeat(110));
for (const r of rows) {
  if (r.error) { console.log(pad(r.name, 30), "ERROR:", r.error); continue; }
  console.log(
    pad(r.name, 30), pad(r.category, 10), pad(String(r.parts), 6), pad(String(r.tris), 8),
    pad(r.overall.toFixed(2), 8), pad(r.geometry.toFixed(2), 6), pad(r.proportion.toFixed(2), 6),
    pad(`${r.hard}/${r.soft}/${r.unsupported}`, 9), `${r.flippedParts}/${r.openParts}/${r.degenParts}`,
  );
}

console.log("\n=== Worst 12 with top issues ===\n");
for (const r of rows.slice(0, 12)) {
  if (r.error) continue;
  console.log(`# ${r.name}  [${r.category}] overall=${r.overall.toFixed(2)} geo=${r.geometry.toFixed(2)} prop=${r.proportion.toFixed(2)}`);
  for (const t of r.topIssues) console.log(`   ${t}`);
}

const unsupportedRows = rows.filter((r) => r.unsupported > 0);
console.log("\n=== Models with unsupported weighted components ===\n");
if (unsupportedRows.length === 0) console.log("None.");
for (const r of unsupportedRows) {
  console.log(`# ${r.name}`);
  for (const issue of r.supportIssues) console.log(`   ${issue}`);
}

const errs = rows.filter((r) => r.error);
if (errs.length) { console.log("\n=== Builders that errored ==="); for (const e of errs) console.log(`- ${e.name}: ${e.error}`); }

const avg = rows.filter((r) => !r.error).reduce((s, r) => s + r.overall, 0) / Math.max(1, rows.filter((r) => !r.error).length);
console.log(`\nAudited ${rows.length} builders. Mean overall = ${avg.toFixed(3)}.`);
