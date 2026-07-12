import { chromium } from "playwright";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = resolve(process.cwd());
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function startServer() {
  const server = createServer(async (request, response) => {
    try {
      let pathname = decodeURIComponent((request.url || "/").split("?")[0]);
      if (pathname === "/favicon.ico") return response.writeHead(204).end();
      if (pathname === "/") pathname = "/web/gallery.html";
      const filePath = normalize(join(ROOT, pathname));
      if (!filePath.startsWith(ROOT)) return response.writeHead(403).end();
      const info = await stat(filePath).catch(() => null);
      const target = info?.isDirectory() ? join(filePath, "index.html") : filePath;
      const body = await readFile(target);
      response.writeHead(200, { "content-type": MIME[extname(target)] || "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  return new Promise((resolveServer, rejectServer) => {
    let port = 5491;
    const listen = () => {
      server.once("error", (error) => {
        if (error?.code === "EADDRINUSE" && port < 5530) {
          port += 1;
          listen();
          return;
        }
        rejectServer(error);
      });
      server.listen(port, "127.0.0.1", () => resolveServer({ server, port }));
    };
    listen();
  });
}

const { server, port } = await startServer();
let browser;
try {
  const fullExecutable = join(
    process.env.LOCALAPPDATA || "",
    "ms-playwright",
    "chromium-1228",
    "chrome-win64",
    "chrome.exe",
  );
  browser = await chromium.launch({
    executablePath: existsSync(fullExecutable) ? fullExecutable : undefined,
    headless: true,
    args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--headless=new"],
  });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/web/gallery.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => document.querySelectorAll(".card").length > 0, null, { timeout: 90000 });
  const cards = await page.evaluate(() => [...document.querySelectorAll(".card")]
    .filter((card) => !card.dataset.id.startsWith("mat:") && !card.dataset.specialUrl)
    .map((card) => ({
      id: card.dataset.id,
      name: card.dataset.name || card.dataset.id,
      file: card.dataset.file || "",
    })));

  const report = await page.evaluate(async (modelCards) => {
    const { PROC_MODELS, defaultParams } = await import("/web/procmodels.js?v=transparent-shell-audit-1");
    const { makeMesh, meshMetrics, recomputeNormals } = await import("/dist/index.js?v=transparent-shell-audit-1");
    const closedTransmissiveTypes = new Set(["glass", "liquid", "jade", "crystal", "ice"]);
    const explicitlyThinTypes = new Set(["water", "cloud", "leaf", "foliage", "grassBlade"]);

    function viewerPartToNamedPart(part) {
      if (part.mesh) return part;
      const positions = [];
      const normals = [];
      const uvs = [];
      for (let index = 0; index < part.positions.length; index += 3) {
        positions.push({ x: part.positions[index], y: part.positions[index + 1], z: part.positions[index + 2] });
      }
      for (let index = 0; index < positions.length; index++) {
        normals.push({ x: 0, y: 1, z: 0 });
        uvs.push({ x: 0, y: 0 });
      }
      return {
        ...part,
        mesh: recomputeNormals(makeMesh({ positions, normals, uvs, indices: Array.from(part.indices || []) })),
      };
    }

    function isClosedTransmissive(part) {
      const surfaceType = part.surface?.type || part.surfaceType || "";
      const params = part.surface?.params || part.surfaceParams || {};
      if (explicitlyThinTypes.has(surfaceType) || part.metadata?.thin === true) return false;
      return closedTransmissiveTypes.has(surfaceType) || Number(params.transmission || 0) > 0.01;
    }

    const cardById = new Map(modelCards.map((card) => [card.id, card]));
    const ids = [...new Set([...modelCards.map((card) => card.id), ...Object.keys(PROC_MODELS)])].sort();
    const findings = [];
    const errors = [];
    let transmissiveParts = 0;
    for (const id of ids) {
      try {
        const model = PROC_MODELS[id];
        let parts;
        if (model) {
          const params = model.defaultParams ? model.defaultParams() : defaultParams(model);
          parts = await model.build(params);
        } else {
          const card = cardById.get(id);
          const response = await fetch(`/out/${card?.file || `${id}.json`}`, { cache: "no-store" });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const viewerModel = await response.json();
          parts = (viewerModel.parts || []).map(viewerPartToNamedPart);
        }
        for (const part of parts || []) {
          if (!isClosedTransmissive(part)) continue;
          transmissiveParts += 1;
          const metrics = meshMetrics(part.mesh);
          if (metrics.boundaryEdges === 0 && !part.doubleSided) continue;
          findings.push({
            model: id,
            modelName: cardById.get(id)?.name || model?.name || id,
            part: part.name,
            surface: part.surface?.type || part.surfaceType || "custom",
            triangles: metrics.triangles,
            boundaryEdges: metrics.boundaryEdges,
            watertight: metrics.watertight,
            doubleSided: !!part.doubleSided,
          });
        }
      } catch (error) {
        errors.push({ model: id, error: error?.message || String(error) });
      }
    }
    return { models: ids.length, transmissiveParts, findings, errors };
  }, cards);

  console.log(`扫描模型 ${report.models}，闭合型透射部件 ${report.transmissiveParts}。`);
  for (const finding of report.findings) {
    console.log(`${finding.model}\t${finding.part}\t${finding.surface}\t边界=${finding.boundaryEdges}\t双面=${finding.doubleSided}\t三角面=${finding.triangles}`);
  }
  if (report.errors.length > 0) {
    console.error(`构建失败 ${report.errors.length}：`);
    for (const error of report.errors) console.error(`${error.model}\t${error.error}`);
  }
  console.log(`命中 ${report.findings.length}。`);
  process.exitCode = report.findings.length > 0 || report.errors.length > 0 ? 1 : 0;
} finally {
  await browser?.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
