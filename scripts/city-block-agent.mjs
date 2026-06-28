/**
 * City-block agent demo — text -> generate street block -> screenshot -> score.
 *
 * Closes the loop for the architecture category: a (mock) LLM is asked for a
 * believable city block, writes a script that calls buildCityBlockParts, the
 * sandbox runs it, the live viewer renders a screenshot, and scoreCityBlock
 * grades the result. The numeric score + textual critique feed back so the
 * model improves: iter 0 a single building (low score), iter 1 a flat block,
 * iter 2 a varied block with roads (high score).
 *
 * Swap MockLlmClient for makeOpenAICompatibleClient to drive it with a real
 * vision model — the scorer and render path stay identical.
 *
 * Usage: pnpm city-block-agent   (requires build + Playwright Chromium)
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import {
  runAgentLoop,
  MockLlmClient,
  toViewerModel,
  scoreCityBlock,
  runMeshScript,
} from "../dist/index.js";

const ROOT = resolve(process.cwd());
const SIZE = { width: 1000, height: 700 };
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".css": "text/css; charset=utf-8" };

function startServer() {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent((req.url || "/").split("?")[0]);
      if (p === "/favicon.ico") return res.writeHead(204).end();
      if (p === "/") p = "/web/index.html";
      const fp = normalize(join(ROOT, p));
      if (!fp.startsWith(ROOT)) return res.writeHead(403).end();
      const info = await stat(fp).catch(() => null);
      const target = info?.isDirectory() ? join(fp, "index.html") : fp;
      const body = await readFile(target);
      res.writeHead(200, { "content-type": MIME[extname(target)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  return new Promise((r) => server.listen(0, () => r({ server, port: server.address().port })));
}

const { server, port } = await startServer();
const base = `http://localhost:${port}`;
const outDir = join(ROOT, "out", "city-agent");
await mkdir(outDir, { recursive: true });

const shellExe = chromium.executablePath();
const fullExe = shellExe
  .replace(/chromium_headless_shell-(\d+)/, "chromium-$1")
  .replace(/chrome-headless-shell-win64[\\/]chrome-headless-shell\.exe$/i, "chrome-win64\\chrome.exe")
  .replace(/chrome-headless-shell-mac[^\\/]*[\\/].*$/i, "chrome-mac/Chromium.app/Contents/MacOS/Chromium")
  .replace(/chrome-headless-shell-linux[\\/]chrome-headless-shell$/i, "chrome-linux/chrome");

const browser = await chromium.launch({
  executablePath: existsSync(fullExe) ? fullExe : undefined,
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--headless=new"],
});
const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 2 });
await page.goto(base + "/", { waitUntil: "networkidle" });
await page.waitForFunction(() => !!window.__meshova, null, { timeout: 10000 });
await page.evaluate(() => window.__meshova.setAutorot(false));

const scores = [];

/** Render + score: inject parts, screenshot, grade with scoreCityBlock. */
async function render(parts, iteration) {
  const model = toViewerModel(parts, `city-${iteration}`);
  await page.evaluate((m) => window.__meshova.loadParts(m), model);
  await page.evaluate((v) => window.__meshova.setView(v), "persp");
  await page.evaluate(() => window.__meshova.screenshotReady());
  await page.waitForTimeout(150);
  const canvas = await page.$("canvas");
  const file = join(outDir, `iter-${iteration}.png`);
  await canvas.screenshot({ path: file });
  const buf = await readFile(file);

  const graded = scoreCityBlock(parts);
  scores[iteration] = graded.score;
  console.log(`  iter ${iteration}: score ${graded.score.toFixed(2)} -> out/city-agent/iter-${iteration}.png`);
  console.log(`    ${graded.feedback}`);
  // Feed the score + critique back into the loop as renderer notes.
  return { imageBase64: buf.toString("base64"), notes: graded.feedback };
}

// Mock replies: a believable progression toward a varied street block.
const client = new MockLlmClient([
  // iter 0: a single building — reads as one house, low score
  "```js\nreturn buildBuildingParts({ floors: 4 });\n```",
  // iter 1: a flat block, no roads — better but flat + no street furniture
  "```js\nreturn buildCityBlockParts({ cols: 4, rows: 1, roads: false, minFloors: 5, maxFloors: 5 });\n```",
  // iter 2: full varied block with roads + sidewalks + facing the street
  "```js\nreturn buildCityBlockParts({ cols: 5, rows: 2, roads: true, faceStreet: true, minFloors: 2, maxFloors: 14, seed: 11 });\n```",
]);

console.log("Running city-block agent loop (goal: a believable downtown street block)...");
const result = await runAgentLoop({
  client,
  goal: "a believable downtown city block: multiple varied-height buildings lining a central street with sidewalks",
  maxIterations: 3,
  render,
  onStep: (s) => {
    const status = s.run.ok ? "OK" : `FAIL (${s.run.error})`;
    console.log(`iteration ${s.iteration}: ${status}`);
  },
});

// Independent verification: re-run the final script headless and score it.
let finalScore = 0;
if (result.final?.run.ok) {
  const reRun = runMeshScript(result.final.script, "final-verify");
  if (reRun.ok) finalScore = scoreCityBlock(reRun.parts).score;
}

console.log(`\nLoop ${result.success ? "succeeded" : "failed"}; ${result.steps.length} iterations.`);
console.log(`Scores by iteration: ${scores.map((s) => s?.toFixed(2)).join(" -> ")}`);
console.log(`Final verified score: ${finalScore.toFixed(2)}`);

await browser.close();
server.close();

// Success = loop ran, improved, and the final block scores well.
const improved = scores.length >= 2 && scores[scores.length - 1] > scores[0];
process.exit(result.success && improved && finalScore > 0.6 ? 0 : 1);
