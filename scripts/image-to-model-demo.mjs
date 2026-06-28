/**
 * Image -> procedural model demo (P7) — the shape-matching closed loop, headless.
 *
 * Boots the viewer in headless Chromium, then runs imageToModel against a
 * reference PNG. Each candidate script is injected into the live viewer,
 * screenshotted, and scored (silhouette IoU + color) against the reference;
 * the score is fed back so the model improves the SHAPE. A MockLlmClient is
 * used by default so this runs with no API key — swap in
 * makeOpenAICompatibleClient (with your fetch + key + a vision model) for the
 * real thing; nothing else changes.
 *
 * Usage: pnpm tsx scripts/image-to-model-demo.mjs [referencePng]
 *   default reference: out/shots/<first existing> or a generated test square.
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { imageToModel, MockLlmClient, toViewerModel, encodePNG } from "../dist/index.js";

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

const outDir = join(ROOT, "out", "image-to-model");
await mkdir(outDir, { recursive: true });

// Resolve a reference image: CLI arg, else generate a simple test target so
// the demo always runs. The generated target is a tall capsule-ish blob.
let referencePng;
const argPath = process.argv[2];
if (argPath && existsSync(argPath)) {
  referencePng = new Uint8Array(await readFile(argPath));
  console.log(`reference: ${argPath}`);
} else {
  const s = 256;
  const px = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = (y * s + x) * 4;
    // upright rounded "bottle" silhouette on light bg
    const nx = (x - s / 2) / (s * 0.18);
    const body = Math.abs(nx) < 1 && y > s * 0.25 && y < s * 0.92;
    const neck = Math.abs(x - s / 2) < s * 0.06 && y >= s * 0.1 && y <= s * 0.25;
    const fg = body || neck;
    const c = fg ? [70, 120, 90] : [238, 238, 238];
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
  }
  referencePng = encodePNG(s, s, 4, px);
  const refFile = join(outDir, "reference.png");
  await writeFile(refFile, referencePng);
  console.log(`reference: generated test target -> out/image-to-model/reference.png`);
}

const { server, port } = await startServer();
const base = `http://localhost:${port}`;

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
const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 1 });
await page.goto(base + "/", { waitUntil: "networkidle" });
await page.waitForFunction(() => !!window.__meshova, null, { timeout: 10000 });
await page.evaluate(() => window.__meshova.setAutorot(false));

async function render(parts, iteration) {
  const model = toViewerModel(parts, `img-${iteration}`);
  await page.evaluate((m) => window.__meshova.loadParts(m), model);
  await page.evaluate(() => window.__meshova.setView("front"));
  await page.evaluate(() => window.__meshova.screenshotReady());
  await page.waitForTimeout(150);
  const canvas = await page.$("canvas");
  const file = join(outDir, `iter-${iteration}.png`);
  await canvas.screenshot({ path: file });
  const buf = await readFile(file);
  return { imageBase64: buf.toString("base64"), notes: `out/image-to-model/iter-${iteration}.png` };
}

// Mock model "thinking": refine a bottle-like shape across iterations. A real
// vision model would derive these from the reference + score feedback.
const client = new MockLlmClient([
  // iter 0: rough single cylinder body
  "```js\nreturn [ part('body', cylinder(0.45, 1.4, 24), [0.27,0.47,0.35]) ];\n```",
  // iter 1: add a neck
  "```js\nconst body = part('body', cylinder(0.45, 1.2, 24), [0.27,0.47,0.35]);\nconst neck = part('neck', transform(cylinder(0.14, 0.5, 16), { translate: vec3(0,0.85,0) }), [0.27,0.47,0.35]);\nreturn [body, neck];\n```",
  // iter 2: round the shoulder with a sphere blend
  "```js\nconst body = part('body', cylinder(0.45, 1.0, 24), [0.27,0.47,0.35]);\nconst shoulder = part('shoulder', transform(sphere(0.45, 24, 16), { translate: vec3(0,0.5,0), scale: vec3(1,0.6,1) }), [0.27,0.47,0.35]);\nconst neck = part('neck', transform(cylinder(0.13, 0.5, 16), { translate: vec3(0,0.9,0) }), [0.27,0.47,0.35]);\nreturn [body, shoulder, neck];\n```",
]);

console.log("Running imageToModel (shape-match loop)...");
const result = await imageToModel({
  client,
  referencePng,
  iterations: 3,
  targetScore: 0.95,
  classifyMaterial: false, // mock client can't classify; skip for the demo
  render,
  onStep: (s) => {
    const sc = s.score ? ` score=${s.score.score.toFixed(3)} (IoU=${s.score.silhouetteIoU.toFixed(3)}, color=${s.score.colorSimilarity.toFixed(3)})` : "";
    console.log(`  iter ${s.iteration}: ${s.ok ? "OK" : "FAIL"}${sc}`);
  },
});

console.log(`\nBest score: ${result.score ? result.score.score.toFixed(3) : "n/a"} after ${result.iterations} iterations.`);
console.log(`Best script:\n${result.script}`);

await browser.close();
server.close();
process.exit(result.success ? 0 : 1);

