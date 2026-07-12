# 《咱的各种城堡》28 分P程序化复刻

- 来源：Bilibili `BV1XhZvBwEAF`
- 本地视频：`ref/bilibili-bv1x-castle/series/`
- 总览帧：`ref/bilibili-bv1x-castle/series-contact-sheet.jpg`
- 四时刻分镜：`ref/bilibili-bv1x-castle/storyboards/`

## 覆盖策略

28 个分P包含重复城堡的季节、天气、建设、农事镜头。按独立轮廓归并为 16 套程序化建筑：第 1 P水围庄园已有专用生成器；本轮新增 15 套。非城堡主体分P复用最接近的建筑原型，不重复复制同一拓扑。

| 分P | 画面核心 | 程序化覆盖 |
| --- | --- | --- |
| 1 | 水围方堡、圆塔、礼堂、瞭望塔 | `bilibili-manor-castle` |
| 2 | 暖石双塔门堡 | `bilibili-earl-gate-castle` |
| 3 | 水环方堡、宴会主厅 | `bilibili-baron-moat-castle` |
| 4 | 骑士城堡建设过程 | 复用第 2、3 P构件语法 |
| 5 | 圆形木栅岛堡、方形主塔 | `bilibili-wooden-island-fort` |
| 6 | 城堡与富裕小镇 | 复用第 7 P环城贸易要塞 |
| 7 | 环城水系、密集城区、中央高堡 | `bilibili-trade-citadel` |
| 8 | 狭长山脊城堡 | `bilibili-ridge-castle` |
| 9 | 密集灰岩军事堡群 | `bilibili-military-stronghold` |
| 10 | 田园城堡四季 | 复用第 1 P水围庄园参数 |
| 11 | 小型开荒木堡 | `bilibili-frontier-wood-fort` |
| 12 | 水车、风车磨坊 | 复用现有程序化水车与风车模型 |
| 13 | 温馨农场庄园 | 复用第 20 P动漫山堡语法 |
| 14 | 磨坊庄园 | 复用第 5 P木栅岛堡与现有磨坊 |
| 15 | 紧凑院落城堡 | 复用第 3 P水环方堡参数 |
| 16 | 木墙骑士领 | 复用第 5、11 P木栅语法 |
| 17 | 深色紧凑环堡 | `bilibili-blackstone-castle` |
| 18 | 河道岩岛废墟 | `bilibili-river-ruin` |
| 19 | 城外耕作 | 复用第 5 P木栅岛堡 |
| 20 | 明亮温馨三塔山堡 | `bilibili-anime-hill-castle` |
| 21 | 奇幻高塔山堡 | `bilibili-fantasy-hill-castle` |
| 22 | 晨雾城堡村庄 | 复用第 7 P环城贸易要塞 |
| 23 | 环形残墙、内湖、孤塔 | `bilibili-ring-ruin` |
| 24 | 雨中小城堡 | 复用第 20 P动漫山堡深色环境 |
| 25 | 四角塔贵族庄园、正门桥 | `bilibili-grand-manor-castle` |
| 26 | 城堡外农事 | 复用第 25 P贵族庄园 |
| 27 | 雾中孤岛废弃主堡 | `bilibili-mist-keep` |
| 28 | 岩壁建筑、石阶、烽火台 | `bilibili-cliff-beacon` |

## 共享参数

- `seed`：民居、花丛等确定性分布。
- `scale`：整体缩放。
- `wallHeight`：幕墙纵向比例。
- `towerScale`：塔楼和内堡高度。
- `detail`：垛口、木栅、城内建筑密度。
- `colorVariation`：石材和木构面级色差。
