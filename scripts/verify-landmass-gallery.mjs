import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { chromium } from "playwright";

const models = [
  { id: "landmass-eroded-mesa", parts: 1 },
  { id: "landmass-volcanic-caldera", parts: 2 },
  { id: "landmass-temperate-archipelago", parts: 2 },
  { id: "landmass-alpine-ridge", parts: 1 },
];
const port = 5400 + (process.pid % 200);
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["scripts/serve.mjs"], {
  env: { ...process.env, PORT: String(port) },
  stdio: "ignore",
  windowsHide: true,
});

function fullChromiumPath() {
  return chromium.executablePath()
    .replace(/chromium_headless_shell-(\d+)/, "chromium-$1")
    .replace(/chrome-headless-shell-win64[\\/]chrome-headless-shell\.exe$/i, "chrome-win64\\chrome.exe");
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(`${base}/web/gallery.html`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("viewer server timeout");
}

let browser;
try {
  await waitForServer();
  const executablePath = fullChromiumPath();
  browser = await chromium.launch({
    executablePath: existsSync(executablePath) ? executablePath : undefined,
    headless: true,
    args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--headless=new"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`${base}/web/gallery.html`, { waitUntil: "networkidle" });

  const results = [];
  for (const model of models) {
    const card = page.locator(`[data-id="${model.id}"]`);
    await card.waitFor({ state: "visible", timeout: 60000 });
    await page.waitForFunction((id) => !document.querySelector(`[data-id="${id}"]`)?.classList.contains("loading"), model.id, { timeout: 60000 });
    await card.screenshot({ path: `out/shots/qa-${model.id}-card.png` });
    await card.click();
    await page.locator("#modal.on").waitFor({ state: "visible" });

    const frame = page.frameLocator("#modal-frame");
    await frame.locator("#stage canvas").waitFor({ state: "visible", timeout: 60000 });
    await frame.locator("body").evaluate(async () => {
      await window.__meshova?.settle?.(12);
    });
    const meta = await frame.locator("body").evaluate(() => window.__meshova?.meta?.());
    const swatches = await frame.locator("#parts .sw").evaluateAll((elements) => elements.map((element) => getComputedStyle(element).backgroundColor));
    await frame.locator("#stage").screenshot({ path: `out/shots/qa-${model.id}-clicked.png` });
    results.push({ id: model.id, meta, swatches });
    if (meta?.parts !== model.parts) throw new Error(`${model.id}: expected ${model.parts} parts, got ${meta?.parts}`);

    await page.locator("#modal-close").click();
    await page.locator("#modal.on").waitFor({ state: "hidden" });
  }

  if (errors.length) throw new Error(errors.join("\n"));
  console.log(JSON.stringify({ ok: true, results }, null, 2));
} finally {
  await browser?.close();
  server.kill();
}
