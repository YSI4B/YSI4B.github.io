# 极简 Markdown 博客

把 Markdown 文件放进 `article/`（可以使用子目录），推送到 GitHub 后，站点会自动构建并发布。

- 列表标题取每篇文章中最先出现的 `# 一级标题`，不显示文件名。
- 默认按文件路径自然排序，例如 `2.md` 会排在 `10.md` 前。若要明确指定顺序，可在文章开头添加：

  ```yaml
  ---
  order: 1
  ---
  ```

- 支持标准 Markdown、表格、删除线、任务列表、脚注、代码高亮和内嵌 HTML。
- 文章中的相对图片及附件会随站点一起发布；Markdown 文章间的相对链接也会自动转换。

## 本地查看

需要 Node.js 22 或更新版本：

```bash
npm install
npm run dev
```

## 发布到 GitHub Pages

1. 将仓库默认分支设为 `main` 并推送代码。
2. 在仓库的 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。
3. 工作流会自动构建和发布。它同时兼容 `用户名.github.io` 仓库与普通项目仓库的子路径。
