import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const baseUrl = process.argv[2] || "http://127.0.0.1:5173";
const outputPath = resolve(process.argv[3] || "out/proc-model-build-audit.json");

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
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));
const results = [];

try {
  await page.goto(`${baseUrl}/web/index.html?model=sphere`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => Boolean(window.__meshova), null, { timeout: 90000 });
  await page.evaluate(() => window.__meshovaReady);
  const ids = await page.evaluate(() => window.__meshova.models());

  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    const result = await page.evaluate(async (modelId) => {
      const { PROC_MODELS, defaultParams } = await import("/web/procmodels.js?v=pcg2");
      const model = PROC_MODELS[modelId];
      const startedAt = performance.now();
      try {
        const parts = await model.build(model.defaultParams ? model.defaultParams() : defaultParams(model));
        let vertices = 0;
        let triangles = 0;
        const problems = [];
        if (!Array.isArray(parts) || parts.length === 0) problems.push("no parts");
        for (const part of parts || []) {
          const mesh = part.renderInstances?.mesh || part.mesh;
          const positions = mesh?.positions || [];
          const indices = mesh?.indices || [];
          const vectorObjects = typeof positions[0] === "object" && positions[0] !== null;
          const vertexCount = vectorObjects ? positions.length : Math.floor(positions.length / 3);
          vertices += vertexCount;
          triangles += Math.floor(indices.length / 3);
          if (!part.name) problems.push("part without name");
          if (vertexCount === 0) problems.push(`${part.name}: no vertices`);
          if (indices.length === 0) problems.push(`${part.name}: no indices`);
          for (const position of positions) {
            const values = vectorObjects ? [position.x, position.y, position.z] : [position];
            if (!values.every(Number.isFinite)) {
              problems.push(`${part.name}: non-finite position`);
              break;
            }
          }
          if (!indices.every((value) => Number.isInteger(value) && value >= 0 && value < vertexCount)) {
            problems.push(`${part.name}: invalid index`);
          }
        }
        return {
          id: modelId,
          ok: problems.length === 0,
          parts: parts?.length || 0,
          vertices,
          triangles,
          elapsedMs: performance.now() - startedAt,
          problems,
        };
      } catch (error) {
        return {
          id: modelId,
          ok: false,
          parts: 0,
          vertices: 0,
          triangles: 0,
          elapsedMs: performance.now() - startedAt,
          problems: [String(error?.stack || error)],
        };
      }
    }, id);
    results.push(result);
    if ((index + 1) % 25 === 0 || index + 1 === ids.length) {
      console.log(`built ${index + 1}/${ids.length}`);
      await writeFile(outputPath, `${JSON.stringify({ total: ids.length, results, pageErrors }, null, 2)}\n`, "utf8");
    }
  }

  const failures = results.filter((result) => !result.ok);
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    total: results.length,
    failureCount: failures.length,
    failures,
    pageErrors: [...new Set(pageErrors)],
    results,
  };
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ total: report.total, failureCount: report.failureCount, pageErrors: report.pageErrors }, null, 2));
  if (failures.length || report.pageErrors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
