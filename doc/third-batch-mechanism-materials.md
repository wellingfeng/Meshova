# 第三批机制材质

更新日期：2026-07-12

第三批从“噪声拼配”升级到可复用表面机制：水流汇聚、侵蚀沉积、覆盖融化、方向场、透射、透明裁剪、各向异性。所有输出由 TypeScript 确定性生成，不依赖外部位图。

## 快速使用

批量烘焙 10 套材质，每套输出 11 张 PNG：

```bash
pnpm materials-third:bake -- 512
```

只烘焙湿泥积水：

```bash
pnpm materials-third:bake -- 512 wetMudPuddles
```

输出目录：`out/materials/third-batch/`。浏览器材质实验室中选择“第三批机制材质 10 套”可实时调参。

## 材质清单

| 标识 | 材质 | 新机制 |
|---|---|---|
| `meltingSnow` | 雪地与融雪 | 高度覆盖、坡度限制、融化边界、边缘湿润 |
| `wetMudPuddles` | 湿泥与积水 | D8 集水、沉积、凹地水洼、分层粗糙度 |
| `fracturedGlacierIce` | 冰川与碎冰 | 裂纹、气泡、透射贴图、冰层厚度 |
| `machinedBrushedMetal` | 拉丝机加工金属 | 环形方向场、刀纹、各向异性强度与旋转 |
| `continuousVeinMarble` | 连续脉络大理石 | 扰动方向场、三维噪声连续脉络 |
| `coolingLava` | 冷却熔岩 | 冷却壳、裂缝扩张、发光贴图 |
| `wornAsphaltRoad` | 磨损沥青道路 | 骨料、裂缝、补丁、标线磨损 |
| `spalledRebarConcrete` | 露筋破损混凝土 | 剥落层、骨料暴露、金属钢筋 |
| `vascularLeaf` | 叶片与叶脉 | SDF 轮廓、分叉叶脉、透明裁剪、薄层透射 |
| `sciFiHardSurfacePanel` | 科幻硬表面面板 | 面板切割、螺钉、通风口、发光贴花 |

## 通用内核

`material-mechanics.ts` 提供以下公共能力：

- `deriveHeightFeatures(height)`：从高度图派生坡度、凹腔、边缘、D8 集水、沉积和流向。
- `erodeHeight(height)`：沿高流量陡坡冲刷，在低坡汇水区沉积；不修改输入。
- `buildCoverageMasks(height)`：生成覆盖层、边界和湿润遮罩，支持坡度限制与融化。
- `makeDirectionField(size)`：生成线性、径向或旋涡方向场，支持种子化扰动。
- `ExtendedMaterial`：在标准 7 通道上增加 `opacity`、`transmission`、`anisotropy`、`anisotropyRotation`。

## 输出通道

标准通道：`baseColor`、`metallic`、`roughness`、`normal`、`ao`、`height`、`emission`。

扩展通道：

- `opacity`：叶片轮廓等透明裁剪。
- `transmission`：冰、水洼和薄叶透射。
- `anisotropy`：拉丝强度。
- `anisotropyRotation`：各向异性方向，`0..1` 映射到 `0..2π`。

`exportExtendedPBR()` 导出全部 11 通道。`validateExtendedMaterial()` 检查尺寸、通道数、物理范围和扩展物理参数。

## 参数

每套材质共享 7 个可编辑参数：随机种子、结构密度、细节层级、机制强度、主体颜色、次要颜色、基础粗糙度。`amount` 代表当前材质的主机制，例如融化量、积水量、裂隙发光量或剥落量。

## 复刻边界

- 当前水文是贴图域 D8 汇流，不替代大尺度地形水力模拟。
- 透射和各向异性在导出层保存为独立贴图；目标引擎需正确绑定对应 PBR 插槽。
- 叶片使用透明裁剪与薄层透射，不包含真实次表面散射。
- 材质追求机制与质感类别一致，不做参考图像像素级复制。
