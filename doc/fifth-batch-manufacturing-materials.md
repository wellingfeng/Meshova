# 第五批：制造工艺与标准材质互通

更新日期：2026-07-12

本批把 Meshova 从程序化贴图生成扩展到制造过程表达，并提供 OpenPBR 语义映射与 MaterialX 文件。实现仍保持确定性、CPU 可运行、无静态位图依赖。

## 快速使用

烘焙全部 10 套材质：

```bash
pnpm materials-fifth:bake -- 512
```

只烘焙一套：

```bash
pnpm materials-fifth:bake -- 512 clearcoatCarbonFiber
```

输出位于 `out/materials/fifth-batch/<材质名>/`。每套包含 19 张 PBR PNG、一个 `.openpbr.json`、一个 `.mtlx`。

TypeScript 调用：

```ts
import {
  FIFTH_BATCH_MATERIALS,
  exportOpenPBRMaterial,
} from "meshova";

const material = FIFTH_BATCH_MATERIALS.dispersiveCutGem(512, {
  seed: 505,
  amount: 0.9,
});
const output = exportOpenPBRMaterial(material, "gem");
```

## 内核 API

| API | 输入 | 输出 | 用途 |
|---|---|---|---|
| `evaluateMicrofacet` | NDF、角度余弦、粗糙度、F0 | D/G/F、能量补偿、响应 | GGX、Beckmann、Charlie 基准计算 |
| `makeDualAnisotropyField` | 种子、方向、交织频率 | 双方向、双强度、交叉遮罩 | 碳纤维、织物、拉丝层 |
| `spectralIor` / `diffractionColor` | IOR、阿贝数、波长或相位 | 色散 IOR、RGB 光谱近似 | 宝石、全息膜、氧化彩 |
| `growGrains` | 晶核数、迭代、种子 | 晶粒 ID、晶界、晶向 | 镀锌、烧结、晶体表面 |
| `depositCurves` | 曲线数、宽度、波纹、珠频率 | 沉积、中心线、方向 | 焊珠、胶线、流挂 |
| `simulateDroplets` | 液滴数、半径、合并、蒸发 | 液滴高度、湿度、残留 | 冷凝、指纹污染、湿痕 |
| `simulateManufacturing` | `cutting/forging/coating/sintering` | 高度、粗糙度、热、沉积、方向 | 制造过程统一入口 |
| `makeTextureSeamless` | 任意贴图、边界混合宽度 | 新的无缝贴图 | 自动边界修复，不修改输入 |
| `analyzeManufacturingQuality` | 贴图、可选法线 | 接缝、Mip、频带、法线能量 | 自动质量门禁 |
| `fitMaterialParameters` | 目标、候选参数、渲染函数 | 最优候选与感知分数 | 有限候选反向拟合 |

## 材质清单

| 材质键 | 主要机制 |
|---|---|
| `clearcoatCarbonFiber` | 斜纹编织、双层各向异性、清漆 |
| `etchedDamascusSteel` | 锻造流线、腐蚀显纹、方向反射 |
| `weldedHeatTintSteel` | 焊珠、热影响区、温度氧化彩 |
| `galvanizedSpangleSteel` | 晶粒生长、晶界、晶向 |
| `dispersiveCutGem` | 切面、透射、色散、体吸收 |
| `holographicDiffractionFilm` | 光栅、方向频谱、薄膜虹彩 |
| `laminatedPlywood` | 层材截面、胶层、木纹方向 |
| `powderCoatedMetal` | 颗粒沉积、橘皮、清漆粗糙度 |
| `contaminatedCondensationSurface` | 液滴合并、蒸发环、指纹、湿痕 |
| `kilnFiredClay` | 烧结孔隙、温度梯度、釉料流挂 |

## 通道与互通

材质保持 19 通道：标准 7 通道、扩展 4 通道、分层着色 8 通道。`exportOpenPBRMaterial` 额外生成：

- `<name>.openpbr.json`：OpenPBR 参数名、纹理绑定、色彩空间、IOR、色散与层参数。
- `<name>.mtlx`：MaterialX 1.39 `standard_surface` 文档，绑定基础色、金属度、粗糙度、法线、清漆、透射。

浏览器材质实验室使用 Three.js `MeshPhysicalMaterial` 预览透射、清漆、Sheen、虹彩、各向异性与色散。

## 复刻边界

- 光谱、色散、衍射与焦散是 RGB/贴图域近似，不替代光谱路径追踪器。
- 制造过程模拟表达稳定视觉特征，不求材料科学级时间积分。
- MaterialX 输出采用通用 `standard_surface`，OpenPBR JSON 保留 OpenPBR 语义；不同 DCC 的节点定义支持度需在导入端验证。
- 参数拟合当前是确定性有限候选搜索。它不包含 VLM、图像编码器或梯度优化器。
