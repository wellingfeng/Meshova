# Bilibili「PCG」合集学习与复刻建议

## 来源与本地资料

- 合集：`PCG`，season `5066969`，UP 主「安德烈康基」
- 入口：`BV1wd4y1S7TK`
- 视频：15 个，合计 `00:13:52`
- 下载：`out/bilibili-pcg-5066969/`
- 规格：15/15 均已下载为 MP4；主体为 1920x1080，少数宽屏；总计约 193 MB
- 附件：每片均有封面、`info.json` 元数据、8 帧接触表；接触表位于 `contact-sheets/`

分析方法：核对合集 API 和视频元数据，逐片按时间均匀抽取 8 帧，结合标题、简介、可见节点流程和最终效果判断。视频多为成果演示，不足以还原完整节点图；下文区分“画面确认”与“合理技术推断”，不把推断当源码事实。

## 结论

最值得 Meshova 学习的不是 15 个独立成品，而是四个可复用内核：

1. **CellGraph2D**：六边形、不规则网格、对偶、松弛、分簇、边界提取。对应 01、02、10、14。
2. **RiverSystem2D**：河道演化、侵蚀沉积、高度场切槽、矢量 Flow Map。对应 07、12。
3. **SurfaceSketch**：视口鼠标画曲线、射线吸附任意表面、曲线驱动生成。对应 13。
4. **CliffPanelization**：按面方向离散分片、局部投影、贴片混合、三平面兜底。对应 15。

其中 CellGraph2D 优先级最高。它同时支撑地图、生物群系、河网、道路、地块、城市和地形边界，能把现有多个模型中的私有实现收敛为公共内核。

## 复刻落地状态（2026-07-11）

四个高价值方向已进入程序化模型库，均由参数和 seed 重建，不保存死网格：

- `pcg-cell-map`：`hexCellGraph`、连通分簇、边界提取、六边格群岛与生态区。
- `pcg-river-valley`：共享中心线、河宽/河深、侵蚀/沉积、积水量、矢量流向与切槽地形。
- `surface-sketch-vine`：可重放表面笔划、去抖/重采样/平滑/投影、笔划驱动藤茎与叶片。
- `cliff-panel-study`：崖面方向离散、连通贴片、局部 UV 投影、平地兜底区。

公共实现位于 `src/geometry/cell-graph.ts`、`river-system.ts`、`surface-sketch.ts`、`cliff-panel.ts`；场景生成器位于 `src/models/pcg-learning.ts`。

## 15 个视频逐项判断

| # | 内容 | 核心价值 | Meshova 现状 | 建议 |
|---:|---|---|---|---|
| 01 | 程序化六边形随机地图 | 六边形邻接图驱动海拔、河网、生态、资产散布 | 已有 `polygon-island`、地形 mask、scatter；缺通用六边形 CellGraph | **高：复刻为 CellGraph 示例** |
| 02 | Irregular Grids Relax | 从规则/随机单元得到均匀、可控的不规则四边形区域 | 已有 Delaunay/Voronoi 私有逻辑和圆形松弛；缺 Lloyd/网格松弛公共 API | **高：并入 CellGraph 核** |
| 03 | DLA 扩散限制聚集 | 少量规则产生自然分形；适合根系、菌落、裂纹、珊瑚、洞穴骨架 | 有递归生长、藤蔓、反应扩散；无 DLA 随机游走核 | **中：小成本新增生成器** |
| 04 | Marching Cubes | 标量场到封闭网格，是 SDF、体素、洞穴、云体的基础 | 已有 `Field3D`、SDF、`polygonizeField`、`voxelRemesh` | **不重做：补示例和文档** |
| 05 | 纪念碑谷程序化山体 | 参数化台地、崖壁轮廓、地表融合 | 已有 heightfield、侵蚀、顶点色、triplanar、terrain island | **中：做风格化地貌 preset** |
| 06 | Houdini/UE5 程序化山体 | 几何属性通过顶点色传给材质；几何和材质联动 | 已有 `coloredPart`、terrain mask、PBR、triplanar | **高价值理念，能力基本已有** |
| 07 | 程序化河流 + Flowmap | 河槽几何、岸边散布、材质流向共用同一河流数据 | 已有流水累积标量 mask；缺矢量 Flow Map 和完整河流对象 | **高：与 12 合并复刻** |
| 08 | UE5 自动堆叠工具 | 资产集合、碰撞/支撑、确定性变体、场景快速布置 | 已有 `buildTitanStackingParts`，含 fracture + 确定性堆叠近似 | **不重做：后续只改支撑质量** |
| 09 | 程序化桥 | 曲线扫掠桥面、等距桥墩/栏杆、转弯和宽度变化 | 已有 curve、track/road、`instanceAlongCurve`、`bridgeWall` | **中：快速整合成完整桥生成器** |
| 10 | 六边形对偶 + 随机分簇 | 区域聚类、圆滑边缘、Biome/地形边界通用化 | 已有 polygon island 的图结构，但算法未抽成通用模块 | **最高：CellGraph 核心验收案例** |
| 11 | Gaea→Houdini→UE 地形流程 | 几何、语义 mask、材质层分工清晰；自动匹配 Layer | 已有 terrain recipe、field set、flow/wear/deposition mask | **学数据契约，不复制外部依赖** |
| 12 | 河流蜿蜒与侵蚀模拟 | 力场引导路径演化，外弯侵蚀、内弯沉积，和高度图耦合 | 现有侵蚀是栅格向低点流动；没有可编辑河道演化模型 | **最高：新增 RiverSystem2D** |
| 13 | 鼠标绘制吸附藤蔓 | 把程序化从“调滑块”升级到“直接画意图” | 已有 `meshSurface`、攀爬藤蔓、sweep；Viewer 缺笔刷/射线曲线输入 | **最高：产品交互差异化** |
| 14 | Irregular Grid 程序化威尼斯 | 图分区→属性→建筑模块→PCG 散布的完整系统案例 | 已有城市、道路、地块、scatter、polygon island；缺统一 CellGraph 属性链 | **高：作为综合验收 Demo** |
| 15 | 崖壁置换贴片优化 | 离散面板化避免三平面纹理被拉伸、模糊和重复 | 已有 triplanar 与地形材质；缺方向聚类和贴片局部坐标 | **最高：几何材质共核代表功能** |

## 建议复刻的公共 API

### 1. CellGraph2D

建议把 `polygon-island` 内部已有三角化/邻接能力抽成独立公共数据结构，而不是再写一个只服务六边形地图的模型。

```ts
interface CellGraph2D {
  sites: Vec2[];
  cells: Cell2D[];
  edges: CellEdge[];
  neighbors: number[][];
  boundaryLoops: Vec2[][];
}
```

需要的算子：

- `hexCellGraph`：规则六边形、轴坐标、邻接。
- `voronoiCellGraph`：随机/抖动采样生成不规则单元。
- `relaxCellGraph`：Lloyd 或面积/边长约束松弛。
- `dualCellGraph`：原图和对偶图转换。
- `clusterCells`：seeded region growth、目标面积、连通性约束。
- `traceClusterBoundary`：从 cell 标签生成连续轮廓。
- `roundCellBoundary`：圆角或对偶三角模块拼接。
- `mapCellAttributes`：海拔、Biome、湿度、道路、建筑类型等稳定属性列。

第一批示例按顺序做 02 → 10 → 01。先验证图结构，再做地图外观。

### 2. RiverSystem2D

把“河流”定义为共享数据对象，不只是一条蓝色曲线：

```ts
interface RiverSystem2D {
  centerlines: Curve[];
  width: Field2D;
  depth: Field2D;
  direction: VectorField2D;
  accumulation: Field2D;
  erosion: Field2D;
  deposition: Field2D;
}
```

生成链：源点选择 → 沿坡度/力场推进 → 障碍偏转 → 曲率约束 → 外弯侵蚀/内弯沉积 → 高度场切槽 → 岸边 mask → Flow Map。几何、水材质、泡沫、岸石和植被必须读同一对象，避免各自猜位置。

现有 `terrain/heightfield` 的 flow/wear/deposition 可复用为栅格基础；新增部分是动态中心线、向量流向和曲线—高度场双向耦合。

### 3. SurfaceSketch

Viewer 增加一种“画生成意图”模式：

1. Pointer 事件射线命中当前 mesh。
2. 记录世界坐标、法线、part key、三角形索引。
3. 对采样点去抖、重采样、平滑。
4. 保存为可重放的 stroke 数据，不保存最终网格。
5. stroke 交给 sweep、scatter、road、vine、fence 等生成器。

首个用例做藤蔓：stroke 提供主方向和吸附区域，`growClimbingStrands` 负责分枝和随机细节。这样仍符合 Meshova“脚本/参数可重放，不烘死网格”的原则。

### 4. CliffPanelization

建议实现为几何—材质桥接层：

- 按法线、坡度、曲率把崖壁面分成方向相近的 panel。
- 每个 panel 建局部切线坐标，生成稳定投影。
- 用高度、曲率、侵蚀 mask 控制贴片选择和混合。
- panel 边界生成 seam/blend mask。
- 平地继续用普通 UV；方向混乱区用 triplanar 兜底。
- 输出调试色：panel id、主方向、混合权重、重复率。

它比单纯加更多噪声更重要：直接解决垂直崖壁纹理拉伸、重复方向一致、远看结构不清的问题。

## 不应重复造的功能

- **Marching Cubes**：现有 `polygonizeField` 已是通用标量场多边形化核心。
- **自动堆叠**：现有 Titan stacking 已复刻视频思路；缺真实 RBD 不影响当前确定性目标。
- **基础山体**：heightfield、热力/水力侵蚀、SDF、顶点色和 triplanar 已齐；重点应转向可控地貌语义和材质映射。
- **外部 Gaea 工作流**：学习 mask 契约即可。Meshova 不应依赖 DCC 才能重放。

## 推荐实施顺序

1. **P0 CellGraph2D**：02、10、01；随后复用到 polygon island、城市地块、Biome。
2. **P0 RiverSystem2D**：12、07；输出中心线、河槽、mask、矢量 Flow Map。
3. **P1 SurfaceSketch**：13；先藤蔓，再扩展道路、围栏、散布带。
4. **P1 CliffPanelization**：15；与 terrain recipe、triplanar、PBR 联调。
5. **P1 综合 Demo**：14 程序化威尼斯；验证图属性驱动整条链。
6. **P2 快速补齐**：09 完整桥生成器、03 DLA、05 风格化台地 preset。

## 验收原则

- 相同 seed、参数、stroke 数据必须得到相同结果。
- 算法输出结构化中间数据；Viewer 可切换调试视图，不只展示最终材质。
- 生成器不依赖 Houdini、Gaea、Unreal 运行时。
- 几何和材质共享语义字段，避免复制一套规则。
- 每个公共内核至少有确定性测试、退化输入测试、一个可交互示例、一个截图基准。
