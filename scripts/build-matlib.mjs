/**
 * Generate doc/aaa-material-shader-library.html — an AAA material & shader
 * capability map cross-referenced against src/texture/surface.ts, plus a
 * Sketchfab top-weekly render-reference gallery from doc/_data.
 */
import { readFileSync, writeFileSync } from "node:fs";

const models = JSON.parse(readFileSync("doc/_data/sketchfab-models.json", "utf8"));

// st: done=已实现 approx=近似 todo=待扩展
const MATERIALS = [
  // ---- 金属 Metals ----
  {cat:"金属 Metals", nm:"镀铬 / 镜面金属", en:"Chrome", st:"done", fn:"chrome()", tech:["GGX","IBL反射"], note:"完美镜面导体，roughness≈0.04，几乎全靠环境反射成像。"},
  {cat:"金属 Metals", nm:"贵金属(光谱F0)", en:"Precious metal", st:"done", fn:"preciousMetal()", tech:["实测F0反照率","GGX"], note:"金/银/铜/铁/钛等真实 F0 反照率，让金看起来是金而非黄色塑料。"},
  {cat:"金属 Metals", nm:"拉丝/各向异性金属", en:"Brushed metal", st:"approx", fn:"brushedMetal()", tech:["各向异性GGX","切线方向高光"], note:"现用拉伸噪声近似；真正各向异性需切线空间 GGX-aniso 沿磨痕方向拉长高光。"},
  {cat:"金属 Metals", nm:"阳极氧化/油膜", en:"Anodized", st:"done", fn:"anodizedMetal()", tech:["薄膜干涉"], note:"金属基底 + 强 thin-film 虹彩，钛阳极、油污金属。"},
  {cat:"金属 Metals", nm:"锈蚀/做旧金属", en:"Rusty metal", st:"done", fn:"rustyMetalSurface()", tech:["程序化锈层","voronoi龟裂"], note:"金属↔锈的程序化遮罩混合，凹陷积锈。"},
  {cat:"金属 Metals", nm:"边缘磨损金属", en:"Edge-wear metal", st:"done", fn:"viewer:attachEdgeWear", tech:["真曲率顶点属性","凸边露金属","fwidth回退"], note:"viewer shader注入:优先用预计算真曲率(curvature属性),凸边降粗糙+提金属+mix tint提亮;无属性时回退fwidth代理。全局开关。"},
  {cat:"金属 Metals", nm:"划痕金属", en:"Scratched metal", st:"done", fn:"surface:scratchedMetal", tech:["各向异性","拉伸划痕roughness","清漆"], note:"拉伸高频噪声做方向性细划痕,各向异性+清漆打断高光。params color/density/rotation。"},

  // ---- 漆 / 塑料 ----
  {cat:"漆/塑料 Paint", nm:"车漆", en:"Car paint", st:"done", fn:"carPaint()", tech:["双层清漆","金属基底"], note:"clearcoat 1.0 + 金属底色，已含清漆层 Fresnel。"},
  {cat:"漆/塑料 Paint", nm:"金属闪粉漆", en:"Metallic flake", st:"done", fn:"flakePaint()", tech:["flake法线","清漆"], note:"高频 voronoi 闪粉扰动高度→清漆下随角度闪烁；车漆进阶。"},
  {cat:"漆/塑料 Paint", nm:"塑料", en:"Plastic", st:"done", fn:"plastic()", tech:["介电Fresnel","清漆"], note:"不透明介电，低粗糙，轻清漆。"},
  {cat:"漆/塑料 Paint", nm:"亮漆/搪瓷", en:"Gloss paint / enamel", st:"done", fn:"glossPaint()", tech:["清漆"], note:"家电珐琅漆，非金属 + 高光清漆。"},

  // ---- 透明/折射 ----
  {cat:"透明/折射 Glass", nm:"玻璃", en:"Glass", st:"done", fn:"glass()", tech:["transmission","IOR折射"], note:"transmission=1, IOR1.5, 体积厚度折射。"},
  {cat:"透明/折射 Glass", nm:"磨砂玻璃", en:"Frosted glass", st:"done", fn:"frostedGlass()", tech:["粗糙透射"], note:"高 roughness 透射 + 噪声法线，雾面散射。"},
  {cat:"透明/折射 Glass", nm:"液体/酒", en:"Liquid", st:"done", fn:"liquid()", tech:["Beer-Lambert吸收"], note:"部分透射 + 强吸收色，葡萄酒红保色。"},
  {cat:"透明/折射 Glass", nm:"水面", en:"Water", st:"approx", fn:"water()", tech:["折射","法线动画"], note:"涟漪法线为静态噪声；真实水面需法线时间动画 + 屏幕空间折射。"},
  {cat:"透明/折射 Glass", nm:"冰", en:"Ice", st:"done", fn:"ice()", tech:["透射","内部裂纹"], note:"冷色透射 + voronoi 内部裂纹 + 清漆。"},
  {cat:"透明/折射 Glass", nm:"宝石/钻石(色散)", en:"Gem", st:"done", fn:"gem()", tech:["高IOR","色散dispersion"], note:"IOR2.4 + 色散，棱镜分光彩边。"},
  {cat:"透明/折射 Glass", nm:"焦散", en:"Caustics", st:"todo", tech:["屏幕空间焦散","光子"], note:"玻璃/水聚焦的亮斑投射，AAA 用 SSR/光子或预烘焦散贴图。"},

  // ---- 次表面/有机 ----
  {cat:"次表面 SSS", nm:"皮肤", en:"Skin", st:"approx", fn:"skin()", tech:["薄透射近似","sheen"], note:"用薄 transmission+sheen 近似；真实需可分离 SSS/Burley 漫透射 + 厚度图。角色多，重点缺口。"},
  {cat:"次表面 SSS", nm:"大理石", en:"Marble", st:"approx", fn:"marble()", tech:["薄SSS近似","清漆","纹脉"], note:"湍流正弦纹脉 + 轻透射近似 SSS + 抛光清漆。"},
  {cat:"次表面 SSS", nm:"玉石/蜡/牛奶", en:"Jade / Wax", st:"done", fn:"jade()", tech:["厚体积透射","短吸收距离"], note:"transmission0.6 + 短 attenuationDistance，边缘透光内部辉光 + 抛光清漆。"},
  {cat:"次表面 SSS", nm:"叶片透光", en:"Leaf translucency", st:"done", fn:"surface:leaf", tech:["薄transmission","叶脉","双面"], note:"thin transmission+绿色attenuation做逆光背透,叶脉法线+清漆角质层。params color。"},

  // ---- 布料/纤维 ----
  {cat:"布料/纤维 Cloth", nm:"织物", en:"Fabric", st:"done", fn:"fabric()", tech:["sheen","低镜面"], note:"sheen 软边光，棉麻布。"},
  {cat:"布料/纤维 Cloth", nm:"天鹅绒", en:"Velvet", st:"done", fn:"velvet()", tech:["逆反射sheen"], note:"强 retro-reflective sheen，边缘发亮。"},
  {cat:"布料/纤维 Cloth", nm:"毛绒/皮草", en:"Fur", st:"approx", fn:"fur()", tech:["纤维贴图","sheen"], note:"纤维噪声贴图近似；真实毛发需 shell/fin 或 strand 几何。"},
  {cat:"布料/纤维 Cloth", nm:"碳纤维", en:"Carbon fiber", st:"done", fn:"carbonFiber()", tech:["各向异性编织","清漆"], note:"2x2 斜纹编织 + 高光清漆。"},
  {cat:"布料/纤维 Cloth", nm:"丝绸/缎面", en:"Silk / Satin", st:"done", fn:"silk()", tech:["各向异性高光","sheen"], note:"沿织向拉伸 roughness + GGX 各向异性 + sheen，缎面光泽随视角流动。"},
  {cat:"布料/纤维 Cloth", nm:"头发(Marschner)", en:"Hair strand", st:"todo", tech:["Kajiya-Kay/Marschner","各向异性"], note:"头发双高光(R/TRT)各向异性模型，角色头发必备。"},
  {cat:"布料/纤维 Cloth", nm:"针织/毛线", en:"Knit", st:"done", fn:"surface:knit", tech:["针脚法线晶格","sheen绒毛"], note:"双正弦晶格做针脚法线+sheen绒毛高光,毛衣围巾。params color/scale。"},

  // ---- 皮革/橡胶 ----
  {cat:"皮革/橡胶 Leather", nm:"皮革", en:"Leather", st:"done", fn:"leather()", tech:["毛孔法线","轻清漆"], note:"voronoi 毛孔 + 可调皮纹 + 轻 sheen/clearcoat。"},
  {cat:"皮革/橡胶 Leather", nm:"橡胶", en:"Rubber", st:"done", fn:"rubber()", tech:["哑光介电"], note:"高粗糙哑光，轮胎握把。"},

  // ---- 建筑/地表 ----
  {cat:"建筑/地表 Hardsurface", nm:"木纹", en:"Wood", st:"done", fn:"wood()", tech:["年轮波","纹理条"], note:"年轮波 + 纹理条暖色 ramp。"},
  {cat:"建筑/地表 Hardsurface", nm:"亮漆木", en:"Lacquered wood", st:"done", fn:"lacqueredWood()", tech:["木纹","高光清漆"], note:"木纹 + 镜面清漆，家具吉他。"},
  {cat:"建筑/地表 Hardsurface", nm:"砖墙", en:"Brick", st:"done", fn:"brickSurface()", tech:["程序化排布","砂浆缝"], note:"砖块遮罩 + 逐砖色变 + 砂浆。"},
  {cat:"建筑/地表 Hardsurface", nm:"岩石/地形", en:"Stone / Terrain", st:"done", fn:"stoneSurface()", tech:["脊状分形","ridged fbm"], note:"ridged multifractal 高度 → 岩色 ramp。"},
  {cat:"建筑/地表 Hardsurface", nm:"混凝土", en:"Concrete", st:"done", fn:"concrete()", tech:["斑驳噪声","AO凹坑"], note:"斑驳色 + 污渍 + AO 凹坑。"},
  {cat:"建筑/地表 Hardsurface", nm:"瓷砖地面", en:"Tile floor", st:"done", fn:"tileFloor()", tech:["倒角浮雕","泛洪填色"], note:"砖排布 + bevel 浮雕 + 逐砖随机色 + 灰缝(buffer链)。"},
  {cat:"建筑/地表 Hardsurface", nm:"陶瓷/瓷器", en:"Ceramic", st:"done", fn:"ceramicSurface()", tech:["釉面清漆"], note:"光滑釉面 + 轻清漆。"},
  {cat:"建筑/地表 Hardsurface", nm:"珍珠/螺钿", en:"Pearl / Nacre", st:"done", fn:"pearl()", tech:["虹彩","清漆"], note:"珍珠层虹彩 + 高光清漆。"},
  {cat:"建筑/地表 Hardsurface", nm:"积水/湿表面", en:"Wet surface", st:"done", fn:"wetGround()", tech:["积水mask","降粗糙+加暗"], note:"低洼处积水：roughness 骤降近镜面、albedo 变暗、填平凹凸。雨后地面。"},
  {cat:"建筑/地表 Hardsurface", nm:"积雪覆盖", en:"Snow cover", st:"done", fn:"snow()", tech:["透射散射","闪烁微面"], note:"高反照亮白 + 薄 transmission 前向散射 + voronoi 颗粒闪烁。"},
  {cat:"建筑/地表 Hardsurface", nm:"苔藓覆盖", en:"Moss", st:"done", fn:"mossyStone()", tech:["凹陷遮罩","sheen"], note:"岩石基底 + 低洼/斑块噪声长苔，苔藓带柔 sheen。"},
  {cat:"建筑/地表 Hardsurface", nm:"沙地", en:"Sand", st:"done", fn:"sand()", tech:["波纹法线","矿物闪烁"], note:"颗粒反照 + 风成正弦波纹法线 + voronoi 矿物 sparkle。"},

  // ---- 植被 ----
  {cat:"植被 Vegetation", nm:"树皮", en:"Bark", st:"done", fn:"surface:bark", tech:["fbm纵向沟槽","voronoi裂纹","POM"], note:"fbm纵向纤维沟槽+voronoi细胞裂纹,height喂POM增深。params color/scale。"},
  {cat:"植被 Vegetation", nm:"树叶/草叶卡", en:"Foliage card", st:"todo", tech:["双面","透光","alpha-test"], note:"alpha 裁切叶卡 + 双面 + 背透，海量植被基础。"},
  {cat:"植被 Vegetation", nm:"草叶", en:"Grass blade", st:"done", fn:"surface:grassBlade", tech:["根暗梢亮","薄transmission","风动复用attachWind"], note:"草叶材质:根部暗梢部亮+薄transmission背透;风动复用已有windWeight顶点动画。params color。"},

  // ---- 特效/NPR ----
  {cat:"特效/NPR FX", nm:"自发光", en:"Emissive", st:"done", fn:"emissive()", tech:["emissiveIntensity"], note:"灯/屏/霓虹基础发光。"},
  {cat:"特效/NPR FX", nm:"虹彩/薄膜", en:"Iridescent", st:"done", fn:"iridescent()", tech:["薄膜干涉"], note:"皂膜/甲虫壳，角度变色。"},
  {cat:"特效/NPR FX", nm:"霓虹辉光", en:"Neon glow", st:"done", fn:"surface:neon", tech:["强emissive","UnrealBloom"], note:"高强度emissive(默认4.5)驱动viewer已有UnrealBloomPass泛光。修了选中高亮清零emissive导致自发光变黑的bug。params color/intensity。"},
  {cat:"特效/NPR FX", nm:"能量护盾/全息", en:"Force field / Hologram", st:"todo", tech:["菲涅尔","扫描线","深度交叉发光"], note:"边缘菲涅尔 + 扫描线 + 与场景相交处高亮，科幻必备。"},
  {cat:"特效/NPR FX", nm:"卡通/二次元(NPR)", en:"Toon / Cel", st:"done", fn:"viewer:toon模式", tech:["cel阶梯gradientMap","反向挤出描边","可调段数/边宽/边色"], note:"viewer 显示模式:MeshToonMaterial+4段阶梯ramp做cel平涂+BackSide挤出壳描边,保留每部件baked贴图。段数/描边粗细/颜色工具栏可调。"},
  {cat:"特效/NPR FX", nm:"边缘光/菲涅尔", en:"Rim light", st:"done", fn:"viewer:attachRimLight", tech:["菲涅尔emissive环"], note:"viewer shader注入:菲涅尔(1-NdotV)^p加emissive轮廓光,全局开关(工具栏边缘光),分离主体背景。__meshova.setRimLight,FX=rim。"},
  {cat:"特效/NPR FX", nm:"体积雾/光束", en:"Volumetric fog", st:"todo", tech:["raymarch体积","光束"], note:"体积散射雾与丁达尔光束，氛围。"},

  // ---- Shader 技术栈 ----
  {cat:"Shader 技术栈", nm:"IBL 环境光照", en:"IBL", st:"done", fn:"viewer", tech:["PMREM","程序化天空"], note:"程序化渐变天空 → PMREM 环境贴图，金属反射正确的前提。"},
  {cat:"Shader 技术栈", nm:"法线贴图", en:"Normal map", st:"done", fn:"heightToNormal()", tech:["切线空间法线"], note:"由高度场生成法线，所有凹凸细节基础。"},
  {cat:"Shader 技术栈", nm:"环境光遮蔽 AO", en:"AO", st:"done", fn:"aoFromHeight()", tech:["AO贴图"], note:"高度→AO，缝隙变暗。可叠 SSAO。"},
  {cat:"Shader 技术栈", nm:"视差遮蔽 POM", en:"Parallax occlusion", st:"done", fn:"viewer:attachPOM", tech:["高度步进","自遮挡","UV偏移"], note:"viewer shader 注入:切线空间对 height 贴图光线步进(最多32层)+插值,砖缝/树皮/瓦缝获得真实自遮挡深度。bakeSurface 已把 height 烘到 userData.heightTex。"},
  {cat:"Shader 技术栈", nm:"曲率/凸度遮罩", en:"Curvature mask", st:"done", fn:"geometry:computeVertexCurvature+viewer", tech:["离散法线spread","按位置weld","顶点curvature属性"], note:"真曲率:几何库computeVertexCurvature算每顶点凸度(按空间位置weld解决硬边分裂顶点),viewer建网格写curvature顶点属性;attachEdgeWear优先用真曲率,无则回退fwidth代理。"},
  {cat:"Shader 技术栈", nm:"三平面映射", en:"Triplanar", st:"done", fn:"viewer:attachTriplanar", tech:["世界空间三轴投影","whiteout法线混合"], note:"viewer shader注入:世界空间XYZ三轴投影采样all贴图通道,Golus whiteout法线混合,skin已在用避免极点拉伸。可挂任意材质。"},
  {cat:"Shader 技术栈", nm:"细节贴图叠加", en:"Detail map", st:"todo", tech:["多频法线/反照率叠加"], note:"近看保留高频细节，远看用基础图，省内存。"},
  {cat:"Shader 技术栈", nm:"贴花 Decals", en:"Decals", st:"todo", tech:["投影贴花"], note:"局部叠加污渍/标识/弹孔，不改基础纹理。"},
  {cat:"Shader 技术栈", nm:"屏幕空间反射", en:"SSR", st:"todo", tech:["屏幕空间光线步进"], note:"地面/水面实时反射场景，光泽表面真实感。"},
  {cat:"Shader 技术栈", nm:"双层清漆", en:"Clearcoat", st:"done", fn:"physical.clearcoat", tech:["第二镜面层"], note:"车漆/木器/碳纤的透明涂层独立 Fresnel。"},
];

const stat = {
  done: MATERIALS.filter(m=>m.st==="done").length,
  approx: MATERIALS.filter(m=>m.st==="approx").length,
  todo: MATERIALS.filter(m=>m.st==="todo").length,
};
const CAT_ZH = {
  "characters-creatures":"角色/生物","architecture":"建筑","places-travel":"场景/地点",
  "cars-vehicles":"载具","people":"人物","art-abstract":"艺术/抽象",
  "science-technology":"科技","fashion-style":"时装","nature-plants":"自然/植物",
  "furniture-home":"家居","animals-pets":"动物","electronics-gadgets":"电子产品",
  "cultural-heritage-history":"文化遗产","weapons-military":"武器/军事",
};

writeFileSync("doc/_data/matlib.json", JSON.stringify({MATERIALS, models, CAT_ZH, stat}));
console.error("data ready | materials:", MATERIALS.length,
  "| done/approx/todo:", stat.done+"/"+stat.approx+"/"+stat.todo, "| models:", models.length);
