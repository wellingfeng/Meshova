# WorkflowPreset v1

Meshova 的可复用程序工作流层。目标：同一份图可换参数、资产、地表或曲线，不改图结构。

## 数据流

```text
WorkflowPreset
  ├─ exposedParams  语义参数
  ├─ sharedRefs     图内共享值
  ├─ assetSlots     可替换资产
  ├─ bindings       surface / curve / region / selection / point-cloud
  ├─ graph          OpPlan
  └─ execution      seed / debounce / freeze / cache 提示
          ↓ materializeWorkflow
       OpPlan
          ↓ evalWorkflow
      NamedPart[]
```

图参数用标记引用：`{ $param: "width" }`、`{ $shared: "spacing" }`、`{ $asset: "tree" }`、`{ $binding: "ground" }`。编译后全部变成普通 `OpPlan` 值，现有执行器与增量缓存无需改造。

## MaskField

统一散布遮罩支持：常量、属性、顶点色、高度、坡度、方向、轴投影、点距离、曲线距离、多边形边界、噪声、纹理、反相、重映射、组合。

`applyMaskField` 把连续值写入点云属性；默认属性为 `mask`。`ruleMaskField` 可直接放入现有 `applyRules` 链。

## ScatterTable

一张表管理多种资产。每行支持：资产槽或 variant、权重、独立密度、MaskField、缩放范围、旋转范围、自定义点属性。表级 `density` 控制总覆盖率，所有随机由 `seed` 驱动。

```ts
const table: ScatterTable = {
  schema: "meshova-scatter-table@1",
  seed: 12,
  density: 0.7,
  rows: [
    { id: "pine", assetSlot: "pine", weight: 3, mask: { type: "slope", maxDeg: 35 } },
    { id: "rock", assetSlot: "rock", weight: 1, mask: { type: "height", min: 8 } },
  ],
};

const points = applyScatterTable(sourcePoints, table, {
  assetVariants: { pine: 0, rock: 1 },
  prune: true,
});
```

## Drawable Preset

查看器读取 `WorkflowPreset.bindings`。`curve` 与 `region` 绑定显示“绘制路径/区域”工具：单击地面加点，右键或按钮完成，随后把序列化点集传入 `ProcModel.build(params, context)`。绑定进入分享链接，可重放、重置、通过 `window.__meshova.setBinding` 自动化控制。

内置示例：

- `drawable-path-fence`：曲线绑定生成围栏。
- `masked-region-grove`：区域绑定 + MaskField + ScatterTable 生成混合林地。
- `scatter-path-lights`：曲线绑定 + MaskField + ScatterTable 布置步道设施。

## 语义资产库

`ProcModel.assetMeta` 支持 `description`、`tags`、`capabilities`、`materialClasses`。模型库卡片显示语义标签，搜索覆盖名称、分类、标签、能力、材质类；点击标签可直接筛选。同字段也可写入 `out/models.json` 的生成模型条目。

## 后续阶段

- 资产槽解析：按稳定 ID、标签、尺寸、材质类匹配 `assetSlots`。
- 执行 UI：读取 `execution`，接入冻结、耗时、局部预览、debounce。
- 非破坏 Bake：产物保存 preset ID、版本、输入与 seed provenance。
