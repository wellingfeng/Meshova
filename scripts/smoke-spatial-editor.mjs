import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.cwd());
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

function assert(value, message) {
  if (!value) throw new Error(message);
}

function startServer() {
  const server = createServer(async (request, response) => {
    try {
      let pathname = decodeURIComponent((request.url || "/").split("?")[0]);
      if (pathname === "/favicon.ico") return response.writeHead(204).end();
      if (pathname === "/") pathname = "/web/index.html";
      const filePath = normalize(join(root, pathname));
      if (!filePath.startsWith(root)) return response.writeHead(403).end();
      const info = await stat(filePath).catch(() => null);
      const target = info?.isDirectory() ? join(filePath, "index.html") : filePath;
      const body = await readFile(target);
      response.writeHead(200, { "content-type": mime[extname(target)] || "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  return new Promise((resolveServer, reject) => {
    let port = 5451;
    const listen = () => {
      server.once("error", (error) => {
        if (error?.code === "EADDRINUSE" && port < 5490) {
          port++;
          listen();
        } else reject(error);
      });
      server.listen(port, "127.0.0.1", () => resolveServer({ server, port }));
    };
    listen();
  });
}

async function waitForRebuild(page) {
  await page.waitForTimeout(450);
  await page.waitForFunction(() => !document.getElementById("loading")?.classList.contains("show"), null, { timeout: 90000 });
}

async function clickHandle(page, predicate) {
  const state = await page.evaluate(() => window.__meshova.getBindingEditorState());
  const handle = state.handles.find(predicate);
  assert(handle, "找不到编辑手柄");
  await page.mouse.click(handle.screen[0], handle.screen[1]);
  await page.waitForTimeout(80);
  return handle;
}

const { server, port } = await startServer();
const shellExecutable = chromium.executablePath();
const fullExecutable = shellExecutable
  .replace(/chromium_headless_shell-(\d+)/, "chromium-$1")
  .replace(/chrome-headless-shell-win64[\\/]chrome-headless-shell\.exe$/i, "chrome-win64\\chrome.exe");
const browser = await chromium.launch({
  executablePath: existsSync(fullExecutable) ? fullExecutable : undefined,
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--headless=new"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`http://127.0.0.1:${port}/?model=road`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__meshova, null, { timeout: 90000 });
  await page.evaluate(() => window.__meshovaReady);
  await waitForRebuild(page);
  await page.evaluate(() => window.__meshova.startBindingEdit());

  await clickHandle(page, (handle) => handle.type === "point" && handle.index === 1);
  let state = await page.evaluate(() => window.__meshova.getBindingEditorState());
  assert(state.selectedPoint === 1, `控制点选择失败: ${JSON.stringify({ selected: state.selectedPoint, handles: state.handles.slice(0, 8) })}`);
  assert(state.handles.filter((handle) => handle.type === "point-axis").length === 3, "XYZ 操纵器缺失");
  const xAxis = state.handles.find((handle) => handle.type === "point-axis" && handle.axis === "x");
  const axisX = xAxis.screenEnd[0] - xAxis.screen[0];
  const axisY = xAxis.screenEnd[1] - xAxis.screen[1];
  const axisLength = Math.hypot(axisX, axisY);
  const unitX = axisX / axisLength;
  const unitY = axisY / axisLength;
  const axisStart = [xAxis.screen[0] + unitX * axisLength * 0.62, xAxis.screen[1] + unitY * axisLength * 0.62];
  const pointBeforeAxisDrag = [...state.binding.points[1]];
  await page.mouse.move(axisStart[0], axisStart[1]);
  await page.mouse.down();
  await page.mouse.move(axisStart[0] + unitX * 36, axisStart[1] + unitY * 36, { steps: 5 });
  await page.mouse.up();
  await waitForRebuild(page);
  state = await page.evaluate(() => window.__meshova.getBindingEditorState());
  const pointAfterAxisDrag = state.binding.points[1];
  assert(Math.abs(pointAfterAxisDrag[0] - pointBeforeAxisDrag[0]) > 0.01, "X 轴拖动未修改 X");
  assert(Math.abs(pointAfterAxisDrag[1] - pointBeforeAxisDrag[1]) < 1e-6, "X 轴拖动串到 Y");
  assert(Math.abs(pointAfterAxisDrag[2] - pointBeforeAxisDrag[2]) < 1e-6, "X 轴拖动串到 Z");

  await page.selectOption("#curve-type", "bezier");
  await waitForRebuild(page);
  await clickHandle(page, (handle) => handle.type === "point" && handle.index === 1);
  await page.selectOption("#tangent-mode", "mirrored");
  await waitForRebuild(page);
  state = await page.evaluate(() => window.__meshova.getBindingEditorState());
  const tangent = state.handles.find((handle) => handle.type === "bezier-handle" && handle.side === "out");
  assert(tangent, "找不到贝塞尔切线手柄");
  await page.mouse.move(tangent.screen[0], tangent.screen[1]);
  await page.mouse.down();
  await page.mouse.move(tangent.screen[0] + 34, tangent.screen[1] - 18, { steps: 5 });
  await page.mouse.up();
  await waitForRebuild(page);
  state = await page.evaluate(() => window.__meshova.getBindingEditorState());
  const authoredHandle = state.binding.handles[1];
  assert(authoredHandle.mode === "mirrored", "镜像切线模式未保留");
  assert(authoredHandle.in.every((value, index) => Math.abs(value + authoredHandle.out[index]) < 1e-5), "镜像切线未保持反向等长");

  await page.locator("#curve-height").fill("1.25");
  await page.locator("#curve-height").dispatchEvent("change");
  await waitForRebuild(page);
  state = await page.evaluate(() => window.__meshova.getBindingEditorState());
  assert(state.binding.pointAttributes[1].height === 1.25, "高度属性轨道未写入");
  const arcBefore = state.binding.arcLength;
  await page.click("#arc-length");
  await waitForRebuild(page);
  state = await page.evaluate(() => window.__meshova.getBindingEditorState());
  assert(state.binding.arcLength !== arcBefore, "弧长采样开关无效");

  await page.evaluate(() => window.__meshova.loadModelById("houdini-howtos-curve-graph"));
  await waitForRebuild(page);
  await page.evaluate(() => window.__meshova.startBindingEdit());
  await clickHandle(page, (handle) => handle.type === "point" && handle.index === 5);
  const graphEditorState = await page.evaluate(() => window.__meshova.getBindingEditorState());
  assert(graphEditorState.selectedPoint === 5, `曲线图节点选择失败: ${JSON.stringify({ selected: graphEditorState.selectedPoint, kind: graphEditorState.binding?.kind, points: graphEditorState.handles.filter((handle) => handle.type === "point") })}`);
  const graphBefore = await page.evaluate(() => window.__meshova.getBindingEditorState().binding);
  await page.click("#add-branch");
  const canvasBox = await page.locator("#stage canvas").boundingBox();
  assert(canvasBox, "找不到查看器画布");
  await page.mouse.click(canvasBox.x + canvasBox.width * 0.72, canvasBox.y + canvasBox.height * 0.68);
  await waitForRebuild(page);
  const graphAfter = await page.evaluate(() => window.__meshova.getBindingEditorState().binding);
  assert(graphAfter.points.length === graphBefore.points.length + 1, "新增分支节点失败");
  assert(graphAfter.edges.length === graphBefore.edges.length + 1, "新增分支边失败");
  assert(errors.length === 0, `页面错误: ${errors.join(" | ")}`);
  console.log(JSON.stringify({
    ok: true,
    xyzAxes: 3,
    bezierMode: authoredHandle.mode,
    pointHeight: state.binding.pointAttributes[1].height,
    graphNodes: graphAfter.points.length,
    graphEdges: graphAfter.edges.length,
  }));
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
