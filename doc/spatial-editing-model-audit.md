# 模型库曲线/曲面编辑筛选

## 结论

已检查查看器注册表 676 个模型。筛选原则：拖点必须比标量参数更直接，且控制点应对应稳定的几何语义。随机细节、数量、材质、开合、机械约束继续使用参数。

现共接入 116 个模型：曲线 47 个、分叉曲线图 1 个、区域 3 个、曲面控制网格 66 个；`pcg-palisade-wall` 同时属于曲线与区域。已有的可绘制围栏、路径灯带、区域林地沿用同一协议。

曲线绑定保存控制点与插值类型，支持 Catmull-Rom、逐锚点三次贝塞尔、三次 B 样条、折线。贝塞尔支持自动、对齐、镜像、自由、折角五种切线模式；曲线默认按弧长均匀重采样。查看器预览与模型构建共用同一采样结果，默认使用 Catmull-Rom。曲面使用 4×4 三次 B 样条控制网格；旧 3×3 分享数据自动回退到默认曲面。

选中控制点显示世界坐标 XYZ 操纵器，轴向拖动严格锁定单轴。每个控制点带宽度、高度、倾斜、扭转属性；SpeedTree 主干已消费宽度、高度、扭转轨道。`houdini-howtos-curve-graph` 使用分叉图绑定，支持节点拖动、双击边分裂、删除节点与从选中节点新增分支。

建筑、城区、路网、生态场景使用共享场景边界计算控制面权重，所有部件按同一空间坐标变形，避免每个部件独立归一化导致撕裂。SpeedTree 与树木族使用主干导向曲线，枝干和叶冠同步跟随。

## 已接入：曲线与区域

| 模型族 | 模型 ID | 控制对象 |
| --- | --- | --- |
| 道路交通 | `road`、`freeway`、`railway`、`viaduct` | 中心线、纵坡 |
| 桥梁 | `suspension-bridge` | 桥面控制线、塔位高程 |
| 墙体围栏 | `pcg-brick-wall`、`pcg-palisade-wall`、`spline-stone-wall` | 墙体基线、闭合边界 |
| 岩石路径 | `realistic-spline-path` | 路径中心线 |
| 路缘系统 | `pcg-spline-curb-sidewalk`、`pcg-curb-boulevard`、`pcg-curb-market-street`、`pcg-curb-riverside-walk`、`pcg-curb-civic-crescent` | 道路样条 |
| 既有工作流 | `drawable-path-fence`、`scatter-path-lights`、`masked-region-grove` | 路径、区域边界 |
| 水系 | `procedural-river`、`river-lake`、`pcg-biome-river` | 河道中心线、入湖位置 |
| 岛屿 | `polygon-island` | 闭合海岸边界 |
| 线缆 | `titan-cable` | 电杆锚点、线路高程、悬垂跨段 |
| 瀑布 | `waterfall` | 3D 落水纵断线 |
| 表面植被 | `surface-sketch-vine` | 岩壁投射藤蔓笔划 |
| 分叉管网 | `houdini-howtos-curve-graph` | 管网节点、分支拓扑、逐边平滑曲线 |

## 已接入：树木主干曲线

| 模型族 | 模型 ID | 控制对象 |
| --- | --- | --- |
| 基础树木 | `bonsai`、`veg-tree`、`veg-growing-tree`、`veg-stylized-tree` | 主干偏移曲线、树冠跟随 |
| 作者级植被 | `veg-authored-broadleaf`、`veg-trellis-fruit`、`veg-column-cypress`、`veg-conifer`、`veg-palm` | 主干导向、整体姿态 |
| 场景树木 | `titan-tree`、`street-tree` | 主干导向、冠幅随动 |
| SpeedTree 树种 | `speedtree-oak`、`speedtree-maple`、`speedtree-birch`、`speedtree-willow`、`speedtree-pine`、`speedtree-spruce`、`speedtree-palm` | 主干 Catmull-Rom / 贝塞尔 / B 样条 |
| SpeedTree 引导树 | `speedtree-guided-canopy`、全部 `speedtree-custom-*` 单树模型 | 主干曲线、枝叶同步变形 |

## 已接入：曲面

| 模型 ID | 控制对象 | 变形范围 |
| --- | --- | --- |
| `terrain-island` | 4×4 B 样条地形控制网格 | 岛屿地形主体 |
| `lunar-crater-surface` | 4×4 B 样条月面控制网格 | 月面主体 |
| `pcg-river-valley` | 4×4 B 样条河谷控制网格 | 河谷地形主体 |
| `terrain-layered` | 4×4 B 样条地形控制网格 | 坡度分层地形 |
| `fterrain` | 4×4 B 样条地形控制网格 | 字段地形 |
| `cliff-panel-study` | 4×4 B 样条崖壁控制网格 | 崖壁分片整体 |
| `rock-formation`、`rock-pile`、`pcg-rock-cluster` | 4×4 B 样条岩体控制网格 | 岩体与岩群大形 |
| `stylized-rock-island`、`easy-cliff-rock` | 4×4 B 样条地貌控制网格 | 浮岛与岩山群整体 |
| `houdini-cave`、`ue5-pcg-cave` | 4×4 B 样条洞体控制网格 | 洞壳与洞内岩体高程 |
| `grasshopper-landscape-contour` | 4×4 B 样条地形控制网格 | 浮雕与等高线同步塑形 |
| `grasshopper-reaction-diffusion` | 4×4 B 样条浮雕控制网格 | 反应扩散板大形 |
| `pcg-cell-map`、`pcg-world` | 4×4 B 样条世界控制网格 | 群岛与生物群系地貌 |
| `pcg-vegetation`、`meadow` | 4×4 B 样条地表控制网格 | 地表及附着植被同步塑形 |
| `stylized-ocean-environment` | 4×4 B 样条海面控制网格 | 海洋低频大形 |

## 已接入：建筑、道路与生态控制面

| 模型族 | 模型 ID | 控制对象 |
| --- | --- | --- |
| 单体建筑 | `roof-generator`、`building`、`procedural-building`、`sidefx-modular-house`、`houdini-lake-house`、`pcg-cartoon-house` | 屋面、轮廓、整体体量 |
| 城市建筑 | 全部 `urban-*` 建筑、`japanese-street-building`、`hong-kong-cyber-house`、`kowloon-cyber-courtyard`、`chinese-hall` | 建筑体量与屋面低频大形 |
| 城区聚落 | `cityblock`、`city-district`、`roman-town`、`residential-community`、`townscaper-harbour`、`chinese-townscaper`、`mountain-village`、`town-scene` | 街区与地貌共享控制面 |
| 道路网络 | `road-network`、`city-district-roadnet`、全部 `citygen-*`、`watabou-city`、`multilevel-interchange`、`intersection`、`streetscene` | 路网整体走向、层高、地表 |
| 生态系统 | `pcg-forest`、`forest-floor`、全部生态工具模型、`dual-grid-forest-camp`、`dual-grid-river-mill` | 地表、散布物与水系同步塑形 |

## 后续应接入：专用编辑平面

这些模型确实适合拖点，但不能直接套首批 XZ 地面编辑器。

| 类型 | 模型/模型族 | 所需编辑器 |
| --- | --- | --- |
| 植被 | `vine`、`roots`、常春藤族、仙人掌；SpeedTree 二级枝 | 将现有分叉曲线图扩展为父子半径继承、表面吸附 |
| 线缆管路 | 高压线、软管、电缆、管线类 Poly Haven 道具 | 多跨 3D 曲线、接头与悬垂约束 |
| 网络布局增强 | 已接入控制面的道路网与立交 | 将现有分叉曲线图接入道路规则、层高约束、单路段选择 |
| 旋转轮廓 | `wineglass`、花瓶、瓶罐、花盆、筒仓族 | 2D 截面曲线 |
| 服装 | `tshirt`、`skirt`、`pants`、`dress`、`hoodie` | 2D 纸样轮廓、缝合边 |

## 后续应接入：高阶曲面

| 类型 | 模型/模型族 | 所需编辑器 |
| --- | --- | --- |
| 大地形增强 | 已接入控制面的城镇、山村、山脉、复杂群岛场景 | 自适应控制网格、笔刷、附着物重投射、边界锁定 |
| 水面 | 海洋、湖泊、河面族 | 曲面网格加流向场，不能只改高程 |
| 车身 | `sports-car`、`gmc-canyon-at4x`、`buick-riviera-1965` | 对称曲面笼、截面环、硬点约束 |
| 建筑自由形体增强 | 已接入体量控制面的扭转塔、波浪表皮、异形屋顶族 | 截面环/双向曲面网格、楼层约束 |

## 保留参数编辑

原语、齿轮/发动机等机械件、门柜等关节家具、规则化建筑构件、随机散布密度、材质与细节开关不接拖点。原因：尺寸、数量、约束、拓扑语义比自由变形更重要；拖点会制造无效或不可制造状态。
