# 第二批高级程序化材质

## 目标

第二批从“逐个仿成品”转向“复刻可组合能力”。全部材质由 TypeScript 实时生成，不依赖静态贴图；输出 baseColor、metallic、roughness、normal、AO、height、emission 七通道。

## 通用能力

- `Flood Fill`：连通块标记、单元随机、单元梯度。
- `Distance / Bevel`：砖块、瓦片、浮雕轮廓。
- `Directional Warp / Slope Blur`：侵蚀、纤维、层理扭曲。
- `Histogram Scan / Curve / Ramp`：遮罩提取与色阶塑形。
- `buildLayeredWearMasks`：统一生成边缘磨损、凹槽积污、掉漆、划痕四层遮罩。

## 材质清单

| ID | 材质 | 复刻重点 |
|---|---|---|
| `damagedPaintedMetal` | 破损喷漆金属 | 涂层/裸金属/锈蚀物理分层 |
| `forestGround` | 森林地表 | 泥土、石块、落叶、枝条多尺度混合 |
| `treeBarkRings` | 树皮与年轮 | 径向方向场、纤维、裂缝 |
| `wovenFabric` | 高级编织物 | 经纬交错、斜纹高低、绒毛微表面 |
| `layeredCliff` | 岩层悬崖 | 定向层理、侵蚀、断裂 |
| `floodFillBrickWall` | 随机砖墙 | 单砖随机、砂浆、破角 |
| `layeredRoofTiles` | 叠层屋瓦 | 弧面瓦片、错列、搭接阴影 |
| `agedLeather` | 做旧皮革 | 皱褶、毛孔、划痕、油脂磨损 |
| `ornamentalPattern` | 程序化装饰花纹 | SDF、旋转对称、边框重复、浮雕 |

## 使用

```powershell
pnpm materials-advanced:bake
pnpm materials-advanced:bake -- 512 damagedPaintedMetal
```

输出位于 `out/materials/advanced-second-batch/`。浏览器材质实验室新增“第二批高级材质 9 套”分类，可实时调种子、密度、细节、磨损、颜色、粗糙度。
