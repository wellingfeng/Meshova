# Townscaper 程序化港湾研究

## 参考材料

- `BV1Br421M7Vm`：《地图随机生成》波函数坍缩算法是如何实现的。
- `BV1y7rfBgEpM`：《程序化生成的两难困境与 Oskar Stålberg 的天才解法》；重点展示模块替换、网格松弛、随机溶边和规则触发。
- Oskar Stålberg Townscaper 页面：<https://oskarstalberg.com/Townscaper/>。
- Game Developer 技术回顾：<https://www.gamedeveloper.com/game-platforms/how-townscaper-works-a-story-four-games-in-the-making>。
- Sketchpunk Labs 有机网格资料：<https://sketchpunklabs.github.io/irregular_grid/>。
- Kai Denrei 的公开算法笔记：<https://github.com/kai-denrei/oskar-procedure>。

原视频、元数据、关键帧和只读公开资料保存在 `ref/townscaper/`，该目录不入库。

## 技术结论

Townscaper 的视觉稳定性来自组合系统，不是单一 WFC：

1. 三角网格随机溶边，合并为四边形。
2. 面中心与共享边中点细分，保证最终全四边形。
3. 顶点松弛到近似等距，得到可变形但仍适配手工模块的有机网格。
4. 状态放在角点或层级占用上；一个单元读取邻居后选择墙、屋顶、拱、支柱、桥等表现。
5. 模块通过双线性或三线性映射贴合目标四边形，接缝保持一致。
6. 色板、圆角、低频水波、软阴影共同建立玩具港湾观感。

## Meshova 实现

`src/models/townscaper.ts` 使用独立重写的轻量版本：

- 稳定种子生成扭曲四边格，三轮邻域松弛抑制坏面。
- 密度场和蜿蜒运河生成分层占用；参数变化后重新计算全部拓扑表现。
- 邻接高度差自动派生外墙、逐层窗、底层拱券、临水支柱、屋顶和跨运河连廊。
- 三组程序化色板绑定灰泥、陶瓦、玻璃、木材和水体材质。
- 水体复用 Meshova 动态水材质，暴露波高参数。

## 中式重檐版本

- `BV1nR4y1v715`：《【波函数坍缩】用 Unity 实现 Townscaper》；单视频，22 分 49 秒。
- 视频、元数据、封面和每 20 秒参考帧保存在 `ref/townscaper/`，该目录不入库。
- `src/models/chinese-townscaper.ts` 新增中式岛城：邻接占用决定殿堂朝向与模块类型，交汇单元必定生成重檐，其余单元按参数触发重檐。
- 建筑复用 Meshova 原创中式木构内核，组合台基、木柱、额枋、斗拱、檐椽、灰瓦曲面屋顶、格扇与脊兽；未复制视频项目资产或源码。
- 场景自动派生岛岸、水渠、邻接石板路和跨渠石桥；网页查看器暴露网格、密度、重檐比例、翼角起翘和水面参数。

当前版本复刻核心交互结果与美术规律，不复制 Townscaper 资产、网格或专有规则表。后续若加入逐格点击编辑，应把单元占用持久化为可编辑层，并局部重建受影响邻域。
