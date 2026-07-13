import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(process.cwd());
const assetDir = join(root, "doc", "meshova-zhihu-assets");

const comparisons = [
  {
    output: "vehicle-parameter-comparison-wide.png",
    title: "同一辆车，真实修改宽高参数",
    subtitle: "固定相机和视角，只改变车宽、车高；每张图都由模型重新计算。",
    note: "局部改参数即可得到新版本，不必重新生成整辆车。",
    items: [
      { file: "vehicle-city-sedan-default.png", label: "低窄车身", value: "车宽 1.58 · 车高 1.16" },
      { file: "vehicle-city-sedan-wide.png", label: "加宽车身", value: "车宽 2.13 · 车高 1.42" },
      { file: "vehicle-city-sedan-tall.png", label: "增高车身", value: "车宽 1.84 · 车高 1.70" },
    ],
  },
  {
    output: "house-garden-parameter-comparison-wide.png",
    title: "同一座花园房子，调整密度得到不同庭院",
    subtitle: "固定相机和随机种子，真实改变房屋尺度与植被密度。",
    note: "调低或调高花园密度，场景会按规则重新布局。",
    items: [
      { file: "house-garden-sparse.png", label: "稀疏庭院", value: "密度 0 · 房屋 1.25" },
      { file: "house-garden-balanced.png", label: "均衡花园", value: "密度 0.5 · 房屋 1.08" },
      { file: "house-garden-lush.png", label: "茂密花园", value: "密度 1 · 房屋 0.78" },
    ],
  },
  {
    key: "urban",
    output: "urban-building-parameter-comparison-normal-wide-tall.png",
    width: 1800,
    imageHeight: 720,
    title: "同一栋都市高楼：正常 / 加宽 / 增高",
    subtitle: "固定相机和建筑风格，只改变楼体宽度、进深与层数。",
    note: "三栋都是高楼；每张图均应用参数后重新生成，没有复用旧截图。",
    items: [
      { file: "urban-building-normal.png", label: "正常高楼", value: "30 层 · 面宽 5.2" },
      { file: "urban-building-wide.png", label: "加宽高楼", value: "30 层 · 面宽 7.4" },
      { file: "urban-building-tall.png", label: "增高高楼", value: "40 层 · 面宽 5.2" },
    ],
  },
];

const requestedComparison = process.argv[2];
const selectedComparisons = requestedComparison
  ? comparisons.filter((comparison) => comparison.key === requestedComparison)
  : comparisons;
if (selectedComparisons.length === 0) throw new Error(`unknown comparison: ${requestedComparison}`);

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

async function imageData(file) {
  const bytes = await readFile(join(assetDir, file));
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

const shellExe = chromium.executablePath();
const fullExe = shellExe
  .replace(/chromium_headless_shell-(\d+)/, "chromium-$1")
  .replace(/chrome-headless-shell-win64[\\/]chrome-headless-shell\.exe$/i, "chrome-win64\\chrome.exe");
const browser = await chromium.launch({
  headless: true,
  executablePath: fullExe,
  args: ["--headless=new"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 820 }, deviceScaleFactor: 1 });

for (const comparison of selectedComparisons) {
  const width = comparison.width ?? 1440;
  const imageHeight = comparison.imageHeight ?? 648;
  await page.setViewportSize({ width, height: imageHeight + 260 });
  const items = await Promise.all(comparison.items.map(async (item) => ({
    ...item,
    src: await imageData(item.file),
  })));
  await page.setContent(`<!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          html, body { width: ${width}px; margin: 0; background: #08111f; }
          body { color: #edf6ff; font-family: "Microsoft YaHei", "PingFang SC", sans-serif; }
          main { width: ${width}px; padding: 28px 34px 24px; background: linear-gradient(155deg, #08111f, #0d1c30); }
          header { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 20px; }
          h1 { margin: 0 0 8px; font-size: 30px; line-height: 1.25; letter-spacing: -0.02em; }
          .subtitle { margin: 0; color: #9eb2c9; font-size: 15px; }
          .badge { flex: none; padding: 8px 13px; border: 1px solid #22c8ef; border-radius: 999px; color: #7ce7ff; font-size: 14px; font-weight: 700; }
          .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
          article { overflow: hidden; border: 1px solid #263a52; border-radius: 11px; background: #101d2e; box-shadow: 0 12px 30px rgba(0, 0, 0, 0.22); }
          .label { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px; padding: 0 14px; }
          .label strong { font-size: 17px; }
          .label span { color: #50d8fb; font-size: 13px; white-space: nowrap; }
          img { display: block; width: 100%; height: ${imageHeight}px; object-fit: cover; object-position: center; background: #aab4c0; }
          footer { margin-top: 17px; padding: 12px 15px; border-left: 4px solid #26c7ef; background: #0d1a2a; color: #c2d2e3; font-size: 15px; }
        </style>
      </head>
      <body>
        <main>
          <header>
            <div>
              <h1>${escapeHtml(comparison.title)}</h1>
              <p class="subtitle">${escapeHtml(comparison.subtitle)}</p>
            </div>
            <div class="badge">同一模板 · 参数驱动</div>
          </header>
          <section class="grid">
            ${items.map((item) => `<article>
              <div class="label"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.value)}</span></div>
              <img src="${item.src}" alt="${escapeHtml(item.label)}" />
            </article>`).join("")}
          </section>
          <footer>${escapeHtml(comparison.note)}</footer>
        </main>
      </body>
    </html>`);
  await page.locator("main").screenshot({ path: join(assetDir, comparison.output) });
  console.log(`written: doc/meshova-zhihu-assets/${comparison.output}`);
}

await browser.close();
