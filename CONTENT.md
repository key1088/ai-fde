# 内容工作流（公众号 → 站点文档）

公众号负责触达，站点负责沉淀：可被搜索、可被更新、可成体系。每发一篇公众号文章，
就把它「搬」进本站的文档区（`/docs/` 与 `/zh/docs/`）。**以后每篇都走这套流程。**

---

## 一条命令，五步走

```bash
# 1) 在 content/sources.json 的 articles 里加一条（见下）
# 2) 抓取 + 转 Markdown + 下图
node tools/import-wechat.mjs <slug>

# 3) 人工校对 content/docs/<slug>/zh.md（结构问题，不改作者原意）
# 4) 写英文版 content/docs/<slug>/en.md，并补 meta.json 里的 en 字段
# 5) 生成静态页
npm run build:docs        # 只构建文档
npm run build:all         # 顺带重建工具页（改了首页才需要）

# 6) 提交并推送（推送即部署到 ai-fde.dev）
git add -A && git commit -m "docs: 新增 <标题>" && git push
```

> `--force` 会覆盖 `zh.md`（会丢掉人工校对），别在已经改过的文章上随手用。
> 图片下载到 `media/docs/<slug>/`，构建时不需要再复制。

---

## 加一篇新文章

编辑 `content/sources.json`，在 `articles` 里追加：

```json
{
  "slug": "03-ai-eng-context",
  "series": "ai-fde-roadmap",
  "order": 3,
  "url": "https://mp.weixin.qq.com/s/xxxxxx"
}
```

- `slug`：唯一、稳定，决定 URL（`/docs/03-ai-eng-context/`）。用 `序号-英文短名`。
- `order`：排序用的，决定系列里的顺序与上/下一篇。
- `url`：公众号文章链接。

然后执行上面的第 2 步。脚本会自动：建目录、抓正文、图片落盘、写 `meta.json`。

---

## 目录结构

```
content/
├── sources.json                 # 导入清单：系列 + 每篇文章的 slug/order/url
└── docs/
    └── <slug>/
        ├── meta.json            # 标题(zh/en)、摘要(zh/en)、日期、来源、标签、顺序
        ├── zh.md                # 中文正文（import 生成 + 人工校对）
        └── en.md                # 英文正文（人工翻译）

media/docs/<slug>/img-01.png ...  # 文中图片（站内绝对路径 /media/docs/<slug>/）

assets/doc.css                    # 文档站公共样式
tools/import-wechat.mjs           # 公众号 → Markdown 抓取转换
tools/build-docs.mjs              # Markdown → 静态页 + sitemap
```

生成物（已提交，Cloudflare 直接部署，**不要手改**）：

```
docs/index.html            docs/<slug>/index.html          # 英文
zh/docs/index.html         zh/docs/<slug>/index.html       # 中文
sitemap.xml                                                 # 含全部文档页
```

---

## URL 与双语规则

- 语言靠路径区分，和工具页一致：`/docs/…` = 英文，`/zh/docs/…` = 中文。
- 两套页面各自是静态 HTML，`hreflang` / `canonical` 已生成，爬虫无需执行 JS。
- 页面右上角「EN / 中文」直接跳到同篇的另一种语言。
- 缺英文时，`en.md` 不存在则该语言版本不生成（构建会提示）。

---

## 约定

1. **只搬不编**：`zh.md` 是作者原文，校对只修结构（标题层级、表格、错乱的加粗/链接），不改观点和措辞。
2. **英文要全**：`en.md` 与 `meta.json` 的 `title.en` / `subtitle.en` / `summary.en` 都要填；页面标题、列表页、SEO 都读它们。
3. **站内互链**：文内引用同系列文章，一律用站内路径（如 `/zh/docs/00-intro/`），不留外部链接。
4. **图片进 media**：正文引用统一写 `/media/docs/<slug>/img-XX.png`。
5. **构建幂等**：`npm run build:all` 可重复执行，输出一致。
