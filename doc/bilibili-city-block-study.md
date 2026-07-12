# Bilibili 程序化街区参考拆解

参考源：

- BV1kk4y1t75G，小规模程序化街区快速生成，UP：wangtaian
- 本地视频：`ref/videos/block-tutorial.mp4`
- 抽帧：`ref/videos/block-tutorial-frames/`

视频章节：

- 01:13 Intro
- 02:22 Road Generator
- 05:30 Get Lot
- 08:15 Quixel Bridge Asset
- 10:50 Building Generator
- 15:30 Street Curb
- 21:00 Street Props
- 36:08 Manually offset curve

## 生成管线

视频核心不是单个小模型，而是一条街区装配链：

1. 路网输入：从 OSM/曲线源过滤道路，保留可生成的道路中心线。
2. 道路生成：中心线加宽成路面，生成交叉口、车道线、人行道边界。
3. 地块切分：从道路围合区域拿 lot/facet，得到可放建筑的 parcel。
4. 建筑生成：按 lot 点/面布设建筑，建筑自身由楼层、窗格、屋顶参数驱动。
5. 路缘生成：沿道路和人行道边界生成 curb/sidewalk。
6. 街道道具：在人行道点云上散布树、灯、垃圾桶、长椅、信号灯。
7. 曲线偏移：局部手工/程序偏移，打破完全规整的网格感。

## Meshova 对应

- `buildCityDistrictParts`：大尺度城区入口。
- `buildStreetNetwork`：路面、人行道、路缘、车道线、斑马线。
- `buildBlock`：block parcel，四边围合建筑，中心内院留空。
- `placeEdgeRun`：沿地块边布楼，加入 `lotJitter` 模拟偏移曲线。
- `buildBuildingParts`：程序化楼体，楼层、窗格、屋顶、水塔。
- `city-props`：街树、路灯、长椅、垃圾桶、信号灯复用现有模块。

## 本次复刻取向

不照搬视频资产；复刻结构逻辑。目标从“小规模街区”升级到“多 block 城区”：

- 默认 5 x 4 个 block。
- 每个 block 四边围合建筑，中间留内院。
- 连续路网，不是孤立一条街。
- 加入斑马线、curb、人行道、街树、路灯、长椅、垃圾桶、信号灯。
- 用统一 seed 保持确定性，换 seed 改布局。
