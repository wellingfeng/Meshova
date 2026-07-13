import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const baseUrl = process.argv[2] || "http://127.0.0.1:5173";
const outputPath = resolve(process.argv[3] || "out/content-render-audit.json");

function browserExecutable() {
  const shellExe = chromium.executablePath();
  const fullExe = shellExe
    .replace(/chromium_headless_shell-(\d+)/, "chromium-$1")
    .replace(/chrome-headless-shell-win64[\\/]chrome-headless-shell\.exe$/i, "chrome-win64\\chrome.exe");
  return existsSync(fullExe) ? fullExe : undefined;
}

const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--headless=new"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));

try {
  await page.goto(`${baseUrl}/web/index.html?model=teddy`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => Boolean(window.__meshova), null, { timeout: 90000 });
  await page.evaluate(() => window.__meshovaReady);
  await page.evaluate(() => window.__meshova.loadModelById("teddy"));
  await page.waitForFunction(() => window.__meshova.meta().parts > 0, null, { timeout: 90000 });
  await page.evaluate(() => window.__meshova.screenshotReady());
  const model = await page.evaluate(() => ({
    ids: window.__meshova.models(),
    params: window.__meshova.getParams(),
    meta: window.__meshova.meta(),
  }));
  await page.goto(`${baseUrl}/web/matlab.html?mat=rustyMetal`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => document.querySelector("#loading")?.getAttribute("aria-hidden") === "true", null, { timeout: 120000 });
  const material = await page.evaluate(() => ({
    selected: document.querySelector("#mat-select")?.value,
    controls: document.querySelectorAll("#param-panel input").length,
  }));
  const report = { model, material, pageErrors: [...new Set(pageErrors)] };
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (!model.ids.includes("teddy") || model.meta.parts < 1) throw new Error("content model failed to render");
  if (material.selected !== "rustyMetal" || material.controls < 1) throw new Error("content material failed to render");
  if (report.pageErrors.length) throw new Error(report.pageErrors.join("\n"));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
