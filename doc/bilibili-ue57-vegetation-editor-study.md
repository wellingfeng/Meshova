# UE5.7 PCG Vegetation Editor 系列学习与 Meshova 复刻

来源：[BV18nmbBEEC4](https://www.bilibili.com/video/BV18nmbBEEC4/)，合集 `season_id=6929238`，UP 主“Matt的UE探索站”。

## 下载状态

- 已发现合集 12 集，保存于 `out/reference/bilibili-vegetation-editor/`。
- 每集包含 MP4、封面、`info.json`；公开预览音频已用 Whisper Small 转写到 `transcripts/`。
- 合集标称总时长约 2 小时 13 分；未登录接口只提供约 33 分钟“充电专属预览”。现有 MP4 是公开预览，不冒充完整正片。
- 未绕过付费墙。用户账号已购买或解锁后，可用合法登录态重新下载正片覆盖学习材料。

| 集 | BVID | 主题 | 标称时长 | 已下载公开预览 |
|---:|---|---|---:|---:|
| 1 | `BV18nmbBEEC4` | 概述、插件与项目设置 | 09:19 | 05:20 |
| 2 | `BV1hEmbBSEMf` | 基础操作、创建简单树木 | 19:54 | 05:20 |
| 3 | `BV1F3mGBnExc` | Carve：Radius、LengthFromRoot | 16:18 | 03:20 |
| 4 | `BV18zmjBmE5A` | Carve：FormBottom、ZPosition | 11:30 | 03:20 |
| 5 | `BV1b9meBcEvA` | Gravity、整体 Scale | 09:14 | 02:20 |
| 6 | `BV1K7qsBBEPw` | Remove Branches | 08:34 | 02:20 |
| 7 | `BV1FBqbB6EDF` | Mesh Builder | 14:08 | 02:20 |
| 8 | `BV1Y5qJBNELf` | Bone Reduction | 01:28 | 00:20 |
| 9 | `BV1qKqJB6Egz` | 叶片密度与分布 | 09:12 | 02:20 |
| 10 | `BV1pPqZB4E1d` | 叶片缩放规律 | 05:03 | 00:20 |
| 11 | `BV1mRqoBaEAE` | 叶片排列、角度、资源 | 06:20 | 01:20 |
| 12 | `BV1YUqBB9EvX` | PCG 场景集成与动态风 | 21:59 | 04:20 |

## 方法提炼

课程把植被生成拆成固定顺序，适合 Meshova 的脚本式 DSL：

1. 加载树种/骨架数据。
2. `Carve` 按枝半径、距根长度、底部形态、垂直位置改变树形。
3. `Gravity` 改变枝条弯曲方向；`Scale` 改整体尺寸。
4. `Remove Branches` 在主形确定后剔除多余分支。
5. `Mesh Builder` 将骨架扫掠成树皮网格，控制环向边数、减面与材质。
6. `Bone Reduction` 降低枝条曲线采样数，保留根和尖端。
7. `Foliage Distributor` 控制叶片密度、沿枝缩放、排列、角度和资源变体。
8. 导出网格，在 PCG 场景散布；通过顶点权重驱动树干弯曲、枝摆和叶片抖动。

## Meshova 对应实现

| 课程概念 | Meshova API | 状态 |
|---|---|---|
| 骨架生成 | `growBranches`、`BranchSegment.parentIndex`、`lengthFromRoot` | 已复刻 |
| Carve | `carveBranches({ mode, amount })` | 已复刻 |
| Gravity / 向光 | `applyBranchGravity({ direction, strength })` | 已复刻 |
| Remove Branches | `removeBranches({ mode, amount, seed })` | 已复刻 |
| Mesh Builder | `branchesToMesh`、`sweepBarkTube` | 已有并复用 |
| Bone Reduction | `reduceBranchBones` | 已复刻 |
| 叶片密度 | `scatterLeaves.perBranch`、`densityProfile` | 已有并复用 |
| 叶片缩放 | `scatterLeaves.scaleProfile` | 已复刻 |
| 叶片排列/角度 | `placement`、`angle`、`angleJitter` | 已复刻 |
| 叶片资源 | `shapeVariants` | 已复刻为程序化叶型变体 |
| 动态风 | `windChannels` | 已有并复用 |

## 复刻产物

- 示例：`examples/ue57-vegetation-editor.ts`
- 输出：`out/ue57-vegetation-editor.json`、`.obj`、`.mtl`
- 示例同时生成直立树、垂枝树、低矮灌木，全部由同一 modifier 流水线参数化得到。

运行：

```powershell
pnpm tsx examples/ue57-vegetation-editor.ts
pnpm build
pnpm view
```

查看器中选择“UE5.7 植被编辑器流程复刻”。
