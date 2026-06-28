import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

const root = process.cwd();
const outDir = path.join(root, "out", "sidefx-hip-study");
const downloadDir = path.join(outDir, "downloads");
const extractDir = path.join(outDir, "extracted");
const reportPath = path.join(root, "doc", "houdini-hip-procedural-study.html");
const base = "https://www.sidefx.com";

const forums = [
  { id: 4, name: "Technical Discussion", pages: 8 },
  { id: 10, name: "Houdini Learning Materials", pages: 6 },
  { id: 68, name: "Houdini for Realtime", pages: 6 },
  { id: 28, name: "Work in Progress", pages: 5 },
  { id: 90, name: "SideFX Labs Tech Art Challenge 2021", pages: 5 },
  { id: 102, name: "SideFX Labs Tech Art Challenge 2022", pages: 5 },
  { id: 106, name: "H20 Tech Art Challenge", pages: 5 },
  { id: 87, name: "Nodevember 2020", pages: 4 },
  { id: 86, name: "HOULY Daily Challenge", pages: 4 },
  { id: 103, name: "Mardini 2023", pages: 5 },
  { id: 108, name: "Mardini 2024", pages: 5 },
  { id: 111, name: "Mardini 2025", pages: 5 },
  { id: 112, name: "2025 Game Art Challenge", pages: 5 },
  { id: 115, name: "How to Houdini Tutorial Contest", pages: 4 },
];

const searchJobs = [
  { keyword: "hip", pages: 16 },
  { keyword: ".hip", pages: 12 },
  { keyword: "hiplc", pages: 12 },
  { keyword: "hipnc", pages: 12 },
  { keyword: "hda", pages: 8 },
  { keyword: "procedural", pages: 8 },
  { keyword: "modeling", pages: 6 },
  { keyword: "sop", pages: 6 },
  { keyword: "curve", pages: 6 },
  { keyword: "sweep", pages: 5 },
  { keyword: "copytopoints", pages: 5 },
  { keyword: "scatter", pages: 5 },
  { keyword: "boolean", pages: 5 },
  { keyword: "vdb", pages: 5 },
  { keyword: "terrain", pages: 5 },
  { keyword: "building", pages: 5 },
  { keyword: "sidefx labs", pages: 5 },
];

const maxTopicPagesToRead = 1;
const maxTopicsToRead = 0;
const maxAttachmentsToProbe = 1400;

const wantedExtensions = new Set([
  ".hip",
  ".hiplc",
  ".hipnc",
  ".hda",
  ".otl",
  ".zip",
]);

const sceneExtensions = new Set([".hip", ".hiplc", ".hipnc", ".hda", ".otl"]);

const nodeLexicon = [
  "attribwrangle",
  "pointwrangle",
  "primitivewrangle",
  "volumewrangle",
  "detailwrangle",
  "attribvop",
  "vopnet",
  "for_begin",
  "for_end",
  "foreach_begin",
  "foreach_end",
  "compile_begin",
  "compile_end",
  "switch",
  "null",
  "object_merge",
  "blast",
  "delete",
  "groupcreate",
  "groupexpression",
  "groupcombine",
  "groupdelete",
  "groupbyrange",
  "partition",
  "name",
  "connectivity",
  "measure",
  "resample",
  "polyframe",
  "sweep",
  "skin",
  "curve",
  "curveu",
  "polycurve",
  "add",
  "line",
  "circle",
  "carve",
  "rails",
  "polyextrude",
  "extrude",
  "boolean",
  "divide",
  "subdivide",
  "remesh",
  "polyreduce",
  "polybevel",
  "bevel",
  "fuse",
  "clean",
  "facet",
  "normal",
  "matchsize",
  "xform",
  "transform",
  "copytopoints",
  "copy",
  "copyxform",
  "instance",
  "pack",
  "unpack",
  "scatter",
  "scatteralign",
  "attribrandomize",
  "mountain",
  "noise",
  "heightfield",
  "heightfield_noise",
  "heightfield_erode",
  "volume",
  "vdb",
  "vdbfrompolygons",
  "convertvdb",
  "isooffset",
  "clip",
  "ray",
  "uvflatten",
  "uvlayout",
  "uvunwrap",
  "uvquickshade",
  "labs",
  "sop_solver",
  "solver",
  "dopnet",
  "rop_geometry",
  "filecache",
  "cache",
  "timeshift",
  "labs_maps_baker",
  "rop_fbx",
  "material",
  "materialx",
  "redshift",
  "karma",
  "heighttonormal",
  "principledshader",
];

const categoryRules = [
  {
    key: "参数化入口",
    terms: ["ch(", "chs(", "chi(", "chf(", "parm", "spare", "parameter"],
  },
  {
    key: "曲线骨架",
    terms: ["curve", "resample", "polyframe", "sweep", "skin", "carve", "line"],
  },
  {
    key: "分组与选择",
    terms: ["group", "blast", "delete", "name", "partition", "connectivity"],
  },
  {
    key: "局部规则/VEX",
    terms: ["wrangle", "attribvop", "@ptnum", "@P", "@N", "rand(", "noise("],
  },
  {
    key: "循环/批处理",
    terms: ["foreach", "for_begin", "for_end", "compile", "feedback"],
  },
  {
    key: "复制/散布",
    terms: ["copytopoints", "scatter", "instance", "pack", "orient", "pscale"],
  },
  {
    key: "布尔/体素",
    terms: ["boolean", "vdb", "volume", "isooffset", "convertvdb"],
  },
  {
    key: "表面质量",
    terms: ["normal", "facet", "clean", "fuse", "remesh", "polyreduce", "bevel"],
  },
  {
    key: "UV/材质/烘焙",
    terms: ["uv", "material", "shader", "baker", "texture", "normalmap"],
  },
  {
    key: "验证/缓存/输出",
    terms: ["null", "filecache", "rop", "cache", "matchsize", "measure"],
  },
];

const workflowPatterns = [
  {
    title: "Null 节点命名输出契约",
    detect: ["null"],
    lesson:
      "Houdini 社区 HIP 常把阶段结果挂到 OUT_* / DISPLAY_* null。Meshova 可显式引入 stage/output label，给 AI 和截图器稳定锚点。",
  },
  {
    title: "Curve -> Resample -> Frame -> Sweep",
    detect: ["curve", "resample", "polyframe", "sweep"],
    lesson:
      "曲线先确定骨架，再重采样稳定密度，再求切线/法线 frame，最后扫掠截面。适合头发、管线、枝条、装饰线、轮廓条。",
  },
  {
    title: "Group/Name 贯穿选择语义",
    detect: ["groupcreate", "groupexpression", "name", "blast"],
    lesson:
      "复杂模型不靠索引猜部位，而靠 group/name 属性流转。Meshova 选择器应输出命名面集/点集，后续 extrude/material/validate 共用。",
  },
  {
    title: "Wrangle 微规则嵌入 SOP 流程",
    detect: ["attribwrangle", "pointwrangle"],
    lesson:
      "Houdini 用少量 VEX 做局部属性规则，不把所有算子做成黑盒。Meshova 可把用户脚本中的 point/face lambda 提升为一等算子。",
  },
  {
    title: "For-Each 迭代构件",
    detect: ["foreach_begin", "foreach_end"],
    lesson:
      "阵列、砖块、鳞片、楼层常用 foreach per piece/number。Meshova 需要可观察的循环：每轮 seed、输入属性、输出 bbox 可记录。",
  },
  {
    title: "Scatter + CopyToPoints 实例化",
    detect: ["scatter", "copytopoints"],
    lesson:
      "点云携带 orient/scale/variant，再实例化几何。Meshova scatter 应返回 typed instance buffer，不急于 bake 成大 mesh。",
  },
  {
    title: "Boolean/VDB 做形体合成",
    detect: ["boolean", "vdb"],
    lesson:
      "硬表面切割和软融合常混用 boolean/VDB。Meshova P2 boolean 可先做可替换接口，验证用体素/SDF 近似比三角布尔更稳。",
  },
  {
    title: "Clean/Fuse/Normal 作为质量门",
    detect: ["clean", "fuse", "normal"],
    lesson:
      "很多 HIP 在生成后立刻清理孤点、焊接、重算法线。Meshova 每个高风险算子后应有 meshQuality report。",
  },
  {
    title: "Material/UV 跟随几何属性",
    detect: ["uvflatten", "uvlayout", "material"],
    lesson:
      "程序化材质绑定常基于 group/name/uv islands。Meshova 几何核要保留 material slots、uv sets、procedural mask 字段。",
  },
  {
    title: "FileCache/ROP 固化昂贵阶段",
    detect: ["filecache", "rop_geometry"],
    lesson:
      "昂贵节点有缓存边界。Meshova AI 闭环也要缓存 hash(params+seed+version) 的中间 mesh/material，截图迭代才快。",
  },
];

async function main() {
  await mkdir(downloadDir, { recursive: true });
  await mkdir(extractDir, { recursive: true });
  await mkdir(path.dirname(reportPath), { recursive: true });

  const topics = await crawlForumTopics();
  console.log(`topics ${topics.length}`);
  const directAttachments = await crawlSearchResultAttachments();
  console.log(`direct attachments ${directAttachments.length}`);
  const attachments = await crawlAttachments(topics, directAttachments);
  console.log(`probed attachments ${attachments.length}`);
  const downloaded = await downloadAttachments(attachments);
  console.log(`downloaded ${downloaded.length}`);
  const extracted = await extractZipScenes(downloaded);
  console.log(`extracted ${extracted.length}`);
  const allScenes = [...downloaded.filter((f) => sceneExtensions.has(f.ext)), ...extracted];
  const analyses = await analyzeScenes(allScenes);
  console.log(`analyses ${analyses.length}`);
  const report = buildReport({ topics, attachments, downloaded, extracted, analyses });
  await writeFile(reportPath, report, "utf8");

  const summary = {
    topics: topics.length,
    attachments: attachments.length,
    downloaded: downloaded.length,
    extracted: extracted.length,
    scenes: analyses.length,
    report: path.relative(root, reportPath),
  };
  console.log(JSON.stringify(summary, null, 2));
}

async function crawlForumTopics() {
  if (maxTopicsToRead === 0) return [];
  const topicMap = new Map();
  for (const job of searchJobs) {
    for (let page = 1; page <= job.pages; page++) {
      const params = new URLSearchParams({
        page: String(page),
        action: "search",
        keywords: job.keyword,
        forum: "0",
        search_in: "all",
        sort_by: "0",
        sort_dir: "DESC",
        show_as: "topics",
      });
      const url = `${base}/forum/search/?${params}`;
      const html = await fetchText(url);
      const ids = [...html.matchAll(/href=["']\/forum\/topic\/(\d+)\/["']/g)].map((m) => m[1]);
      const uniqueIds = [...new Set(ids)];
      if (uniqueIds.length === 0) break;
      for (const id of uniqueIds) {
        const key = `${id}`;
        if (!topicMap.has(key)) {
          topicMap.set(key, {
            id,
            url: `${base}/forum/topic/${id}/`,
            forums: [`搜索：${job.keyword}`],
            searchHits: [job.keyword],
          });
        } else {
          const entry = topicMap.get(key);
          const forumName = `搜索：${job.keyword}`;
          if (!entry.forums.includes(forumName)) entry.forums.push(forumName);
          entry.searchHits ??= [];
          if (!entry.searchHits.includes(job.keyword)) entry.searchHits.push(job.keyword);
        }
      }
      await sleep(45);
    }
  }
  for (const forum of forums) {
    for (let page = 1; page <= forum.pages; page++) {
      const url = `${base}/forum/${forum.id}/${page === 1 ? "" : `?page=${page}`}`;
      const html = await fetchText(url);
      const ids = [...html.matchAll(/href=["']\/forum\/topic\/(\d+)\/["']/g)].map((m) => m[1]);
      const uniqueIds = [...new Set(ids)];
      if (uniqueIds.length === 0 && page > 3) break;
      for (const id of uniqueIds) {
        const key = `${id}`;
        if (!topicMap.has(key)) {
          topicMap.set(key, {
            id,
            url: `${base}/forum/topic/${id}/`,
            forums: [forum.name],
            searchHits: [],
          });
        } else {
          const entry = topicMap.get(key);
          if (!entry.forums.includes(forum.name)) entry.forums.push(forum.name);
        }
      }
      await sleep(60);
    }
  }
  return [...topicMap.values()]
    .sort((a, b) => (b.searchHits?.length ?? 0) - (a.searchHits?.length ?? 0))
    .slice(0, maxTopicsToRead);
}

async function crawlSearchResultAttachments() {
  const attachmentMap = new Map();
  for (const job of searchJobs) {
    for (let page = 1; page <= job.pages; page++) {
      const params = new URLSearchParams({
        page: String(page),
        action: "search",
        keywords: job.keyword,
        forum: "0",
        search_in: "all",
        sort_by: "0",
        sort_dir: "DESC",
        show_as: "posts",
      });
      const html = await fetchText(`${base}/forum/search/?${params}`);
      const plain = stripHtml(html);
      const refs = [];
      for (const match of html.matchAll(/href=["']\/forum\/topic\/(\d+)\/["']|href=["'](\/forum\/attachment\/[a-f0-9]+\/)["']/gi)) {
        if (match[1]) refs.push({ type: "topic", id: match[1], index: match.index ?? 0 });
        if (match[2]) refs.push({ type: "attachment", href: match[2], index: match.index ?? 0 });
      }
      let currentTopicId = "search";
      const seenOnPage = new Set();
      for (const ref of refs) {
        if (ref.type === "topic") {
          currentTopicId = ref.id;
          continue;
        }
        const href = ref.href;
        if (seenOnPage.has(href)) continue;
        seenOnPage.add(href);
        const attachmentUrl = `${base}${href}`;
        if (!attachmentMap.has(attachmentUrl)) {
          attachmentMap.set(attachmentUrl, {
            url: attachmentUrl,
            href,
            topicId: currentTopicId,
            topicTitle: `搜索命中：${job.keyword}`,
            forumNames: [`搜索：${job.keyword}`],
            textSample: plain.slice(0, 1600),
          });
        } else {
          const item = attachmentMap.get(attachmentUrl);
          const forumName = `搜索：${job.keyword}`;
          if (!item.forumNames.includes(forumName)) item.forumNames.push(forumName);
        }
      }
      await sleep(35);
    }
  }
  return [...attachmentMap.values()];
}

async function crawlAttachments(topics, seedAttachments = []) {
  const attachmentMap = new Map();
  for (const item of seedAttachments) attachmentMap.set(item.url, item);
  for (const topic of topics.slice(0, maxTopicsToRead)) {
    for (let page = 1; page <= maxTopicPagesToRead; page++) {
      const url = `${topic.url}${page === 1 ? "" : `?page=${page}`}`;
      const html = await fetchText(url);
      const title = decodeHtml(
        firstMatch(html, /<title>(.*?)\s*\|\s*Forums\s*\|\s*SideFX<\/title>/is) ??
          firstMatch(html, /<title>(.*?)<\/title>/is) ??
          `Topic ${topic.id}`,
      );
      topic.title = title.trim();
      const postText = stripHtml(html).slice(0, 5000);
      topic.textSample = postText;
      const attachmentIds = [
        ...html.matchAll(/href=["'](\/forum\/attachment\/[a-f0-9]+\/)["']/gi),
      ].map((m) => m[1]);
      for (const href of new Set(attachmentIds)) {
        const attachmentUrl = `${base}${href}`;
        if (!attachmentMap.has(attachmentUrl)) {
          attachmentMap.set(attachmentUrl, {
            url: attachmentUrl,
            href,
            topicId: topic.id,
            topicTitle: topic.title,
            forumNames: topic.forums,
          });
        }
      }
      if (!html.includes(`?page=${page + 1}`)) break;
      await sleep(50);
    }
  }
  const attachments = [...attachmentMap.values()].slice(0, maxAttachmentsToProbe);
  await mapLimit(attachments, 16, async (item) => {
    const head = await safeHead(item.url);
    item.contentType = head.contentType;
    item.contentLength = head.contentLength;
    item.fileName = head.fileName ?? `${hash(item.url)}.bin`;
    item.ext = path.extname(item.fileName).toLowerCase();
  });
  return attachments;
}

async function downloadAttachments(attachments) {
  const candidates = attachments
    .filter((item) => wantedExtensions.has(item.ext))
    .filter((item) => item.contentLength === 0 || item.contentLength <= 45 * 1024 * 1024)
    .sort((a, b) => scoreAttachment(b) - scoreAttachment(a))
    .slice(0, 320);

  const results = [];
  await mapLimit(candidates, 6, async (item) => {
    const safeName = sanitizeFileName(`${item.topicId}-${item.fileName}`);
    const target = path.join(downloadDir, safeName);
    try {
      const existing = await exists(target);
      if (!existing) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 45_000);
        try {
          const res = await fetch(item.url, { signal: controller.signal });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buf = Buffer.from(await res.arrayBuffer());
          await writeFile(target, buf);
        } finally {
          clearTimeout(timeout);
        }
      }
      const size = (await stat(target)).size;
      results.push({
        ...item,
        path: target,
        relPath: path.relative(root, target).replaceAll("\\", "/"),
        size,
      });
    } catch (error) {
      item.downloadError = String(error?.message ?? error);
    }
  });
  return results;
}

async function extractZipScenes(files) {
  const zips = files.filter((file) => file.ext === ".zip");
  const extracted = [];
  for (const zip of zips) {
    let buf;
    try {
      buf = await readFile(zip.path);
    } catch {
      continue;
    }
    const entries = parseZip(buf);
    for (const entry of entries) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!sceneExtensions.has(ext) || entry.size > 35 * 1024 * 1024) continue;
      try {
        const outName = sanitizeFileName(`${path.basename(zip.path, zip.ext)}-${entry.name}`);
        const target = path.join(extractDir, outName);
        await writeFile(target, entry.data);
        extracted.push({
          ...zip,
          ext,
          fileName: path.basename(target),
          path: target,
          relPath: path.relative(root, target).replaceAll("\\", "/"),
          size: entry.data.length,
          sourceZip: zip.fileName,
          zipEntry: entry.name,
        });
      } catch {
        // Ignore malformed ZIP entries.
      }
    }
  }
  return extracted;
}

async function analyzeScenes(files) {
  const analyses = [];
  for (const file of files) {
    let raw;
    try {
      raw = await readFile(file.path);
    } catch {
      continue;
    }
    const text = bufferToSearchableText(raw);
    const lower = text.toLowerCase();
    const nodeCounts = {};
    for (const node of nodeLexicon) {
      const count = countWordish(lower, node);
      if (count > 0) nodeCounts[node] = count;
    }
    const categories = {};
    for (const rule of categoryRules) {
      const score = rule.terms.reduce((sum, term) => sum + countLoose(lower, term), 0);
      if (score > 0) categories[rule.key] = score;
    }
    const detectedPatterns = workflowPatterns
      .filter((pattern) => pattern.detect.every((term) => countLoose(lower, term) > 0))
      .map((pattern) => pattern.title);
    const snippets = extractSnippets(text);
    const topNodes = Object.entries(nodeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 18);
    const categoryList = Object.entries(categories).sort((a, b) => b[1] - a[1]);
    analyses.push({
      ...file,
      hash: await sha1(file.path),
      topNodes,
      categories: categoryList,
      detectedPatterns,
      snippets,
      textSize: text.length,
    });
  }
  return analyses.sort((a, b) => scoreAnalysis(b) - scoreAnalysis(a));
}

function buildReport(data) {
  const { topics, attachments, downloaded, extracted, analyses } = data;
  const generatedAt = new Date().toISOString().slice(0, 10);
  const sceneCount = analyses.length;
  const forumRows = forums
    .map((forum) => {
      const t = topics.filter((topic) => topic.forums.includes(forum.name)).length;
      const a = attachments.filter((att) => att.forumNames.includes(forum.name)).length;
      return `<tr><td>${escapeHtml(forum.name)}</td><td>${t}</td><td>${a}</td></tr>`;
    })
    .join("");

  const categoryTotals = {};
  const nodeTotals = {};
  for (const analysis of analyses) {
    for (const [key, value] of analysis.categories) categoryTotals[key] = (categoryTotals[key] ?? 0) + value;
    for (const [key, value] of analysis.topNodes) nodeTotals[key] = (nodeTotals[key] ?? 0) + value;
  }
  const catBars = barList(categoryTotals, 12);
  const nodeBars = barList(nodeTotals, 24);

  const patternCards = workflowPatterns
    .map((pattern) => {
      const count = analyses.filter((analysis) => analysis.detectedPatterns.includes(pattern.title)).length;
      return `<article class="card">
        <div class="metric">${count}</div>
        <h3>${escapeHtml(pattern.title)}</h3>
        <p>${escapeHtml(pattern.lesson)}</p>
        <div class="chips">${pattern.detect.map((x) => `<span>${escapeHtml(x)}</span>`).join("")}</div>
      </article>`;
    })
    .join("");

  const sceneRows = analyses
    .slice(0, 80)
    .map((a) => {
      const cats = a.categories
        .slice(0, 4)
        .map(([key]) => `<span>${escapeHtml(key)}</span>`)
        .join("");
      const nodes = a.topNodes
        .slice(0, 8)
        .map(([key, count]) => `${escapeHtml(key)}:${count}`)
        .join(", ");
      return `<tr>
        <td><a href="../${escapeHtml(a.relPath)}">${escapeHtml(a.fileName)}</a></td>
        <td>${escapeHtml(a.topicTitle ?? "")}<br><small><a href="${escapeHtml(a.url)}">附件</a> · <a href="${base}/forum/topic/${escapeHtml(a.topicId)}/">主题 ${escapeHtml(a.topicId)}</a></small></td>
        <td>${formatBytes(a.size)}</td>
        <td><div class="chips">${cats}</div></td>
        <td>${nodes}</td>
      </tr>`;
    })
    .join("");

  const snippetCards = analyses
    .filter((a) => a.snippets.length > 0)
    .slice(0, 24)
    .map((a) => {
      const snips = a.snippets
        .slice(0, 3)
        .map((s) => `<code>${escapeHtml(s)}</code>`)
        .join("");
      return `<article class="snippet"><h4>${escapeHtml(a.fileName)}</h4>${snips}</article>`;
    })
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SideFX 论坛 HIP 程序化建模学习报告</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b0f14;
      --panel: #131a22;
      --panel2: #17212c;
      --text: #e8eef5;
      --muted: #9aa9ba;
      --line: #283544;
      --a: #ff8a3d;
      --b: #47d7ac;
      --c: #72a7ff;
      --d: #f3d36b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.55;
    }
    header {
      padding: 56px 6vw 34px;
      background:
        linear-gradient(120deg, rgba(255,138,61,.18), transparent 36%),
        linear-gradient(220deg, rgba(71,215,172,.14), transparent 40%),
        #0d1218;
      border-bottom: 1px solid var(--line);
    }
    main { padding: 28px 6vw 64px; }
    h1 { margin: 0 0 14px; font-size: clamp(30px, 5vw, 58px); line-height: 1.02; letter-spacing: 0; }
    h2 { margin: 36px 0 16px; font-size: 26px; }
    h3 { margin: 0 0 8px; font-size: 18px; }
    h4 { margin: 0 0 10px; font-size: 15px; color: var(--d); }
    p { margin: 0 0 14px; color: var(--muted); }
    a { color: var(--c); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .lead { max-width: 1100px; font-size: 18px; color: #cdd7e3; }
    .stats, .grid { display: grid; gap: 14px; }
    .stats { grid-template-columns: repeat(5, minmax(120px, 1fr)); margin-top: 26px; }
    .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .stat, .card, .panel, .snippet {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px;
    }
    .stat b { display: block; font-size: 30px; color: #fff; line-height: 1; margin-bottom: 6px; }
    .stat span { color: var(--muted); font-size: 13px; }
    .metric { float: right; font-size: 28px; color: var(--a); font-weight: 800; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chips span {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 2px 8px;
      border: 1px solid #33475b;
      border-radius: 999px;
      color: #cfe3f8;
      background: #111923;
      font-size: 12px;
    }
    .bars { display: grid; gap: 8px; }
    .bar {
      display: grid;
      grid-template-columns: 190px 1fr 56px;
      align-items: center;
      gap: 10px;
      color: #dbe8f6;
      font-size: 13px;
    }
    .track { height: 12px; background: #0b1118; border: 1px solid #253344; border-radius: 999px; overflow: hidden; }
    .fill { height: 100%; background: linear-gradient(90deg, var(--a), var(--b)); }
    table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
    th, td { padding: 10px 12px; border-bottom: 1px solid var(--line); vertical-align: top; text-align: left; }
    th { color: #fff; background: var(--panel2); position: sticky; top: 0; }
    td, small { color: var(--muted); }
    td:first-child { color: #fff; }
    ul { margin: 0; padding-left: 20px; color: var(--muted); }
    li { margin: 7px 0; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    code {
      display: block;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      padding: 9px;
      margin: 8px 0;
      border-radius: 6px;
      background: #090d12;
      border: 1px solid #253344;
      color: #d9f5e9;
      font-size: 12px;
    }
    .note { color: #d9e8f7; background: #111923; border-left: 3px solid var(--a); padding: 12px 14px; border-radius: 6px; }
    @media (max-width: 1000px) {
      .stats { grid-template-columns: repeat(2, 1fr); }
      .grid, .two { grid-template-columns: 1fr; }
      .bar { grid-template-columns: 128px 1fr 42px; }
    }
  </style>
</head>
<body>
  <header>
    <h1>SideFX 论坛 HIP 程序化建模学习报告</h1>
    <p class="lead">抓取 SideFX 官方论坛公开主题与附件，筛选 HIP/HIPLC/HIPNC/HDA/ZIP 样本，离线抽取可读节点名、参数痕迹、网络结构关键词。目标不是复刻 Houdini，而是提炼 Meshova 可用的程序化建模流程、验证、工具与造型策略。</p>
    <div class="stats">
      <div class="stat"><b>${topics.length}</b><span>扫描主题</span></div>
      <div class="stat"><b>${attachments.length}</b><span>公开附件</span></div>
      <div class="stat"><b>${downloaded.length}</b><span>已下载目标附件</span></div>
      <div class="stat"><b>${extracted.length}</b><span>ZIP 内提取场景</span></div>
      <div class="stat"><b>${sceneCount}</b><span>分析 HIP/HDA 场景</span></div>
    </div>
    <p style="margin-top:18px">生成日期：${generatedAt}。下载样本位于 <code style="display:inline;padding:2px 6px">out/sidefx-hip-study/downloads/</code>。</p>
  </header>
  <main>
    <section>
      <h2>结论先行</h2>
      <div class="panel">
        <ul>
          <li>Houdini 的强点不是单个算法，而是<strong>属性流 + 命名选择 + 可视阶段边界</strong>。Meshova 应把 group/name/uv/material/seed/report 作为一等数据，不只传 positions/indices。</li>
          <li>程序化建模常见骨架：<strong>输入参数 -> 粗形/曲线骨架 -> 分组/属性标注 -> 局部规则 -> 复制/循环 -> 清理验证 -> 输出缓存</strong>。</li>
          <li>AI 闭环最该学 Houdini 的是可观察性：每个阶段有可命名输出、可缓存、可截图、可测 bbox/面积/连通块/法线/非流形。</li>
          <li>曲线流程最适合 Meshova 下一阶段补齐：curve/resample/polyframe/sweep 能覆盖头发、绳索、管道、植物、轮廓装饰、家具边线。</li>
          <li>不要照搬节点 UI。照搬<strong>网络语义</strong>：稳定输入输出、属性表、局部表达式、显式随机种子、阶段验证。</li>
        </ul>
      </div>
    </section>

    <section>
      <h2>样本覆盖</h2>
      <table>
        <thead><tr><th>论坛版块</th><th>主题数</th><th>附件数</th></tr></thead>
        <tbody>${forumRows}</tbody>
      </table>
    </section>

    <section>
      <h2>高频能力分布</h2>
      <div class="two">
        <div class="panel"><h3>流程类别</h3><div class="bars">${catBars}</div></div>
        <div class="panel"><h3>节点/关键词</h3><div class="bars">${nodeBars}</div></div>
      </div>
    </section>

    <section>
      <h2>可学模式</h2>
      <div class="grid">${patternCards}</div>
    </section>

    <section>
      <h2>Meshova 建议路线</h2>
      <div class="grid">
        <article class="card">
          <h3>短期：属性与选择系统</h3>
          <p>新增 face/point/group/name/material 属性表。所有几何算子保留属性映射。选择器返回命名集合，不返回临时索引。</p>
        </article>
        <article class="card">
          <h3>短期：曲线建模栈</h3>
          <p>实现 polyline/Bezier/NURBS-lite、resample、frame transport、sweep profile、curve loft。优先稳定、可测、可截图。</p>
        </article>
        <article class="card">
          <h3>短期：质量报告</h3>
          <p>每次 build 输出 bbox、surface area、volume 近似、连通块、退化面、非流形边、normal flip、UV 缺失率。</p>
        </article>
        <article class="card">
          <h3>中期：实例系统</h3>
          <p>scatter 返回点属性；copyToPoints 输出 instance buffer。AI 调参时不必每次烘大 mesh，截图前再 bake 或 GPU instance。</p>
        </article>
        <article class="card">
          <h3>中期：阶段缓存</h3>
          <p>算子链节点 hash = op + params + seed + input hash。缓存中间 mesh/material，失败时定位到具体 stage。</p>
        </article>
        <article class="card">
          <h3>中期：SDF/体素接口</h3>
          <p>布尔、融合、厚度、形体约束可先走 SDF。先提供抽象接口和验证，不急于复杂三角布尔完全体。</p>
        </article>
      </div>
    </section>

    <section>
      <h2>推荐 DSL 形状</h2>
      <div class="panel">
        <p class="note">Houdini 是节点图；Meshova 应保持脚本优先。但 DSL 可吸收节点图的 stage、group、attribute、cache、validation。</p>
        <code>const body = stage("body.blockout", () =>
  box({ size }).bevel(radius).tagFaces("front", byNormal(zPlus))
);

const ribs = stage("detail.ribs", () =>
  curveSpine(points)
    .resample({ segments: 48 })
    .frame({ mode: "parallelTransport" })
    .sweep(profile.roundRect({ width, height }))
    .copyAround(body.group("front"), { count, seed })
);

return validate(merge(body, ribs), {
  maxDegenerateFaces: 0,
  requireGroups: ["front", "ribs"],
  screenshotViews: ["front", "side", "iso"],
});</code>
      </div>
    </section>

    <section>
      <h2>样本索引 Top 80</h2>
      <table>
        <thead><tr><th>文件</th><th>来源主题</th><th>大小</th><th>类别</th><th>高频节点/词</th></tr></thead>
        <tbody>${sceneRows}</tbody>
      </table>
    </section>

    <section>
      <h2>可读片段</h2>
      <div class="grid">${snippetCards}</div>
    </section>

    <section>
      <h2>方法与限制</h2>
      <div class="panel">
        <ul>
          <li>仅抓取公开论坛页面与公开附件；未登录，不访问私有资源。</li>
          <li>HIP 二进制未用 Houdini 官方 API 解析，采用字符串抽取；节点频次代表“可读痕迹”，不是完整网络拓扑。</li>
          <li>ZIP 内只提取 HIP/HDA/OTL；超大附件跳过，避免把模拟缓存/贴图包拉爆。</li>
          <li>报告用于学习流程和设计原则；不要复制 GPL/第三方资产或具体实现。</li>
        </ul>
      </div>
    </section>
  </main>
</body>
</html>`;
}

async function fetchText(url) {
  for (let i = 0; i < 3; i++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "user-agent": "Meshova research script; public SideFX forum attachment study",
        },
      });
      if (res.ok) return await res.text();
    } catch {
      await sleep(500 + i * 500);
    } finally {
      clearTimeout(timeout);
    }
  }
  return "";
}

async function safeHead(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9_000);
  try {
    const res = await fetch(url, { method: "HEAD", signal: controller.signal });
    const cd = res.headers.get("content-disposition") ?? "";
    const fileName =
      firstMatch(cd, /filename\*=UTF-8''([^;]+)/i) ??
      firstMatch(cd, /filename="?([^";]+)"?/i);
    return {
      contentType: res.headers.get("content-type") ?? "",
      contentLength: Number(res.headers.get("content-length") ?? 0),
      fileName: fileName ? decodeURIComponent(fileName) : undefined,
    };
  } catch {
    return { contentType: "", contentLength: 0 };
  } finally {
    clearTimeout(timeout);
  }
}

function parseZip(buf) {
  const entries = [];
  let offset = 0;
  while (offset < buf.length - 30) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== 0x04034b50) {
      offset++;
      continue;
    }
    const method = buf.readUInt16LE(offset + 8);
    const compressedSize = buf.readUInt32LE(offset + 18);
    const uncompressedSize = buf.readUInt32LE(offset + 22);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf
      .subarray(offset + 30, offset + 30 + nameLen)
      .toString("utf8")
      .replaceAll("\\", "/");
    const dataStart = offset + 30 + nameLen + extraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buf.length || name.endsWith("/")) {
      offset = Math.max(offset + 1, dataEnd);
      continue;
    }
    const payload = buf.subarray(dataStart, dataEnd);
    let data;
    if (method === 0) data = payload;
    else if (method === 8) data = inflateRawSync(payload);
    else {
      offset = dataEnd;
      continue;
    }
    if (uncompressedSize === 0 || data.length === uncompressedSize) {
      entries.push({ name, size: data.length, data });
    }
    offset = dataEnd;
  }
  return entries;
}

function bufferToSearchableText(buf) {
  const chars = [];
  let run = "";
  for (const byte of buf) {
    if (byte >= 32 && byte <= 126) {
      run += String.fromCharCode(byte);
    } else {
      if (run.length >= 3) chars.push(run);
      run = "";
    }
  }
  if (run.length >= 3) chars.push(run);
  return chars.join("\n").slice(0, 3_000_000);
}

function extractSnippets(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 8 && line.length <= 220)
    .filter((line) =>
      /(@P|@N|ch\(|chs\(|fit01|rand\(|noise\(|v@|f@|i@|group|poly|sweep|copy|scatter|uv|normal|OUT_|CACHE_|validate)/i.test(
        line,
      ),
    );
  return [...new Set(lines)].slice(0, 12);
}

function barList(counts, maxItems) {
  const entries = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxItems);
  const max = Math.max(1, ...entries.map(([, value]) => value));
  return entries
    .map(([name, value]) => {
      const width = Math.max(3, Math.round((value / max) * 100));
      return `<div class="bar"><span>${escapeHtml(name)}</span><div class="track"><div class="fill" style="width:${width}%"></div></div><b>${value}</b></div>`;
    })
    .join("");
}

function scoreAttachment(item) {
  const topic = `${item.topicTitle ?? ""} ${item.fileName ?? ""}`.toLowerCase();
  let score = 0;
  if (sceneExtensions.has(item.ext)) score += 40;
  if (item.ext === ".zip") score += 16;
  for (const word of [
    "procedural",
    "model",
    "sop",
    "curve",
    "scatter",
    "copy",
    "boolean",
    "vdb",
    "hda",
    "asset",
    "terrain",
    "building",
    "road",
    "tree",
    "tool",
  ]) {
    if (topic.includes(word)) score += 5;
  }
  if ((item.contentLength ?? 0) > 0) score += Math.max(0, 8 - Math.log2(item.contentLength / 1024 + 1));
  return score;
}

function scoreAnalysis(item) {
  return (
    item.detectedPatterns.length * 20 +
    item.categories.length * 6 +
    item.topNodes.length * 2 +
    item.snippets.length
  );
}

function sanitizeFileName(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/\s+/g, "_").slice(0, 180);
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function sha1(file) {
  const h = createHash("sha1");
  await new Promise((resolve, reject) => {
    createReadStream(file)
      .on("data", (chunk) => h.update(chunk))
      .on("end", resolve)
      .on("error", reject);
  });
  return h.digest("hex");
}

function hash(value) {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapLimit(items, limit, fn) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

function firstMatch(text, regex) {
  const match = text.match(regex);
  return match?.[1];
}

function countWordish(text, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...text.matchAll(new RegExp(`(^|[^a-z0-9_])${escaped}([^a-z0-9_]|$)`, "g"))].length;
}

function countLoose(text, term) {
  let count = 0;
  let idx = 0;
  while ((idx = text.indexOf(term.toLowerCase(), idx)) !== -1) {
    count++;
    idx += term.length;
  }
  return count;
}

function stripHtml(html) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  );
}

function decodeHtml(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatBytes(value) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

await main();
