# 生产级程序化材质流水线

`production-materials.ts` 复用现有三平面投影、方向场、天气运输、Tile Sampler、PBR 校验与五套城市材质，补齐统一生产入口。

## 面向模型的生产系统

- `bakeGeometryToTextures`：烘焙高度、AO、曲率、覆盖、对象 ID、材质 ID、归一化位置、世界法线、厚度。
- `geometryAwareMasks` / `applyGeometryAwareWeathering`：按凹槽、边缘、朝向、位置生成积尘、磨损、雨淋。
- `wangTileTexture`：边码约束、90° 旋转、颜色均衡、确定性随机，降低重复平铺。
- `splinePathMask`：统一生成裂缝、焊缝、电缆、道路、砖缝、贴花路径遮罩。
- `MaterialAnchors`：不可变保存并引用中间贴图；五套城市材质默认暴露高度、AO、粗糙度、金属度 Anchor。
- `fitTextureReference`：颜色与边缘联合指标驱动的确定性黑盒参数拟合。
- `compileTextureCompute` / `executeTextureCompute`：同一像素表达式生成 CPU 执行器与 WGSL Compute；无 GPU 自动回退 CPU。

推荐资产流程：网格贴图烘焙 → 基础材质 → 3D 感知老化 → Anchor 层叠 → Wang 平铺/路径贴花 → 参考拟合 → Mip 与质量检查 → CPU/WebGPU 烘焙。

## 能力

- `periodicField`：周期坐标包装，保证字段级无缝。
- `antiAliasField`：确定性分层超采样，压制细线、格栅、砖缝锯齿。
- `generateMipChain` / `generateMaterialMipChains`：完整 Mip 链；法线逐级重归一化。
- `applyMaterialWeathering`：复用 `weatheringTransport`，生成湿润、盐析、霉斑、剥落并同步修改 PBR 通道。
- `MaterialBakeCache`：按材质、尺寸、参数、老化配置缓存 CPU 烘焙结果。
- `compileSemanticMaterial`：把“潮湿破旧混凝土”等中文/英文描述编译为五套材质的稳定语义参数。
- `bakeProductionMaterial`：统一返回材质、Mip、通道质量报告、语义解析与缓存命中状态。

## 示例

```ts
const result = bakeProductionMaterial("潮湿破旧混凝土", 512, {
  weathering: { amount: 0.65, rainfall: 0.8, seed: 7 },
});

result.material;
result.mipmaps.normal;
result.quality.baseColor;
result.semantic;
```

缓存中的材质按不可变对象使用。需要隔离修改时，调用方应复制对应 `TextureBuffer`。

## 游戏资产流水线

- `bakeHighToLowTextures`：Cage 高低模射线转移、切线/世界法线、命中距离、重叠与漏烘诊断、接缝扩边。
- `analyzeTexelDensity`：按三角形世界面积加权检查 Texel Density。
- `compileMaterialGraph`：类型检查、环检测、拓扑排序、公共子表达式消除、按 revision 增量重算。
- `analyzeUdimLayout`：UDIM 占用、跨 Tile 三角形、非法 UV 检查。
- `bakeVirtualTexturePage` / `sampleNoRepeat`：全局坐标分页与连续随机无重复采样。
- `fitTextureReferences`：多视角或多通道共享参数拟合；`removeReferenceLighting` 分离低频光照。
- `describeLayeredMaterial`：从现有高级 PBR 材质生成 glTF 扩展描述与 MaterialX Standard Surface。
- `compareTextureResults` / `analyzeMaterialConformance`：CPU/WebGPU 误差、法线长度、介电反照率与通道结构基准。
