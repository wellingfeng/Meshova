# 第六批：场景感知与时间演化材质

本批把 Meshova 从静态纹理配方扩展为场景属性驱动、可随时间演化、可对参考图做多视角参数拟合的程序化材质系统。输出继续兼容前五批：标准 7 通道、扩展 4 通道、分层 8 通道，共 19 张 PBR 贴图。

## 快速使用

烘焙全部 10 套材质：

```powershell
pnpm materials-sixth:bake -- 512
```

只烘焙苔藓岩石：

```powershell
pnpm materials-sixth:bake -- 512 sceneAwareMossyRock
```

输出位于 `out/materials/sixth-batch/<material>/`。每套包含 19 张 PNG、OpenPBR JSON、MaterialX 文档、复刻报告 JSON。

材质实验室：

```powershell
pnpm build
pnpm view
```

打开 `http://127.0.0.1:5173/web/matlab.html?mat=sceneAwareMossyRock`。

## 材质清单

| 标识 | 视觉目标 | 主要驱动 |
|---|---|---|
| `sceneAwareMossyRock` | 苔藓岩石 | 湿度、光照、凹腔、生长时间 |
| `rainWashedConcrete` | 雨淋混凝土 | 雨流、吸水、干燥、污迹沉积 |
| `compactedSnowRuts` | 积雪车辙 | 覆盖、压实、磨耗、融化湿痕 |
| `marineCorrodedSteel` | 海洋腐蚀钢 | 盐雾、锈蚀、生物附着 |
| `slopeHeightTerrainBlend` | 地形混合 | 坡度、高度、湿度、归一权重 |
| `hangarOilStainedFloor` | 机库油污地面 | 泄漏扩散、轮胎印、灰尘沉积 |
| `windErodedSandstone` | 风蚀砂岩 | 风向、层理、输运、侵蚀 |
| `wornMudTireRubber` | 轮胎橡胶 | 胎纹、接触磨耗、泥水附着 |
| `uvAgedPlastic` | 老化塑料 | 紫外褪色、发白、脆裂 |
| `layeredGraffitiWall` | 涂鸦墙 | SDF 贴花、覆盖、风化剥落 |

## 机制 API

核心位于 `src/texture/scene-material-mechanics.ts`。

### 世界空间采样

- `noise3D(position, options)`：确定性 3D FBM，输出 `[0,1]`。
- `triplanarNoise3D(position, normal, options)`：按法线权重混合三轴投影，无 UV 网格可用。

### 场景属性烘焙

`bakeMeshSceneAttributes(mesh, options)` 输出 AO、曲率、厚度、坡度、高度、世界坐标、覆盖率。输入网格必须包含有效 UV；世界坐标贴图当前保存归一化投影位置，不替代精确位置重建。

### 时间演化与输运

- `transportScalarField(source, velocity, options)`：周期边界半拉格朗日输运，输出剩余场和沉积场。
- `simulateSurfaceEvolution(size, options)`：耦合计算湿度、生长、腐蚀、沉积、磨耗、裂纹、流向。
- `time`、`humidity`、`salinity`、`sunlight`、`traffic` 均限制在 `[0,1]`；相同输入保证相同输出。

### 分层投射与地形混合

- `projectSdfDecals(size, decals)`：支持圆、方框、条带、圆环；按输入顺序合成覆盖率。
- `computeTerrainBlendWeights(height, slope, moisture, rules)`：每像素输出 N 个权重；总和恒为 1。

### 参考图拟合

`fitMaterialMultiview(targets, ranges, render, options)` 使用确定性演化搜索与坐标精修。评分包含亮度均值、方差、边缘能量、高频能量、方向性、直方图差异。

```ts
const fit = fitMaterialMultiview(
  referenceViews,
  {
    scale: { min: 2, max: 12 },
    amount: { min: 0, max: 1 },
    time: { min: 0, max: 1 },
  },
  (params, view, scale) => renderCandidate(params, view, scale),
  { seed: 42, generations: 12, population: 16 },
);

const report = createReplicationReport("moss", fit, 0.12);
```

`render` 必须无副作用、确定性，并返回单通道特征贴图。多尺度阶段先用半分辨率特征搜索，再用全分辨率精修。`createReplicationReport` 记录参数、总误差、逐视角误差、超阈值原因。

## 数据流

```text
网格/参考图
  -> 场景属性或感知特征
  -> 3D 场、输运、时间演化
  -> 材质机制组合
  -> 19 通道 LayeredMaterial
  -> PNG + OpenPBR + MaterialX + 复刻报告
```

## 复刻边界

- 当前输运是 CPU 二维周期场；不模拟真实 Navier–Stokes 流体。
- 厚度是 UV 邻域覆盖近似；封闭网格的精确厚度仍需双向射线烘焙。
- 场景朝向在二维材质预览中由合成属性近似；实际模型应传入烘焙属性。
- 拟合评分是可解释感知特征，不等于神经感知损失或像素级重建。
- 多视角拟合减少单视角过拟合，但无法恢复参考图未观察到的材质结构。
