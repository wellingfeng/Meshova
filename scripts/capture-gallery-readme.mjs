import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(process.cwd());
const siteDir = resolve(root, process.env.MESHOVA_PAGES_DIR || ".site");
const outputPath = resolve(root, "docs/assets/meshova-gallery.png");
const mime = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".wasm": "application/wasm",
};

if (!existsSync(join(siteDir, "index.html"))) {
  throw new Error(".site missing. Run `pnpm build` and `node scripts/build-pages.mjs` first.");
}

const server = createServer(async (request, response) => {
  try {
    let pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
    if (pathname === "/") pathname = "/index.html";
    const path = normalize(join(siteDir, pathname));
    if (!path.startsWith(siteDir)) {
      response.writeHead(403).end();
      return;
    }
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "content-type": mime[extname(path)] || "application/octet-stream" });
    response.end(await readFile(path));
  } catch {
    response.writeHead(500).end("server error");
  }
});

const port = await new Promise((resolvePort) => {
  server.listen(0, "127.0.0.1", () => resolvePort(server.address().port));
});
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--headless=new"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 2200 } });
  const pageErrors = [];
  const failedRequests = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("requestfailed", (request) => failedRequests.push(`${request.url()} ${request.failure()?.errorText || "failed"}`));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await page.waitForSelector("#grid .card");

  const previewCard = page.locator("#grid .card").first();
  await previewCard.click();
  await page.waitForSelector("#modal.on");
  const frame = page.frameLocator("#modal-frame");
  await frame.locator("#stage canvas").waitFor({ state: "visible", timeout: 60_000 });
  const frameUrl = page.frames().find((candidate) => candidate !== page.mainFrame())?.url() || "";
  if (!new URL(frameUrl).pathname.endsWith("/viewer.html")) {
    throw new Error(`Model preview opened wrong page: ${frameUrl}`);
  }
  if (await frame.locator("#grid .card").count()) {
    throw new Error("Model preview contains nested gallery");
  }
  await page.click("#modal-close");

  const generatedCard = page.locator('#grid .card[data-generated="true"]').first();
  if (await generatedCard.count()) {
    await generatedCard.click();
    await page.waitForSelector("#modal.on");
    const generatedFrame = page.frameLocator("#modal-frame");
    await generatedFrame.locator("#stage canvas").waitFor({ state: "visible", timeout: 120_000 });
    const generatedMeta = await generatedFrame.locator("body").evaluate(async () => {
      await window.__meshovaReady;
      await window.__meshova?.settle?.(2);
      return window.__meshova?.meta?.();
    });
    if (!generatedMeta?.parts) {
      throw new Error("Published generated model did not finish loading");
    }
    const generatedFrameUrl = page.frames().find((candidate) => candidate !== page.mainFrame())?.url() || "";
    if (!new URL(generatedFrameUrl).pathname.endsWith("/viewer.html")) {
      throw new Error(`Generated model preview opened wrong page: ${generatedFrameUrl}`);
    }
    if (await generatedFrame.locator("#grid .card").count()) {
      throw new Error("Generated model preview contains nested gallery");
    }
    await page.click("#modal-close");
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(() => {
    const captureBottom = window.innerHeight + 300;
    return [...document.querySelectorAll("#grid .card.loading")]
      .every((card) => card.getBoundingClientRect().top > captureBottom);
  }, null, { timeout: 180_000 });
  await page.waitForTimeout(500);

  if (pageErrors.length || failedRequests.length) {
    throw new Error(`Gallery errors: ${JSON.stringify({ pageErrors, failedRequests }, null, 2)}`);
  }
  await page.screenshot({ path: outputPath });
  const summary = await page.evaluate(() => ({
    cards: document.querySelectorAll("#grid .card").length,
    loadingInCapture: [...document.querySelectorAll("#grid .card.loading")]
      .filter((card) => card.getBoundingClientRect().top <= window.innerHeight).length,
  }));
  console.log(`README gallery screenshot: ${outputPath}`);
  console.log(`Cards: ${summary.cards}; loading in capture: ${summary.loadingInCapture}`);
} finally {
  await browser.close();
  server.close();
}
