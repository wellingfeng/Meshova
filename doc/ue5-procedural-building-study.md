# UE5 程序化建筑课程拆解与 Meshova 复刻

参考：`BV1oK87zTEhP`，Procedural Minds 的 UE5.3 PCG/蓝图建筑课程，共 12 集、约 5 小时 49 分。

本地学习副本：`ref/videos/procedural-building-ue5/`。每集 12 点抽帧：`ref/videos/procedural-building-ue5/contact-sheets/`。

## 课程结构

1. 样条线定义建筑轮廓；按固定间距采样为墙体模块点。
2. 门以墙段索引替换；楼层参数驱动外墙、楼板、屋顶循环复制。
3. 内缩轮廓得到室内范围；房间点和分割线生成独立房间。
4. 房间规则逐层复制，形成多层室内布局。
5. `层高 ÷ 目标踏步高` 得到台阶数；索引驱动每级位移和旋转。
6. 外饰依附墙段局部坐标，生成檐线、阳台、栏杆等细节。
7. 重复楼层逻辑封装为 PCG 循环子图。
8. 室内数据增加墙侧、楼层、房间类型等属性，减少错误连接。
9. 房间标签用于隔离、筛选和单独处理特定房间。
10. Transform Points 使用属性控制位置、旋转、缩放和基点。
11. 顶层轮廓生成屋顶面、屋檐和屋顶附件。
12. 家具读取房间范围与类型，按可用空间缩放、朝向、摆放。

## Meshova 对应实现

`buildProceduralBuilding` 把课程规则重写成 TypeScript 几何语法，不复制 UE 蓝图或课程资产：

- 支持矩形、L 形、任意自定义多边形轮廓。
- 轮廓边按 `facadeModule` 离散为立面模块。
- 首层正面中心模块替换为门，其余模块生成真实墙洞、玻璃、窗框。
- `floors` 循环生成楼板、外墙、室内隔墙、房间和家具。
- 中央走廊两侧切分房间，房间带 `living/kitchen/bedroom/study` 语义。
- U 形楼梯按层高自动计算踏步数、踏步高和踏面深度。
- 家具按房间类型和边界自适应尺寸、位置；种子保证确定性。
- 外饰生成楼层檐线、阳台、栏杆、雨水管。
- 矩形支持双坡/四坡屋顶；L 形和自定义轮廓使用贴合轮廓的平屋顶女儿墙。
- `revealInterior` 切除正立面和屋顶，直接检查多层室内。

## 入口

- 核心：`src/models/procedural-building.ts`
- 示例：`pnpm procedural-building`
- 查看器模型：`procedural-building`
- 测试：`test/procedural-building.test.ts`
- 外观截图：`out/shots/procedural-building-exterior.png`
- 室内剖切：`out/shots/procedural-building-front.png`
