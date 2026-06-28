/**
 * Wine-glass image->model run: drive the real imageToModel pipeline against the
 * pasted reference photo. The reference is decoded, each candidate script is
 * built in the sandbox, rendered headlessly in the viewer, and scored by
 * silhouette IoU + color against the photo. No VLM key here, so a deterministic
 * client supplies lathe profiles (a capable vision model would emit these from
 * the photo + score feedback); everything else — decode, render, scoring — is
 * the production path.
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { imageToModel, MockLlmClient, toViewerModel, decodePNG, maskFromPhoto, encodePNG } from "../dist/index.js";

const ROOT = resolve(process.cwd());
const REF = process.argv[2] || ".ultragamestudio/clipboard-images/pasted-1782570881069-9ad7cde9dd604b19-0.png";
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

const referencePng = new Uint8Array(await readFile(join(ROOT, REF)));
const outDir = join(ROOT, "out", "wineglass");
await mkdir(outDir, { recursive: true });

// Debug: dump the extracted reference silhouette so we can eyeball what the
// scorer is matching against.
{
  const img = decodePNG(referencePng);
  const mask = maskFromPhoto(img);
  const vis = new Uint8Array(img.width * img.height);
  for (let i = 0; i < mask.data.length; i++) vis[i] = mask.data[i] ? 255 : 0;
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(outDir, "ref-mask.png"), encodePNG(img.width, img.height, 1, vis));
  let fg = 0;
  for (let i = 0; i < mask.data.length; i++) fg += mask.data[i];
  console.log(`reference ${img.width}x${img.height}, foreground ${(100 * fg / mask.data.length).toFixed(1)}% -> out/wineglass/ref-mask.png`);
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
await page.waitForFunction(() => !!window.__meshova, null, { timeout: 30000 });
await page.evaluate(() => window.__meshova.setAutorot(false));

async function render(parts, iteration) {
  const model = toViewerModel(parts, `wine-${iteration}`);
  await page.evaluate((m) => window.__meshova.loadParts(m), model);
  await page.evaluate(() => window.__meshova.setView("front"));
  await page.evaluate(() => window.__meshova.screenshotReady());
  await page.waitForTimeout(150);
  const canvas = await page.$("canvas");
  const file = join(outDir, `iter-${iteration}.png`);
  await canvas.screenshot({ path: file });
  const buf = await readFile(file);
  return { imageBase64: buf.toString("base64"), notes: `out/wineglass/iter-${iteration}.png` };
}

// Lathe helper inlined into each script: build a wine-glass profile as control
// points [y, r] and sweep a vertical polyline with radiusAt() for the taper.
// The three candidates refine the bowl/stem/foot proportions toward the photo.
const LATHE = (rows) => `
const prof = ${JSON.stringify(rows)};
const pts = prof.map((p) => vec3(0, p[0], 0));
const curve = polyline(pts, false);
const n = prof.length;
const radiusAt = (t) => {
  const f = t * (n - 1);
  const i = Math.max(0, Math.min(n - 2, Math.floor(f)));
  const k = f - i;
  return prof[i][1] * (1 - k) + prof[i + 1][1] * k;
};
const glass = sweep(curve, { radius: 1, sides: 48, radiusAt, caps: true });
return [ part('glass', glass, [0.82, 0.71, 0.52]) ];
`;

// iter 0: rough goblet (foot, stem, plain bowl)
const p0 = [[0, 0.02], [0.04, 0.5], [0.12, 0.5], [0.18, 0.06], [0.6, 0.05], [0.7, 0.2], [1.1, 0.4], [1.6, 0.4], [1.9, 0.38]];
// iter 1: tulip bowl that curves inward at the rim + flared foot
const p1 = [[0, 0.02], [0.03, 0.52], [0.06, 0.52], [0.1, 0.4], [0.16, 0.06], [0.62, 0.05], [0.72, 0.12], [0.95, 0.34], [1.25, 0.43], [1.55, 0.41], [1.8, 0.33], [1.95, 0.31]];
// iter 2: taller egg-shaped bowl matching the photo's narrow waist + rounded belly + slight rim in
const p2 = [[0, 0.02], [0.03, 0.55], [0.05, 0.55], [0.09, 0.42], [0.15, 0.05], [0.66, 0.045], [0.74, 0.1], [0.9, 0.26], [1.15, 0.4], [1.4, 0.43], [1.65, 0.4], [1.85, 0.33], [2.0, 0.31]];

const client = new MockLlmClient([
  "```js" + LATHE(p0) + "```",
  "```js" + LATHE(p1) + "```",
  "```js" + LATHE(p2) + "```",
]);

console.log("imageToModel: wine glass (shape-match against the photo)...");
const result = await imageToModel({
  client,
  referencePng,
  hint: "a stemmed wine glass: flared foot, thin stem, rounded tulip bowl, open rim",
  iterations: 3,
  targetScore: 0.98,
  classifyMaterial: false,
  render,
  onStep: (s) => {
    const sc = s.score ? ` score=${s.score.score.toFixed(3)} (IoU=${s.score.silhouetteIoU.toFixed(3)}, color=${s.score.colorSimilarity.toFixed(3)})` : "";
    console.log(`  iter ${s.iteration}: ${s.ok ? "OK" : "FAIL " + (s.score ? "" : "")}${sc}`);
  },
});

console.log(`\nBest score: ${result.score ? result.score.score.toFixed(3) : "n/a"} (IoU=${result.score?.silhouetteIoU.toFixed(3)}) after ${result.iterations} iterations.`);
console.log("Best script:\n" + result.script);

await browser.close();
server.close();
process.exit(result.success ? 0 : 1);

