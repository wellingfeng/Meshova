import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { chromium } from "playwright";

const port = 5200 + (process.pid % 300);
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
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${base}/web/gallery.html`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("viewer server timeout");
}

const expected = ["drawable-path-fence", "masked-region-grove", "scatter-path-lights"];
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
  await page.waitForFunction((ids) => ids.every((id) => document.querySelector(`[data-id="${id}"]`)), expected, { timeout: 60000 });
  const gallery = await page.evaluate((ids) => ids.map((id) => {
    const card = document.querySelector(`[data-id="${id}"]`);
    return {
      id,
      category: card?.dataset.cat,
      tags: [...(card?.querySelectorAll(".asset-tag") || [])].map((element) => element.textContent),
    };
  }), expected);
  await page.locator("#search").fill("Drawable");
  await page.waitForTimeout(100);
  await page.waitForFunction((ids) => ids.every((id) => !document.querySelector(`[data-id="${id}"]`)?.classList.contains("loading")), expected, { timeout: 60000 });
  const filtered = await page.evaluate(() => [...document.querySelectorAll(".card")]
    .filter((card) => card.style.display !== "none")
    .map((card) => card.dataset.id));
  await page.screenshot({ path: "out/shots/workflow-showcase-gallery.png", fullPage: true });

  const models = [];
  for (const id of expected) {
    await page.goto(`${base}/web/index.html?model=${id}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__meshova && window.__meshova.meta().parts > 0, null, { timeout: 30000 });
    const before = await page.evaluate(() => ({
      bindings: window.__meshova.getBindings(),
      stats: window.__meshova.meta(),
      drawTools: getComputedStyle(document.getElementById("draw-tools")).display,
    }));
    const key = Object.keys(before.bindings)[0];
    let uiDrawPoints = null;
    let editor = null;
    let dragUndo = null;
    if (id === "drawable-path-fence") {
      await page.locator("#draw-binding").click();
      const canvas = page.locator("#stage canvas");
      const box = await canvas.boundingBox();
      await canvas.click({ position: { x: box.width * 0.32, y: box.height * 0.58 } });
      await canvas.click({ position: { x: box.width * 0.5, y: box.height * 0.48 } });
      await canvas.click({ position: { x: box.width * 0.68, y: box.height * 0.58 } });
      await page.locator("#draw-binding").click();
      await page.waitForFunction((bindingKey) => window.__meshova.getBindings()[bindingKey]?.points?.length === 3, key);
      uiDrawPoints = await page.evaluate((bindingKey) => window.__meshova.getBindings()[bindingKey].points.length, key);
      await page.locator(".part").first().click();
      editor = await page.evaluate(() => window.__meshova.getBindingEditorState());
      const pointHandle = editor.handles.find((handle) => handle.type === "point" && handle.index === 0);
      if (!pointHandle) throw new Error("curve point handle unavailable");
      const beforeDrag = await page.evaluate((bindingKey) => window.__meshova.getBindings()[bindingKey], key);
      await page.mouse.move(pointHandle.screen[0], pointHandle.screen[1]);
      await page.mouse.down();
      await page.mouse.move(pointHandle.screen[0] + 48, pointHandle.screen[1] - 12, { steps: 4 });
      await page.mouse.up();
      await page.waitForFunction(({ bindingKey, previous }) => (
        JSON.stringify(window.__meshova.getBindings()[bindingKey]) !== JSON.stringify(previous)
      ), { bindingKey: key, previous: beforeDrag });
      const afterDrag = await page.evaluate((bindingKey) => window.__meshova.getBindings()[bindingKey], key);
      await page.locator("#draw-undo").click();
      await page.waitForFunction(({ bindingKey, previous }) => (
        JSON.stringify(window.__meshova.getBindings()[bindingKey]) === JSON.stringify(previous)
      ), { bindingKey: key, previous: beforeDrag });
      dragUndo = { before: beforeDrag, after: afterDrag };
    }
    const binding = id === "masked-region-grove"
      ? { kind: "region", closed: true, points: [[-2, 0, -2], [2, 0, -2], [2.5, 0, 2], [-2.5, 0, 2]] }
      : { kind: "curve", points: [[-3, 0, 0], [0, 0, 2], [3, 0, 0]] };
    const applied = await page.evaluate(({ bindingKey, value }) => window.__meshova.setBinding(bindingKey, value), { bindingKey: key, value: binding });
    await page.evaluate(() => window.__meshova.settle(2));
    const after = await page.evaluate(() => ({ bindings: window.__meshova.getBindings(), stats: window.__meshova.meta() }));
    if (id === "masked-region-grove") {
      await page.locator("#edit-binding").click();
      editor = await page.evaluate(() => window.__meshova.getBindingEditorState());
    }
    models.push({ id, key, applied, uiDrawPoints, editor, dragUndo, before, after });
  }

  if (errors.length) throw new Error(errors.join("\n"));
  if (filtered.some((id) => !expected.includes(id)) || filtered.length !== expected.length) {
    throw new Error(`semantic filter mismatch: ${filtered.join(",")}`);
  }
  if (models.some((model) => !model.applied || model.before.drawTools === "none") || models[0]?.uiDrawPoints !== 3) {
    throw new Error("drawable binding API unavailable");
  }
  if (!models[0]?.editor?.handles.some((handle) => handle.type === "rotate") || !models[0]?.dragUndo) {
    throw new Error("curve transform handles unavailable");
  }
  if (!models[1]?.editor?.hasSurface) throw new Error("surface editor unavailable");
  console.log(JSON.stringify({ ok: true, gallery, filtered, models }, null, 2));
} finally {
  await browser?.close();
  server.kill();
}
