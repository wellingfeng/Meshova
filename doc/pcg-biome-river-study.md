# UE5 PCG Biome River 学习与复刻

## 源资产结论

源项目使用 UE 5.4 PCG。核心入口：

- `PCG_BiomeRiver`：完整生态图。
- `PCG_BiomeRiver_SimpleWind`：简化风版本。
- `PCG_BiomeRiver_Cinematic`：高质量版本。
- `DT_BiomeRiver`：三个图版本与网格集合绑定。
- `BP_PCG_BiomeWater_Partitioned`：分区生成 Actor。

完整图包含 512 个节点。主要节点统计：100 个 Static Mesh Spawner、55 个密度过滤、34 个点变换、21 个属性噪声、14 个空间噪声、12 个差集、11 个投影、10 个自剪枝。

## 生成管线

```mermaid
flowchart LR
  A[Landscape 与河道 Spline] --> B[水体与岸带区域]
  B --> C[表面采样]
  C --> D[密度噪声与曲线重映射]
  D --> E[高度、距离、边界过滤]
  E --> F[自剪枝与种子稳定化]
  F --> G[数据表选择网格变体]
  G --> H[随机旋转缩放与生成]
```

生态层按水深和离岸距离组织：

- 水内：睡莲、水草、漂流木。
- 水边：绿色芦苇、岩石。
- 外岸：枯黄芦苇、槭树灌丛、枯木堆。
- 全局：Landscape 投影、排除体积、分区生成、确定性种子。

## Meshova 映射

`buildPcgBiomeRiverParts()` 用同构脚本管线重写，不复制 UE 蓝图：

- `buildRiverSystem2D` 生成确定性中心线和湿地地形场。
- `roadRibbon` 生成泥岸带与缓流水面。
- 沿中心线按离岸区间分层采样。
- 每层使用独立密度、尺度、变体和材质。
- 暴露河宽、蜿蜒、芦苇、睡莲、灌丛、岩石、枯木、种子参数。

实现入口：`src/models/pcg-biome-river.ts`。浏览器模型 ID：`pcg-biome-river`。
