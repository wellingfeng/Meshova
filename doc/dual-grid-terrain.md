# 双网格程序化地形

参考视频：Bilibili `BV1WaH9eTEPU`《给种田游戏添加程序化地形生成（双网格系统、无限地形）》；原视频链接见其简介。参考视频已下载到 `out/reference/dual-grid-terrain/BV1WaH9eTEPU.mp4`，仅作为本地研究资料。

## 核心结构

双网格把“数据采样点”和“渲染单元”错开半格：每个渲染单元读取四个相邻采样点，得到 `0..15` 的四位掩码。Meshova 不存死网格块，而是根据掩码实时生成平滑过渡面。

```text
采样点 A ----- B
       | mask  |
       D ----- C

bit0=A  bit1=B  bit2=C  bit3=D
```

`buildDualGridLayer()` 对每个过渡单元执行平滑双线性采样、阈值裁切、顶面三角化、边界裙边生成。不同地表类型分别建层：泥土作底板，草地和石路使用不同层高，得到视频里的圆角边界和立体草沿。

## API

- `createDualGrid(rows, origin)`：从二维语义采样创建网格。
- `dualGridMask(grid, target, x, z)`：返回单元的 16 类掩码。
- `countDualGridCases(grid, target)`：统计完整块和过渡块。
- `buildDualGridLayer(grid, target, options)`：生成目标语义层网格。
- `createDualGridChunk(chunkX, chunkZ, cellsX, cellsZ, sample)`：用全局坐标采样无限分块，保证相邻块共享边界值。

## 场景

`buildDualGridFarm()` 复刻视频里的低多边形农场构图：双网格草地、裸露农田、石路、农舍、白色围栏、果树、作物。所有随机量由 `seed` 控制，参数可在网页查看器实时调整。

```powershell
pnpm dual-grid-farm
pnpm build
pnpm shot dual-grid-farm "persp,top,orbit:35@22" "" "pbr"
```

输出：`out/dual-grid-farm.{obj,mtl,json}` 和 `out/shots/dual-grid-farm-*.png`。
