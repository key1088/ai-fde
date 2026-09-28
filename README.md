# AI-FDE 技能自评地图 / AI-FDE Skill Self-Assessment Map

> 六大能力域 · 53 项技能 · 中英双语 · 在线自评 + 雷达图 + 分享
> Six domains · 53 skills · bilingual (English / 中文) · self-assess, see a live radar, share the result.

一个**纯静态**的 AI-FDE（Forward Deployed Engineer，前置交付工程师）能力地图与自评工具。
既是岗位能力地图，也是个人自评工具：逐项打分，雷达图实时更新，可生成分享链接、文字版结果和结果卡片 PNG。

## 在线访问 / Live

- English（默认）：<https://ai-fde.dev/>
- 中文：<https://ai-fde.dev/zh/>

两个页面是**各自独立的静态 HTML**（不是用 JS 切换），所以中英文都能被搜索引擎直接收录。
部署在 Cloudflare Pages 上。

## 功能 / Features

- **能力概览**：六大域达成率进度条 + 雷达图 + 总体达成率、最薄弱能力域。
- **技能思维导图**：可折叠的 SVG 导图，节点颜色随自评等级变化，支持缩放 / 拖拽 / 触屏手势。
- **53 项技能清单**：每项含目标等级、具体要求、自检问题，右侧下拉框直接打分。
- **等级定义**：L0–L4 五级判定标准与典型证据。
- **不同背景的短板**：开发者 / 产品 / 运维 / 交付四类背景的补法建议。
- **分享与导出**：
  - 分享链接（数据编码在 `#p=` 里，**不会上传服务器**，对方只读）
  - 文字版结果（适合粘贴到聊天 / 群 / 文章）
  - 结果卡片 PNG（1080×1550，带二维码，本机绘制）
  - JSON 备份 / 恢复（跨语言、跨浏览器通用）

## 技术 / Tech

- 纯原生 HTML / CSS / JavaScript + SVG，**零后端**。
- 最终产物是两份静态 HTML：`index.html`（英文）与 `zh/index.html`（中文），均预渲染，爬虫无需执行 JS。
- 评分保存在浏览器 `localStorage`（key: `aifde_skill_v1`）。
- 分享数据编码在 URL hash 中，服务器和统计工具都看不到。
- 内置 QR Code 生成器（MIT, Kazuhiko Arase）。

## 双语机制 / i18n

- **路径即语言**：`/` = 英文（默认、`x-default`），`/zh/` = 中文。两套 URL 各自有静态 HTML，`hreflang` 已配好。
- 界面文案在 `T.zh` / `T.en` 两个字典里；数据字段直接写 `{zh:'…', en:'…'}`。
- 缺英文时自动回退中文。开发时在浏览器控制台执行 `listUntranslated()` 可列出所有缺失英文的字段。
- 页面的「中文 / EN」按钮是在 `/` 与 `/zh/` 之间跳转，并记住你的选择。

### 自动语言跳转（软跳转）

首次访问时，若满足**全部**条件，会从英文首页跳到中文页：

- 浏览器语言是中文（`navigator.language` 以 `zh` 开头）
- 你从未手动切换过语言（无 `aifde_lang_pref`）
- 本次会话还没跳过、且不是分享链接（无 `#p=`）

它是**客户端软跳转**，不是服务端 301，因此不会像 `Accept-Language` 重定向那样让爬虫只看到一个版本。
手动切换过语言后就不再自动跳。想强制留在英文页，加 `?nolang=1` 即可：
<https://ai-fde.dev/?nolang=1>

> 若想彻底关掉自动跳转，删除 `index.html` 里 `detectLang()` 下方那段 IIFE 即可。

### 静态页怎么生成

`index.html`（英文）与 `zh/index.html`（中文）都是**生成产物**，不要手改正文；内容以 `index.html` 底部 `<script>` 里的数据 / 文案字典为准。流程：

```bash
npm install        # 只需一次（安装 jsdom，仅开发用）
npm run build      # 同时生成 index.html（英文）与 zh/index.html（中文）
```

脚本会分别以 `/` 和 `/zh/` 路径把 `index.html` 加载进 jsdom，让页面自己按语言渲染（表格 / 雷达图 / 导图 / 文案），再序列化落盘并自检（语言、技能数、canonical、残留中文）。构建是幂等的，重复运行输出一致。
**改完内容 / 文案后记得重跑 `npm run build`。**

### 新增一项技能时

1. 在 `DOMAINS` 对应域里加一个对象：`{id, n, t, jd, ck}`，`id` 必须唯一且稳定（用于导出 / 导入匹配）。
2. 中英文字段都要填。
3. 运行 `npm run build`。
4. 分享链接长度、示例画像 `DEMO_PROFILE` 会自动按技能总数校验；改动技能数量后，旧的分享链接会被安全忽略（不会错位）。

## 本地开发 / Local dev

```bash
npm install
npm run build
npm run serve          # python3 -m http.server 8080
# 英文 http://localhost:8080/
# 中文 http://localhost:8080/zh/
```

## 部署到 Cloudflare

有两条路，看你在哪个界面：

### A. Workers（新界面，会强制要「部署命令 / 预览命令」）

仓库里已备好 `wrangler.jsonc` 和 `.assetsignore`，直接这样填：

| 字段 | 填什么 |
|---|---|
| Build command | **留空**（静态文件已提交）；也可填 `npm run build` 让 Cloudflare 重新生成 |
| **Deploy command** | `npx wrangler deploy` |
| **Preview command** | `npx wrangler versions upload` |

- `wrangler.jsonc` 把整个仓库作为静态资源目录，并设了 `html_handling: auto-trailing-slash`（`/zh` → `/zh/`）与 `not_found_handling: 404-page`。
- `.assetsignore` 排除 `node_modules / .git / tools / package*.json / README` 等开发文件，**不会**把依赖一起传上去。
- 部署后是 `ai-fde.<account>.workers.dev`，再到 Worker → Settings → Domains & Routes 绑定 `ai-fde.dev`。

### B. Pages（只有「构建命令 + 输出目录」，没有部署/预览命令）

- Framework preset：`None`
- Build command：留空
- Build output directory：`/`

> 两种方式都不需要本地跑构建；`_headers` / `_redirects` 会自动生效。
> 只有 Pages 用 `npx wrangler pages deploy .`；Workers 用 `npx wrangler deploy`。

## 目录 / Layout

```
.
├── index.html            # 英文页（默认，生成产物；同时是构建的源文件）
├── zh/
│   └── index.html        # 中文页（生成产物）
├── tools/
│   └── build.mjs         # 生成上面两个静态页
├── og-image.png          # 社媒分享缩略图 1200×630
├── apple-touch-icon.png  # iOS 主屏图标
├── favicon.ico           # 浏览器标签图标
├── 404.html              # 自定义 404
├── sitemap.xml           # 站点地图（中英双语 hreflang）
├── robots.txt
├── _headers              # Cloudflare Pages 响应头
├── _redirects            # /en → / ，/zh → /zh/
├── wrangler.jsonc        # Cloudflare Workers 静态资源配置
├── .assetsignore         # Workers 部署时排除开发文件
├── package.json          # 仅用于 npm run build
└── README.md
```

## Roadmap

- [x] 中英双语静态页（`/` 英文默认，`/zh/` 中文）
- [x] SEO：canonical / hreflang / OG 图 / JSON-LD / sitemap / robots
- [ ] 教学文档页（AI-FDE 是什么、如何转型、逐域学习路径）
- [ ] 更多页面（案例库、术语表、课程大纲）
- [ ] 统计与广告位（隐私政策页先行）
- [ ] 把单文件拆成模板 / 组件，方便多页扩展

## License

待定 / TBD。
