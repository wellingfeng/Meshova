# B站 Substance Designer 38 集程序化材质复刻

更新时间：2026-07-12

## 目标

把 VV叔叔的 38 集 Substance Designer 制作过程转译为 Meshova 原生 TypeScript 程序化 PBR 配方。复刻视觉结构与材质类别，不复制 `.sbs` 节点图或视频内容。

输出统一包含 `baseColor`、`metallic`、`roughness`、`normal`、`ao`、`height`、`emission`。所有噪声由种子控制。

## 使用

```bash
pnpm materials-38:download
pnpm materials-38:verify
pnpm materials-38:frames
pnpm materials-38:bake 256 stylizedBrickWall
```

- 视频、元数据、字幕、缩略图：`ref/bilibili-stylized-materials-38/`
- PBR 烘焙：`out/materials/bilibili-stylized-38/`
- 代码注册表：`src/texture/bilibili-stylized-materials.ts`
- 浏览器预览：材质实验室 → **B站 38 集复刻**

下载脚本固定校验 38 集，支持 `--items 1-5,8`，支持断点续传。`ref/` 与 `out/` 已被 Git 忽略。

## 转译原则

1. 先复刻主高度结构：砖缝、木纹、编织、瓦片、裂缝、坑洞。
2. 同一结构派生 AO、法线、粗糙度，避免通道互相矛盾。
3. 颜色只做材质语义与层次匹配，不逐像素拟合视频画面。
4. SD 节点对应 Meshova 自研算子：`fbm2`、Voronoi、网格/砖块、波纹、颜色混合、height-to-normal。
5. 视频仅作本地学习参考。仓库只提交独立实现与研究索引。

## 38 集索引

| 集 | Meshova ID | 视觉目标 | 核心程序链 |
|---:|---|---|---|
| 01 | `stylizedColumn` | 竖槽石膏柱、金属收边 | 周期竖槽 → 边带遮罩 → 绳纹 → 细噪声磨损 |
| 02 | `earthyGround` | 泥土地、碎石、裂隙 | 低频土丘 → Voronoi 碎石 → 裂隙 → 颗粒细节 |
| 03 | `stylizedWoodPlanks` | 纵向木板与拉丝木纹 | 木板分格 → 扭曲纵纹 → 板缝 → 板级随机色 |
| 04 | `glassBlocks` | 金属框、压花玻璃砖 | 方格 → 框体遮罩 → 中央压花 → 低粗糙玻璃 |
| 05 | `simpleRock` | 分层岩石起伏 | FBM 脊线 → 裂隙 → 微表面颗粒 |
| 06 | `realisticConcreteWallA` | 细孔水泥墙 | 低频斑驳 → 高频砂粒 → Voronoi 气孔 |
| 07 | `realisticConcreteWallB` | 裂损水泥墙 | 水泥基底 → 气孔 → 裂缝 → 污渍磨损 |
| 08 | `redWoodPlanks` | 红漆木板 | 木板与木纹 → 红漆层 → 板缝/边缘掉漆 |
| 09 | `bambooBlind` | 细竹帘与绑绳 | 密集圆竹条 → 横向绑绳 → 竹色随机 |
| 10 | `floorTiles` | 写实地砖与砖缝 | 网格分块 → 边缘倒角 → 单砖随机 → 崩边 |
| 11 | `lanternPaper` | 红灯笼纸与骨架 | 纸纤维 → 横竖骨架 → 红色透光 → emission |
| 12 | `bambooRaft` | 并排竹竿 | 圆竹条 → 竹节 → 纵向色差 → 缝隙 AO |
| 13 | `volcanicRock` | 多孔火山岩 | 岩脊 → 随机孔洞 → 深 AO → 暗色坡度 |
| 14 | `stylizedStoneColumn` | 石柱分段与竖槽 | 竖槽 → 水平石段 → 裂损 → 手绘色阶 |
| 15 | `bamboo` | 竹竿表皮与竹节 | 圆柱周期 → 竹节环 → 纵向纤维 |
| 16 | `framedWindow` | 窗框与反射玻璃 | 大格窗框 → 玻璃波纹 → 框体金属/磨损 |
| 17 | `plasterWall` | 旧墙面 | 灰泥斑驳 → 块面暗示 → 裂损剥落 |
| 18 | `stylizedFloorTilesA` | 冷色错缝地砖 | 错缝砖格 → 倒角 → 单砖色差 → 崩边 |
| 19 | `meteorSurface` | 陨石坑行星表面 | 多尺度 Voronoi 坑 → 坑缘 → 岩层噪声 |
| 20 | `stylizedGrass` | 手绘草簇地面 | 随机草叶单元 → 倾斜 → 地表低频色块 |
| 21 | `stylizedRoad` | 粗粒路面与裂缝 | 沥青细粒 → 骨料 → 裂隙 → 脏污层 |
| 22 | `stylizedRoofTilesA` | 冷色鱼鳞瓦 | 交错瓦行 → 圆拱 → 缝隙 AO → 单瓦色差 |
| 23 | `stylizedCoins` | 金币阵列与浮雕 | 圆币分布 → 外圈 → 六向徽记 → 金属通道 |
| 24 | `bambooBasket` | 粗竹篾编织 | 经线/纬线 → 奇偶压盖 → 纤维色差 |
| 25 | `stylizedBark` | 深沟树皮 | 纵向扭曲沟槽 → 裂缝 → 边缘亮暗 |
| 26 | `realisticSteps` | 水泥台阶 | 水平阶带 → 前缘 → 崩角 → 水泥细节 |
| 27 | `stylizedStoneWall` | 不规则石墙 | 错缝石块 → 块级随机 → 砖缝 → 崩边 |
| 28 | `stylizedBurlap` | 麻布经纬纹 | 细经纬线 → 奇偶压盖 → 纤维噪声 |
| 29 | `stylizedRoofTilesB` | 红色旧瓦 | 密集交错瓦 → 圆拱 → 红色变化 → 污损 |
| 30 | `stylizedMarble` | 蓝灰大理石纹 | FBM 扭曲 → 主脉 → 毛细脉 → 抛光粗糙度 |
| 31 | `stylizedRedWall` | 破损红墙 | 红灰泥 → 裂缝 → 暗层外露 → 污渍 |
| 32 | `stylizedFloorTilesB` | 暖色旧地砖 | 砖格 → 倒角 → 暖色随机 → 边缘磨损 |
| 33 | `stylizedWood` | 强对比风格化木纹 | 粗木板 → 扭曲纹理 → 深色沟槽 → 色阶 |
| 34 | `stylizedBrickWall` | 红砖墙 | 错缝砖块 → 砖缝 → 单砖随机 → 崩边 |
| 35 | `stylizedCarpet` | 厚绒地毯 | 高频经纬绒毛 → 交织高度 → 粗糙度变化 |
| 36 | `stylizedGround` | 暖色风格化地面 | 低频土块 → 碎石 → 裂隙 → 手绘色阶 |
| 37 | `stylizedDesert` | 沙丘与风纹 | 大沙丘 → 风向扭曲 → 高频沙纹 → 细砂 |
| 38 | `stylizedSnow` | 雪堆与晶点 | 平滑雪漂 → 微粒 → 稀疏晶点 → 冷暖色差 |

## 已知边界

- `MaterialFields` 不含物理透射。玻璃窗当前复刻压花高度、框格和低粗糙反射；真实折射需接 `SurfaceMaterial`。
- 视频画面含不同预览网格、灯光、色调映射。配方优先匹配材质结构，不把预览灯光烘进贴图。
- 38 配方共享可调参数：随机种子、结构密度、细节层级、磨损、主体色、次要色、基础粗糙度。
