/**
 * Zero-dependency static server for the Meshova viewer.
 *
 * Serves the repo root so the viewer (/web), vendored three.js (/web/vendor)
 * and generated models (/out) are all reachable. Run: pnpm view
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = resolve(process.cwd());
const PORT = process.env.PORT ? Number(process.env.PORT) : 5173;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".obj": "text/plain; charset=utf-8",
  ".mtl": "text/plain; charset=utf-8",
};

const MAX_JSON_BYTES = 24 * 1024 * 1024;

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, no-cache, must-revalidate",
    "pragma": "no-cache",
  });
  res.end(JSON.stringify(body));
}

/**
 * 读取 models.json，并给每个条目补上时间戳。
 * - 保留条目里已有的 createdAt/updatedAt（生成脚本显式写入的优先）。
 * - 缺失时用该模型 .json 文件的 mtime（生成/最近修改时间）兜底。
 * - 最后按 updatedAt 倒序排序，最新生成或修改的排在最前。
 */
async function withModelTimestamps(manifestPath) {
  let data;
  try {
    data = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    return null;
  }
  if (!data || !Array.isArray(data.models)) return null;
  await Promise.all(
    data.models.map(async (m) => {
      if (!m || !m.file) return;
      let mtimeMs = 0;
      const modelPath = normalize(join(ROOT, "out", m.file));
      if (modelPath.startsWith(ROOT)) {
        const st = await stat(modelPath).catch(() => null);
        if (st) mtimeMs = st.mtimeMs;
      }
      const iso = mtimeMs ? new Date(mtimeMs).toISOString() : undefined;
      if (!m.createdAt && iso) m.createdAt = iso;
      if (!m.updatedAt) m.updatedAt = m.createdAt || iso;
    }),
  );
  data.models.sort((a, b) => {
    const ta = Date.parse(a?.updatedAt || a?.createdAt || 0) || 0;
    const tb = Date.parse(b?.updatedAt || b?.createdAt || 0) || 0;
    return tb - ta;
  });
  return data;
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_JSON_BYTES) throw new Error("request body too large");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(value, fallback = 0) {
  return Math.max(0, Math.min(1, num(value, fallback)));
}

function key(value, fallback) {
  const raw = text(value, fallback).toLowerCase();
  return raw.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || fallback;
}

function extractJsonObject(reply) {
  const raw = String(reply || "").trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const body = fence ? fence[1].trim() : raw;
  const match = /\{[\s\S]*\}/.exec(body);
  if (!match) throw new Error("VLM reply missing JSON");
  return JSON.parse(match[0]);
}

function normalizeBbox(value) {
  if (!Array.isArray(value) || value.length < 4) return null;
  const out = value.slice(0, 4).map(Number);
  if (out.some((n) => !Number.isFinite(n))) return null;
  return out.map((n) => Math.max(0, Math.min(1, n)));
}

function normalizeAiSplitPlan(parsed) {
  const rawParts = Array.isArray(parsed?.parts) ? parsed.parts : [];
  const parts = [];
  for (let i = 0; i < rawParts.length; i++) {
    const item = rawParts[i] || {};
    const label = text(item.label);
    const bbox = normalizeBbox(item.bbox);
    if (!label || !bbox) continue;
    const partKey = key(item.key, `ai_part_${i + 1}`);
    parts.push({
      key: partKey,
      partKey,
      label,
      role: text(item.role),
      confidence: clamp01(item.confidence, 0.6),
      method: text(item.method, "cut") === "regenerate" ? "regenerate" : "cut",
      generationPrompt: text(item.generationPrompt),
      bbox,
    });
  }
  return {
    objectLabel: text(parsed?.objectLabel ?? parsed?.object, "AI识别物体"),
    confidence: clamp01(parsed?.confidence, parts.length ? 0.6 : 0.1),
    source: "ai",
    parts,
    notes: Array.isArray(parsed?.notes) ? parsed.notes.map((v) => text(v)).filter(Boolean) : [],
  };
}

async function proxyAiSplitWorker(payload) {
  const workerUrl = process.env.MESHOVA_AI_SPLIT_WORKER_URL;
  if (!workerUrl) return null;
  const resp = await fetch(workerUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const textBody = await resp.text();
  let json = null;
  try {
    json = textBody ? JSON.parse(textBody) : null;
  } catch {
    throw new Error(`AI worker returned non-JSON: ${textBody.slice(0, 200)}`);
  }
  if (!resp.ok) throw new Error(json?.error || `AI worker HTTP ${resp.status}`);
  return json;
}

function openAiEndpoint() {
  if (process.env.MESHOVA_OPENAI_ENDPOINT) return process.env.MESHOVA_OPENAI_ENDPOINT;
  const base = process.env.OPENAI_BASE_URL;
  if (base) return `${base.replace(/\/+$/, "")}/chat/completions`;
  return "https://api.openai.com/v1/chat/completions";
}

async function planAiSplitWithVlm(payload) {
  const apiKey = process.env.MESHOVA_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  const model = process.env.MESHOVA_VISION_MODEL || process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL;
  if (!apiKey || !model) return null;
  const maxParts = Math.max(1, Math.min(16, num(payload.maxParts, 10)));
  const prompt = [
    "你是 Meshova 的 AI mesh 部件切割规划器。",
    "只看截图判断真实物体和可见部件；不要根据文件名、prompt、UI 标签猜。",
    "给出每个可切割部件的归一化 bbox，格式 [x0,y0,x1,y1]，范围 0..1，左上原点。",
    "bbox 只是 fallback；如果有 SAM worker 应该返回像素 mask。",
    `最多 ${maxParts} 个部件。标签用简体中文，key 用稳定 ASCII。`,
    "只返回紧凑 JSON：",
    '{"objectLabel":"物体名","confidence":0.0,"parts":[{"key":"stable_key","label":"部件名","role":"short","confidence":0.0,"method":"cut","bbox":[0,0,1,1]}],"notes":[]}',
  ].join("\n");
  const resp = await fetch(openAiEndpoint(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "Return JSON only. No prose." },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:image/png;base64,${payload.imageBase64 || ""}` } },
          ],
        },
      ],
    }),
  });
  if (!resp.ok) throw new Error(`VLM HTTP ${resp.status}: ${await resp.text()}`);
  const json = await resp.json();
  const reply = json?.choices?.[0]?.message?.content || "";
  const parsed = extractJsonObject(reply);
  const plan = normalizeAiSplitPlan(parsed);
  return {
    ok: plan.parts.length > 0,
    mode: "vlm_bbox",
    plan,
    masks: plan.parts,
    error: plan.parts.length ? undefined : "VLM 未返回可用 bbox",
  };
}

async function handleAiSplit(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "POST required" });
    return;
  }
  try {
    const payload = await readJson(req);
    if (!payload.imageBase64 || !payload.width || !payload.height) {
      sendJson(res, 400, { ok: false, error: "missing imageBase64/width/height" });
      return;
    }
    const worker = await proxyAiSplitWorker(payload);
    if (worker) {
      sendJson(res, 200, worker.ok === false ? worker : { ok: true, ...worker });
      return;
    }
    const vlm = await planAiSplitWithVlm(payload);
    if (vlm) {
      sendJson(res, 200, vlm);
      return;
    }
    sendJson(res, 200, {
      ok: false,
      error: "AI切割服务未配置：设置 MESHOVA_AI_SPLIT_WORKER_URL（推荐，返回 SAM masks），或 OPENAI_API_KEY + MESHOVA_VISION_MODEL（bbox fallback）",
    });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err?.message || String(err) });
  }
}

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath === "/favicon.ico") { res.writeHead(204).end(); return; }
    if (urlPath === "/api/ai-split") { await handleAiSplit(req, res); return; }
    if (urlPath === "/") {
      res.writeHead(302, { location: "/web/gallery.html" });
      res.end();
      return;
    }
    // Prevent path traversal: resolve and confirm it stays under ROOT.
    const filePath = normalize(join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    const info = await stat(filePath).catch(() => null);
    const target = info?.isDirectory() ? join(filePath, "index.html") : filePath;
    // 模型库清单：为每个条目注入对应 .json 文件的真实修改时间(mtime)作为
    // updatedAt 兜底。文件系统 mtime 天然就是模型的"生成/最近修改"时间，
    // 这样所有 example 产物无需逐个改脚本，就能被前端按时间倒序排列。
    if (urlPath === "/out/models.json") {
      const patched = await withModelTimestamps(target);
      if (patched) { sendJson(res, 200, patched); return; }
    }
    const body = await readFile(target);
    const mime = MIME[extname(target)] || "application/octet-stream";
    res.writeHead(200, { "content-type": mime, "cache-control": "no-store, no-cache, must-revalidate", "pragma": "no-cache" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
  }
});

server.listen(PORT, () => {
  console.log(`\n  Meshova viewer  ->  http://localhost:${PORT}/\n`);
  console.log(`  根目录: ${ROOT}`);
  console.log(`  模型来自 out/models.json，改完模型刷新页面即可。\n`);
});
