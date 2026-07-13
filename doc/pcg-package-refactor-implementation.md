# PCG 三层重构实施记录

## 当前阶段

已完成 P0～P2 纵向样板。仓库保持三个物理目录、三个职责层：

- `src/`：现有稳定内核与迁移期兼容导出。
- `pcg/`：可演进领域生成器、内容契约、通用内容适配。
- `content/`：具体模型、材质、参数 Schema、元数据、默认值、预览配置。

本阶段没有批量搬迁全部内容。原因：当前库包含 676 个 Web 程序化模型入口、152 个 `src/models` 文件。按计划先验证契约、发现、构建、Web、截图、测试闭环，再按领域迁移。

## 已落地

1. `defineModel`、`defineMaterial`、`createContentManifest` 提供最小内容契约和运行时校验。
2. `scripts/generate-content-manifest.mjs` 扫描 `content/models/*/index.ts` 与 `content/materials/*/index.ts`，生成类型化清单。
3. Node 包分别输出 `dist/index.js`、`dist/pcg/index.js`、`dist/content/index.js`。
4. 浏览器生成专用 ESM 镜像，避免 Web Worker 无法继承 import map。
5. Web 模型表、材质表通过一次通用桥接加载清单；新增内容不再逐项修改中央注册表。
6. 小熊迁入 `content/models/teddy-bear/`；共享毛绒角色装配进入 `pcg/geometry/character/`。
7. 锈蚀金属样板进入 `content/materials/rusty-metal/`；腐蚀金属领域模式进入 `pcg/material/metal/`。
8. `scripts/check-pcg-boundaries.mjs` 阻止 `src -> pcg/content`、`pcg -> content` 反向依赖。
9. Web 分享仍使用内容 ID、参数和现有相机/材质 URL 状态；生成结果不作为事实源。

## 新增内容

1. 在 `content/models/<id>/index.ts` 或 `content/materials/<id>/index.ts` 默认导出定义。
2. 参数 Schema、默认参数、版本、分类、标签、预览配置与生成函数放同一入口。
3. 运行 `pnpm content:manifest`。
4. 运行 `pnpm build`、对应测试和浏览器审计。

无需修改 `web/procmodels.js`、`web/materials.js` 或根导出表。

## 后续波次

- P3：让 Catalog 完全取代 Web 内容名称、分类特判和旧包装。
- P4：按家具、建筑、交通、环境、植被、角色波次迁移模型。
- P5：按金属、木材、织物、石材及批次系统迁移材质。
- P6：删除 `src/models` 真实实现、核心成品材质导出和迁移兼容层。
- P7：验证仓库外第三方内容包、版本锁定与沙箱能力声明。

每波必须保持 `pnpm test`、`pnpm typecheck`、`pnpm build` 通过，并运行全注册表 build 审计和 gallery WebGL 审计。
