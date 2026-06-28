/**
 * Render doc/aaa-material-shader-library.html from doc/_data/matlib.json.
 * Self-contained dark-theme single file: material capability map + Sketchfab gallery.
 */
import { readFileSync, writeFileSync } from "node:fs";

const { MATERIALS, models, CAT_ZH, stat } = JSON.parse(readFileSync("doc/_data/matlib.json", "utf8"));

const CSS = `
  :root{--bg:#0d1117;--panel:#161b22;--panel2:#1c2330;--border:#2d3748;--text:#e6edf3;
    --muted:#8b97a7;--accent:#ff8a3d;--accent2:#4dd0e1;--chip:#21262d;--shadow:rgba(0,0,0,.4);
    --done:#3fb950;--approx:#d29922;--todo:#f85149;}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--text);font-family:"Segoe UI","Microsoft YaHei",system-ui,sans-serif;line-height:1.5;padding:0 0 60px}
  header{position:sticky;top:0;z-index:10;background:linear-gradient(180deg,#0d1117 80%,rgba(13,17,23,.85));border-bottom:1px solid var(--border);padding:16px 24px 12px;backdrop-filter:blur(6px)}
  h1{font-size:21px;font-weight:700;letter-spacing:.4px}
  h1 span{color:var(--accent)}
  .sub{color:var(--muted);font-size:12.5px;margin-top:4px}
  .tabs{display:flex;gap:8px;margin-top:14px}
  .tab{background:var(--chip);border:1px solid var(--border);color:var(--muted);padding:7px 16px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;transition:.15s}
  .tab:hover{color:var(--text)}
  .tab.active{background:var(--accent);color:#161b22;border-color:var(--accent)}
  .controls{margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  #search{flex:1;min-width:220px;background:var(--panel2);border:1px solid var(--border);color:var(--text);padding:9px 14px;border-radius:10px;font-size:14px;outline:none}
  #search:focus{border-color:var(--accent)}
  .stat{display:flex;gap:8px;font-size:12px;color:var(--muted);flex-wrap:wrap}
  .badge{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:20px;border:1px solid var(--border);background:var(--chip)}
  .dot{width:8px;height:8px;border-radius:50%}
  .d-done{background:var(--done)}.d-approx{background:var(--approx)}.d-todo{background:var(--todo)}
  .cats{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px}
  .cat{background:var(--chip);border:1px solid var(--border);color:var(--muted);padding:5px 11px;border-radius:20px;font-size:12.5px;cursor:pointer;transition:.15s;user-select:none}
  .cat:hover{color:var(--text);border-color:var(--accent)}
  .cat.active{background:var(--accent);color:#161b22;border-color:var(--accent);font-weight:600}
  main{padding:22px 24px;max-width:1480px;margin:0 auto}
  .group{margin-bottom:30px}
  .group h2{font-size:15px;color:var(--accent2);border-left:3px solid var(--accent2);padding-left:10px;margin-bottom:12px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
  .card{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:13px 15px;transition:.15s;box-shadow:0 1px 3px var(--shadow);position:relative}
  .card:hover{border-color:var(--accent);transform:translateY(-2px)}
  .card .top{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;padding-right:64px}
  .card .nm{font-size:14.5px;font-weight:600}
  .card .en{font-size:11.5px;color:var(--muted)}
  .card .st{position:absolute;top:12px;right:13px;font-size:10.5px;padding:2px 8px;border-radius:20px;font-weight:600}
  .st-done{color:var(--done);background:rgba(63,185,80,.12);border:1px solid rgba(63,185,80,.3)}
  .st-approx{color:var(--approx);background:rgba(210,153,34,.12);border:1px solid rgba(210,153,34,.3)}
  .st-todo{color:var(--todo);background:rgba(248,81,73,.12);border:1px solid rgba(248,81,73,.3)}
  .card .ds{font-size:12.6px;color:var(--muted);margin-top:7px}
  .card .fn{font-size:11px;color:var(--accent2);font-family:ui-monospace,Consolas,monospace;margin-top:7px}
  .tch{margin-top:7px;display:flex;gap:5px;flex-wrap:wrap}
  .tch span{font-size:10.5px;color:var(--accent);background:rgba(255,138,61,.1);border-radius:5px;padding:1px 7px}
  .ggrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}
  .gcard{background:var(--panel);border:1px solid var(--border);border-radius:10px;overflow:hidden;transition:.15s;text-decoration:none;color:inherit;display:block}
  .gcard:hover{border-color:var(--accent);transform:translateY(-3px)}
  .gcard .thumb{width:100%;aspect-ratio:16/10;object-fit:cover;background:var(--panel2);display:block}
  .gcard .body{padding:9px 11px}
  .gcard .gnm{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .gcard .gmeta{font-size:11px;color:var(--muted);margin-top:3px;display:flex;justify-content:space-between}
  .gcard .gcat{font-size:10px;color:var(--accent2);margin-top:5px}
  .empty{color:var(--muted);text-align:center;padding:60px;font-size:15px}
  .intro{background:var(--panel);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:8px;padding:13px 16px;margin-bottom:20px;font-size:13px;color:var(--muted)}
  .intro b{color:var(--text)}
  footer{text-align:center;color:var(--muted);font-size:12px;margin-top:30px}
  .hide{display:none}
  mark{background:var(--accent);color:#161b22;border-radius:3px;padding:0 2px}
`;
// CLIENT runs in browser. Written as a plain string so build-time template
// literals don't clash with the client's own backticks.
const CLIENT = [
'const ST_LABEL={done:"\\u2705 \\u5df2\\u5b9e\\u73b0",approx:"\\u26a0\\ufe0f \\u8fd1\\u4f3c",todo:"\\u274c \\u5f85\\u6269\\u5c55"};',
'const matCats=[...new Set(MATERIALS.map(m=>m.cat))];',
'const modelCats=[...new Set(MODELS.flatMap(m=>m.categories))].sort((a,b)=>',
'  MODELS.filter(m=>m.categories.includes(b)).length-MODELS.filter(m=>m.categories.includes(a)).length);',
'let view="mat",activeCat="all",q="";',
'const $=s=>document.querySelector(s);',
'function esc(s){return String(s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));}',
'function hi(s){if(!q)return esc(s);const r=new RegExp("("+q.replace(/[.*+?^${}()|[\\]\\\\]/g,"\\\\$&")+")","ig");return esc(s).replace(r,"<mark>$1</mark>");}',
'function renderStat(){',
'  if(view==="mat"){',
'    const d=MATERIALS.filter(m=>m.st==="done").length,a=MATERIALS.filter(m=>m.st==="approx").length,t=MATERIALS.filter(m=>m.st==="todo").length;',
'    $("#stat").innerHTML="<span class=\\"badge\\"><span class=\\"dot d-done\\"></span>\\u5df2\\u5b9e\\u73b0 "+d+"</span><span class=\\"badge\\"><span class=\\"dot d-approx\\"></span>\\u8fd1\\u4f3c "+a+"</span><span class=\\"badge\\"><span class=\\"dot d-todo\\"></span>\\u5f85\\u6269\\u5c55 "+t+"</span>";',
'  }else{',
'    const liked=MODELS.reduce((s,m)=>s+m.likeCount,0);',
'    $("#stat").innerHTML="<span class=\\"badge\\">"+MODELS.length+" \\u6a21\\u578b</span><span class=\\"badge\\">"+modelCats.length+" \\u5206\\u7c7b</span><span class=\\"badge\\">\\u603b\\u8d5e "+(liked/1000).toFixed(0)+"k</span>";',
'  }',
'}',
'function renderCats(){',
'  const list=view==="mat"?matCats:modelCats;',
'  const lbl=view==="mat"?(c=>c):(c=>CAT_ZH[c]||c);',
'  let h="<span class=\\"cat "+(activeCat==="all"?"active":"")+"\\" data-c=\\"all\\">\\u5168\\u90e8</span>";',
'  for(const c of list)h+="<span class=\\"cat "+(activeCat===c?"active":"")+"\\" data-c=\\""+esc(c)+"\\">"+esc(lbl(c))+"</span>";',
'  $("#cats").innerHTML=h;',
'  $("#cats").querySelectorAll(".cat").forEach(el=>el.onclick=()=>{activeCat=el.dataset.c;render();});',
'}',
'function matCard(m){',
'  const tech=(m.tech||[]).map(t=>"<span>"+esc(t)+"</span>").join("");',
'  return "<div class=\\"card\\"><div class=\\"st st-"+m.st+"\\">"+ST_LABEL[m.st]+"</div>"+',
'    "<div class=\\"top\\"><span class=\\"nm\\">"+hi(m.nm)+"</span><span class=\\"en\\">"+hi(m.en)+"</span></div>"+',
'    "<div class=\\"ds\\">"+hi(m.note)+"</div>"+(m.fn?"<div class=\\"fn\\">"+esc(m.fn)+"</div>":"")+',
'    "<div class=\\"tch\\">"+tech+"</div></div>";',
'}',
'function renderMat(){',
'  const ql=q.toLowerCase();',
'  const f=MATERIALS.filter(m=>{',
'    if(activeCat!=="all"&&m.cat!==activeCat)return false;',
'    if(!ql)return true;',
'    return (m.nm+m.en+m.note+(m.tech||[]).join("")+(m.fn||"")).toLowerCase().includes(ql);',
'  });',
'  const groups={};for(const m of f)(groups[m.cat]=groups[m.cat]||[]).push(m);',
'  let h="";',
'  for(const c of matCats){if(!groups[c])continue;h+="<div class=\\"group\\"><h2>"+esc(c)+"</h2><div class=\\"grid\\">"+groups[c].map(matCard).join("")+"</div></div>";}',
'  $("#matlist").innerHTML=h||"<div class=\\"empty\\">\\u6ca1\\u6709\\u5339\\u914d\\u7684\\u6750\\u8d28</div>";',
'}',
'function renderGal(){',
'  const ql=q.toLowerCase();',
'  const f=MODELS.filter(m=>{',
'    if(activeCat!=="all"&&!m.categories.includes(activeCat))return false;',
'    if(!ql)return true;',
'    return (m.name+m.author+m.tags.join("")+m.categories.join("")).toLowerCase().includes(ql);',
'  });',
'  $("#gallist").innerHTML=f.length?f.map(m=>{',
'    const cats=m.categories.map(c=>CAT_ZH[c]||c).join(" \\u00b7 ");',
'    return "<a class=\\"gcard\\" href=\\""+esc(m.url)+"\\" target=\\"_blank\\" rel=\\"noopener\\">"+',
'      "<img class=\\"thumb\\" loading=\\"lazy\\" src=\\""+esc(m.thumbSmall||m.thumb)+"\\" alt=\\"\\">"+',
'      "<div class=\\"body\\"><div class=\\"gnm\\">"+hi(m.name)+"</div>"+',
'      "<div class=\\"gmeta\\"><span>\\u2665 "+m.likeCount.toLocaleString()+"</span><span>"+(m.faceCount?(m.faceCount/1000).toFixed(0)+"k \\u9762":"")+"</span></div>"+',
'      "<div class=\\"gcat\\">"+esc(cats)+"</div></div></a>";',
'  }).join(""):"<div class=\\"empty\\">\\u6ca1\\u6709\\u5339\\u914d\\u7684\\u6a21\\u578b</div>";',
'}',
'function render(){renderStat();renderCats();view==="mat"?renderMat():renderGal();}',
'$("#search").oninput=e=>{q=e.target.value.trim();view==="mat"?renderMat():renderGal();};',
'document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>{',
'  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));',
'  t.classList.add("active");view=t.dataset.view;activeCat="all";q="";$("#search").value="";',
'  $("#matview").classList.toggle("hide",view!=="mat");',
'  $("#galview").classList.toggle("hide",view!=="gal");',
'  render();',
'});',
'render();',
].join("\n");

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Meshova · AAA 材质与 Shader 能力地图</title>
<style>${CSS}</style>
</head>
<body>
<header>
  <h1>Meshova · <span>AAA 材质与 Shader 能力地图</span></h1>
  <div class="sub">对标 AAA 渲染 · 已实现/近似/待扩展三态 · 含 ${models.length} 个 Sketchfab 本周热门模型作渲染参考</div>
  <div class="tabs">
    <div class="tab active" data-view="mat">材质 &amp; Shader 库 (${MATERIALS.length})</div>
    <div class="tab" data-view="gal">Sketchfab 渲染参考 (${models.length})</div>
  </div>
  <div class="controls">
    <input id="search" type="text" placeholder="搜索材质名 / 技术 / 用途（中英文）…" autocomplete="off">
    <div class="stat" id="stat"></div>
  </div>
  <div class="cats" id="cats"></div>
</header>
<main>
  <div id="matview">
    <div class="intro">
      这张地图把 AAA 渲染常见的材质与 shader 能力，对照 Meshova 现有 <b>src/texture/surface.ts</b> 材质库逐项标注：
      <span style="color:var(--done)">●已实现</span>(${stat.done}) ·
      <span style="color:var(--approx)">●近似可用</span>(${stat.approx}) ·
      <span style="color:var(--todo)">●待扩展</span>(${stat.todo})。
      <b>待扩展</b>项即下一步要补的高品质材质/shader。最高价值缺口：<b>真·次表面散射(皮肤/玉石)</b>、<b>各向异性头发</b>、<b>视差/曲率边缘磨损</b>、<b>卡通NPR(二次元角色)</b>、<b>湿度/积雪/苔藓覆盖层</b>。
    </div>
    <div id="matlist"></div>
  </div>
  <div id="galview" class="hide">
    <div class="intro">数据取自 Sketchfab 本周点赞榜公开 API。社区认可的高质量渲染样本，用于反推 Meshova 需支持的材质类型与 shader 特性。点击卡片打开原页面观察其真实渲染。</div>
    <div class="ggrid" id="gallist"></div>
  </div>
</main>
<footer>Meshova 材质能力地图 · 模型数据来自 Sketchfab 公开 API（本周点赞榜，仅作渲染参考，版权归原作者）</footer>
<script>
const MATERIALS=${JSON.stringify(MATERIALS)};
const MODELS=${JSON.stringify(models)};
const CAT_ZH=${JSON.stringify(CAT_ZH)};
${CLIENT}
</script>
</body>
</html>`;

writeFileSync("doc/aaa-material-shader-library.html", html);
console.error("wrote doc/aaa-material-shader-library.html", (html.length/1024).toFixed(0)+"KB");
// CLIENT_AND_OUTPUT
