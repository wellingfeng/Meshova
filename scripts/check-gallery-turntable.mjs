import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:5173";
const modelId = process.argv[3] || "sidefx-solaris-market";
const maxBackgroundDelta = Number(process.argv[4] || 24);
const outputDir = resolve("out/qa");

function browserExecutable() {
  const shellExecutable = chromium.executablePath();
  const fullExecutable = shellExecutable
    .replace(/chromium_headless_shell-(\d+)/, "chromium-$1")
    .replace(/chrome-headless-shell-win64[\\/]chrome-headless-shell\.exe$/i, "chrome-win64\\chrome.exe");
  return existsSync(fullExecutable) ? fullExecutable : undefined;
}

function colorDelta(first, second) {
  return Math.sqrt(
    (first[0] - second[0]) ** 2 +
    (first[1] - second[1]) ** 2 +
    (first[2] - second[2]) ** 2,
  );
}

const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1536, height: 864 } });
const selector = `.card[data-id="${modelId}"]`;

try {
  await mkdir(outputDir, { recursive: true });
  await page.goto(`${baseUrl}/web/gallery.html?turntable-check=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForSelector(selector, { timeout: 120000 });
  await page.locator(selector).scrollIntoViewIfNeeded();
  await page.waitForFunction((cardSelector) => {
    const card = document.querySelector(cardSelector);
    const image = card?.querySelector(".thumb img");
    return !!card && !card.classList.contains("loading") && !!image?.complete && image.naturalWidth > 0;
  }, selector, { timeout: 120000 });

  const imageSelector = `${selector} .thumb img`;
  const thumbSelector = `${selector} .thumb`;
  const sampleBackground = () => page.locator(imageSelector).evaluate((image) => {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const patchWidth = Math.max(4, Math.floor(canvas.width * 0.16));
    const patchHeight = Math.max(4, Math.floor(canvas.height * 0.16));
    const patches = [
      context.getImageData(0, 0, patchWidth, patchHeight).data,
      context.getImageData(canvas.width - patchWidth, 0, patchWidth, patchHeight).data,
    ];
    const sum = [0, 0, 0];
    let pixels = 0;
    for (const patch of patches) {
      for (let offset = 0; offset < patch.length; offset += 4) {
        sum[0] += patch[offset];
        sum[1] += patch[offset + 1];
        sum[2] += patch[offset + 2];
        pixels++;
      }
    }
    return {
      color: sum.map((channel) => channel / pixels),
      source: image.src.startsWith("data:image/") ? "live" : "static",
    };
  });

  const staticSample = await sampleBackground();
  await page.locator(thumbSelector).screenshot({ path: resolve(outputDir, `${modelId}-static.png`) });
  await page.locator(selector).hover();
  await page.waitForFunction(({ cardSelector }) => {
    const image = document.querySelector(`${cardSelector} .thumb img`);
    return !!image?.src.startsWith("data:image/png");
  }, { cardSelector: selector }, { timeout: 120000 });
  await page.waitForTimeout(180);
  const hoverSample = await sampleBackground();
  await page.locator(thumbSelector).screenshot({ path: resolve(outputDir, `${modelId}-hover.png`) });

  const backgroundDelta = colorDelta(staticSample.color, hoverSample.color);
  console.log(JSON.stringify({
    modelId,
    maxBackgroundDelta,
    backgroundDelta,
    staticSample,
    hoverSample,
  }, null, 2));
  if (backgroundDelta > maxBackgroundDelta) process.exitCode = 1;
} finally {
  await browser.close();
}
