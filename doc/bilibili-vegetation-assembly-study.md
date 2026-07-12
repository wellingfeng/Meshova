# 植被组合 Assembly Collection 技术复刻

参考视频：`BV1LZftBWELc`《植被组合 AssemblyCollection UE5_PCG教程》。本地分析副本与关键帧位于 `out/reference/BV1LZftBWELc/`。

## 视频方法

1. 先在场景中手工摆出一个完成度高的小型植被组合，确定主树、灌木、花簇、地被、景石的前中后层次。
2. 将组合成员记录为 Assembly Data Asset。每个成员保存 `Species`、`Type`、`Mesh`、相对位置、旋转、缩放。
3. PCG Graph 读取 Data Asset，把记录转换为点和属性，再交给 Static Mesh Spawner。
4. 以 Assembly Actor 的世界位置生成稳定随机种子。同一位置结果稳定；移动组合后，同类资产产生新变体。
5. 资产替换受 `Species + Type` 约束。主树只换主树，花簇只换花簇，景石只换景石；相对构图不变。

## Meshova 对应实现

- `VegetationAssemblyCollection`：组合模板与语义槽位。
- `VegetationAssemblySlot`：人类可读标签、`species`、`type`、首选资产、相对 TRS。
- `VegetationAssemblyAsset`：同类候选资产及惰性程序化构建函数。
- `resolveVegetationAssembly()`：位置种子、同类过滤、加权变体、轻微姿态扰动。
- `buildVegetationAssembly()`：构建选中资产、应用槽位 TRS 与根 TRS、保留语义元数据。

实现完全程序化，不复制视频或 UE 工程中的网格、材质、蓝图。

## 模型库预设

- `assembly-flower-island`：花境岛，圆冠主树、彩色花簇、灌木和景石。
- `assembly-woodland-edge`：林缘组合，深浅绿层次、蕨类地被和苔石。
- `assembly-dry-rockery`：旱溪岩组，针叶主景、暖色花草和层叠岩石。

三个预设均可调随机种子、位置种子、构图展开、主树比例、地被密度。
