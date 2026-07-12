# HoudiniHowtos 学习清单

来源：https://github.com/jhorikawa/HoudiniHowtos

快照：2026-07-11，通过 GitHub API 读取目录树。仓库根 README 说明这是 Junichiro Horikawa 的 Houdini YouTube 教程文件库；许可证为 MIT。目录树约 736 项，主体是 Houdini `.hiplc/.hipnc/.hip` 场景文件，另有少量图片、OBJ/STL、Unity/VAT 工程、README 和 VEX 片段。

注意：Meshova 可学习算法和生成结构，但不应依赖 Houdini 节点图，也不应把 `.hip*` 作为运行时资产。正确路线是按目录主题重写 TypeScript 算子、场、采样器、网格处理和示例模型。

## 最值得学的技术

| 优先级 | 技术方向 | Meshova 收益 | 代表目录 |
| --- | --- | --- | --- |
| P0 | 曲线生成、重采样、扫掠成管/带 | 快速提升可见模型复杂度；适合 AI 参数调节 | `0001 Spiral Trail`, `0017 Coiled Wall`, `Live-0018 Wire Trail`, `Live-0059 Swirling Trail`, `Live-0124 Procedural Pipe Network` |
| P0 | 程序化建筑/硬表面模块化 | 直接做 gallery 标杆；最像实际建模工具 | `0002 Simple Chair`, `0024 Spiral Staircase`, `0045 Procedural Dungeon`, `Live-0064 Sci-Fi Panel`, `Live-0076 Hard Surfacing`, `Live-0085 Procedural Wall City`, `Live-0134 Procedural Dungeon with Basic BSP`, `Live-0157 Procedural Apartment Complex` |
| P0 | Tiling/编织/装饰图案 | 同时服务几何和 PBR；可做 trim/panel/ornament | `0025 Weaving Pot`, `0040 Kagome Weaving`, `Extra-0004 Islamic Pattern`, `Live-0030 Kumiko Pattern`, `Live-0062 Kite Tiling Rosette`, `Live-0083 Ring Weaving`, `Live-0116 Canadian Smocking`, `Live-0127 Weaving Vessel` |
| P0 | 图像/标量场转几何 | 对“图片输入逼近模型”重要；先做低风险桥梁 | `0011 Image Brick`, `Live-0014 Line Tracing`, `Live-0079 Video Stippling`, `Live-0095 Pixel Art Generator`, `Live-0106 ASCII Art`, `Live-0150 TSP Art` |
| P1 | 反应扩散/Gray-Scott/纹理模拟 | 程序化材质核心；可输出 color/roughness/normal/height | `0004 Reaction Diffusion`, `0022 Gray-Scott Pattern`, `0023 3D Gray-Scott`, `Live-0017 Belousov-Zhabotinsky Reaction`, `Live-0037 Weighted Reaction Diffusion` |
| P1 | 生长算法 | 做珊瑚、根系、藤蔓、城市网络、裂纹；视觉性强 | `0008 Coral Growth`, `0018 Diffusion-Limited Aggregation`, `0035 Swarm Intelligence`, `0052 Constrained Physarum Simulation`, `Live-0032 Shortest Path Growth`, `Live-0075 Recursive Branch Vein`, `Live-0078 Gradient Growth`, `Live-0092 Organic Branching`, `Live-0112 Procedural Plant Growth`, `Live-0123 Weighted Shortest Path Growth` |
| P1 | 标量场/向量场/物理场可视化 | Meshova 需要 Field2D/Field3D；后续材质、地形、流体共用 | `0032 Magnetic Field`, `Live-0021 Magnetic Field Visualization`, `Live-0058 Volume Advection`, `Live-0073 Procedural Ferrofluid`, `Live-0100 Attribute Isolines`, `Live-0105 Energy Field`, `Live-0111 Field-based Anisotropic Remeshing` |
| P1 | 分形/递归/数学曲面 | 少量代码产出高复杂形体；适合 showcase | `0010 Fractal Crystal`, `0020 Mandelbulb Formula`, `0027 IFS Fractals`, `0030 Romanesco Broccoli`, `0034 Strange Attractor`, `Live-0007 Menger Sponge`, `Live-0013 Klein Bottle`, `Live-0086 Fractal Flame 3D`, `Live-0097 Hyperbolic Surface` |
| P1 | 曲线网络/图算法 | 路网、管网、电路、蛛网、地铁、迷宫 | `0031 Spider Web`, `0037 Edge Bundling`, `0039 Maze Generation`, `Live-0081 Procedural Metro Network`, `Live-0084 Circuit Network`, `Live-0124 Procedural Pipe Network`, `Live-0136 Circular Route`, `Live-0153 L-System Road Network` |
| P1 | 网格处理/重网格/面片化 | 让 Meshova 从拼图元进化到可控拓扑工具 | `Live-0045 Mesh Unfolding`, `Live-0060 Quadrilateral Remesh`, `Live-0104 Developable Surface`, `Live-0117 Cage Deformation`, `Live-0120 Weighted Centroidal Voronoi Tessellation`, `Live-0131 Discrete Panelization`, `Live-0158 Monte Carlo Geometry Processing`, `Snippet-0008 Custom Remeshing`, `Snippet-0014 Principal Direction Curve` |
| P1 | SDF/体素/等值面 | 软体、洞穴、晶体、熔岩、材质化生成 | `Live-0026 Deformed Gyroid`, `Live-0040 Voxel Rain`, `Live-0054 Voxel Materializing`, `Live-0148 SDF-based Softbody` |
| P1 | 地形/自然表面 | 地形、沙丘、山体、裂纹，可接现有 terrain/rock | `0003 Needle Mountain`, `0026 Crack Surface`, `Live-0088 Dune Simulation`, `Live-0094 Sand Trail`, `Snippet-0005 Visualizing GeoTIFF with HeightField` |
| P2 | 布料/折纸/可展开曲面 | 有价值，但约束求解复杂；先做静态近似 | `0041 Curve Folding`, `Live-0010 Miura Folding`, `Live-0044 Popup Folding Papercraft`, `Live-0103 Freeform Curved Folding`, `Live-0104 Developable Surface`, `Live-0116 Canadian Smocking` |
| P2 | Vellum/软体/撕裂/皱纹 | 效果强，浏览器 CPU 实现成本高；后续 WebGPU | `Live-0053 Differential Growth with Vellum`, `Live-0069 Wiggle Pattern with Vellum`, `Live-0129 Mesh Tearing`, `Live-0137 Wrinkle Growth`, `Live-0148 SDF-based Softbody` |
| P2 | 流体/烟/气泡 | 更偏仿真；可先做 2D/贴图版 | `Live-0125 SOP Fluid Sim`, `Live-0130 Tobacco Smoke`, `Live-0146 2D Fluid Simulation with VEX and OpenCL`, `Live-0143 Bubble Stream`, `Live-0122 3D Bubble` |
| P2 | 动画/VAT/运行时导出 | 对 Web viewer 和游戏落地有用，但不是几何核优先项 | `Live-0118 Lava Loop Animation for Mobile with VAT and Unity`, `Snippet-0016 Export Animation to USDZ`, `Snippet-0006 Digital Asset Runtime Control on Unity Editor` |

## Meshova 应新增的核心能力

1. `Field2D/Field3D`：标量场、向量场、采样、梯度、散度、拉普拉斯、curl、噪声域扭曲、边界条件。
2. `marchingSquares/marchingCubes`：从场生成轮廓线、等值面、洞孔、泡泡、体素物化。
3. `curveGraph`：节点/边图、路径搜索、边束、地铁/管网/电路、最短路生长。
4. `sweep/ribbon/weave`：曲线扫掠、带状面、交错上下关系、绳/藤/线缆。
5. `pattern2d`：平铺、玫瑰窗、Kumiko、Islamic、Kagome、Moire、auxetic。
6. `growthSim`：DLA、Physarum、Reaction-Diffusion、Cellular Automata、gradient growth。
7. `remesh`：面片化、Voronoi/CVT、quad remesh lite、曲率方向、cage deform。
8. `panel/hardSurface`：边界 inset、bevel、greeble、panel seam、螺丝/槽线/格栅。
9. `proceduralMaterialFields`：同一场驱动几何 height/normal/roughness/baseColor。
10. `imageToProcHints`：图片采样只变成结构提示，不生成贴图拷贝。

## 最值得复刻的模型/效果

### P0：快赢，适合先做 gallery

| 目录 | 复刻目标 | Meshova 实现点 |
| --- | --- | --- |
| `0002 Simple Chair` | 参数化椅子 | box/cylinder/rounded bevel，尺寸比例约束 |
| `0024 Spiral Staircase` | 螺旋楼梯 | polar array、踏板实例、中心柱、扶手曲线 |
| `0045 Procedural Dungeon` | 程序化地牢 | 网格房间、走廊连接、墙体挤出 |
| `Live-0134 Procedural Dungeon with Basic BSP` | BSP 地牢 | 递归 split、room placement、door graph |
| `Live-0064 Sci-Fi Panel` | 科幻面板 | inset、bevel、凹槽、螺丝、trim sheet UV |
| `Live-0076 Hard Surfacing` | 硬表面块 | panelization、greeble、edge loop 风格 |
| `Live-0085 Procedural Wall City` | 墙面城市 | 立面网格、窗/阳台/管线实例 |
| `Live-0157 Procedural Apartment Complex` | 公寓综合体 | 模块化楼层、窗格、阳台、屋顶设备 |
| `Extra-0003 Block Tower` | 积木塔 | seeded stacking、稳定性近似、随机尺寸 |
| `Live-0026 Deformed Gyroid` | 变形 Gyroid | implicit field、marching cubes 或网格位移 |
| `Live-0012 Voronoi Vase` | Voronoi 花瓶 | lathe 基体、Voronoi mask、孔洞/浮雕 |
| `Live-0135 Twisty Vase` | 扭转花瓶 | profile lathe、twist deformation、noise bump |
| `0025 Weaving Pot` | 编织罐 | 纬线/经线曲线、上下交错、管状扫掠 |
| `Live-0127 Weaving Vessel` | 编织容器 | param surface 上的带状编织 |
| `Live-0083 Ring Weaving` | 圆环编织 | torus 参数域曲线、交错排序 |
| `Live-0030 Kumiko Pattern` | 木格图案 | 2D pattern grammar、槽线厚度、木材材质 |
| `Extra-0004 Islamic Pattern` | 伊斯兰几何纹 | 星形/多边形平铺、线宽、挤出 |
| `0040 Kagome Weaving` | Kagome 编织 | 三角/六角网格、交错带 |
| `Live-0062 Kite Tiling Rosette` | 风筝平铺玫瑰窗 | 极坐标 tiling、旋转对称 |
| `0039 Maze Generation` | 迷宫 | DFS/Prim/Kruskal，墙体/地面生成 |
| `Live-0035 Infinite Maze` | 无限迷宫 | chunk seed、局部生成、边界连续 |
| `0007 Wavy Torus` | 波形环面 | torus 参数面位移 |
| `0050 Lissajous Bones` | Lissajous 雕塑 | 参数曲线、tube sweep、骨状半径变化 |
| `Live-0048 Recursive Box` | 递归盒 | IFS-style box subdivision |
| `Live-0007 Menger Sponge` | Menger 海绵 | recursive voxel/box subtraction |
| `Live-0147 Procedural Disco Ball` | 迪斯科球 | 球面面片、镜面材质、随机亮度 |
| `Live-0090 Fibonacci Flower` | Fibonacci 花 | phyllotaxis 点阵、花瓣实例 |
| `Live-0009 Procedural Flower` | 程序花 | petal curve surface、seeded variation |
| `Live-0091 Procedural Sea Urchin` | 海胆 | 球面采样、刺状实例、长度噪声 |
| `0021 Ammonite Shell` | 菊石壳 | 对数螺旋、截面扫掠、壳纹 |
| `0030 Romanesco Broccoli` | 罗马花椰菜 | 递归锥/螺旋 phyllotaxis |
| `0003 Needle Mountain` | 针状山 | height field、noise、尖峰控制 |
| `0026 Crack Surface` | 裂纹表面 | Voronoi/张力场裂缝、height/normal |
| `Live-0088 Dune Simulation` | 沙丘 | height field advection 近似、风向参数 |
| `Live-0094 Sand Trail` | 沙痕 | 粒子轨迹转 height field |

### P1：核心能力驱动，复刻后项目档次明显上升

| 目录 | 复刻目标 | Meshova 实现点 |
| --- | --- | --- |
| `0004 Reaction Diffusion` | 反应扩散纹理 | Gray-Scott/FitzHugh 2D buffer，PBR mask |
| `0022 Gray-Scott Pattern` | Gray-Scott 图案 | 可控 feed/kill，tileable 输出 |
| `0023 3D Gray-Scott` | 3D 反应扩散 | 体素场、等值面 |
| `Live-0037 Weighted Reaction Diffusion` | 加权反应扩散 | mask/场驱动参数 |
| `Live-0017 Belousov-Zhabotinsky Reaction` | BZ 反应 | 细胞自动机/连续场近似 |
| `0008 Coral Growth` | 珊瑚生长 | DLA/space colonization、tube/mesh 融合 |
| `0018 Diffusion-Limited Aggregation` | DLA 晶枝 | random walk、grid acceleration |
| `0052 Constrained Physarum Simulation` | 黏菌网络 | 粒子沉积场、转向采样、约束 mask |
| `Live-0032 Shortest Path Growth` | 最短路生长 | graph path、growth animation/static mesh |
| `Live-0123 Weighted Shortest Path Growth` | 加权最短路生长 | cost field、Dijkstra/A* |
| `Live-0078 Gradient Growth` | 梯度生长 | scalar field 梯度追踪 |
| `Live-0075 Recursive Branch Vein` | 递归枝脉 | L-system/space colonization |
| `Live-0092 Organic Branching` | 有机分枝 | curve graph、半径衰减、avoidance |
| `Live-0112 Procedural Plant Growth` | 植物生长 | 节间、叶序、分枝规则 |
| `Live-0149 Procedural Jade Vine` | 翡翠葛 | 藤蔓曲线、花序实例 |
| `Live-0138 Venus Flytrap` | 捕蝇草 | 叶片曲面、齿缘、铰链变形 |
| `Live-0061 Mushroom Gills` | 蘑菇褶皱 | underside radial folds、薄片实例 |
| `Live-0082 Muscle Fiber` | 肌纤维 | bundle curves、anisotropic material |
| `Live-0099 Fiber Structure` | 纤维结构 | 多尺度曲线束 |
| `0031 Spider Web` | 蜘蛛网 | radial/circular graph、扰动、粘丝 |
| `0037 Edge Bundling` | 边束 | graph edge bundling、KDE/力导向 |
| `Live-0039 Edge Bundling with KDE` | KDE 边束 | density field + curve relaxation |
| `Live-0081 Procedural Metro Network` | 地铁网络 | graph layout、站点、线路偏移 |
| `Live-0084 Circuit Network` | 电路网络 | orthogonal routing、pads/traces |
| `Live-0124 Procedural Pipe Network` | 管网 | graph routing、elbow/junction fitting |
| `Live-0153 L-System Road Network` | L-System 路网 | grammar + avoidance + road mesh |
| `Live-0152 Procedural Aerial Overpass` | 高架桥 | spline road、support pillars、ramps |
| `Live-0120 Weighted Centroidal Voronoi Tessellation` | 加权 CVT | Lloyd relaxation、weighted sites |
| `Live-0131 Discrete Panelization` | 离散面板化 | surface sampling、panel fitting |
| `Live-0060 Quadrilateral Remesh` | 四边重网格 | direction field、grid tracing |
| `Live-0100 Attribute Isolines` | 属性等值线 | scalar field contour on mesh |
| `Snippet-0014 Principal Direction Curve` | 主曲率方向线 | curvature estimation、streamlines |
| `Live-0117 Cage Deformation` | 笼变形 | cage weights、smooth interpolation |
| `Live-0113 Optimal Transport (3D Mesh Morphing)` | 3D 网格形变 | spherical parameterization + transport |
| `Live-0104 Developable Surface` | 可展开曲面 | ruled surface、flattening constraint |
| `Live-0045 Mesh Unfolding` | 网格展开 | cut graph、UV flatten、papercraft |
| `Live-0115 Procedural Jigsaw Puzzle` | 拼图 | 2D curve cuts、tabs/slots |
| `Live-0156 Spiral Carving` | 螺旋雕刻 | curve-on-surface、boolean/inset |
| `Live-0109 Auxetic-Like Pattern` | 负泊松图案 | repeated cells、hinge gaps |
| `Live-0116 Canadian Smocking` | 加拿大褶饰 | fabric grid constraints、fold pattern |

### P2：研究型，展示强但实现重

| 目录 | 复刻目标 | Meshova 实现点 |
| --- | --- | --- |
| `Live-0053 Differential Growth with Vellum` | 差分生长 | spring mesh、edge split、collision |
| `Live-0069 Wiggle Pattern with Vellum` | 弹性摆动图案 | constraint solver 近似 |
| `Live-0148 SDF-based Softbody` | SDF 软体 | SDF collision + mass-spring |
| `Live-0129 Mesh Tearing` | 网格撕裂 | stress threshold、edge split |
| `Live-0137 Wrinkle Growth` | 皱纹生长 | stress field、curve ridge displacement |
| `Live-0125 SOP Fluid Sim` | 流体 | grid solver；先做 2D |
| `Live-0146 2D Fluid Simulation with VEX and OpenCL` | 2D 流体 | stable fluids/WebGPU future |
| `Live-0130 Tobacco Smoke` | 烟 | density/velocity volume |
| `Live-0118 Lava Loop Animation for Mobile with VAT and Unity` | 熔岩 VAT | vertex animation texture、viewer playback |
| `Live-0119 Homing Missiles and Lasers (Itano Circus)` | 板野马戏导弹 | curve trails、target steering |
| `Live-0022 Tensegrity Structure Simulation` | 张拉整体 | strut/cable constraints |
| `Live-0158 Monte Carlo Geometry Processing` | 蒙特卡洛几何处理 | stochastic sampling、denoise |
| `Live-0140 OpenCL on Copernicus Feedback Loop Basics` | GPU feedback loop | WebGPU compute 对应 |
| `Live-0141 Copernicus with SOP Solver` | 图像-SOP 反馈 | texture field drives mesh |
| `Live-0144 Ordered Dithering with Copernicus` | 有序抖动 | image quantization/material mask |
| `Live-0155 Pixel Sorting with Copernicus` | 像素排序 | texture effect，低优先 |
| `Live-0160 Pixel Art with Copernicus` | 像素化 | palette quantization |
| `Live-0098 Calabi-Yau Manifolds` | Calabi-Yau 形体 | 参数数学展示 |
| `Live-0086 Fractal Flame 3D` | 3D fractal flame | stochastic IFS volume |
| `Live-0097 Hyperbolic Surface` | 双曲曲面 | differential geometry |

## 可暂缓或不适合当前阶段

| 目录 | 原因 |
| --- | --- |
| `Algorithm-0001 Bubble Sort`, `Algorithm-0002 Insertion Sort` | 算法可视化，不增强 Meshova 建模能力 |
| `0029 Spectrum Visualizer` | 音频可视化，偏媒体 demo |
| `0051 Autostereogram` | 视觉玩具，和程序化建模关系弱 |
| `Live-0034 Robot with KineFX`, `Live-0066 Strandbeest with KineFX` | KineFX/骨骼动画重，不是几何核近期重点 |
| `Live-0046 3D Glitch`, `Live-0107 SciFi Dissolve`, `Live-0132 3D Smudge` | 更偏视觉后处理/图像处理 |
| `Live-0128 Marquee Scrolling`, `Live-0106 ASCII Art` | 适合趣味示例，不是核心库能力 |
| `Snippet-0010 SQLite Access` | Houdini pipeline 技巧，对 Meshova 核心无关 |

## 推荐落地顺序

1. P0 gallery：`Spiral Staircase`、`Sci-Fi Panel`、`Procedural Dungeon BSP`、`Voronoi Vase`、`Weaving Pot`、`Menger Sponge`、`Fibonacci Flower`、`Sea Urchin`。
2. 基础库补强：`Field2D`、`curveGraph`、`sweep/ribbon/weave`、`pattern2d`。
3. PBR/材质联动：`Reaction Diffusion`、`Marble Pattern`、`Crack Surface`、`Dune/Sand Trail`。
4. 图像输入桥：`Line Tracing`、`Image Brick`、`Video Stippling`、`TSP Art`。
5. 高级几何：`CVT`、`Panelization`、`Quad Remesh`、`Cage Deformation`、`Mesh Unfolding`。
6. 研究 showcase：`Physarum`、`DLA`、`Plant Growth`、`Optimal Transport Mesh Morphing`、`VAT Lava`。

## 对 Meshova 产品方向的判断

HoudiniHowtos 最大价值不是某个模型，而是“场 + 曲线 + 图 + 采样 + 迭代反馈”的组合范式。Meshova 当前已有几何、材质、viewer、AI 截图闭环，下一阶段最该补的是可组合的中层算子：

- 场负责“哪里长、哪里裂、哪里变形”。
- 曲线/图负责“路径、网络、管线、藤蔓、道路”。
- 平铺/编织负责“表面细节和可读结构”。
- Remesh/panel 负责“从粗生成到可展示资产”。
- PBR 场共用负责“几何和材质同源”。

先复刻可控静态模型，再做模拟。这样最符合 Meshova：脚本化、可参数化、可被 AI 调参、可截图评估。
