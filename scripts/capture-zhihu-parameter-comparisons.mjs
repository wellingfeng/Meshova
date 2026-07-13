import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(process.cwd());
const assetDir = join(root, "doc", "meshova-zhihu-assets");
const sourceDir = join(root, "out", "shots");

const groups = [
  {
    model: "vehicle-city-sedan",
    frame: { width: 2.13, height: 1.7 },
    cases: [
      { output: "vehicle-city-sedan-default.png", params: { width: 1.58, height: 1.16 } },
      { output: "vehicle-city-sedan-wide.png", params: { width: 2.13, height: 1.42 } },
      { output: "vehicle-city-sedan-tall.png", params: { width: 1.84, height: 1.7 } },
    ],
  },
  {
    model: "house-garden-03",
    frame: { lotSize: 5.7, houseScale: 1.45, gardenDensity: 1, treeDensity: 1, flowerDensity: 1 },
    cases: [
      { output: "house-garden-sparse.png", params: { lotSize: 5.7, houseScale: 1.25, gardenDensity: 0, treeDensity: 0, flowerDensity: 0, seed: 131 } },
      { output: "house-garden-balanced.png", params: { lotSize: 5.7, houseScale: 1.08, gardenDensity: 0.55, treeDensity: 0.5, flowerDensity: 0.5, seed: 131 } },
      { output: "house-garden-lush.png", params: { lotSize: 5.7, houseScale: 0.78, gardenDensity: 1, treeDensity: 1, flowerDensity: 1, seed: 131 } },
    ],
  },
  {
    model: "urban-artdeco",
    frame: { floors: 40, floorHeight: 1, width: 7.4, depth: 6, podiumFloors: 3, podiumOverhang: 0.9, setbackEvery: 8, setbackAmount: 0.15, crown: 1, crownHeight: 1.5 },
    cases: [
      { output: "urban-building-normal.png", params: { floors: 30, floorHeight: 1, width: 5.2, depth: 4.6, podiumFloors: 3, podiumOverhang: 0.9, setbackEvery: 8, setbackAmount: 0.15, crown: 1, crownHeight: 1.5 } },
      { output: "urban-building-wide.png", params: { floors: 30, floorHeight: 1, width: 7.4, depth: 6, podiumFloors: 3, podiumOverhang: 0.9, setbackEvery: 8, setbackAmount: 0.15, crown: 1, crownHeight: 1.5 } },
      { output: "urban-building-tall.png", params: { floors: 40, floorHeight: 1, width: 5.2, depth: 4.6, podiumFloors: 3, podiumOverhang: 0.9, setbackEvery: 8, setbackAmount: 0.15, crown: 1, crownHeight: 1.5 } },
    ],
  },
];

const requestedModel = process.argv[2];
const selectedGroups = requestedModel
  ? groups.filter((group) => group.model === requestedModel)
  : groups;
if (selectedGroups.length === 0) throw new Error(`unknown comparison model: ${requestedModel}`);

function runScreenshot(model, frame, params) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, ["scripts/screenshot.mjs", model, "current"], {
      cwd: root,
      env: {
        ...process.env,
        FRAME_PARAMS: JSON.stringify(frame),
        PARAMS: JSON.stringify(params),
      },
      stdio: "inherit",
    });
    child.on("error", rejectRun);
    child.on("exit", (code) => code === 0
      ? resolveRun()
      : rejectRun(new Error(`screenshot failed for ${model}, exit ${code}`)));
  });
}

await mkdir(assetDir, { recursive: true });
const audit = [];
for (const group of selectedGroups) {
  for (const item of group.cases) {
    await runScreenshot(group.model, group.frame, item.params);
    const source = join(sourceDir, `${group.model}-current.png`);
    const target = join(assetDir, item.output);
    await copyFile(source, target);
    const bytes = await readFile(target);
    audit.push({
      model: group.model,
      output: item.output,
      params: item.params,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
}

for (const group of selectedGroups) {
  const hashes = audit.filter((item) => item.model === group.model).map((item) => item.sha256);
  if (new Set(hashes).size !== hashes.length) throw new Error(`duplicate screenshots detected for ${group.model}`);
}

const auditFile = join(root, "out", "zhihu-parameter-comparison-audit.json");
await writeFile(auditFile, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(`wrote ${audit.length} verified screenshots`);
console.log(`audit: ${auditFile}`);
