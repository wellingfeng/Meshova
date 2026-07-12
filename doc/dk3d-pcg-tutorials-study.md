# DK 3D《PCG Tutorials》学习与 Meshova 复刻清单

来源：YouTube 播放列表 `PLYrS3D9rJwiR0nb6ijnqzz9-nt21WDTfK`，DK 3D，共 31 集，总时长 `23:51:32`。

本地资料：

- 视频、字幕、描述、封面、元数据：`out/youtube/pcg-tutorials/`
- 播放列表元数据：`out/youtube-playlist.json`
- 去重全文索引：`out/youtube/pcg-tutorials/transcript-index.json`
- 章节技术词摘要：`out/youtube/pcg-tutorials/transcript-digest.md`
- 每集清洗字幕：各视频目录内的 `cleaned-transcript.txt`

## 结论

最值得学的不是 UE 节点操作，而是五个稳定范式：

1. **数据先于几何**：点、样条、面、实例都携带属性；筛选、分组、混合后才生成网格。
2. **向量化先于循环**：能对整批点计算，就不拆成逐点/逐组子图。课程实测可从 `0.5s / 16MB` 降到 `0.001s / 2MB`。
3. **边界与邻居驱动装配**：模块长度、朝向、缩放来自下一点、网格 Bounds、Socket、曲线总长，而非手填常量。
4. **生成器输出中间数据**：建筑不仅输出墙，也输出角点、楼层索引、横向索引、类型标签，供屋顶、人行道、窗、道具继续消费。
5. **编辑期生成与最终资产分离**：预览保持参数化；确认后再 Bake 网格、碰撞、材质槽和 LOD。

Meshova 已有 `PointCloud`、属性、曲线采样、`copyToPoints`、规则树、道路、建筑、CSG、地形场。不是从零复刻。最大缺口：

- 通用向量/字符串/布尔点属性；当前属性只有 `number[]`。
- 最近目标吸引/排斥与距离权重。
- 真正的 Spline Mesh 变形；当前主要是刚体模块沿曲线摆放。
- Mesh Socket、面组、材质 ID 在核心网格中的稳定表示。
- 每实例自定义 Shader 数据。
- 生成阶段剖析、缓存、质量档和 Bake 契约。

## 31 集逐集拆解

| 集 | 主题 | 值得学习 | Meshova 复刻判断 |
| --- | --- | --- | --- |
| 01 | 智能样条围栏 | 邻点定向；按邻点距离拉伸模块；从 Mesh Bounds 自动推导间距；暴露 Mesh、偏移、旋转、随机旋转 | **P0**。现有 `segmentCurve/layoutPiecesOnCurve` 已覆盖基础。补 `fitToCurve`、首尾策略、模块 Bounds 自动长度、局部轴、分段随机流。直接升级 `titan-fence`、护栏、栏杆、管线。 |
| 02 | 样条路径与 Level 模块 | 路段作为可复用 Prefab；Tag 过滤不同元素；路径局部坐标对齐；整套模块沿样条装配 | **P1**。用 `Assembly` 扩展命名层、Tag、局部锚点。适合石板路、铁路沿线模块、道路施工区、遗迹路径。 |
| 03 | 程序化室内 | Bounds 相对摆放；桌→椅→显示器→键盘→线缆→小物件逐层依赖；随机只作用于合法位置；层级表面继续散布 | **P0 标杆项目**。现有 `procedural-building` 有房间家具，但缺“表面锚点链”。应新增 `SurfaceAnchor/Socket`、占用区、避免碰撞、语义家具 Catalog。 |
| 04 | 程序化建筑一 | 蓝图参数成为子图输入；墙点、角点分流；模块数由尺寸/模块宽度计算；用参数代替魔数 | **已有较多**。对照 `procedural-building` 补统一 `BuildingPointData`：`floorIndex`、`sideIndex`、`horizontalIndex`、`kind`、`isCorner`、`isExterior`。 |
| 05 | 程序化建筑二 | 子图输出点继续消费；按类型过滤网格；楼层点复制；首层、中层、顶层采用不同模块；横向索引驱动立面节奏 | **P0 数据层升级**。建筑生成器不只返回 `NamedPart[]`，还应返回可查询点云/语义结构。立面模块选择改为规则，不硬编码分支。 |
| 06 | 屋顶、窗、Decal | 屋顶基座、平顶、斜面分层；世界对齐材质避免 UV 依赖；随机重复；窗与墙面 Decal 继续消费建筑属性 | **P1**。已有 `roof-generator`。补屋顶附件 Socket、世界坐标材质字段、投射式几何/材质 Stamp、立面污渍与破损规则。 |
| 07 | 8 个高级技巧 | 无额外节点制造间隔；重算 Seed 避免多组重复；只修改选定点属性；Branch/Switch；运行时质量档；简化碰撞；蓝图读取点 | **P0 工具箱**。新增 `reseedPoints`、`selectAndStore`、`switchRule`、`qualityGate`、`collisionProxy`、只读点数据导出。 |
| 08 | 动态生成样条与人行道 | 角点成对生成独立样条；角点/长边/短边分流；沿边生成点；成组道具网格；Decal Actor；子图复用；尾段长度自适应 | **P0 标杆项目**。现有街区生成已很强；应抽出通用 `curveGraphFromCorners`、`edgeClassify`、`clusterStamp`、`fitLastSegment`。可做“人行道装饰套件”。 |
| 09 | 建筑模块化修复 | 生成器复用后暴露的楼层、屋顶、斜面、模型替换问题；说明参数化工具必须有极端尺寸回归测试 | **P0 测试思想**。为建筑增加最小宽度、奇偶模块数、1 层/高层、L 形、模块不可整除、极扁屋顶等参数矩阵。 |
| 10 | PCG + Geometry Script 墙生成器 | Static Mesh→Dynamic Mesh；窗口/门洞布尔；切割体作为可复用生成器；材质 ID 重映射；确认后保存静态资产 | **P0 核心升级**。Meshova 已有 CSG，但 `Mesh` 无面组/材质 ID。先加 `faceGroups/materialIds`，再做 `wallWithOpenings` 和显式 `bakeAsset`。不要复制 UE 的保存对话框。 |
| 11 | For Each 数组循环 | 任意长度数组作为输入；每项执行同一子规则；子图封装循环体 | **P1**。脚本语言天然有 `map/flatMap`。只需给沙箱安全、预算可计量的 `mapItems`/`mapPointGroups`，无需仿节点。 |
| 12 | Spline Mesh | 刚体 Static Mesh 与沿曲线变形的 Spline Mesh 区分；按 Bounds 自动算段长；Forward Axis、Up Vector 参数化 | **P0**。新增 `deformMeshAlongCurve`，支持轴选择、弧长参数化、稳定 Frame、扭转、端点切线。当前 `layoutPiecesOnCurve` 不能替代它。 |
| 13 | 程序化道路 | Data Object 描述道路资产；静态道具沿线；曲线物体用 Spline Mesh；道路生成器消费同一份参数数据 | **已有强基础**。`road.ts/road-network.ts` 已覆盖大量几何。补 `RoadStyleCatalog`、路段 Socket、按道路类型选择护栏/路灯/标线、曲线变形网格。 |
| 14 | PCG 值传给 Actor | 点属性绑定到生成对象的公开参数；同一 Actor 根据实例数据改变行为 | **P1**。对应 `InstanceRecord.userData` 与 Viewer 绑定。应支持数值、向量、颜色、枚举，不把对象逻辑塞回核心几何。 |
| 15 | 随机 Spline Mesh 后处理 | 生成后按段替换 Mesh；首段、末段特殊件；随机选择保持路径连续 | **P1**。新增 `postProcessSegments`：按 `first/last/interior/corner/slope/tag` 选择模块。围栏端柱、管线接头、道路收边直接受益。 |
| 16 | 5 级随机旋转 | ①任意轴随机；②贴坡但保持世界向上；③量化为 N 个离散角；④多轴离散随机且不同 Seed；⑤按比例只影响部分点 | **P0 小而高频**。新增 `rotationPolicy`：`free/upright/quantized/multiAxis/masked`，独立 Seed 流，避免所有模型手写。 |
| 17 | 限时环境挑战 | 同一资产与规则在 5/10/30 分钟内迭代；展示“工具复用速度”比单次最终质量更重要 | **不复刻场景，复刻评测**。建立 Meshova `5min/10min/30min` 生成挑战和截图评分，测 API 可发现性、复用性、默认值质量。 |
| 18 | 任意物体表面生成 | Mesh 表面采样；按材质 ID 过滤；目标距离写 Density；阈值控制覆盖；上下方向翻转；概率稀疏；适合 Ivy | **P0**。现有 `surfacePointCloud`、`ruleDensityPrune` 已有一半。缺面组/材质 ID、距目标场、法线方向策略。可升级 `ivy-ruins` 为任意网格表面装饰器。 |
| 19 | PCG Grammar | 模块附带属性；Grammar 字符串分段；重复、顺序、随机选择；程序生成 Grammar；Seed 控制稳定变体 | **P0 高杠杆**。Meshova 有 `rule-tree` 与 WFC，但缺一维 Grammar。实现轻量 `grammar.ts`：序列、重复、加权选项、命名模块、参数捕获。书架、立面、围栏、管线、货架都能复用。 |
| 20 | ChatGPT + DataTables | AI 不直接写庞大逻辑，而是生成结构化数据表；图/脚本消费强类型行；人工与 AI 生成结果可对比 | **P1 产品能力**。实现 JSON/TS `CatalogSchema`、校验、默认值、版本迁移。让 AI 生成模块表、植被表、道路样式表，核心生成器保持稳定。 |
| 21 | PCG/蓝图修改 Landscape | Landscape Patch 叠加地形，不破坏原始高度；高级 Patch；PCG 集成；调试常见边界问题 | **P0 地形链**。增加 `HeightfieldPatch`：加/减/替换、Mask、Falloff、优先级、可撤销合成。道路压地、建筑找平、水沟、陨石坑都需要。 |
| 22 | 从原型到最终性能 | 逐行/逐点 Partition + Loop 破坏批处理和多线程；整批属性数学可快约 500 倍、内存降 8 倍；必须看时间和内存 | **P0 架构约束**。为算子加 `profileGeneration`，记录阶段耗时、点数、三角数、临时内存估算、缓存命中。文档明确“批量 Field 优先，逐项循环仅用于拓扑变化”。 |
| 23 | Spline Sampler 技巧 | 曲线内/曲线上采样；闭合曲线与 Bounds；禁止无界大地图采样；投射到 3D 曲面；间距、首尾偏移、归一化随机偏移、Fit To Curve；导出距离属性后用取模分组 | **P0**。扩展 `scatterAlongCurve`：`startOffset/endOffset/randomOffsetNormalized/fitToCurve/distanceAttr/normalizedDistanceAttr`；新增闭合曲线内部点采样与显式 Bounds。 |
| 24 | 自定义积雪网格 | 表面点→球/体积块→Dynamic Mesh 融合成雪层；碰撞影响结果；UV 缩放；材质参数 | **P1 标杆效果**。用 SDF smooth union + marching cubes/现有体场做 `snowCover(mesh)`；沿上向法线采样，坡度/遮挡/高度控制厚度，输出 UV/材质字段。 |
| 25 | 快速关卡设计 | 少数 PCG 工具组合快速搭关；重点是工具集默认值和互操作，而非单个复杂图 | **P1 产品包装**。做 `LevelDressingKit`：围栏、道路、散布、地形贴合、人行道、植被、灯光代理，共享 Seed/质量档。 |
| 26 | 每实例随机数据 | PCG 为每实例写随机值；材质读取 Per-Instance Custom Data；同一 Mesh/材质产生颜色和表面变化 | **P0 渲染桥**。给 `InstanceRecord` 增 `customData: number[]`，Viewer 用 InstancedMesh attribute/材质字段读取；避免为颜色变化复制 Mesh 或材质。 |
| 27 | Attract 节点 | 每源点找半径内最近目标；权重决定移动比例；可映射位置/旋转/缩放等属性；支持固定权重或距离属性权重；负向即排斥 | **P0 通用算子**。实现 `ruleAttract(targets, {radius, weight, mode, attributes})` 与空间索引。森林开路、石块避让、树木朝路倒伏、城市密度中心、植被过渡都依赖它。 |
| 28 | Lerp 节点 | 用 Alpha 对整批点混合 Min/Max 属性；Density 可直接作 Alpha；代替按 Mesh 分组后逐组 Loop；布尔 Alpha 可当 Branch；可统一/非统一缩放 | **P0**。实现通用 `lerpPointAttribute` 与 `selectPointAttribute`，并把 `density` 正式定义为标准 0..1 控制场。 |
| 29 | 可视化生成 HLSL | Kweave 以图生成 Point Generator/Processor HLSL；桥接 UE 自动同步；Biome 颜色驱动 Mesh 选择 | **P2，学编译思路，不复刻 UI**。Meshova 是脚本优先，应做 `Field AST → WGSL`、CPU/WGPU 同源执行、生成代码检查器。不要再造节点编辑器。 |
| 30 | UE 5.7 自定义 PCG 节点一 | 新 Blueprint Element ABI；点范围循环；Density→Scale；参数、输入输出 Pin；Mesh Socket 示例 | **P1**。对应稳定的 `PointKernel<I,O>` 接口、批量上下文、Schema、预算、错误诊断。函数本身仍用 TS。 |
| 31 | UE 5.7 自定义 PCG 节点二 | Base Element 手动控制数据循环；每输入 Mesh、每点、每 Socket 嵌套；复制点到命名 Socket；保留 Seed/属性 | **P0 Socket 系统**。为 Mesh/Assembly 定义命名 Socket 与局部 Transform；支持 `copyToSockets`、Socket 过滤、递归装饰、Seed 派生。 |

## 最值得新增的核心能力

### P0：先做，覆盖 20 集以上

1. **标准点属性 2.0**
   - 支持 `number/Vec2/Vec3/color/string/bool`。
   - 标准字段：`position`、`normal`、`tangent`、`rotation`、`scale`、`bounds`、`density`、`seed`、`variant`、`group`、`materialId`、`distance`、`normalizedDistance`。
   - 提供 `store/filter/select/switch/partition/lerp/reseed` 批量算子。

2. **Curve Sampler 2.0**
   - `fitToCurve`、首尾偏移、归一化随机偏移、闭合曲线内部采样、显式 Bounds、距离属性。
   - 刚体布局和曲线变形分离：`layoutPiecesOnCurve` 与 `deformMeshAlongCurve`。
   - 统一稳定 Frame、Forward Axis、Up Vector、端点切线、闭合扭转校正。

3. **Attract/Repel Field**
   - 最近目标、K 近邻、半径、固定/属性/曲线权重。
   - 修改位置、朝向、缩放、Density 或自定义属性。
   - 使用格网或 KD-tree；不要 O(N×M) 暴力。

4. **Mesh Socket 与 Surface Anchor**
   - Socket：名字、局部位置、旋转、缩放、Tag。
   - `copyToSockets`、`copyHierarchy`、递归深度预算、稳定 Seed 派生。
   - Surface Anchor：三角形索引、重心坐标、法线、面组，网格变形后仍能重算位置。

5. **面组与材质 ID**
   - `Mesh` 增每三角形 `faceGroups/materialIds`，所有 transform/merge/boolean/export 必须保留或定义重映射规则。
   - 支撑材质感知散布、门窗布尔后的材质槽、选择性 Decal、雪/苔藓区域。

6. **Linear Grammar**
   - 最小语法：序列、`repeat`、加权选项、可选项、命名模块、首尾模块。
   - Grammar 输出 Point/Segment 数据，不直接绑 Mesh。
   - 与 WFC 分工：Grammar 管一维序列，WFC 管二维邻接约束。

7. **每实例 Custom Data**
   - Instance 保留而非立即 merge。
   - 自定义 Float/Color/Variant/LOD 数据进入 Viewer Shader。
   - 导出 glTF 时按能力 Bake 或写 Extras。

8. **性能剖析与质量档**
   - 每阶段：耗时、输入/输出点数、实例数、三角数、内存估算、缓存命中。
   - `draft/preview/final` 控制采样密度、细分、碰撞、材质烘焙、LOD。
   - 对逐点循环、重复 realize、大规模 merge 给诊断警告。

### P1：形成完整关卡装配链

9. **动态曲线图**：点对成边、角点分类、闭环、分段 Tag、边合并；服务人行道、管线、道路、围栏。
10. **Heightfield Patch Stack**：道路压地、地基找平、沟槽、坑、雪堆；可撤销、可排序、可 Mask。
11. **Catalog/DataTable**：强类型资产行、权重、Bounds、Socket、Tag、材质类、适用坡度和质量档。
12. **Bake 契约**：参数化源→实例/网格→材质槽→碰撞代理→LOD→导出；显式执行，不在每次参数变化时自动写资产。
13. **Point Kernel ABI**：纯 TS 批处理函数、Schema、可观察输入输出、预算、缓存；作为“自定义节点”的脚本优先替代。

### P2：WebGPU 与代码生成

14. **Field AST → WGSL**：同一 Field 在 CPU 测试、WebGPU 批处理、材质烘焙中复用。
15. **GPU Point Processor**：批量修改点属性；限制在无拓扑变化的纯映射/筛选。
16. **可视化仅作调试**：显示数据流、点数、属性和耗时；不把 Meshova 改成节点编辑器。

## 最值得复刻的项目

| 优先级 | 项目 | 组合能力 | 验收重点 |
| --- | --- | --- | --- |
| P0 | Smart Fence 2.0 | Curve Sampler、邻点定向、Bounds 自动长度、首尾件、量化旋转 | 任意折线无明显缝；换 Mesh 不手调间距 |
| P0 | Spline Deform Showcase | 弧长参数化、稳定 Frame、Forward/Up Axis | 长条网格沿 S 弯连续变形，无翻转 |
| P0 | Sidewalk Dressing Kit | 角点曲线图、边分类、Cluster、Catalog、Decal/Stamp | 建筑尺寸变化后人行道与道具自动跟随 |
| P0 | Office Interior Generator | 房间 Bounds、Surface Anchor、Socket、占用区、家具表 | 桌椅屏幕键盘线缆层级正确，不穿插 |
| P0 | Modular Building V2 | 语义点输出、Grammar、面组、窗门洞、屋顶 Socket | 首层/中层/顶层可独立规则；极端参数稳定 |
| P0 | Surface Ivy 2.0 | 表面采样、面组/材质 ID、距离 Density、法线方向 | 只长墙不长门窗；覆盖率、上下生长可控 |
| P0 | Forest Path Attractor | 路径目标、吸引/排斥、距离权重、朝向修改 | 路边草低、树避让、倒木朝路但不挡路 |
| P0 | Instance Color Forest | 每实例 Custom Data、Shader 读取、Seed | 单 Mesh/单材质产生稳定色差，无 Mesh 复制 |
| P0 | Grammar Bookshelf | 一维 Grammar、首尾模块、随机种子、Socket | 书组、空隙、装饰稳定随机；长度变化自动重排 |
| P0 | Wall Cutout Kit | CSG、面组、材质 ID、Bake | 任意门窗数组；洞边、材质槽、法线正确 |
| P0 | Terrain Patch Road | Road、Heightfield Patch、Falloff | 路面压地、边坡平滑、原地形可恢复 |
| P1 | Procedural Road Ecosystem | RoadStyleCatalog、Spline Deform、Socket、道具规则 | 道路类型切换连带护栏、灯、标线、路肩 |
| P1 | Snow Cover Generator | 表面采样、SDF 融合、坡度/遮挡、UV | 雪积上表面与凹处，不包裹底面；厚度连续 |
| P1 | Rooftop Grammar Kit | Grammar、WFC、Socket、Catalog | 女儿墙、设备、风管、天窗满足邻接与安全距离 |
| P1 | Pipe/Cable Network | Curve Graph、Spline Deform、接头 Socket、首尾件 | 三通、弯头、端帽自动选择；曲线连续 |
| P1 | Material-Aware Moss | 面组、曲率/朝上/湿度场、Density | 金属/玻璃排除；缝隙、背阴处更多 |
| P1 | Level Dressing Kit | 共享 Seed、质量档、Catalog、规则组合 | 5 分钟生成可用场景；10/30 分钟可继续细化 |
| P1 | Data-Driven Biome | AI 生成 Catalog、Biome Field、实例 Custom Data | 改表不改生成器；Schema 错误可诊断 |
| P1 | Socket Decorator | Mesh Socket、递归装饰、预算 | 建筑挂灯、招牌、管线、空调；无无限递归 |
| P1 | Curve Sampler Lab | 曲线上/曲线内、Bounds、Fit、取模分组、随机偏移 | 所有采样模式可视化并可做确定性测试 |
| P2 | GPU Point Field Lab | Field AST、WGSL、CPU 对照 | CPU/GPU 结果容差一致；十万点实时 |
| P2 | PCG Profiler Dashboard | 阶段计时、内存估算、缓存、质量档 | 能定位逐点循环、重复网格合并、热点算子 |

## 推荐落地顺序

### 第一阶段：数据与曲线

1. 点属性 2.0。
2. Curve Sampler 2.0。
3. `deformMeshAlongCurve`。
4. `rotationPolicy`、`lerpPointAttribute`、`reseedPoints`。
5. `Smart Fence 2.0` 与 `Curve Sampler Lab` 验证。

### 第二阶段：关系与语义

1. Attract/Repel。
2. Mesh Socket / Surface Anchor。
3. 面组 / 材质 ID。
4. Linear Grammar。
5. `Surface Ivy 2.0`、`Office Interior Generator`、`Grammar Bookshelf` 验证。

### 第三阶段：生产与性能

1. Instance Custom Data。
2. Heightfield Patch Stack。
3. Catalog/DataTable。
4. Bake 契约、碰撞代理、LOD。
5. Profiler 与质量档。
6. Sidewalk、Road Ecosystem、Snow Cover 三个综合项目。

## 不建议照搬

- 不复刻 UE 蓝图节点图。Meshova 保持脚本优先，复刻数据模型和算法。
- 不把所有流程强制改成“节点”。调试图可以有，创作入口仍是 TypeScript。
- 不逐点生成独立 Mesh 再 Merge。尽量保留 PointCloud 与 InstancePlan 到最后。
- 不让生成器每次参数变化自动写文件。Bake 必须显式触发。
- 不把随机当成一个全局 Seed。位置、旋转、变体、密度应使用独立派生 Seed。
- 不仅看最终截图。必须测中间点数、属性、耗时、内存、极端参数与确定性。

## 最终判断

这 31 集对 Meshova 的最大价值，是把现有“很多模型函数”继续收敛成一套中层 PCG 语言：

`输入几何/曲线 → 点与属性 → 批量规则 → 关系约束 → 实例/动态网格 → Bake/渲染`

Meshova 当前最该做的不是再增加十个独立建筑示例，而是补齐 `Attract + Spline Deform + Socket + Face Group + Instance Custom Data + Profiler`。这六项完成后，播放列表里约三分之二的效果可由短脚本组合出来，且能同时服务建筑、道路、植被、室内、材质和 AI 自迭代。
