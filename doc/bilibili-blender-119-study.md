# Blender 百景程序化复刻

- 来源：<https://www.bilibili.com/video/BV1nx421972j>
- 标题：`【Blender】上百个小场景案例 pro版`
- 规模：119 集，约 40 小时
- 本地参考：`ref/bilibili-blender-119/`
- 模型入口：`BLENDER_119_SCENES`、`buildBlender119SceneParts()`
- 网页分类：`Blender 百景复刻`
- 批量导出：`pnpm blender-119`
- 断点下载：`pnpm blender-119:download`
- 提取关键帧：`pnpm blender-119:frames`
- 视频校验：`pnpm blender-119:verify`

## 复刻策略

每个分集对应一个独立模型 ID。场景按乡村、城市、赛博、水景、海岸、山地、奇幻、载具、角色、气象、特效、地标、工业、作品集十四类共享生成器。标题语义继续驱动专属特征件：风车、水车、电车、瀑布、火焰、外星飞船、传送门、三叉戟、大炮等。

全部模型使用确定性种子、低面数几何、面级色差、语义部件标签。原始分集编号和模型键仅作稳定内部标识。
