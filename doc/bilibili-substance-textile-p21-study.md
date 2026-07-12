# Bilibili Substance Designer 织物课时 20 学习记录

- 来源：`BV1ki4y1D7K6` 第 21 集，《课时20：SD服装花纹纹理入门教学1》
- 本地参考：`out/reference/bilibili-bv1ki4y1d7k6/p21.mp4`
- 时长：约 15 分 20 秒；1920×1080，30 FPS

## 节点链拆解

1. `Weave 2` 生成经纬交织基础高度。
2. 两组不同方向织纹通过 `Blend` 组合，形成更密的布面结构。
3. `Multi Directional Warp` 使用 `Gaussian Noise` 扰动规则纱线，消除机械直线感。
4. 高度链送入法线；灰度链经统一颜色映射生成 Base Color。
5. 同一组参数通过密度、方向、颜色变化，可扩展出大量服装面料。

## Meshova 独立复刻

`src/texture/textile.ts` 用数学交织核重写，不复制 Substance 节点资源：

- 经纱、纬纱分别生成圆拱截面高度。
- 每个交点按织法决定上下层关系。
- 周期多向正弦场近似 Gaussian Noise + Multi Directional Warp，保持无缝平铺。
- 高频纤维、低频磨损同时影响 Base Color、Roughness、Height、AO。
- `materialFromFields` 自动从高度生成法线，输出完整 7 通道 PBR。

已实现 8 种贴图：平纹、2/2 斜纹、人字纹、篮纹、缎纹、3/1 牛仔斜纹、V 形纹、细条纹。

运行：

```powershell
pnpm tsx examples/bilibili-textile-p21.ts
```

输出：`out/materials/bilibili-textile-p21/<preset>/`。
