# Sebastian Lague 程序化地形学习记录

来源播放列表：<https://www.youtube.com/playlist?list=PLFt_AvWsXl0eBW2EiBtl_sxmDtSgZBxB3>

没有下载视频本体。下面实现基于公开播放列表元数据、分集结构和 MIT 许可公开仓库的架构信息整理，并按 Meshova 的 TypeScript 高度场流程重写。

## 已检查分集

1. Procedural Landmass Generation (E01: Introduction)
2. Procedural Landmass Generation (E02: Noise Map)
3. Procedural Landmass Generation (E03: Octaves)
4. Procedural Landmass Generation (E04: Colours)
5. Procedural Landmass Generation (E05: Mesh)
6. Procedural Landmass Generation (E06: LOD)
7. Procedural Landmass Generation (E07: Endless terrain)
8. Procedural Landmass Generation (E08: Threading)
9. Procedural Landmass Generation (E09: LOD switching)
10. Procedural Landmass Generation (E10: seams)
11. Procedural Landmass Generation (E11: falloff map)
12. Procedural Landmass Generation (E12: normals)
13. Procedural Landmass Generation (E13: collisions)
14. Procedural Landmass Generation (E14: flatshading)
15. Procedural Landmass Generation (E15: data storage)
16. Procedural Landmass Generation (E16: colour shader)
17. Procedural Landmass Generation (E17: texture shader)
18. Procedural Landmass Generation (E18: fixes and optimization)
19. Procedural Landmass Generation (E19: refactoring 1/2)
20. Procedural Landmass Generation (E20: refactoring 2/2)
21. Procedural Landmass Generation (E21: fixing gaps)

## Meshova 映射

- E01-E03 -> `generateLandmassNoiseMap`：seeded 分层 Perlin 噪声，支持 octave、persistence、lacunarity、offset、本地/全局归一化。
- E04 -> `classifyLandmassTerrain`：归一化高度阈值映射为地形带和逐顶点颜色。
- E05 -> `landmassHeightfieldToMesh`：把 `Field2D` 转成 Meshova indexed mesh。
- E06-E10/E21 -> `lod`、`edgeLODs`、`skirtDepth`、`LandmassChunkStreamer`：通过采样步长降密度，细边贴合粗边，裙边遮蔽 T 接缝；异步请求去重、LOD 调度、LRU 缓存可接 Web Worker。
- E11 -> `generateLandmassFalloffMap` + `applyLandmassFalloff`：扣低边缘高度，形成岛屿海岸。
- E12-E14 -> `recomputeNormals` 或 `flatShaded` 顶点复制。
- E15-E20 -> 用 options object 表达数据配置，不照搬 Unity ScriptableObject/shader。

## Meshova 增强

- `erosion` 把现有水力/热力侵蚀内核接入 landmass 管线，输出 `wear`、`deposition`、`flow` 数据图。
- 区块侵蚀默认保留边界采样值，避免相邻区块因独立迭代产生高度裂缝。
- 流送层只负责确定性调度与缓存；浏览器重计算可通过 `generateChunk` 注入 Web Worker。
