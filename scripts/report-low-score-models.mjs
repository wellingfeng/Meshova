import { chromium } from "playwright";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { extname, join, normalize, relative, resolve, sep } from "node:path";

const ROOT = resolve(process.cwd());
const REPORT_PATH = join(ROOT, "doc", "model-self-review-below-85.html");
const GENERATED_THUMB_DIR = join(ROOT, "out", "reports", "model-self-review", "thumbs");
const THRESHOLD = 85;
const VIEWPORT = { width: 1440, height: 960 };

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function startServer() {
  const server = createServer(async (request, response) => {
    try {
      let pathname = decodeURIComponent((request.url || "/").split("?")[0]);
      if (pathname === "/favicon.ico") return response.writeHead(204).end();
      if (pathname === "/__blank") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end("<!doctype html><meta charset=\"utf-8\">");
        return;
      }
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
    let port = 5451;
    const listen = () => {
      server.once("error", (error) => {
        if (error?.code === "EADDRINUSE" && port < 5490) {
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function reportRelative(filePath) {
  return relative(join(ROOT, "doc"), filePath).split(sep).join("/");
}

function scoreBand(score) {
  if (score >= 70) return "70–84";
  if (score >= 50) return "50–69";
  return "0–49";
}

function critiqueCategoryLabel(category) {
  const labels = {
    generic: "通用",
    settlement: "聚落",
    cactus: "仙人掌",
    tree: "树木",
    "water-tower": "水塔",
    car: "汽车",
    lamp: "灯具",
    building: "建筑",
    bottle: "瓶器",
    bench: "长椅",
    table: "桌具",
    quadruped: "四足动物",
    error: "执行错误",
  };
  return labels[category] || "专项规则";
}

function categoryAdvice(category) {
  const advice = {
    城市: "建立主街—街区—地标三级层次，补人车尺度与远近密度变化。",
    建筑: "强化主体、附属体、入口的体块层级；立面模数与结构逻辑保持一致。",
    基建: "补受力与连接关系、护栏标线和尺度参照，先保证工程可信度。",
    程序化地图: "增加道路/水系主导线、关键地标和可读分区，减少均匀铺满。",
    程序生态: "用环境掩膜驱动群落边界、过渡带和稀疏区，避免随机噪声感。",
    地形: "强化大轮廓、坡折与侵蚀层级；水系应服从汇流和高程关系。",
    自然: "拉开主形、次形、碎形频率，加入遮挡、接地和风化方向性。",
    植被: "优化根—干—枝—冠层级，增加年龄、密度、朝向和色相变化。",
    载具: "先校准轴距、轮径、座舱和前后悬比例，再补功能件与材质分区。",
    机械: "明确动力输入、传动、支撑和紧固关系；细节密度服从功能。",
    硬表面: "统一倒角尺度与面板语言，减少无功能切线，增强材质分件。",
    角色: "先修头身、重心和轮廓辨识度，再补关节转折与材质层次。",
    服装: "褶皱应从受力点和垂坠方向产生；补厚度、缝线和材质响应。",
    家具: "校准人体工学比例、承重连接和接触阴影，材质边界跟随零件。",
    基础: "从单一原语升级为有明确用途的组合体，补比例变化和设计焦点。",
    程序工作流: "增加结果导向的主视图与参数对比，直接展示规则带来的视觉收益。",
  };
  return advice[category] || "强化主轮廓、视觉焦点和前中后层次，减少均匀细节。";
}

function shapeAdvice(entry) {
  const text = `${entry.id} ${entry.name} ${entry.semantic}`.toLowerCase();
  if (/river|water|lake|waterfall|河|湖|水|瀑布/.test(text)) {
    return "校准水流方向、岸线曲率和宽深变化；交界处补湿润、泡沫或沉积层。";
  }
  if (/tree|forest|grass|flower|plant|vine|ivy|树|森林|草|花|藤|植被/.test(text)) {
    return "打破等距、等高、等色分布；用成簇、空隙和边缘过渡形成生态节奏。";
  }
  if (/road|street|traffic|bridge|rail|path|道路|街|交通|桥|铁路|路径/.test(text)) {
    return "优化曲线连续性、交叉口半径和端点收口；补通行尺度与边缘构造。";
  }
  if (/city|town|village|scene|world|garden|market|map|城|镇|村|场景|世界|花园|市集|地图/.test(text)) {
    return "设定唯一主焦点，用道路/河流引导视线；远景降密度、近景增加尺度参照。";
  }
  if (/terrain|mountain|island|rock|cliff|cave|地形|山|岛|岩|崖|洞/.test(text)) {
    return "优先修剪影与地貌分区，再叠加侵蚀、碎石和材质过渡，避免全频段同强度。";
  }
  if (/building|house|tower|hall|pavilion|temple|ruin|建筑|房|塔|殿|亭|寺|遗迹/.test(text)) {
    return "突出入口、屋顶和基座关系；窗格、柱距、层高采用稳定模数并留变化点。";
  }
  if (/car|vehicle|engine|gear|machine|bus|车|引擎|齿轮|机械/.test(text)) {
    return "检查功能件是否互相连接、是否有运动空间；主次倒角和表面粗糙度需分层。";
  }
  if (/curve|spline|helix|ribbon|rope|曲线|样条|螺旋|带|绳/.test(text)) {
    return "平滑曲率与半径过渡，增加粗细渐变和端点设计，清理穿插与过密段。";
  }
  return "选择一个最强卖点做视觉焦点；次要细节降对比，轮廓与材质分区先行。";
}

function scoreAdvice(score) {
  if (score >= 70) return "已有较强展示基础；集中修正一到两个高影响问题，避免平均加细节。";
  if (score >= 50) return "先做一轮大形和构图迭代，再增加中尺度结构；暂缓微细节。";
  return "当前存在高影响必修项；先修几何、比例和部件/材质语义错误，再处理展示细节。";
}

function translateIssueFinding(issue) {
  const finding = issue.finding;
  let match;
  if ((match = /^(\d+) weighted component\(s\) are floating.+largest is near \((.+)\)$/.exec(finding))) {
    return `${match[1]} 个承重部件悬空，未形成到地面的接触路径；最大悬空部件约在 (${match[2]})。`;
  }
  if (finding === "fire escape has landings but no reachable stair/ladder path") return "消防梯有平台，但没有可到达的楼梯或爬梯路径。";
  if (finding === "fire escape access path has no usable treads/rungs") return "消防梯通道缺少可用踏步或横档。";
  if ((match = /^(\d+) fire-escape landing\(s\) are not connected/.exec(finding))) return `${match[1]} 个消防梯平台未被通行路径连接。`;
  if ((match = /^(\d+) fire-escape landing entrance\(s\) are blocked/.exec(finding))) return `${match[1]} 个消防梯平台入口被栏杆或护栏几何堵住。`;
  if ((match = /^fire-escape flight is (?:too steep for treads|very steep) \((\d+) degrees\)$/.exec(finding))) return `消防梯坡度过陡（${match[1]}°），不符合可用踏步尺度。`;
  if ((match = /^"(.+)" has active wind\/sway animation weights/.exec(finding))) return `部件 "${match[1]}" 带风摆动画权重，但其语义应为刚性或静态物体。`;
  if ((match = /^(\d+) building footprint\(s\) overlap road geometry$/.exec(finding))) return `${match[1]} 个建筑占地与道路几何重叠。`;
  if ((match = /^(\d+)% of buildings sit too tight against roads$/.exec(finding))) return `${match[1]}% 的建筑离道路过近，缺少合理退距。`;
  if ((match = /^buildings are overcrowded \((\d+)% below spacing threshold\)$/.exec(finding))) return `建筑过度拥挤，${match[1]}% 的间距低于阈值。`;
  if (finding === "settlement buildings repeat as plain body+roof blocks with no facade detail") return "聚落建筑重复使用简单墙体与屋顶，缺少立面细节。";
  if (finding === "building scale variation is too low for a settlement") return "聚落建筑尺度变化不足，重复感明显。";
  if (finding === "part has no triangles (empty mesh)") return "部件没有三角面，是空网格。";
  if ((match = /^(\d+) degenerate \(zero-area\) faces$/.exec(finding))) return `存在 ${match[1]} 个零面积退化面。`;
  if ((match = /^(\d+)\/(\d+) faces have inward\/flipped normals$/.exec(finding))) return `${match[1]}/${match[2]} 个面法线朝内或翻转。`;
  if ((match = /^"(.+)" uses transmissive surface "(.+)" \(transmission=([\d.]+), opacity=([\d.]+)\) without matching transparent\/translucent semantics$/.exec(finding))) {
    return `部件 "${match[1]}" 使用透射表面 "${match[2]}"（透射 ${match[3]}，不透明度 ${match[4]}），但名称或元数据没有透明/半透明语义。`;
  }
  if ((match = /^opaque 3D part "(.+)" is an open shell forced double-sided/.exec(finding))) return `不透明部件 "${match[1]}" 是强制双面的开放壳体，背面可见会产生错误半透明感。`;
  if ((match = /^"(.+)" is a broken\/open shell \((\d+) boundary edges over (\d+) faces, (\d+)%\)/.exec(finding))) return `部件 "${match[1]}" 是破损开放壳体：${match[2]} 条边界边 / ${match[3]} 个面，开放率 ${match[4]}%。`;
  if ((match = /^"(.+)" is a large visible LOD\/billboard card/.exec(finding))) return `部件 "${match[1]}" 是明显可见的大型 LOD/公告板卡片，不像可信植被几何。`;
  if ((match = /^"(.+)" leaf cards are too large.+spans (\d+)%.*and (\d+)%/.exec(finding))) return `部件 "${match[1]}" 的叶片卡过大：最大卡片占冠层包围盒 ${match[2]}%，${match[3]}% 的卡片超过尺寸限制。`;
  if ((match = /^"(.+)" leaves are torn slivers.*?(\d+)% of (\d+) cards.*?mean aspect ([\d.]+):1/.exec(finding))) return `部件 "${match[1]}" 的叶片呈细长破片：${match[2]}% / ${match[3]} 张卡片过细，平均长宽比 ${match[4]}:1。`;
  if ((match = /^"(.+)" leaves overlap heavily.*?crowding (\d+)%/.exec(finding))) return `部件 "${match[1]}" 的叶片严重重叠，拥挤度 ${match[2]}%。`;
  if ((match = /^"(.+)" has exposed occluder blobs.*?(\d+)%/.exec(finding))) return `部件 "${match[1]}" 有裸露遮挡球：${match[2]}% 的冠层露出封闭球体，形成明显“绿球”。`;
  if ((match = /^(\d+) coplanar same-facing triangle pair\(s\) overlap/.exec(finding))) return `${match[1]} 对同向共面三角形重叠，会产生 Z-fighting 闪烁。`;
  if ((match = /^"(.+)" is not sealed.+only (\d+)%/.exec(finding))) return `容器部件 "${match[1]}" 未密封，侧壁射线仅 ${match[2]}% 被阻挡，存在漏缝。`;
  if ((match = /^"(.+)" side walls are sealed but the top\/bottom leaks \((\d+)% enclosed\)$/.exec(finding))) return `容器部件 "${match[1]}" 侧壁已封闭，但顶部或底部泄漏，整体封闭率 ${match[2]}%。`;
  if ((match = /^model height ([\d.-]+) is outside the expected ([\d.-]+)-([\d.-]+) units$/.exec(finding))) return `模型高度 ${match[1]} 超出预期 ${match[2]}–${match[3]} 单位。`;
  if ((match = /^(.+)=([\d.-]+) outside expected ([\d.-]+)-([\d.-]+): (.+)$/.exec(finding))) return `比例 ${match[1]}=${match[2]} 超出预期 ${match[3]}–${match[4]}：${match[5]}。`;
  if ((match = /^no part appears to be the "(.+)" a (.+) should have$/.exec(finding))) return `${match[2]} 缺少应有的 "${match[1]}" 部件。`;
  if ((match = /^(\d+) "(.+)" parts; a (.+) usually has (.+)$/.exec(finding))) return `${match[3]} 当前有 ${match[1]} 个 "${match[2]}" 部件，通常应为 ${match[4]} 个。`;
  const where = issue.part ? `部件 "${issue.part}"` : "模型整体";
  const axis = { geometry: "几何", proportion: "比例", aesthetic: "美学", realism: "真实感", motion: "运动" }[issue.axis] || issue.axis;
  return `${where} 触发${axis}自审问题，需按对应规则修正。`;
}

function translateIssueSuggestion(issue) {
  const finding = issue.finding;
  if (/floating with no contact path/.test(finding)) return "让悬空部件接地，或增加支架、立柱、缆绳等承重连接；纯视觉悬浮件需显式标记 supportExempt。";
  if (/fire escape/.test(finding)) return "重做消防梯通行链：地面、踏步/横档、平台开口必须连续可达，坡度与净空满足使用尺度。";
  if (/wind\/sway animation weights/.test(finding)) return "移除刚性部件的 windWeight；只给植被、布料、水体等柔性部件风摆权重。";
  if (/building footprint|too tight against roads|overcrowded/.test(finding)) return "增加道路退距与地块间距；拒绝与道路带相交的建筑落点，保留可读巷道和庭院。";
  if (/plain body\+roof|scale variation/.test(finding)) return "增加门窗、台阶、阳台和立面模块，并变化建筑宽深、高度与朝向，消除印章式重复。";
  if (/no triangles/.test(finding)) return "删除或重建空部件，确保生成器输出有效三角面。";
  if (/degenerate/.test(finding)) return "避免顶点塌缩；检查细分、位移和合并参数，清理零面积面。";
  if (/flipped normals/.test(finding)) return "修正面绕序并重算法线，避免暗面和内外翻转。";
  if (/transmissive surface/.test(finding)) return "若部件应不透明，改用不透射表面；若透射是设计意图，补正确透明材质名称或语义元数据。";
  if (/open shell forced double-sided|broken\/open shell/.test(finding)) return "补盖开口、焊接壳体并修正外向绕序；不透明实体不要依赖双面渲染掩盖破面。";
  if (/LOD\/billboard card/.test(finding)) return "普通预览隐藏 Impostor/公告板，或替换为真实枝叶几何；卡片只在专用 LOD 调试视图显示。";
  if (/leaf cards are too large/.test(finding)) return "缩小叶片卡并增加叶簇数量，让冠层由多层小叶片构成。";
  if (/torn slivers/.test(finding)) return "把叶片长宽比控制在约 1:1–2:1，避免细长条带。";
  if (/overlap heavily/.test(finding)) return "降低叶片密度并扩大散布间距，减少同点堆叠。";
  if (/exposed occluder blobs/.test(finding)) return "缩小内部遮挡球，或加厚叶片外壳，确保球体不触及冠层剪影。";
  if (/coplanar same-facing/.test(finding)) return "沿法线错开玻璃、贴花或面板，切真实开口，删除隐藏共面面。";
  if (/not sealed|top\/bottom leaks/.test(finding)) return "合并侧壁缝隙并补底/盖；必要时加内壳，确保容器形成连续闭合体。";
  if (/model height/.test(finding)) return "统一模型尺度，使高度落入自审规则的预期范围。";
  if (/outside expected/.test(finding)) return "调整主体长宽高与部件比例，使检测比值回到规则范围。";
  if (/no part appears|parts; a .* usually has/.test(finding)) return "补齐缺失语义部件，或修正部件命名/标签，使自审器能识别其职责与数量。";
  return "先修该项对应的几何、比例或语义规则，再重新运行确定性自审。";
}

function categoryWeakness(category) {
  const weaknesses = {
    城市: "主街—街区—地标层级可能偏弱，人车尺度与远近密度变化不足。",
    建筑: "主体、附属体、入口层级可能不清，立面模数或结构逻辑偏弱。",
    基建: "受力、连接、护栏标线或尺度参照可能不足，工程可信度偏弱。",
    程序化地图: "道路/水系主导线、关键地标或可读分区可能不足，分布偏均匀。",
    程序生态: "群落边界、过渡带和稀疏区可能不明显，随机噪声感偏强。",
    地形: "大轮廓、坡折、侵蚀层级或汇流关系可能不够清楚。",
    自然: "主形、次形、碎形层级可能接近，接地和风化方向性偏弱。",
    植被: "根—干—枝—冠层级或年龄、密度、朝向变化可能不足。",
    载具: "轴距、轮径、座舱、前后悬比例或功能件完整度可能不足。",
    机械: "动力输入、传动、支撑和紧固关系可能不清，细节功能性偏弱。",
    硬表面: "倒角尺度、面板语言或材质分件可能不统一，无功能切线偏多。",
    角色: "头身、重心、轮廓辨识度或关节转折可能不足。",
    服装: "褶皱受力、垂坠方向、厚度和缝线表达可能不足。",
    家具: "人体工学比例、承重连接、接触阴影或零件材质边界可能不足。",
    基础: "原语组合较简单，用途、比例变化和设计焦点可能不明确。",
    程序工作流: "结果主视图和参数对比可能不足，规则带来的视觉收益不直观。",
  };
  return weaknesses[category] || "主轮廓、视觉焦点或前中后层次可能不足，细节分布偏均匀。";
}

function shapeWeakness(entry) {
  const text = `${entry.id} ${entry.name} ${entry.semantic}`.toLowerCase();
  if (/river|water|lake|waterfall|河|湖|水|瀑布/.test(text)) return "水流方向、岸线曲率、宽深变化或水陆交界层次可能不足。";
  if (/tree|forest|grass|flower|plant|vine|ivy|树|森林|草|花|藤|植被/.test(text)) return "分布可能等距、等高或等色，缺少成簇、空隙和边缘过渡。";
  if (/road|street|traffic|bridge|rail|path|道路|街|交通|桥|铁路|路径/.test(text)) return "曲线连续性、交叉口半径、端点收口或通行尺度可能不足。";
  if (/city|town|village|scene|world|garden|market|map|城|镇|村|场景|世界|花园|市集|地图/.test(text)) return "主焦点和视线引导可能不强，远近景密度或尺度参照不足。";
  if (/terrain|mountain|island|rock|cliff|cave|地形|山|岛|岩|崖|洞/.test(text)) return "剪影与地貌分区可能偏弱，多频段细节强度过于接近。";
  if (/building|house|tower|hall|pavilion|temple|ruin|建筑|房|塔|殿|亭|寺|遗迹/.test(text)) return "入口、屋顶、基座关系或窗格、柱距、层高模数可能不够稳定。";
  if (/car|vehicle|engine|gear|machine|bus|车|引擎|齿轮|机械/.test(text)) return "功能件连接、运动空间、倒角层级或粗糙度分层可能不足。";
  if (/curve|spline|helix|ribbon|rope|曲线|样条|螺旋|带|绳/.test(text)) return "曲率、半径过渡、粗细渐变或端点设计可能不足，并可能存在穿插。";
  return "视觉卖点可能不集中，次要细节对比偏高，轮廓或材质分区不够清楚。";
}

function suggestions(entry) {
  const concrete = entry.issues
    .map(translateIssueSuggestion)
    .filter((suggestion, index, all) => suggestion && all.indexOf(suggestion) === index)
    .slice(0, 3);
  return [...concrete, categoryAdvice(entry.category), shapeAdvice(entry), scoreAdvice(entry.score)].slice(0, 3);
}

function lowScoreReasons(entry) {
  if (entry.error) return [`自审执行失败：${entry.error}`];
  const issues = entry.issues.slice(0, 6).map((issue) => {
    const severity = issue.severity === "hard" ? "必修" : "优化";
    const where = issue.part || issue.axis;
    return `${severity} [${where}] ${translateIssueFinding(issue)}`;
  });
  return issues.length ? issues : [
    `自审器未返回具体问题；${categoryWeakness(entry.category)}`,
    shapeWeakness(entry),
  ];
}

function screenshotRank(name, id) {
  const lower = name.toLowerCase();
  const exact = lower === `${id}.png` ? 0 : 10;
  const view = lower.includes("-persp") ? 0
    : lower.includes("-current") ? 1
      : lower.includes("-orbit") ? 2
        : lower.includes("-front") ? 3
          : lower.includes("-side") ? 4
            : lower.includes("-top") ? 5
              : 6;
  const channelPenalty = /-(normal|depth|matcap|ao|lowpoly|toon)(?:\.|-)/.test(lower) ? 20 : 0;
  const qaPenalty = /(qa|debug|wire|mask|ui)/.test(lower) ? 10 : 0;
  return exact + view + channelPenalty + qaPenalty;
}

async function indexScreenshots() {
  const locations = [
    { directory: join(ROOT, "out", "shots"), prefix: "../out/shots/" },
    { directory: join(ROOT, "out"), prefix: "../out/" },
  ];
  const indexed = [];
  for (const location of locations) {
    const names = await readdir(location.directory).catch(() => []);
    for (const name of names) {
      if (!/\.(png|jpe?g|webp)$/i.test(name)) continue;
      indexed.push({ ...location, name, lower: name.toLowerCase() });
    }
  }
  return indexed;
}

function findExistingScreenshot(entry, indexed) {
  const id = entry.id.toLowerCase();
  const escapedId = id.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const viewName = new RegExp(
    `^${escapedId}[-_](?:persp|current|orbit|front|side|top|tt\\d+|preview|final|hero|beauty|render|pbr|evolved|color-fix)(?:[-_.]|$)`,
  );
  const candidates = indexed.filter((image) =>
    image.lower === `${id}.png` ||
    image.lower === `${id}.jpg` ||
    image.lower === `${id}.jpeg` ||
    image.lower === `${id}.webp` ||
    viewName.test(image.lower)
  );
  candidates.sort((a, b) => screenshotRank(a.name, id) - screenshotRank(b.name, id) || a.name.localeCompare(b.name));
  return candidates[0] ? `${candidates[0].prefix}${encodeURIComponent(candidates[0].name)}` : null;
}

async function saveDataUrl(dataUrl, outputPath) {
  const match = /^data:image\/(?:png|jpeg|webp);base64,(.+)$/i.exec(dataUrl);
  if (!match) return false;
  await writeFile(outputPath, Buffer.from(match[1], "base64"));
  return true;
}

async function captureMissingThumbnail(page, entry, index, total) {
  const locator = page.locator(`.card[data-id=${JSON.stringify(entry.id)}]`);
  await locator.scrollIntoViewIfNeeded();
  await page.waitForFunction(
    (id) => {
      const card = document.querySelector(`.card[data-id=${JSON.stringify(id)}]`);
      return card && !card.classList.contains("loading");
    },
    entry.id,
    { timeout: 90000 },
  );
  const source = await locator.locator(".thumb img").getAttribute("src").catch(() => null);
  if (source?.startsWith("data:image/")) {
    const outputPath = join(GENERATED_THUMB_DIR, `${entry.id.replaceAll(/[^a-zA-Z0-9._-]/g, "_")}.png`);
    if (await saveDataUrl(source, outputPath)) return reportRelative(outputPath);
  }
  if (source?.startsWith("/")) return `..${source}`;

  const outputPath = join(GENERATED_THUMB_DIR, `${entry.id.replaceAll(/[^a-zA-Z0-9._-]/g, "_")}.png`);
  await locator.locator(".thumb").screenshot({ path: outputPath });
  if ((index + 1) % 20 === 0 || index + 1 === total) {
    console.log(`已补截图 ${index + 1}/${total}`);
  }
  return reportRelative(outputPath);
}

function renderReport(entries, totals, generatedAt) {
  const categories = [...new Set(entries.map((entry) => entry.category))]
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
  const categoryCounts = Object.fromEntries(categories.map((category) => [
    category,
    entries.filter((entry) => entry.category === category).length,
  ]));
  const bandCounts = {
    "70–84": entries.filter((entry) => entry.score >= 70).length,
    "50–69": entries.filter((entry) => entry.score >= 50 && entry.score < 70).length,
    "0–49": entries.filter((entry) => entry.score < 50).length,
  };
  const average = entries.reduce((sum, entry) => sum + entry.score, 0) / entries.length;
  const lowRate = entries.length / totals.models * 100;

  const cards = entries.map((entry, index) => {
    const advice = suggestions(entry);
    const reasons = lowScoreReasons(entry);
    const scoreClass = entry.score >= 70 ? "near" : entry.score >= 50 ? "mid" : "low";
    return `
      <article class="card" data-name="${escapeHtml(`${entry.name} ${entry.id}`.toLowerCase())}" data-category="${escapeHtml(entry.category)}" data-band="${scoreBand(entry.score)}">
        <div class="shot">
          ${entry.image ? `<img loading="lazy" src="${entry.image}" alt="${escapeHtml(entry.name)} 模型截图">` : `<div class="missing">暂无可用截图</div>`}
          <span class="rank">#${index + 1}</span>
          <span class="score ${scoreClass}">${entry.score}</span>
        </div>
        <div class="body">
          <div class="title-row"><h2>${escapeHtml(entry.name)}</h2><span class="category">${escapeHtml(entry.category)}</span></div>
          <p class="id">${escapeHtml(entry.id)}</p>
          <p class="source">确定性几何自审 · ${escapeHtml(critiqueCategoryLabel(entry.critiqueCategory))} · 几何 ${entry.geometry} / 比例 ${entry.proportion} · 分段 ${scoreBand(entry.score)}</p>
          <h3>低分原因</h3>
          <ul class="reasons">${reasons.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          <h3>优化建议</h3>
          <ol>${advice.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>
        </div>
      </article>`;
  }).join("");

  const categoryOptions = categories
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}（${categoryCounts[category]}）</option>`)
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Meshova 模型库 · 自审分低于 85 报告</title>
<style>
  :root{color-scheme:dark;--bg:#080b10;--panel:#101620;--panel2:#151d29;--line:#263245;--text:#f1f5fb;--muted:#91a0b5;--cyan:#49d7ff;--orange:#ffb35c;--red:#ff6f79;--green:#70e1aa}
  *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:radial-gradient(900px 520px at 12% -8%,#15344a 0,transparent 64%),var(--bg);color:var(--text);font:14px/1.62 Inter,"Segoe UI","Microsoft YaHei",sans-serif}
  header{padding:48px clamp(20px,5vw,72px) 30px;border-bottom:1px solid var(--line)}.eyebrow{color:var(--cyan);font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}h1{margin:7px 0 10px;font-size:clamp(28px,4vw,48px);line-height:1.15;letter-spacing:-.04em}.lead{max-width:900px;color:var(--muted);font-size:15px}.warning{margin-top:16px;max-width:980px;padding:12px 15px;border:1px solid #76552e;background:#251c12;color:#ffd9a5;border-radius:8px}
  .stats{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:12px;margin-top:26px;max-width:960px}.stat{padding:16px;background:#101822cc;border:1px solid var(--line);border-radius:10px}.stat strong{display:block;font-size:25px;line-height:1.1}.stat span{color:var(--muted);font-size:12px}
  .toolbar{position:sticky;top:0;z-index:20;display:flex;gap:10px;flex-wrap:wrap;padding:12px clamp(20px,5vw,72px);background:#080b10e8;border-bottom:1px solid var(--line);backdrop-filter:blur(14px)}input,select{height:38px;background:var(--panel);border:1px solid var(--line);border-radius:7px;color:var(--text);padding:0 11px;font:inherit}input{min-width:260px;flex:1}select{min-width:155px}.shown{display:flex;align-items:center;color:var(--muted);font-variant-numeric:tabular-nums}
  main{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:18px;padding:24px clamp(20px,5vw,72px) 70px}.card{overflow:hidden;background:linear-gradient(180deg,var(--panel2),var(--panel));border:1px solid var(--line);border-radius:12px;box-shadow:0 10px 28px #0005}.shot{position:relative;aspect-ratio:4/3;background:#090d13;overflow:hidden}.shot img{width:100%;height:100%;object-fit:cover;display:block}.missing{height:100%;display:grid;place-items:center;color:var(--muted)}.score,.rank{position:absolute;top:10px;padding:4px 9px;border-radius:999px;font-weight:850;box-shadow:0 3px 14px #0008}.score{right:10px;font-size:18px;background:#171d26}.score.near{color:var(--orange);border:1px solid #915e24}.score.mid{color:#ff8b78;border:1px solid #8d4036}.score.low{color:var(--red);border:1px solid #7d3138}.rank{left:10px;color:#d4dbe6;background:#111720cc;border:1px solid #344156;font-size:11px}.body{padding:15px 16px 17px}.title-row{display:flex;align-items:flex-start;gap:10px}.title-row h2{flex:1;margin:0;font-size:17px;line-height:1.35}.category{flex:0 0 auto;padding:2px 7px;border:1px solid #2b5363;border-radius:999px;color:var(--cyan);font-size:10px}.id,.source{margin:3px 0;color:var(--muted);font-size:11px}.id{font-family:"Cascadia Code",Consolas,monospace}.source{color:#bf9b72}.body h3{margin:12px 0 4px;font-size:12px;color:#dce5f1}.body ol,.body ul{margin:0;padding-left:20px;color:#c3cedd}.body .reasons{color:#efc58e}.body li+li{margin-top:4px}.empty{display:none;grid-column:1/-1;padding:80px 0;text-align:center;color:var(--muted)}footer{padding:18px clamp(20px,5vw,72px) 38px;color:var(--muted);border-top:1px solid var(--line);font-size:12px}
  @media(max-width:700px){header{padding-top:30px}.stats{grid-template-columns:repeat(2,1fr)}main{grid-template-columns:1fr}.toolbar{position:static}input,select{width:100%;min-width:0}.shown{width:100%}}
  @media print{body{background:#fff;color:#111}.toolbar{display:none}header{padding:20px;border-color:#ccc}.warning{color:#6b4300;background:#fff4dd}.lead,.stat span,.id,.source,footer{color:#555}.stats{grid-template-columns:repeat(4,1fr)}.stat,.card{background:#fff;border-color:#bbb;box-shadow:none}main{grid-template-columns:repeat(2,1fr);padding:16px}.card{break-inside:avoid}.body ol{color:#222}.category{color:#057a9b}}
</style>
</head>
<body>
<header>
  <div class="eyebrow">Meshova · Model Library Audit</div>
  <h1>自审分低于 85 的模型</h1>
  <p class="lead">扫描当前模型库 ${totals.models} 个模型，筛出 ${entries.length} 个低于 ${THRESHOLD}。按分数从低到高排列；截图来自模型库现有渲染或离线视图。</p>
  <div class="warning">口径说明：分数直接来自查看器右下角同一套 <b>critique() 确定性自审</b>，包含几何、比例、部件语义与材质语义检查；未接入 VLM 美学评分。分数用于定位技术问题，不等同于人工审美评分。</div>
  <div class="stats">
    <div class="stat"><strong>${entries.length}</strong><span>低于 85</span></div>
    <div class="stat"><strong>${lowRate.toFixed(1)}%</strong><span>模型库占比</span></div>
    <div class="stat"><strong>${average.toFixed(1)}</strong><span>低分模型均分</span></div>
    <div class="stat"><strong>${bandCounts["70–84"]} / ${bandCounts["50–69"]} / ${bandCounts["0–49"]}</strong><span>70–84 / 50–69 / 0–49</span></div>
  </div>
</header>
<div class="toolbar">
  <input id="search" type="search" placeholder="搜索模型名或 ID…">
  <select id="category"><option value="">全部分类（${categories.length}）</option>${categoryOptions}</select>
  <select id="band"><option value="">全部分段</option><option>70–84</option><option>50–69</option><option>0–49</option></select>
  <span class="shown" id="shown"></span>
</div>
<main id="grid">${cards}<div class="empty" id="empty">没有匹配项</div></main>
<footer>生成时间：${escapeHtml(generatedAt)} · 阈值：&lt; ${THRESHOLD} · 数据源：src/critique/critic.ts + 当前 gallery DOM</footer>
<script>
  const cards=[...document.querySelectorAll('.card')];
  const search=document.getElementById('search');
  const category=document.getElementById('category');
  const band=document.getElementById('band');
  const shown=document.getElementById('shown');
  const empty=document.getElementById('empty');
  function filter(){
    const query=search.value.trim().toLowerCase();let count=0;
    for(const card of cards){const visible=(!query||card.dataset.name.includes(query))&&(!category.value||card.dataset.category===category.value)&&(!band.value||card.dataset.band===band.value);card.hidden=!visible;if(visible)count++}
    shown.textContent=count+' / '+cards.length+' 个';empty.style.display=count?'none':'block';
  }
  search.addEventListener('input',filter);category.addEventListener('change',filter);band.addEventListener('change',filter);filter();
</script>
</body>
</html>`;
}

await mkdir(GENERATED_THUMB_DIR, { recursive: true });
const { server, port } = await startServer();
let browser;

try {
  const shellExecutable = chromium.executablePath();
  const fullExecutable = shellExecutable
    .replace(/chromium_headless_shell-(\d+)/, "chromium-$1")
    .replace(/chrome-headless-shell-win64[\\/]chrome-headless-shell\.exe$/i, "chrome-win64\\chrome.exe");
  browser = await chromium.launch({
    executablePath: existsSync(fullExecutable) ? fullExecutable : undefined,
    headless: true,
    args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--headless=new"],
  });
  const metadataPage = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  metadataPage.on("console", (message) => {
    if (message.type() === "error") console.error(`浏览器控制台：${message.text()}`);
  });
  metadataPage.on("pageerror", (error) => console.error(`页面错误：${error.message}`));
  await metadataPage.addInitScript(() => {
    window.IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return []; }
    };
  });
  await metadataPage.goto(`http://127.0.0.1:${port}/web/gallery.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await metadataPage.waitForFunction(() => document.querySelectorAll(".card").length > 0, null, { timeout: 90000 });
  const modelCards = await metadataPage.evaluate(() => [...document.querySelectorAll(".card")]
    .filter((card) => !card.dataset.id.startsWith("mat:") && !card.dataset.specialUrl)
    .map((card) => ({
      id: card.dataset.id,
      name: card.dataset.name,
      category: card.dataset.cat,
      semantic: card.dataset.semantic || "",
      file: card.dataset.file || "",
    })));
  await metadataPage.close();

  const auditPage = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  auditPage.on("console", (message) => {
    if (message.type() === "error") console.error(`浏览器控制台：${message.text()}`);
  });
  auditPage.on("pageerror", (error) => console.error(`页面错误：${error.message}`));
  await auditPage.goto(`http://127.0.0.1:${port}/__blank`, { waitUntil: "domcontentloaded", timeout: 90000 });

  const audit = await auditPage.evaluate(async ({ threshold, cards }) => {
    const { PROC_MODELS, defaultParams } = await import("/web/procmodels.js?v=water7");
    const { critique, makeMesh, recomputeNormals } = await import("/dist/index.js?v=water7");
    const viewerPartToNamedPart = (part) => {
      if (part.mesh) return part;
      const positions = [];
      const normals = [];
      const uvs = [];
      for (let index = 0; index < part.positions.length; index += 3) {
        positions.push({ x: part.positions[index], y: part.positions[index + 1], z: part.positions[index + 2] });
      }
      if (Array.isArray(part.normals) && part.normals.length === part.positions.length) {
        for (let index = 0; index < part.normals.length; index += 3) {
          normals.push({ x: part.normals[index], y: part.normals[index + 1], z: part.normals[index + 2] });
        }
      } else {
        for (let index = 0; index < positions.length; index++) normals.push({ x: 0, y: 1, z: 0 });
      }
      if (Array.isArray(part.uvs) && part.uvs.length === positions.length * 2) {
        for (let index = 0; index < part.uvs.length; index += 2) {
          uvs.push({ x: part.uvs[index], y: part.uvs[index + 1] });
        }
      } else {
        for (let index = 0; index < positions.length; index++) uvs.push({ x: 0, y: 0 });
      }
      return {
        ...part,
        mesh: recomputeNormals(makeMesh({ positions, normals, uvs, indices: Array.from(part.indices || []) })),
      };
    };
    const entries = [];
    for (let index = 0; index < cards.length; index++) {
      const card = cards[index];
      const id = card.id;
      try {
        const procModel = PROC_MODELS[id];
        let parts;
        let goal;
        if (procModel) {
          const params = procModel.defaultParams ? procModel.defaultParams() : defaultParams(procModel);
          parts = await procModel.build(params);
          goal = procModel.critiqueGoal || procModel.id;
        } else {
          const file = card.file || `${id}.json`;
          const response = await fetch(`/out/${file}`, { cache: "no-store" });
          if (!response.ok) throw new Error(`模型文件读取失败：${response.status}`);
          const model = await response.json();
          parts = (model.parts || []).map(viewerPartToNamedPart);
          goal = id;
        }
        const report = critique(parts, { goal });
        entries.push({
          id,
          name: card.name,
          category: card.category,
          semantic: card.semantic,
          score: Number((report.scores.overall * 100).toFixed(0)),
          geometry: Number((report.scores.geometry * 100).toFixed(0)),
          proportion: Number((report.scores.proportion * 100).toFixed(0)),
          critiqueCategory: report.category,
          issues: report.issues.map(({ axis, severity, part, finding, suggestion }) => ({
            axis, severity, part, finding, suggestion,
          })),
        });
      } catch (error) {
        entries.push({
          id,
          name: card.name,
          category: card.category,
          semantic: card.semantic,
          score: 0,
          geometry: 0,
          proportion: 0,
          critiqueCategory: "error",
          issues: [],
          error: error?.message || String(error),
        });
      }
      if ((index + 1) % 20 === 0 || index + 1 === cards.length) {
        console.log(`已自审 ${index + 1}/${cards.length}`);
      }
    }
    return {
      models: entries.length,
      entries: entries.filter((entry) => entry.score < threshold),
    };
  }, { threshold: THRESHOLD, cards: modelCards });
  await auditPage.close();

  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  page.on("console", (message) => {
    if (message.type() === "error") console.error(`浏览器控制台：${message.text()}`);
  });
  page.on("pageerror", (error) => console.error(`页面错误：${error.message}`));
  await page.goto(`http://127.0.0.1:${port}/web/gallery.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => document.querySelectorAll(".card").length > 0, null, { timeout: 90000 });

  audit.entries.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name, "zh-CN"));
  const screenshots = await indexScreenshots();
  const missing = [];
  for (const entry of audit.entries) {
    entry.image = findExistingScreenshot(entry, screenshots);
    if (!entry.image) missing.push(entry);
  }

  console.log(`模型 ${audit.models}，低于 ${THRESHOLD}：${audit.entries.length}，需补截图：${missing.length}`);
  for (let index = 0; index < missing.length; index++) {
    missing[index].image = await captureMissingThumbnail(page, missing[index], index, missing.length);
  }

  const generatedAt = new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date());
  const html = renderReport(audit.entries, { models: audit.models }, generatedAt);
  await writeFile(REPORT_PATH, html, "utf8");
  console.log(`报告已生成：${REPORT_PATH}`);
} finally {
  await browser?.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
