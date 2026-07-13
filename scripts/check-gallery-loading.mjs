import { existsSync } from "node:fs";
import { chromium } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:5173";
const budgetMs = Number(process.argv[3] || 1000);
const requiredRatio = Number(process.argv[4] || 0.9);

function browserExecutable() {
  const shellExecutable = chromium.executablePath();
  const fullExecutable = shellExecutable
    .replace(/chromium_headless_shell-(\d+)/, "chromium-$1")
    .replace(/chrome-headless-shell-win64[\\/]chrome-headless-shell\.exe$/i, "chrome-win64\\chrome.exe");
  return existsSync(fullExecutable) ? fullExecutable : undefined;
}

const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1536, height: 864 } });

try {
  await page.goto(`${baseUrl}/web/gallery.html`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForSelector(".card", { timeout: 120000 });
  await page.waitForTimeout(budgetMs);

  const result = await page.evaluate(() => {
    const cards = [...document.querySelectorAll(".card")];
    const nearViewport = cards.filter((card) => {
      const bounds = card.getBoundingClientRect();
      return bounds.bottom >= -300 && bounds.top <= window.innerHeight + 300;
    });
    const completed = nearViewport.filter((card) => !card.classList.contains("loading"));
    return {
      completed: completed.length,
      total: nearViewport.length,
      staticPreviews: completed.filter((card) => card.dataset.previewSource === "static").length,
    };
  });
  const ratio = result.total ? result.completed / result.total : 0;
  console.log(JSON.stringify({ budgetMs, requiredRatio, ratio, ...result }, null, 2));
  if (ratio < requiredRatio) process.exitCode = 1;
} finally {
  await browser.close();
}
