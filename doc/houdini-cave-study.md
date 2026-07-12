# Houdini 程序化山洞复刻笔记

## 源场景

- 文件：`Houdini 程序化生成山洞 以及 岩石.hip`
- Houdini：19.5.303
- 场景包可按 cpio 结构读取，未依赖 Houdini CLI。
- 仅分析节点、连接和参数；Meshova 实现为独立 TypeScript/SDF 重写。

## 原始节点链

```text
Sphere(30,10,20)
  -> Mountain(height 8.44, element size 9.11)
  -> Boolean subtract Entrance Sphere
  -> PolyExtrude(distance 1.364)
  -> VDB From Polygons(voxel 0.075)
  -> VDB Smooth SDF(mean, radius 5, iterations 4)
  -> VDB Analysis(gradient)
  -> Volume VOP(direction noise displacement)
  -> Convert VDB
```

入口球原参数：

- 半径：`(6.959, 8.291, 5.982)`
- 位置：`(-26.294, 4.192, -4.982)`
- 布尔：`A minus B`

Volume VOP 的核心关系：

```text
gradient(SDF) -> negate -> normalize
anisotropic noise(freq 0.1, 0.8, 0.8)
normal * noise + position
sample SDF at displaced position
```

## Meshova 映射

| Houdini | Meshova |
|---|---|
| 多边形椭球 | `sdfEllipsoid` |
| Mountain | 两层 seeded fBm 距离位移 |
| Surface Boolean | 空心壳体减入口椭球 |
| PolyExtrude | SDF 等距壳 `max(-d, d-thickness)` |
| VDB Smooth | 平滑布尔接缝 |
| Gradient noise displacement | 各向异性 seeded fBm 距离扰动 |
| Convert VDB | `polygonizeField` marching cubes |
| 岩石对象 | 3 个 seeded `rock()` 入口变体 |

入口朝向整体旋转到 `+Z`，便于 Meshova 默认相机直接看到洞口；比例和拓扑方法保持一致。

## 产物

- 核心：`src/models/houdini-cave.ts`
- 示例：`examples/houdini-cave.ts`
- 测试：`test/houdini-cave.test.ts`
- 查看器模型：`houdini-cave`
- 输出：`out/houdini-cave.{obj,mtl,json}`
