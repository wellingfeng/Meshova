// Meshova × SpeedTree 拟合对比页：并排参考图 / 最佳截图 / 可交互 3D。
const listEl = document.getElementById("list");
const refImg = document.getElementById("refImg");
const bestImg = document.getElementById("bestImg");
const viewer = document.getElementById("viewer");
const infoEl = document.getElementById("info");

function scoreClass(s, target) {
  if (s >= target) return "ok";
  if (s >= target * 0.75) return "warn";
  return "bad";
}

function selectItem(item, target, row) {
  document.querySelectorAll(".row").forEach((r) => r.classList.remove("on"));
  if (row) row.classList.add("on");
  refImg.src = `/web/${item.ref}`;
  bestImg.src = `/web/${item.best}`;
  viewer.src = `/web/index.html?model=${encodeURIComponent(item.id)}`;
  const cls = scoreClass(item.score, target);
  const spm = (item.spmNotes && item.spmNotes.length)
    ? `<div class="spm"><div class="spm-h">SPM 结构解析（离线 gzip XML，仅统计特征）</div>` +
      item.spmNotes.map((n) => `<div class="spm-n">${n}</div>`).join("") + `</div>`
    : `<div class="spm"><div class="spm-h">SPM 结构解析</div><div class="spm-n">该树种未取到可解析的授权 SPM，退回纯剪影+颜色拟合</div></div>`;
  infoEl.innerHTML = [
    `<span><span class="k">树种</span><b>${item.name}</b></span>`,
    `<span><span class="k">分类</span><b>${item.category} / ${item.species}</b></span>`,
    `<span><span class="k">总分</span><b class="sc ${cls}">${item.score.toFixed(3)}</b></span>`,
    `<span><span class="k">剪影 IoU</span><b>${item.iou.toFixed(3)}</b></span>`,
    `<span><span class="k">颜色</span><b>${item.color.toFixed(3)}</b></span>`,
    `<span><span class="k">最佳候选</span><b>${item.tag}</b></span>`,
    `<span><span class="k">视角</span><b>${item.view}</b></span>`,
  ].join("") + spm;
}

async function main() {
  const data = await (await fetch("/web/tree-fit-assets/fit-data.json", { cache: "no-store" })).json();
  document.getElementById("mean").textContent = data.mean.toFixed(3);
  document.getElementById("target").textContent = data.targetScore.toFixed(2);
  document.getElementById("count").textContent = data.items.length;
  document.getElementById("genAt").textContent = new Date(data.generatedAt).toLocaleString("zh-CN");

  const sorted = [...data.items].sort((a, b) => b.score - a.score);
  sorted.forEach((item, i) => {
    const row = document.createElement("div");
    row.className = "row";
    const cls = scoreClass(item.score, data.targetScore);
    row.innerHTML =
      `<div class="nm">${item.name}</div>` +
      `<div class="meta"><span>${item.category}</span><span class="sc ${cls}">${item.score.toFixed(3)}</span></div>`;
    row.onclick = () => selectItem(item, data.targetScore, row);
    listEl.appendChild(row);
    if (i === 0) selectItem(item, data.targetScore, row);
  });
}

main().catch((e) => {
  infoEl.innerHTML = `<span style="color:#f85149">加载失败：${e?.message || e}</span>`;
});
