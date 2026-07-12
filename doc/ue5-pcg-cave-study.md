# UE5 PCG 程序化山洞复刻笔记

参考视频：`BV1e9bazqE25`，共 4 段，约 44 分钟。视频已下载到 `out/reference/procedural-cave/`，关键帧在其 `contact-sheets/` 子目录。

## 视频方法

1. 用样条 Actor 绘制主洞、回环和支路。
2. PCG 图读取样条数据，重采样为稳定的路径点。
3. Geometry Script 沿样条生成动态管状网格，修复退化面，体素包裹并平滑交叉处。
4. 壳体加厚、翻转洞穴内壁法线，再用噪声位移打破规则圆管。
5. PCG 将动态网格转成可采样表面，按法线区分洞底、洞壁、顶部。
6. 各分区散布不同岩石静态网格；随机缩放、旋转并对齐表面法线。

## Meshova 映射

`ue5-pcg-cave` 使用等价但更适合脚本内核的实现：

- 样条网络转为分段距离场，主洞、回环、支路直接做 SDF 并集。
- Marching Cubes 一次生成无缝交叉口，避免多根 sweep 管重叠和接缝。
- 洞口落在体素边界，网格保持开放；`solidify` 生成岩壁厚度和洞口边缘。
- 两层 seeded fBm 控制大形崎岖与表面碎岩，结果完全确定。
- 按内壁三角面法线分出洞底、洞壁、顶部，再做蓝噪声岩块散布。

入口：`buildUe5PcgCaveMesh`、`buildUe5PcgCaveParts`；网页模型 ID：`ue5-pcg-cave`。
