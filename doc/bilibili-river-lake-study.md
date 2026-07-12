# Houdini PCG 河流湖泊复刻

- 来源：`BV1ndiWBfEXo`，标题“houdini PCG生成河流、湖泊”，时长 88 秒。
- 本地参考：`out/references/BV1ndiWBfEXo/houdini-pcg-river-lake.mp4`。
- 关键约束：湖面提供固定下游高程；沿河道从下游向上游传播回水；水面必须持续向下游不升高；河床按水面和水深重新下切，避免悬空河道。
- Meshova 实现：`solveBackwaterProfile()` 负责一维回水剖面，`buildRiverLakeParts()` 生成侵蚀地形、河床湿岸、湖岸、湖面、河面和流痕。
- 查看：`pnpm river-lake && pnpm build && pnpm view`，模型选择“PCG 河流湖泊回水”。
