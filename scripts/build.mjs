import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import hljs from "highlight.js";
import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";
import alerts from "./markdown-alerts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const articleDir = path.join(root, "article");
const outputDir = path.join(root, "dist");
const basePath = normalizeBase(process.env.BASE_PATH || "/");
const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });

function normalizeBase(value) {
  const cleaned = `/${value}`.replaceAll("\\", "/").replace(/\/+/g, "/");
  return cleaned.endsWith("/") ? cleaned : `${cleaned}/`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function encodePath(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

function isExternalUrl(value) {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/|#|\/)/i.test(value);
}

function splitUrl(value) {
  const match = value.match(/^([^?#]*)(.*)$/);
  return [match?.[1] || "", match?.[2] || ""];
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else files.push(absolute);
  }
  return files;
}

function textFromInline(token) {
  if (!token?.children) return token?.content?.trim() || "";
  return token.children
    .filter((child) => !["html_inline", "softbreak", "hardbreak"].includes(child.type))
    .map((child) => child.content || "")
    .join("")
    .trim();
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
  highlight(code, language) {
    if (language && hljs.getLanguage(language)) {
      return `<pre><code class="hljs language-${escapeHtml(language)}">${hljs.highlight(code, { language }).value}</code></pre>`;
    }
    return `<pre><code class="hljs">${escapeHtml(code)}</code></pre>`;
  }
})
  .use(anchor, { permalink: false, slugify: (value) => value.trim().toLowerCase().replace(/\s+/g, "-") })
  .use(footnote)
  .use(taskLists, { enabled: false, label: true, labelAfter: true })
  .use(alerts);

function firstHeading(markdown) {
  const tokens = md.parse(markdown, {});
  const index = tokens.findIndex((token) => token.type === "heading_open" && token.tag === "h1");
  return index >= 0 ? textFromInline(tokens[index + 1]) : "";
}

function page({ title, description = title, body, className = "" }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(description)}">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${basePath}style.css">
</head>
<body${className ? ` class="${className}"` : ""}>
  <main>${body}</main>
</body>
</html>
`;
}

const allFiles = await walk(articleDir);
const markdownFiles = allFiles.filter((file) => file.toLowerCase().endsWith(".md"));
const articles = await Promise.all(markdownFiles.map(async (file) => {
  const relativePath = path.relative(articleDir, file).replaceAll(path.sep, "/");
  const parsed = matter(await readFile(file, "utf8"));
  const title = firstHeading(parsed.content);
  if (!title) throw new Error(`${relativePath} does not contain an H1 heading (# title).`);
  const numericOrder = Number(parsed.data.order);
  return {
    file,
    relativePath,
    content: parsed.content,
    title,
    order: Number.isFinite(numericOrder) ? numericOrder : Number.POSITIVE_INFINITY
  };
}));

articles.sort((a, b) => a.order - b.order || collator.compare(a.relativePath, b.relativePath));
articles.forEach((article, index) => { article.slug = `article-${index + 1}`; });

const articleByPath = new Map(articles.map((article) => [article.relativePath.toLowerCase(), article]));
const originalImage = md.renderer.rules.image;
md.renderer.rules.image = (tokens, index, options, env, self) => {
  const srcIndex = tokens[index].attrIndex("src");
  if (srcIndex >= 0) tokens[index].attrs[srcIndex][1] = resolveLocalUrl(tokens[index].attrs[srcIndex][1], env, false);
  return originalImage(tokens, index, options, env, self);
};

const originalLinkOpen = md.renderer.rules.link_open || ((tokens, index, options, env, self) => self.renderToken(tokens, index, options));
md.renderer.rules.link_open = (tokens, index, options, env, self) => {
  const hrefIndex = tokens[index].attrIndex("href");
  if (hrefIndex >= 0) tokens[index].attrs[hrefIndex][1] = resolveLocalUrl(tokens[index].attrs[hrefIndex][1], env, true);
  return originalLinkOpen(tokens, index, options, env, self);
};

function resolveLocalUrl(url, env, allowArticle) {
  if (!url || url.startsWith("?") || isExternalUrl(url)) return url;
  const [pathname, suffix] = splitUrl(url);
  const currentDirectory = path.posix.dirname(env.relativePath);
  const resolved = path.posix.normalize(path.posix.join(currentDirectory, decodeURIComponent(pathname)));
  if (resolved.startsWith("../")) return url;
  if (allowArticle && resolved.toLowerCase().endsWith(".md")) {
    const target = articleByPath.get(resolved.toLowerCase());
    return target ? `${basePath}articles/${target.slug}/${suffix}` : url;
  }
  return `${basePath}article-assets/${encodePath(resolved)}${suffix}`;
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, ".nojekyll"), "");
await cp(path.join(root, "src", "style.css"), path.join(outputDir, "style.css"));

const list = articles.length
  ? `<ol class="article-list">${articles.map((article) => `\n    <li><a href="${basePath}articles/${article.slug}/">${escapeHtml(article.title)}</a></li>`).join("")}\n  </ol>`
  : `<p>还没有文章。</p>`;
await writeFile(path.join(outputDir, "index.html"), page({
  title: "沈阳建筑大学袁帅教授傻逼时刻合订本",
  description: "文章列表",
  body: list,
  className: "index-page"
}));

for (const article of articles) {
  const directory = path.join(outputDir, "articles", article.slug);
  await mkdir(directory, { recursive: true });
  const rendered = md.render(article.content, { relativePath: article.relativePath });
  await writeFile(path.join(directory, "index.html"), page({
    title: article.title,
    body: `<nav aria-label="返回文章列表"><a href="${basePath}">←</a></nav>\n<article>${rendered}</article>`
  }));
}

const assetFiles = allFiles.filter((file) => !file.toLowerCase().endsWith(".md"));
for (const file of assetFiles) {
  const relativePath = path.relative(articleDir, file);
  const destination = path.join(outputDir, "article-assets", relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(file, destination);
}

console.log(`Built ${articles.length} article${articles.length === 1 ? "" : "s"} with base path ${basePath}`);
