import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const baseUrl = process.argv[2] || "http://127.0.0.1:5173";
const query = process.argv[3] || "";
const outputPath = resolve(process.argv[4] || "out/gallery-preview-audit.json");
const proceduralOnly = process.argv.includes("--procedural-only");

function browserExecutable() {
  const shellExe = chromium.executablePath();
  const fullExe = shellExe
    .replace(/chromium_headless_shell-(\d+)/, "chromium-$1")
    .replace(/chrome-headless-shell-win64[\\/]chrome-headless-shell\.exe$/i, "chrome-win64\\chrome.exe");
  return existsSync(fullExe) ? fullExe : undefined;
}

async function imageMetrics(image) {
  return image.evaluate((element) => {
    const width = element.naturalWidth;
    const height = element.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(element, 0, 0);
    const pixels = context.getImageData(0, 0, width, height).data;
    let foregroundPixels = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const red = pixels[offset] / 255;
        const green = pixels[offset + 1] / 255;
        const blue = pixels[offset + 2] / 255;
        const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
        const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
        if (luminance >= 0.78 && saturation <= 0.075) continue;
        foregroundPixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    const totalPixels = width * height;
    return {
      width,
      height,
      foregroundPixels,
      foregroundRatio: foregroundPixels / totalPixels,
      bounds: foregroundPixels ? { minX, minY, maxX, maxY } : null,
    };
  });
}

const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--headless=new"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));

try {
  await page.goto(`${baseUrl}/web/gallery.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  if (query) {
    await page.locator("#search").fill(query);
    await page.locator("#search").dispatchEvent("input");
  }
  const cardSelector = proceduralOnly
    ? ".card:visible[data-generated='false']:not([data-id^='mat:'])"
    : ".card:visible:not([data-id^='mat:'])";
  const cards = page.locator(cardSelector);
  const total = await cards.count();
  const results = [];
  for (let index = 0; index < total; index += 1) {
    const card = cards.nth(index);
    await card.scrollIntoViewIfNeeded();
    await page.waitForFunction((element) => !element.classList.contains("loading"), await card.elementHandle(), { timeout: 120000 });
    const id = await card.getAttribute("data-id");
    const name = await card.getAttribute("data-name");
    const generated = await card.getAttribute("data-generated") === "true";
    const previewSource = await card.getAttribute("data-preview-source");
    const image = card.locator(".thumb img");
    if (await image.count() === 0) {
      results.push({ id, name, generated, previewSource, blank: true, reason: "missing-image" });
      continue;
    }
    const metrics = await imageMetrics(image);
    results.push({ id, name, generated, previewSource, blank: metrics.foregroundPixels < 80, ...metrics });
  }
  const blank = results.filter((result) => result.blank);
  const staticFallbackCount = results.filter((result) => result.previewSource === "static").length;
  const proceduralBlankIds = blank.filter((result) => !result.generated).map((result) => result.id);
  const geometry = await page.evaluate(async (ids) => {
    const { PROC_MODELS, defaultParams } = await import("/web/procmodels.js");
    const output = [];
    for (const id of ids) {
      const model = PROC_MODELS[id];
      if (!model) continue;
      const parts = await model.build(defaultParams(model));
      output.push({
        id,
        parts: parts.map((part) => {
          const positions = part.mesh?.positions || [];
          const first = positions[0];
          const vectorObjects = typeof first === "object" && first !== null;
          let finite = true;
          for (const position of positions) {
            if (vectorObjects) {
              if (![position.x, position.y, position.z].every(Number.isFinite)) finite = false;
            } else if (!Number.isFinite(position)) finite = false;
          }
          return {
            name: part.name,
            positions: positions.length,
            indices: part.mesh?.indices?.length || 0,
            vectorObjects,
            finite,
          };
        }),
      });
    }
    return output;
  }, proceduralBlankIds);
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    query,
    proceduralOnly,
    total,
    blankCount: blank.length,
    staticFallbackCount,
    blank,
    geometry,
    pageErrors: [...new Set(pageErrors)],
    results,
  };
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ total, blankCount: blank.length, staticFallbackCount, blank, pageErrors: report.pageErrors }, null, 2));
} finally {
  await browser.close();
}
