# STS 102 程序化贴图复刻分析

视频：`BV1xW411Z77e`，Substance Designer In Depth STS 102，共 41 P，约 13.8 小时。

## 结论

最值得 Meshova 学习的不是节点界面，而是三套方法：

1. 用 SDF、重复图案和分层高度场构造可参数化硬表面图案。
2. 从几何烘焙法线、AO、曲率、位置和材质 ID，再驱动磨损与材质分区。
3. 把干湿、积尘、锈蚀、苔藓等状态做成独立遮罩层，统一修改颜色、粗糙度、高度和金属度。

## 复刻优先级

| 优先级 | 贴图/系统 | 视频段 | 核心技术 | Meshova 现状与缺口 |
|---|---|---|---|---|
| S | 材质 ID 驱动的建筑立面 | P31-P41 | 几何烘焙、材质 ID、立面分区、砖石/窗框/檐口组合、统一风化 | 已有 `geometry-bake`、`trim`、砖墙与材质混合；缺完整“立面烘焙 -> ID 选材 -> 风化 -> PBR”管线 |
| S | 参数化井盖与周边地面 | P14-P21 | 同心环、径向图案、格栅、孔洞、浮雕、金属磨损、地面融合 | 已有 SDF、环形图案、磨损、湿地；缺井盖专用构造器、径向复制、浮雕字形与多材质成套输出 |
| A | 压纹/波纹金属板 | P9-P13 | 周期条纹、倒角高度、拉丝微表面、划痕、积尘 | 基础算子基本齐；适合最先做成高质量 preset，验证粗糙度与法线尺度 |
| A | 湿路面、排水沟、积水、苔藓/雪 | P19-P21 | 低洼集水、干湿粗糙度分层、污垢传播、气候变体 | 已有 `wetDrainConcrete`、`wetGround`、`mossyStone`；缺统一天气层栈及同一材质多状态切换 |
| A | 科幻控制面板与发光按键 | P22-P25 | 面板分割、凹槽、按键、图标、发光遮罩、旧化 | 已有 `sciFiIndustrialPanel`；缺语义控件布局、字形/图标 SDF、独立 emission 设计和参数化状态 |
| A | 涂漆金属门板旧化 | P22、P27-P30 | 网格烘焙、边缘露底、凹槽积尘、划痕、漆层/金属层切换 | 已有曲率、AO、wear 与材质层；缺可复用的 baked smart-material 模板 |
| B | 破损灰泥砖墙 | P37-P40 | 砖块变化、灰浆、剥落、裂缝、积尘 | `damagedPlasterBrick` 已覆盖大部；重点应转为提升空间一致性和立面集成 |
| B | Voronoi 石材/混凝土 | P7-P8、P13 | 单元随机、边界/坡度遮罩、微表面噪声 | 现有 Voronoi、flood fill、stone/concrete 已较完整；无需优先重复 |

## 推荐实现顺序

1. `corrugatedMetal`：小范围、高复用、可快速校准 PBR 质量。
2. `manholeCover`：补径向构图、硬表面浮雕、复合材质能力。
3. `weatherStack`：统一 wetness、dirt、rust、moss、snow 遮罩与通道联动。
4. `bakedSmartMaterial`：消费 AO、曲率、法线、位置、材质 ID。
5. `facadeMaterialPipeline`：把建筑几何、材质 ID、trim/atlas、风化串成闭环。
6. `controlPanel`：加入语义控件布局、glyph SDF、emission 状态。

## 复刻原则

- 复刻算法和参数结构，不复刻原视频的标志、文字与具体装饰图案。
- 高度先行：先生成稳定 height/mask，再派生 normal、AO、roughness。
- 粗糙度独立设计；不要仅用 base color 明暗假装材质变化。
- 所有随机都由 seed 驱动；同一 seed 必须跨分辨率、Node、浏览器稳定。
- 几何语义 ID 直接进入材质管线，避免仅依赖 UV 像素位置猜部件。
