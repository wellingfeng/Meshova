# SpeedTree 教程复刻学习记录

源目录：`E:\BaiduNetdiskDownload\speedtree教程软件树库\SpeedTree教程26部`

本地学习输出：

- 清单：`out/speedtree-study/video-inventory.md`
- 截图索引：`out/speedtree-study/index.html`
- 步骤截图：`out/speedtree-study/frames`
- 复刻脚本：`examples/speedtree-tutorial-trees.ts`
- 复刻模型：`out/speedtree-tutorial-*.json`、`.obj`、`.mtl`

## 视频学习覆盖

- 视频：107 个
- 总时长：28:51:23
- 抽帧间隔：15 秒
- 步骤截图：6930 张
- 贴图/参考图片：42 个
- SpeedTree `.spm` 源文件：27 个

## 复刻映射

| 教程组 | Meshova 复刻资产 | 关键做法 |
|---|---|---|
| 树根藤蔓制作 | `speedtree-tutorial-root-vine-tree` | 主干曲线扫掠、外露根、缠绕藤蔓、枝干结疤 |
| 芭蕉类树制作 | `speedtree-tutorial-banana-tree` | 弯曲单干、顶部宽叶扇、双面叶片 |
| 柏松制作 | `speedtree-tutorial-column-cypress` | 柱形树冠约束、短枝、密集窄叶 |
| 松树类制作 | `speedtree-tutorial-layered-pine` | 针叶树轮生枝、分层树冠、针簇 |
| 高级/松柏教程 | `speedtree-tutorial-narrow-spruce` | 窄锥形云杉、更多轮生层 |
| 花树制作 | `speedtree-tutorial-blossom-tree` | 椭球树冠、粉色泪滴叶/花簇 |
| 插片花树制作 | `speedtree-tutorial-card-blossom-tree` | 高密度交叉叶片卡、粉色花冠 |
| 树根制作及力场演示 | `speedtree-tutorial-root-force-tree` | 倾斜主干、偏向根系、风/力场感树冠 |
| 叶子植物制作 | `speedtree-tutorial-large-leaf-plant` | 多茎灌木、大圆叶、叶片卷曲/折叠 |
| 球型树制作 | `speedtree-tutorial-spherical-topiary` | 球形树冠 envelope、密集圆叶 |
| Digital Tutors 写实树 | `speedtree-tutorial-realistic-deciduous` | 粗主干、递归枝、结疤、写实阔叶冠 |
| 3DMotive Bush | `speedtree-tutorial-cryengine-bush` | 多茎灌木、游戏用中低高度叶冠 |
| Grass / ground cover | `speedtree-tutorial-ground-grass` | 随机弯曲草叶、面积散布 |
| fx phd fern/plant | `speedtree-tutorial-fern-plant` | 蕨叶 rachis、成对小叶、放射生长 |
| 生长动画教程 | `speedtree-tutorial-growth-sequence` | 四阶段树高/枝数/叶量序列 |

## SpeedTree 思路转 Meshova 参数

| SpeedTree 操作习惯 | Meshova 实现 |
|---|---|
| Generator 层级 | `tree` / `shrub` / `conifer` / `grass` / `palm` builder |
| Branch distribution | `branchCount`、`depth`、golden-angle 分布 |
| Branch length/angle curves | `branchLengthProfile`、`branchAngleProfile`、`branchRadiusProfile` |
| Crown shaping | `treeGuideFromSilhouette` + canopy envelope |
| Forces | trunk lean、branch angle profile、root bias、gnarl |
| Fronds / needles | `frond`、`needleCluster` |
| Leaf cards | `leafShape: "quad"` 或 shaped leaf mesh |
| Bark detail | `branchFeatures` knots/scars/burls |
| Wind | `windChannels` per part |
| LOD / game export | 继续沿用现有 vegetation LOD/export 模块 |
