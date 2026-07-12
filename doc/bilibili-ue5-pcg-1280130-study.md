# Bilibili UE5 PCG 合集学习与 Meshova 复刻

## 资料

- 合集：`PCG_程序化生态域、大世界制作（虚幻5.2）`
- 作者：Game艺视界
- Season：`1280130`
- 入口：`BV1q94y1s7Fc`
- 数量：29 集，合计 `07:38:44`
- 本地归档：`out/bilibili-pcg-1280130/`
- 归档内容：29 个 MP4、30 个元数据 JSON、30 张封面；总计约 2.22 GiB
- 关键帧：`out/bilibili-pcg-1280130/contact-sheets/`

视频没有可下载字幕。判断依据为合集元数据、画面节点图、关键帧和最终效果。视频只作算法与产品交互参考；Meshova 使用 TypeScript 独立重写，不复制 Unreal 源码、蓝图资产或演示工程。

## 结论

合集的通用数据流是：

```text
空间输入 → 候选点 → 边界/密度/坡度过滤 → 属性计算 → 射线/表面投射 → 变体与朝向 → 实例化
```

Meshova 已覆盖大部分能力。此次新增两个缺口：

- `rayProjectPointCloud`：批量 World Ray Hit Query。候选点可投射到任意目标网格，保留原属性，输出命中、距离、三角形索引。
- `storePointColorHSV`：把任意点属性映射为 HSV 调试色，写入 `color.r/g/b`。

目标视频 `BV1q94y1s7Fc` 的关键不是普通 `Mesh Sampler`。画面做法是先生成候选点，再用 `World Ray Hit Query` 命中场景内任意静态网格。Meshova 对应链：`makePointCloud/surfacePointCloud → rayProjectPointCloud → 规则过滤 → copyToPoints`。

## 逐集映射

| 分区 | 视频主题 | Meshova 对应能力 | 状态 |
|---|---|---|---|
| PCG 基础案例 | 森林环境展示 | `buildPcgForestParts`、`buildPcgSuite` | 已有 |
| PCG 基础案例 | 森林案例分析 | `surfacePointCloud`、`ruleDensityNoise`、`ruleNormalToDensity`、`ruleSelfPruning`、`copyToPoints` | 已有 |
| PCG 基础案例 | 地形材质过滤点 | `rasterToField2D`、`compileMaskField`、`ruleMaskField`、地形 slope/height mask | 已有 |
| PCG 基础案例 | 湖边、道路 PCG | `Curve`、`ruleClipToCurveBand`、road/river 系统 | 已有 |
| PCG 进阶 | 简介 | 点云、曲线、实例、环境四类数据流 | 已有 |
| PCG 进阶 | 边界和排除 | `ruleClipToPolygon`、`ruleClipToCurveBand`、`partition` | 已有 |
| PCG 进阶 | 网格采样器、密度过滤、子图 | `surfacePointCloud`、density 规则、函数组合、`groupBy/partition` | 已有 |
| PCG 进阶 | Landscape 样条线 | `polyline`、`resampleCurve`、`scatterAlongCurve`、road 系统 | 已有 |
| PCG 进阶 | 样条线常见问题 | 重采样、曲线平滑、端点 padding、自交与曲率处理 | 已有 |
| PCG 进阶 | 在任何静态网格上采样 | `rayProjectPointCloud` | 本次新增 |
| PCG 进阶 | 点颜色作为调试颜色 | `storePointColorHSV`、`color.r/g/b` 属性约定 | 本次新增 |
| 单独案例 | 匹配模型任意旋转 | 先 `transform` 目标网格再采样；`alignToNormal` 继承完整表面法线 | 已有 |
| 砖墙/家具 | 可调砖墙 01 | `buildPcgBrickWallLayout`、曲线重采样、running bond | 已有 |
| 砖墙/家具 | 可调砖墙 02 | 尺寸、形状、破损、种子变体 | 已有 |
| 基础教程 | 丛林工具 | `buildPcgForestParts` | 已有 |
| 基础教程 | 基础知识 | `PointCloud`、`ScatterRule`、`InstancePlan` | 已有 |
| 基础教程 | 样条线 | `Curve`、sweep、curve scatter | 已有 |
| 基础教程 | 撒点节点 | surface/Poisson/grid/curve scatter | 已有 |
| 基础教程 | 子图 | 普通 TS 函数组合；点云不提前烘焙 | 已有 |
| 基础教程 | PCG Actor | 参数对象 + 纯构建函数；无引擎 Actor 依赖 | 已有等价设计 |
| 基础教程 | 属性 | `storePointAttribute`、`pointAttribute`、query/group | 已有 |
| 基础教程 | 自定义节点 | 自定义 `ScatterRule` 或纯函数算子 | 已有 |
| 基础教程 | 森林、路径和河流 | forest、road、`RiverSystem2D` | 已有 |
| 基础教程 | 自定义景观层数据 | `Field2D`、mask field、terrain channels | 已有 |
| 基础教程 | UE5.3 节点更新 | 按能力映射，不追逐引擎节点名称 | 持续 |
| 基础教程 | World Ray Hit Query 11 | `rayMesh`、`rayProjectPointCloud` | 本次补齐批量层 |
| 基础教程 | World Ray Hit Query 12 | 命中距离、表面法线、miss 策略、最大距离 | 本次补齐 |
| 基础教程 | PCG Level Instances | `Assembly`、`copyAssembliesToPoints`、layer scatter | 已有 |
| 基础教程 | 纹理图与地形材质层撒点 | `rasterToField2D` → mask/density → scatter | 已有 |

## 新 API

```ts
const candidates = makePointCloud({ points });
const hits = rayProjectPointCloud(candidates, targetMesh, {
  direction: vec3(0, -1, 0),
  maxDistance: 20,
  surfaceOffset: 0.01,
});
const debug = storePointColorHSV(
  hits,
  (ctx) => (ctx.attributes["ray.distance"]?.[ctx.index] ?? 0) / 20,
);
```

`rayProjectPointCloud` 默认删除 miss。设 `miss: "keep"` 后保留原点，并写：

- `ray.hit = 0`
- `ray.distance = -1`
- `ray.prim = -1`

命中点写入目标表面插值法线。`surfaceOffset` 用于避免实例底面与目标表面共面。

## 模型库落地

本次把射线投射能力组合成 3 个可实时调参的模型库场景：

| 模型 ID | 场景 | 验证能力 |
|---|---|---|
| `raycast-roof-garden` | 射线投射屋顶花园 | 向下射线、双坡屋面命中、属性保留、实例法线对齐 |
| `raycast-asteroid-garden` | 径向投射晶体小行星 | 逐点射线方向、任意旋转网格、全表面散布、HSV 距离调试色 |
| `raycast-cliff-lights` | 横向投射岩壁灯阵 | 非地形静态网格、横向命中、粗糙表面、实例变体 |

三者均使用参数对象 + 纯构建函数，种子固定时输出完全一致。模型库直接调用 `dist` 同源实现，不维护浏览器专用几何副本。

## 还值得学习与复刻

按对 Meshova 的产品价值排序：

1. **BVH 射线加速**：当前批量投射是候选点 × 三角形暴力查询。BVH 可把十万级候选点与高模网格投射变成可交互能力，是本合集剩余价值最高项。
2. **原生点云调试渲染**：Viewer 直接读取 `color.r/g/b`、density、normal、hit distance，无需把点烘成小球。能显著缩短 AI 和人定位规则错误的时间。
3. **增量 PCG 求值与节点缓存**：参数变化只重算受影响阶段；以内容哈希缓存点云、mask、投射结果。比复刻 UE 节点外观更有价值。
4. **分区流式与稳定种子**：按空间单元生成、卸载和重建；跨分区保持实例 ID 与随机结果稳定。对应真正的大世界使用场景。
5. **可保存 recipe 与子图**：把 mask → scatter → ray project → rules → instances 序列化，支持组合、版本迁移、AI 修改与回放。
6. **多条件生态约束**：补曲率、遮挡、可见天空、邻域类别、碰撞体积规则；比继续堆基础撒点节点更能提高生成质量。

不建议复刻 UE 的 Actor 包装、节点命名和编辑器兼容细节。它们平台绑定重，无法增强 Meshova 的程序化内核。

## 后续优先级

1. 给 `rayProjectPointCloud` 增加 BVH，加速大网格和十万级候选点。
2. Viewer 读取 `color.r/g/b`，直接显示点云调试色。
3. 增加增量求值、缓存与空间分区。
4. 将纹理/景观层 mask 与 scatter 规则做成可保存 recipe。
5. 保持能力命名独立于 Unreal，避免把节点 UI 复制成 Meshova 公共 API。
