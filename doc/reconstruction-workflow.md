# 参考图重建工作流

Meshova 可用强类型质量合同约束图片建模闭环。合同把关键身份特征、部件连接、动作元数据、阶段证据和 LookDev 截图变成硬门禁，不再只依赖提示词。

## 质量合同

```ts
import type { ReconstructionContract } from "meshova";

const contract: ReconstructionContract = {
  version: 1,
  id: "hero-chair",
  subject: "office chair",
  complexity: "hero",
  intendedUse: "animation",
  referenceViews: ["front", "side"],
  criticalFeatures: [{
    id: "backrest",
    label: "靠背",
    description: "Tall curved backrest",
    partNames: ["backrest"],
    minimumScore: 0.8,
  }],
  attachments: [{
    id: "backrest-seat",
    childPart: "backrest",
    parentPart: "seat",
    parentSocket: "seat-back",
    localStart: [0, 0, 0],
    localEnd: [0, 0, 0],
    embedDepth: 0.02,
    gapTolerance: 0.03,
  }],
  actions: [{
    partName: "backrest",
    pivot: [0, -0.5, 0],
    collider: { type: "box", size: [1, 2, 0.2] },
    detachable: true,
  }],
};
```

通过 `reconstructionContract` 把合同传给 `runImageLoop`。结果新增 `passState` 和 `reviewLedger`。默认合同运行会为每个锁定阶段预留一次迭代：

`blockout -> structure -> shape -> material -> lookdev`

- `blockout`：脚本成功运行，参考图 D0 阶段通过。
- `structure`：几何评分和全部连接合同通过。
- `shape`：参考图 D1 阶段和全部必需关键特征通过。
- `material`：参考图 D2 阶段通过。
- `lookdev`：参考图 D3、最终审查和必需光照截图全部通过。

渲染器可返回 `criticalFeatureScores`、`parameters` 和 `lookDevFrames`。外部/VLM 特征评分优先于部件名检测。账本会归档每轮脚本、参数、分数、特征/连接结果和截图数据。

## LookDev 截图

一次捕获参考光、中性光和掠射光证据：

```powershell
pnpm shot teddy persp "" pbr reference,neutral,grazing
```

等价环境变量写法：

```powershell
$env:LOOKDEV="reference,neutral,grazing"; pnpm shot teddy persp
```

默认仍只捕获 `reference`，旧输出文件名不变。

## CLI

列出或查看内置旗舰合同：

```powershell
pnpm meshova contracts
pnpm meshova contract buick-riviera-1965
```

运行完整重建闭环：

```powershell
$env:OPENAI_API_KEY="..."
$env:OPENAI_MODEL="gpt-4o"
pnpm meshova sculpt ref.png --contract buick-riviera-1965 --hint "1965 hardtop coupe"
```

兼容服务可通过 `OPENAI_ENDPOINT` 指定完整 Chat Completions 地址。未指定 `--contract` 时，CLI 会创建通用五阶段合同。输出写入 `out/meshova/<name>/`：最佳脚本、模型 JSON、合同、每轮截图和复盘账本。

当前旗舰合同：

- `buick-riviera-1965`：刀锋车身、无柱硬顶、蚌壳隐藏灯、别克前脸。
- `gmc-canyon-at4x`：机舱/乘员舱/货斗布局、GMC 前脸、越野硬件。
