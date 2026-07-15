---
description: Meshova 程序化建模/材质总入口 — 给文字或参考图，闭环生成可重跑的程序化脚本+PBR材质
argument-hint: <文字描述 或 图片路径> [附加要求...]
allowed-tools: Bash, Read, Edit, Write, Glob, Grep
---

你是 Meshova 闭环里写脚本的那个 LLM。用户输入：$ARGUMENTS

Meshova 的定义思想是**闭环自迭代**：你写受限 JS 脚本 → sandbox 跑 → 渲染截图 → 分数/图反馈给你 → 你改。产物永远是**可重跑的脚本**，不是烘焙好的死网格。determinism 不可妥协，脚本里禁止 `Math.random()`/`Date.now()`。

## 判断输入类型

- 参数是**图片路径**（.png/.jpg/.jpeg/.webp 存在的文件）→ 走 image-to-model：形状一致性优先（剪影 IoU），材质只求类别对（金属别做成皮革）。
- 否则视为**文字描述** → 走 text-to-model。

## 流程

1. **准备**：确认 `dist/` 存在，没有就 `pnpm build`。读一遍 DSL 可用函数：
   ```bash
   node scripts/meshova.mjs ref
   ```
   只能调用这里列出的函数，脚本以 `return [ part(...), ... ]` 结尾。三种 part 构造器：`part(name,mesh,[r,g,b])`（平色）、`coloredPart(name,mesh,colorFn)`（按几何场逐顶点上色）、`surfacePart(name,mesh,type,params)`（匹配物理材质：glass/liquid/metal/fabric…，与模型一起生成保证材质和造型对齐）。

2. **图片输入时**先归一化参考图：
   ```bash
   node scripts/meshova.mjs prep-image "<图片路径>"
   ```

3. **写脚本**：根据需求写一个受限 JS 片段到 `out/meshova/<id>.js`（无 import、无 async）。优先用 shape builder / deformer / metaballs 等高级算子拼出可辨识造型，别用一堆独立球体堆连续躯干。

4. **跑一轮闭环**：
   ```bash
   # 文字（--title 给 web 里显示的中文名）：
   node scripts/meshova.mjs run out/meshova/<id>.js --views persp,front,side --name <id> --title "<中文名>"
   # 图片：加 --ref 做剪影评分
   node scripts/meshova.mjs run out/meshova/<id>.js --views front,side,persp --name <id> --title "<中文名>" --ref out/meshova/ref.png
   ```
   命令回一个 JSON：`ok`/`error`/`stats`/`renders`（各视角 PNG 路径）/`score`（剪影 IoU + 颜色，仅带 --ref 时）/`published`（写进 web 的 id 与 `?model=<id>` 链接）。

   **默认发布进 web**：每轮 run 会自动写 `out/<id>.json`（viewer 用 `?model=<id>` 直接加载）、把截图落到 `out/shots/<id>-<view>.png` 当 gallery 缩略图、并 upsert 进 `out/models.json`（category=meshova，gallery 已放行）。不想入库时加 `--no-publish`。

5. **看反馈再改**：用 Read 打开渲染出的 PNG 观察造型，读 stats 判断比例/包围盒。脚本报错就按 `error` 修；造型不对就改脚本重跑（同一 `--name` 会覆盖更新 web 里的条目）。图片模式盯着 IoU 往上迭代（目标 ≥0.9）。迭代 2-4 轮，直到形状可辨识/分数达标。

6. **收尾**：告诉用户模型已进 web，可 `pnpm view` 后打开 `/web/gallery.html` 或直接 `/web/index.html?model=<id>` 查看；报告最终脚本路径 `out/meshova/<id>/script.js`、以及（图片模式）最终分数。可加 `--obj` 顺带导出 OBJ+MTL。

## 约束

- 材质必须程序化（代码算 PBR），不直出位图，不把照片烘进几何/纹理。
- 新增给 AI 用的几何/材质函数要同时注册进 `src/agent/api.ts` 的 `SCRIPT_API` 和 `SCRIPT_API_REFERENCE`——但 `/meshova` 默认只**使用**现有 DSL，不擅自扩内核，除非用户明确要求。
- 渲染依赖 Playwright Chromium；缺了就用 `--no-render` 先验证脚本能跑通，并告知用户。
