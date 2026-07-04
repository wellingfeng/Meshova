# Meshova Pages

GitHub Pages 站点由 `scripts/build-pages.mjs` 生成。

本地构建：

```sh
pnpm build
node scripts/build-pages.mjs
```

脚本会写入 `.site/`：

- `index.html`：模型库
- `viewer.html`：共享查看器
- `models/<id>.html`：每个程序化模型的小入口页
- `web/` 和 `dist/`：浏览器运行资源

每次推送到 `main` 后，`.github/workflows/pages.yml` 会构建并部署 `.site/`。
