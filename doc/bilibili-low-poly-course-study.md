# Low Poly 系列课程研究

- 来源：<https://www.bilibili.com/video/BV11s411e7Sa>
- 标题：抽象就是艺术——Low Poly 教程一套（Blender 制作）
- 规模：16 集，约 6.9 小时
- 本地参考：`ref/low-poly-course/`

## 视觉规则

1. 几何先低面数：轮廓由少量大平面构成，不靠高模加贴图伪装。
2. 法线按面：硬切面承担主要明暗节奏。
3. 面级色差：同一材质在相邻面产生小幅明度变化，避免纯色塑料感。
4. 材质克制：高粗糙、低金属、少纹理；造型和配色优先。
5. 场景采用大色块：草地、道路、建筑、岩石、植被分组明确。

## 落库映射

| 课程内容 | Meshova 模型 | 核心复刻点 |
| --- | --- | --- |
| First LowPoly scene | `low-poly-village` | 俯视村落、弯曲道路、蓝灰屋顶、树群边界 |
| LowPoly Clouds / Landscapes | `low-poly-cloud-valley` | 多面群山、前景树、低多边形云带 |
| Tropical island | `low-poly-tropical-island` | 沙洲、岛心植被、火山岩、棕榈、远景云 |
| Low-Poly Trees | `low-poly-tree-kit` | 阔叶、针叶、棕榈三类低面数树形 |

## 实现入口

- 几何风格：`styleLowPolyMesh()`、`facetedMesh()`
- 场景生成：`buildLowPolySceneParts()` 与四个专用 builder
- 查看器：调试视图中的 `Low Poly 面光照`
- CLI：`pnpm low-poly-scenes`
