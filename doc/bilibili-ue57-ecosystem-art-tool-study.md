# UE5.7 生态艺术工具视频学习

- 来源：<https://www.bilibili.com/video/BV1459jBxEzE/>
- 标题：`【PCG+AI制作】UE5.7 生态艺术工具—介绍`
- 本地视频：`ref/video/BV1459jBxEzE-ue57-ecosystem-tool.mp4`

## 视频机制

1. 用 DataTable 保存项目级生态预设，按乔木、灌木、草、石头逐层叠加。
2. 用地形 Layer、贴图/笔刷范围控制生成与排除区域。
3. 通用参数覆盖密度、间距、缩放、坡度、朝向、中心聚类、二次资产叠加。
4. 百万点场景避免逐点蓝图；作者改用 C++、HLSL/GPU 节点降低生成耗时和内存。
5. 结果可转 Foliage Actor、HISM/Static Mesh Actor，并按地形分块烘焙。

## Meshova 现状

已有 `pcg-forest`、`MaskField`、`ScatterTable`、空间自裁剪、GPU `InstanceBufferGroup`、植被与地形核。缺少把这些能力收口成同一套“生态层表 → 掩码 → 散布 → 分块烘焙”工具。

## 本次复刻

新增 `ecosystem-art-tool`：

- 声明式生态层和资产槽；
- 坡度、高度、噪声、道路距离、笔刷清除区组合掩码；
- 确定性密度筛选、缩放/朝向、空间自裁剪；
- 按空间块生成 GPU 实例缓冲，等价于 HISM 分块准备数据；
- 输出乔木、灌木、草本、岩石、道路、地形到模型库；
- 提供密度、坡度、间距、聚类尺度、笔刷空区、分块尺寸、季节、种子参数。

未照搬 UE 蓝图或源码；仅按视频公开工作流在 Meshova 内核上独立实现。
