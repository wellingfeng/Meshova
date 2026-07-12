# Bilibili 罗马城镇程序化生成评估

- 来源：`BV1qRMP6hEBN`，《Houdini PDG + UE PCG 程序化生成罗马城镇》，时长 2:30。
- 本地参考：`out/reference/bilibili/BV1qRMP6hEBN/source.mp4`。
- 关键帧：`out/reference/bilibili/BV1qRMP6hEBN/frames/`；接触表：`contact-sheet.jpg`。
- 目标：判断 Meshova 现有模型库能否生成相近的现代罗马传统街区；不复制视频工程、网格或贴图。

## 结论

可以。现有库已覆盖约 75% 的结构能力，但现成模型直接组合只能达到约 50% 的视觉相似度。主要缺口不是底层几何或城区 PCG，而是独立的“罗马街区风格包”：暖色风化灰泥、百叶窗与窗楣、陶瓦屋顶、围合院落、屋顶露台、底商拱门及老城路面。

视频展示的是现代罗马传统街区，不是古罗马神殿或遗迹。核心管线是：少量建筑原型和立面模块，经 Houdini PDG 生成地块/建筑数据，再由 UE PCG 装配街区、屋顶、颜色、道具和材质变化。

## 视频内容与现有能力

| 视频目标 | Meshova 可复用模块 | 当前判断 |
| --- | --- | --- |
| 矩形与围合院落街区 | `buildCityDistrictParts`、`buildCitygenParts`、`cityBlocks` | 可用；需减少北美式宽路，增加窄街与不规则地块 |
| 5–7 层连续街墙 | `buildBuildingParts`、`buildUrbanBuildingParts`、`buildHoudiniCityFacadeReplica` | 体量和立面阵列可用 |
| 窗户、百叶、阳台、檐口 | `buildSidefxModularHouseParts`、`module-kit`、建筑檐口/阳台 | 构件存在；需罗马比例与组合规则 |
| 四坡、曼萨德、平屋顶 | `buildRoofGeneratorParts`、`buildRooftopKitParts`、`buildWfcRooftopParts` | 基础完整；需陶瓦、露台、天线布局 |
| 底商、遮阳棚、咖啡座 | `newsstand`、`buildUmbrellaTableParts`、遮阳棚模块 | 可复用；需店面拱门和沿街布置规则 |
| 路灯、树木、街道道具 | `buildStreetLampParts`、`buildStreetTreeParts`、`streetscene` | 可用 |
| 石板/鹅卵石街面 | `tileFloor`、道路与地形材质链 | 有生成基础；缺写实罗马块石 preset |
| 风化粉刷墙、陶瓦 | 材质场、噪声、PBR 烘焙、`brickWall`/`ceramic` | 底层可用；缺专用 preset |
| 拱门、柱式、古典构件 | `archway`、`column`、`pavilion`、`bridgeWall` | 可作入口、庭院、地标；不是本视频主体 |

## 最短实现路径

1. 新增 `RomanTownStyle`：6 个建筑原型、暖灰泥调色板、统一楼层/窗洞/檐口比例。
2. 复用 `sidefx-modular-house` 槽位系统，加入百叶窗、窗楣、法式阳台、底层圆拱店面、墙角线脚。
3. 复用 `roof-generator` 和 `rooftop-kit`，加入陶瓦参数、屋顶露台、女儿墙、烟囱、天线、晾晒/花盆道具。
4. 用 `city-district` 的围合院落作街区骨架；路网改为窄街、短支路、轻微不规则转角。
5. 新增 `weatheredPlaster`、`terracottaRoof`、`romanCobblestone` 三个程序化 PBR preset。
6. 种子驱动建筑原型、墙色、窗扇开合、屋顶布局和店铺密度；保持语义分件，便于 AI/VLM 调参。

## 预期效果

- 仅复用现成模型：城区布局相近，建筑风格仍偏通用，约 45%–55% 视觉相似度。
- 补齐风格包：可达到约 75%–85% 的整体观感与构成相似度。
- 视频级近景写实：还需更细的窗框/百叶/檐口网格、材质宏微观风化、贴花和 LOD/实例化优化。

建议产物：`src/models/roman-town.ts`、`src/texture/roman-presets.ts`、`examples/roman-town.ts`，沿用现有 Viewer JSON/OBJ 输出和截图回归链。

## 网络资料结论与实现映射

本轮重点检索 SideFX Labs 官方开源帮助文档；只借鉴公开工作流，不复制 HDA、网格或贴图。

| 公开资料 | 可复用方法 | Meshova 实现 |
| --- | --- | --- |
| [Labs Building Generator 4.0](https://github.com/sideeffects/SideFXLabs/blob/Development/help/nodes/sop/labs--building_generator-4.0.txt) | 低模体块切楼层；识别墙、转角、檐带；用用户模块替换结构区 | 街坊先生成四条围合建筑条带，再按楼层/开间生成底商、窗、转角石、檐口槽位 |
| [Labs Building from Patterns 1.1](https://github.com/sideeffects/SideFXLabs/blob/Development/help/nodes/sop/labs--building_from_patterns-1.1.txt) | 首层、填充层、顶层使用不同模块模式；支持重复与变体 | 首层圆拱店面；上层窗楣/百叶/阳台；顶层檐口与屋顶语法独立生成 |
| [Labs Lot Subdivision 2.0](https://github.com/sideeffects/SideFXLabs/blob/Development/help/nodes/sop/labs--lot_subdivision-2.0.txt) | 最小地块、迭代切分、不规则度、地块聚类 | 窄街网格切出街坊；每街坊生成连续街墙与中央院落；中心街坊可替换为广场 |
| 视频 `BV1qRMP6hEBN` | Houdini PDG 生成建筑数据，UE PCG 装配街区与变体 | 单主种子派生街坊、楼层、墙色、店面、百叶、阳台、屋顶与道具变体 |

六类风格缺口对应规则：

- 风化灰泥：暖色基底 + 低频潮斑 + 高频砂粒 + 稀疏裂纹；粗糙度、AO、高度同源。
- 陶瓦屋顶：四坡屋顶几何 + 交错瓦行；瓦拱、缝隙、烧制色差进入高度/颜色/粗糙度。
- 罗马窗楣：窗台、水平楣、三角山花、转角石、层间檐带组合。
- 底层拱形店面：半圆拱扫掠环 + 石质拱脚 + 内缩玻璃门；部分开间添加遮阳篷。
- 窄街块石：深色玄武岩矩形块错缝；磨圆顶面、深缝 AO、可调湿润度。
- 屋顶露台：平屋面、女儿墙、木棚架、陶盆、绿植；与陶瓦坡屋顶按种子混合。

## 已完成产物

- 模型生成器：`src/models/roman-town.ts`
- 专用 PBR：`src/texture/roman-presets.ts`
- Viewer 实时模型：`roman-town`
- CLI 示例：`pnpm roman-town`
- 输出：`out/roman-town.obj`、`out/roman-town.mtl`、`out/roman-town.json`
- 截图：`out/shots/roman-town-persp.png`、`roman-town-top.png`、`roman-town-orbit45.png`
