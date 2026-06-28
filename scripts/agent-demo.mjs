/**
 * Agent loop end-to-end demo — the P4 closed loop, headless.
 *
 * Boots the viewer in headless Chromium once, then runs the agent loop with a
 * MockLlmClient (no API key needed). Each successful script is injected into
 * the live viewer via window.__meshova.loadParts and screenshotted, proving
 * the full chain: script -> sandbox run -> render -> feedback -> revise.
 *
 * Swap MockLlmClient for makeOpenAICompatibleClient (passing your fetch + key)
 * to drive it with a real vision model. Nothing else changes.
 *
 * Usage: pnpm tsx scripts/agent-demo.mjs   (or: node after build)
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { runAgentLoop, MockLlmClient, toViewerModel } from "../dist/index.js";

const ROOT = resolve(process.cwd());
const SIZE = { width: 900, height: 700 };
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
const outDir = join(ROOT, "out", "agent");
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

/** Render callback: inject parts into the live viewer and screenshot to PNG. */
async function render(parts, iteration) {
  const model = toViewerModel(parts, `iter-${iteration}`);
  await page.evaluate((m) => window.__meshova.loadParts(m), model);
  await page.evaluate((v) => window.__meshova.setView(v), "persp");
  await page.evaluate(() => window.__meshova.screenshotReady());
  await page.waitForTimeout(150);
  const canvas = await page.$("canvas");
  const file = join(outDir, `iter-${iteration}.png`);
  await canvas.screenshot({ path: file });
  const buf = await readFile(file);
  console.log(`  rendered iteration ${iteration} -> out/agent/iter-${iteration}.png`);
  return { imageBase64: buf.toString("base64"), notes: `saved to out/agent/iter-${iteration}.png` };
}

// Mock "model replies": first a deliberately broken script, then a fix, then a
// refinement. A real LLM would generate these from the goal + screenshot.
const client = new MockLlmClient([
  "```js\nreturn buildTree();\n```", // iter 0: fails (undefined fn)
  // iter 1: a basic low-poly tree (trunk + foliage), succeeds
  "```js\nconst trunk = part('trunk', cylinder(0.12, 0.8, 8), [0.4,0.26,0.15]);\nconst foliage = part('foliage', transform(icosphere(0.55, 1), { translate: vec3(0,0.95,0) }), [0.25,0.55,0.2]);\nreturn [trunk, foliage];\n```",
  // iter 2: refined — taller trunk + layered foliage
  "```js\nconst trunk = part('trunk', cylinder(0.1, 1.0, 8), [0.4,0.26,0.15]);\nconst f1 = part('f1', transform(icosphere(0.55,1), { translate: vec3(0,0.95,0) }), [0.22,0.5,0.18]);\nconst f2 = part('f2', transform(icosphere(0.4,1), { translate: vec3(0.15,1.3,0.05) }), [0.28,0.58,0.22]);\nconst f3 = part('f3', transform(icosphere(0.38,1), { translate: vec3(-0.12,1.25,-0.05) }), [0.24,0.54,0.2]);\nreturn [trunk, f1, f2, f3];\n```",
]);

console.log("Running agent loop (goal: a low-poly tree)...");
const result = await runAgentLoop({
  client,
  goal: "a low-poly stylized tree, ~2 units tall, centered",
  maxIterations: 3,
  render,
  onStep: (s) => {
    const status = s.run.ok ? "OK" : `FAIL (${s.run.error})`;
    console.log(`iteration ${s.iteration}: ${status}`);
    if (s.run.ok) console.log(s.run.summary.split("\n").map((l) => "    " + l).join("\n"));
  },
});

console.log(`\nLoop ${result.success ? "succeeded" : "failed"}; ${result.steps.length} iterations.`);
console.log(`Final script (iteration ${result.final?.iteration}):\n${result.final?.script}`);

// Second run: shape-aligned material (snow settles on upward faces). Proves
// the material follows the geometry with zero UV/projection work.
const matClient = new MockLlmClient([
  "```js\nconst rock = displaceByNoise(icosphere(1, 3), { seed: 7, scale: 1.6, amount: 0.35 });\nreturn [ coloredPart('rock', rock, weatheredColor({ base: vec3(0.12,0.1,0.09), topColor: vec3(0.95,0.96,1.0), topThreshold: 0.68, topSoftness: 0.1, cavityColor: vec3(0.05,0.04,0.03), cavityBelow: 0.0 })) ];\n```",
]);
console.log("\nRunning agent loop (goal: a snow-capped rock, shape-aligned material)...");
const matResult = await runAgentLoop({
  client: matClient,
  goal: "a snow-capped rock where snow settles only on upward faces",
  maxIterations: 1,
  render: async (parts) => {
    const model = toViewerModel(parts, "snow-rock");
    await page.evaluate((m) => window.__meshova.loadParts(m), model);
    await page.evaluate((v) => window.__meshova.setView(v), "persp");
    await page.evaluate(() => window.__meshova.screenshotReady());
    await page.waitForTimeout(150);
    const canvas = await page.$("canvas");
    const file = join(outDir, "snow-rock.png");
    await canvas.screenshot({ path: file });
    console.log("  rendered snow-capped rock -> out/agent/snow-rock.png");
    return { notes: "saved" };
  },
  onStep: (s) => console.log(`material iteration ${s.iteration}: ${s.run.ok ? "OK" : "FAIL " + s.run.error}`),
});

await browser.close();
server.close();
process.exit(result.success && matResult.success ? 0 : 1);
