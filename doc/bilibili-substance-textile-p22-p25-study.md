# Bilibili Substance Designer 织物课 P22-P25 延伸实现

## 开发目标

不逐节点照抄课程。提炼可复用的“纱线层 + 周期图案 + 多尺度起伏”内核，补齐服装和软装常用材质族。

## 共享内核

- `sampleYarnLayer`：整数 UV 晶格方向、纱线圆拱截面、周期扰动、顺纱高频纤维。
- 图案驱动：花瓣、菱形等周期遮罩同时控制纱线上下层、颜色、高度、粗糙度和金属度。
- 三层尺度：大褶皱或图案、中尺度纱线、微尺度纤维与磨损。
- 所有随机变化由 `seed` 驱动；UV 边界严格无缝。

## 新增材质

| ID | 材质 | 核心结构 |
|---|---|---|
| `jacquardTextile` | 提花布 | 缎纹底 + 花卉组织反转 |
| `brocadeTextile` | 金线锦缎 | 斜纹底 + 金属花纹纱 |
| `laceTextile` | 蕾丝 | 双向网线 + 花边线圈 + 孔隙 |
| `ribKnitTextile` | 罗纹针织 | 纵向罗纹 + V 形针脚 |
| `corduroyTextile` | 灯芯绒 | 宽纵向绒条 + 细纤维 |
| `meshTextile` | 网纱 | 双向斜线网格 + 交点压层 |
| `twistedRopeTextile` | 多股绳 | 三股周期扭结 + 高频股纹 |
| `pleatedSilkTextile` | 褶皱丝绸 | 大尺度褶皱 + 缎纹微结构 |

## 使用

```powershell
pnpm tsx examples/bilibili-textile-p22-p25.ts
```

输出：`out/materials/bilibili-textile-p22-p25/<preset>/`，每套 7 张 PBR 图。
