import * as Meshova from "../src/index.js";
import { zFightingReport, type NamedPart } from "../src/index.js";

const REQUIRES_ARGS = new Set([
  "buildClimbingVineParts",
  "buildDrawableFenceParts",
  "buildDungeonThemeParts",
  "buildPathLightsParts",
  "buildRegionGroveParts",
]);
const moduleExports = Meshova as unknown as Record<string, unknown>;
const builders = Object.keys(moduleExports)
  .filter((name) =>
    /^build[A-Za-z]*Parts$/.test(name) &&
    typeof moduleExports[name] === "function" &&
    !REQUIRES_ARGS.has(name),
  )
  .sort();

const offenders: string[] = [];
const errors: string[] = [];

for (const name of builders) {
  try {
    const build = moduleExports[name] as () => NamedPart[];
    const parts = build();
    if (!Array.isArray(parts) || parts.length === 0) continue;
    const report = zFightingReport(parts, {
      includeSamePart: false,
      maxTriangles: Number.POSITIVE_INFINITY,
      maxExamples: 3,
    });
    if (report.pairs > 0) {
      offenders.push(`${name}: ${report.pairs} pair(s) [${report.parts.join(", ")}]${report.truncated ? " sampled" : ""}`);
    }
  } catch (error) {
    errors.push(`${name}: ${(error as Error).message}`);
  }
}

for (const offender of offenders) console.error(`Z-FIGHT ${offender}`);
for (const error of errors) console.error(`ERROR ${error}`);
console.log(`Audited ${builders.length} builders: ${offenders.length} offender(s), ${errors.length} error(s).`);

if (offenders.length > 0 || errors.length > 0) process.exitCode = 1;
