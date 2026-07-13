import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, writeFile, stat, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, extname, join, normalize, resolve } from "node:path";
import {
  getHeroReconstructionContract,
  makeOpenAICompatibleClient,
  runImageLoop,
  serializeReviewLedger,
  toViewerModel,
} from "../dist/index.js";

const ROOT = resolve(process.cwd());
const SIZE = { width: 960, height: 720 };
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
};

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value.startsWith("--")) {
      const key = value.slice(2);
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) flags[key] = true;
      else {
        flags[key] = next;
        index++;
      }
    } else {
      positional.push(value);
    }
  }
  return { flags, positional };
}

function fail(message) {
  console.error(message);
  process.exit(2);
}

function safeId(value) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "sculpt";
}

function genericContract(name, subject) {
  return {
    version: 1,
    id: `sculpt:${name}`,
    subject,
    complexity: "complex",
    intendedUse: "game-ready",
    referenceViews: ["front", "side", "persp"],
    criticalFeatures: [],
    attachments: [],
    actions: [],
    quality: {
      targetScore: 0.9,
      minimumGeometryScore: 0.62,
      requireCriticPass: true,
      requiredLookDevModes: ["reference", "neutral", "grazing"],
    },
  };
}

function startServer() {
  const server = createServer(async (request, response) => {
    try {
      let requestPath = decodeURIComponent((request.url || "/").split("?")[0]);
      if (requestPath === "/favicon.ico") return response.writeHead(204).end();
      if (requestPath === "/") requestPath = "/web/index.html";
      const filePath = normalize(join(ROOT, requestPath));
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
    let port = 5451;
    const listen = () => {
      server.once("error", (error) => {
        if (error?.code === "EADDRINUSE" && port < 5499) {
          port++;
          listen();
        } else {
          rejectServer(error);
        }
      });
      server.listen(port, "127.0.0.1", () => resolveServer({ server, port }));
    };
    listen();
  });
}

function fullChromiumPath() {
  return chromium.executablePath()
    .replace(/chromium_headless_shell-(\d+)/, "chromium-$1")
    .replace(/chrome-headless-shell-win64[\\/]chrome-headless-shell\.exe$/i, "chrome-win64\\chrome.exe")
    .replace(/chrome-headless-shell-mac[^\\/]*[\\/].*$/i, "chrome-mac/Chromium.app/Contents/MacOS/Chromium")
    .replace(/chrome-headless-shell-linux[\\/]chrome-headless-shell$/i, "chrome-linux/chrome");
}

const { flags, positional } = parseArgs(process.argv.slice(3));
const referencePath = positional[0];
if (!referencePath || !existsSync(referencePath)) fail(`sculpt：参考 PNG 不存在：${referencePath ?? ""}`);
if (extname(referencePath).toLowerCase() !== ".png") fail("sculpt：当前只接受 PNG 参考图");

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) fail("sculpt：缺少 OPENAI_API_KEY");
const endpoint = process.env.OPENAI_ENDPOINT || "https://api.openai.com/v1/chat/completions";
const model = process.env.OPENAI_MODEL || "gpt-4o";
const referencePng = new Uint8Array(await readFile(referencePath));
const name = safeId(String(flags.name || basename(referencePath, extname(referencePath))));
const hint = String(flags.hint || name);
const contractId = flags.contract ? String(flags.contract) : null;
let contract;
if (contractId) {
  try {
    contract = getHeroReconstructionContract(contractId);
  } catch {
    fail(`sculpt：未知旗舰合同：${contractId}`);
  }
} else {
  contract = genericContract(name, hint);
}
const iterations = flags.iterations ? Math.max(1, Number.parseInt(String(flags.iterations), 10)) : undefined;
const targetScore = flags.target ? Number.parseFloat(String(flags.target)) : undefined;
const outDir = join(ROOT, "out", "meshova", name);
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, "contract.json"), JSON.stringify(contract, null, 2));

const client = makeOpenAICompatibleClient({
  endpoint,
  apiKey,
  model,
  fetchImpl: globalThis.fetch,
});
const { server, port } = await startServer();
const fullExe = fullChromiumPath();
const browser = await chromium.launch({
  executablePath: existsSync(fullExe) ? fullExe : undefined,
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--headless=new"],
});

try {
  const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 2 });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
  await page.addStyleTag({ content: "#critiqueBadge,#hud{display:none!important}" });
  await page.waitForFunction(() => !!window.__meshova, null, { timeout: 90000 });
  await page.evaluate(() => window.__meshovaReady);
  await page.evaluate(() => {
    window.__meshova.setAutorot(false);
    window.__meshova.setWind(false);
    window.__meshova.setPost(false);
    window.__meshova.setFog(false);
    window.__meshova.setDOF(false);
    window.__meshova.setFloor("none");
    window.__meshova.setGrid(false);
    window.__meshova.setBackground("solid", "#0d1117");
  });

  async function capture(iteration, tag) {
    await page.evaluate(() => window.__meshova.settle(16));
    const canvas = await page.$("canvas");
    const file = join(outDir, `iter-${iteration}-${tag}.png`);
    await canvas.screenshot({ path: file });
    return new Uint8Array(await readFile(file));
  }

  async function render(parts, iteration) {
    await page.evaluate((viewerModel) => window.__meshova.loadParts(viewerModel), toViewerModel(parts, `${name}-${iteration}`));
    await page.evaluate(() => {
      window.__meshova.setEnvironment("studio");
      window.__meshova.setKeyLightDirection([5, 8, 6]);
      window.__meshova.setBackground("solid", "#0d1117");
      window.__meshova.setView("front");
    });
    const reference = await capture(iteration, "reference");
    await page.evaluate(() => window.__meshova.setView("side"));
    const side = await capture(iteration, "side");
    await page.evaluate(() => {
      window.__meshova.setView("front");
      window.__meshova.setEnvironment("overcast");
      window.__meshova.setKeyLightDirection([4, 8, 5]);
      window.__meshova.setBackground("solid", "#777777");
    });
    const neutral = await capture(iteration, "neutral");
    await page.evaluate(() => {
      window.__meshova.setEnvironment("studio");
      window.__meshova.setKeyLightDirection([9, 1.2, 2]);
    });
    const grazing = await capture(iteration, "grazing");
    return {
      imageBase64: Buffer.from(reference).toString("base64"),
      auxViewsBase64: [Buffer.from(side).toString("base64")],
      lookDevFrames: [
        { mode: "neutral", imageBase64: Buffer.from(neutral).toString("base64") },
        { mode: "grazing", imageBase64: Buffer.from(grazing).toString("base64") },
      ],
      notes: `out/meshova/${name}/iter-${iteration}-*.png`,
    };
  }

  const loopOptions = {
    client,
    referencePng,
    hint,
    render,
    reconstructionContract: contract,
    scoreOptions: { renderBg: [13, 17, 23] },
    onStep: (step) => {
      const phase = step.reconstructionGate?.phase ?? "free";
      const score = step.combinedScore === undefined ? "n/a" : step.combinedScore.toFixed(3);
      console.error(`迭代 ${step.iteration + 1}：阶段=${phase} 分数=${score} 门禁=${step.reconstructionGate?.accepted ?? step.gate?.accepted ?? false}`);
    },
  };
  if (iterations !== undefined) loopOptions.maxIterations = iterations;
  if (targetScore !== undefined) loopOptions.targetScore = targetScore;
  const result = await runImageLoop(loopOptions);
  if (result.best) {
    await writeFile(join(outDir, "best-script.js"), result.best.script);
    await writeFile(join(outDir, "model.json"), JSON.stringify(toViewerModel(result.best.run.parts, name)));
  }
  if (result.reviewLedger) {
    await writeFile(join(outDir, "review-ledger.json"), serializeReviewLedger(result.reviewLedger));
  }
  if (pageErrors.length > 0) await writeFile(join(outDir, "page-errors.txt"), pageErrors.join("\n"));
  console.log(JSON.stringify({
    ok: result.success,
    name,
    contract: contract.id,
    iterations: result.steps.length,
    phase: result.passState?.phase ?? null,
    completed: result.passState?.completed ?? null,
    bestScore: result.best?.combinedScore ?? null,
    output: `out/meshova/${name}`,
    pageErrors,
  }, null, 2));
  process.exitCode = result.success && pageErrors.length === 0 ? 0 : 1;
} finally {
  await browser.close();
  server.close();
}
