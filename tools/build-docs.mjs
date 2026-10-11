/*
 * 文档站构建：content/** → /docs/** 与 /zh/docs/**
 * ------------------------------------------------------------
 * 读 content/sources.json + content/docs/<slug>/{meta.json,zh.md,en.md}，
 * 生成中英双语的文档首页与文章页，并把配图复制到 /media/docs/<slug>/。
 *
 *   npm run build:docs      # = node tools/build-docs.mjs
 *
 * 生成物（勿手改）：
 *   docs/index.html            zh/docs/index.html
 *   docs/<slug>/index.html     zh/docs/<slug>/index.html
 *   media/docs/<slug>/*
 *   sitemap.xml（保留工具页两条，追加文档条目）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://ai-fde.dev';
const sources = JSON.parse(fs.readFileSync(path.join(root, 'content/sources.json'), 'utf8'));

const LANGS = {
  zh: { html: 'zh-CN', dir: 'zh/docs', urlBase: '/zh/docs', tool: '/zh/', hreflang: 'zh-CN' },
  en: { html: 'en', dir: 'docs', urlBase: '/docs', tool: '/', hreflang: 'en' },
};

const UI = {
  zh: {
    tool: '自评工具',
    docs: '文档',
    otherLang: 'EN',
    series: '本系列',
    onThisPage: '本页目录',
    prev: '上一篇',
    next: '下一篇',
    home: '文档',
    source: '本文首发于微信公众号「杀他个回马枪」',
    sourceLink: '在公众号阅读原文',
    cta: '想先看看自己缺什么？用自评地图打个分 →',
    updated: '更新于',
    indexTitle: 'AI-FDE 转型之路 · 文档',
    indexDesc: '从客户现场走向 AI 交付：写给实施、售前、交付、运维背景同学的 AI-FDE 转型学习路径。',
    articles: '篇文章',
  },
  en: {
    tool: 'Self-Assessment',
    docs: 'Docs',
    otherLang: '中文',
    series: 'In this series',
    onThisPage: 'On this page',
    prev: 'Previous',
    next: 'Next',
    home: 'Docs',
    source: 'First published on WeChat (杀他个回马枪)',
    sourceLink: 'Read the original on WeChat',
    cta: 'Want to see where you stand? Score yourself on the map →',
    updated: 'Updated',
    indexTitle: 'The AI-FDE Transition Path · Docs',
    indexDesc: 'From the client site to AI delivery: a learning path for implementation, pre-sales, delivery and operations people moving into the AI-FDE role.',
    articles: 'articles',
  },
};

marked.setOptions({ gfm: true, breaks: false });

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function slugifyHeading(text, used) {
  let id = text
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fff-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!id) id = 'section';
  let final = id, n = 2;
  while (used.has(final)) final = `${id}-${n++}`;
  used.add(final);
  return final;
}

// markdown → 语义化正文 HTML（加标题 id、包表格、图片懒加载）
function renderBody(md) {
  const raw = marked.parse(md);
  const dom = new JSDOM(`<body><div id="c">${raw}</div></body>`);
  const doc = dom.window.document;
  const c = doc.getElementById('c');

  const used = new Set();
  const toc = [];
  c.querySelectorAll('h1,h2,h3').forEach((h) => {
    const level = +h.tagName[1];
    if (level === 1) return;
    const id = slugifyHeading(h.textContent, used);
    h.id = id;
    toc.push({ id, text: h.textContent.trim(), level });
  });

  c.querySelectorAll('table').forEach((t) => {
    const wrap = doc.createElement('div');
    wrap.className = 'tw';
    t.replaceWith(wrap);
    wrap.appendChild(t);
  });
  c.querySelectorAll('img').forEach((img) => {
    img.setAttribute('loading', 'lazy');
    img.setAttribute('decoding', 'async');
  });
  c.querySelectorAll('a[href^="http"]').forEach((a) => {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });
  return { html: c.innerHTML, toc };
}

function loadArticles() {
  const list = [...sources.articles].sort((a, b) => a.order - b.order);
  return list.map((entry) => {
    const dir = path.join(root, 'content/docs', entry.slug);
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
    const md = {};
    for (const lang of ['zh', 'en']) {
      const f = path.join(dir, `${lang}.md`);
      md[lang] = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : '';
    }
    return { ...entry, dir, meta, md };
  });
}

function docPage({ lang, art, series, articles, body, toc }) {
  const L = LANGS[lang];
  const t = UI[lang];
  const other = lang === 'zh' ? 'en' : 'zh';
  const OL = LANGS[other];
  const canon = `${SITE}${L.urlBase}/${art.slug}/`;
  const altEn = `${SITE}${LANGS.en.urlBase}/${art.slug}/`;
  const altZh = `${SITE}${LANGS.zh.urlBase}/${art.slug}/`;
  const title = art.meta.title[lang] || art.meta.title.zh;
  const sub = art.meta.subtitle[lang] || art.meta.subtitle.zh || series.title[lang] || series.title.zh;
  const idx = articles.findIndex((a) => a.slug === art.slug);
  const prev = articles[idx - 1];
  const next = articles[idx + 1];
  const summary = art.meta.summary[lang] || art.meta.summary.zh || sub;
  const firstImg = art.meta.images?.[0]?.name;
  const ogImage = firstImg ? `${SITE}/media/docs/${art.slug}/${firstImg}` : `${SITE}/og-image.png`;
  const jsonld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description: summary,
    datePublished: art.meta.date || undefined,
    inLanguage: L.html,
    image: ogImage,
    author: { '@type': 'Organization', name: '杀他个回马枪' },
    publisher: { '@type': 'Organization', name: 'AI-FDE' },
    mainEntityOfPage: canon,
    isPartOf: { '@type': 'CreativeWorkSeries', name: series.title[lang] || series.title.zh },
  });

  const tocHtml = [
    `<div class="toc-h">${esc(t.series)}</div>`,
    `<div class="toc-body">`,
    ...articles.map((a, i) => {
      const at = a.meta.title[lang] || a.meta.title.zh;
      return `<a class="art${a.slug === art.slug ? ' cur' : ''}" href="/${L.dir}/${a.slug}/"><span class="no">${String(i + 1).padStart(2, '0')}</span>${esc(at)}</a>`;
    }),
    `</div>`,
    `<div class="toc-h">${esc(t.onThisPage)}</div>`,
    `<div class="toc-body">`,
    ...toc.map((h) => `<a class="h${h.level}" href="#${h.id}">${esc(h.text)}</a>`),
    `</div>`,
  ].join('\n');

  const pager = (prev || next)
    ? `<div class="pager">
${prev ? `<a class="prev" href="/${L.dir}/${prev.slug}/"><span class="dir">← ${t.prev}</span><span class="ttl">${esc(prev.meta.title[lang] || prev.meta.title.zh)}</span></a>` : '<span class="spacer"></span>'}
${next ? `<a class="next" href="/${L.dir}/${next.slug}/"><span class="dir">${t.next} →</span><span class="ttl">${esc(next.meta.title[lang] || next.meta.title.zh)}</span></a>` : '<span class="spacer"></span>'}
</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="${L.html}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(series.title[lang] || series.title.zh)}</title>
<meta name="description" content="${esc(summary)}">
<link rel="canonical" href="${canon}">
<link rel="alternate" hreflang="en" href="${altEn}">
<link rel="alternate" hreflang="zh-CN" href="${altZh}">
<link rel="alternate" hreflang="x-default" href="${altEn}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(summary)}">
<meta property="og:url" content="${canon}">
<meta property="og:image" content="${ogImage}">
<meta property="og:locale" content="${lang === 'zh' ? 'zh_CN' : 'en_US'}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico">
<link rel="stylesheet" href="/assets/doc.css">
<script type="application/ld+json">${jsonld}</script>
</head>
<body>
<header class="site">
  <a class="brand" href="/${L.dir}/">AI-FDE <span>· ${esc(t.docs)}</span></a>
  <nav>
    <a href="${L.tool}">${esc(t.tool)}</a>
    <a href="/${L.dir}/" class="on">${esc(t.docs)}</a>
    <a class="lang" href="/${OL.dir}/${art.slug}/">${esc(t.otherLang)}</a>
  </nav>
</header>
<div class="wrap">
  <nav class="toc">
${tocHtml}
  </nav>
  <main>
    <div class="crumb"><a href="/${L.dir}/">${esc(t.home)}</a> / ${esc(series.title[lang] || series.title.zh)}</div>
    <article>
      <h1 class="doc-title">${esc(title)}</h1>
      ${sub ? `<p class="doc-sub">${esc(sub)}</p>` : ''}
      <p class="doc-meta">${art.meta.date ? `${esc(art.meta.date)} · ` : ''}${esc(t.source)}</p>
      ${body}
    </article>
${pager}
    <div class="doc-foot">
      <p>${esc(t.source)} · <a href="${esc(art.meta.source)}" target="_blank" rel="noopener noreferrer">${esc(t.sourceLink)}</a></p>
      <p>${esc(t.cta.replace('→', ''))} <a href="${L.tool}">→</a></p>
    </div>
  </main>
</div>
<button id="top" title="Top" aria-label="Top" style="position:fixed;right:22px;bottom:26px;width:42px;height:42px;border-radius:50%;background:#1c3a5e;color:#fff;border:none;cursor:pointer;font-size:18px;display:none;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.22)">↑</button>
<script>
(function(){
  var toc=document.querySelector('nav.toc');
  var h=toc&&toc.querySelector('.toc-h');
  if(h){h.addEventListener('click',function(){if(window.innerWidth<=960)toc.classList.toggle('open');});}
  var links=[].slice.call(document.querySelectorAll('nav.toc a[href^="#"]'));
  var heads=links.map(function(a){return document.getElementById(a.getAttribute('href').slice(1));});
  var btn=document.getElementById('top');
  function onScroll(){
    var y=window.scrollY+90,cur=0;
    for(var i=0;i<heads.length;i++){if(heads[i]&&heads[i].offsetTop<=y)cur=i;}
    links.forEach(function(a,i){a.classList.toggle('on',i===cur);});
    btn.style.display=window.scrollY>500?'flex':'none';
  }
  window.addEventListener('scroll',onScroll,{passive:true});
  window.addEventListener('resize',onScroll);onScroll();
  btn.addEventListener('click',function(){window.scrollTo({top:0,behavior:'smooth'});});
})();
</script>
</body>
</html>
`;
}

function indexPage({ lang, series, articles }) {
  const L = LANGS[lang];
  const t = UI[lang];
  const other = lang === 'zh' ? 'en' : 'zh';
  const OL = LANGS[other];
  const canon = `${SITE}${L.urlBase}/`;
  const title = t.indexTitle;
  const desc = t.indexDesc;
  const cards = articles
    .map((a, i) => {
      const at = a.meta.title[lang] || a.meta.title.zh;
      const sum = a.meta.summary[lang] || a.meta.summary.zh || '';
      return `<a class="card" href="/${L.dir}/${a.slug}/">
  <div class="no">${String(i + 1).padStart(2, '0')}${a.meta.date ? ` · ${esc(a.meta.date)}` : ''}</div>
  <h3>${esc(at)}</h3>
  ${sum ? `<p>${esc(sum)}</p>` : ''}
</a>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="${L.html}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canon}">
<link rel="alternate" hreflang="en" href="${SITE}${LANGS.en.urlBase}/">
<link rel="alternate" hreflang="zh-CN" href="${SITE}${LANGS.zh.urlBase}/">
<link rel="alternate" hreflang="x-default" href="${SITE}${LANGS.en.urlBase}/">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canon}">
<meta property="og:image" content="${SITE}/og-image.png">
<meta property="og:locale" content="${lang === 'zh' ? 'zh_CN' : 'en_US'}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico">
<link rel="stylesheet" href="/assets/doc.css">
<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description: desc,
    inLanguage: L.html,
    url: canon,
    hasPart: articles.map((a) => ({
      '@type': 'Article',
      headline: a.meta.title[lang] || a.meta.title.zh,
      url: `${SITE}${L.urlBase}/${a.slug}/`,
    })),
  })}</script>
</head>
<body>
<header class="site">
  <a class="brand" href="/${L.dir}/">AI-FDE <span>· ${esc(t.docs)}</span></a>
  <nav>
    <a href="${L.tool}">${esc(t.tool)}</a>
    <a href="/${L.dir}/" class="on">${esc(t.docs)}</a>
    <a class="lang" href="/${OL.dir}/">${esc(t.otherLang)}</a>
  </nav>
</header>
<div class="wrap">
  <nav class="toc">
    <div class="toc-h">${esc(t.series)}</div>
    <div class="toc-body">
      <a class="art cur" href="/${L.dir}/">${esc(series.title[lang] || series.title.zh)}</a>
    </div>
  </nav>
  <main>
    <div class="hero">
      <h1>${esc(series.title[lang] || series.title.zh)}</h1>
      <p>${esc(series.description[lang] || series.description.zh)}</p>
      <p style="margin-top:10px;font-size:13.5px;color:#8a94a2">${articles.length} ${esc(t.articles)}</p>
    </div>
    <div class="series">
      <div class="cards">
${cards}
      </div>
    </div>
    <div class="doc-foot">
      <p><a href="${L.tool}">${esc(t.cta.replace('→', ''))} →</a></p>
    </div>
  </main>
</div>
</body>
</html>
`;
}

// ---- 执行 ----
const seriesMap = sources.series;
const articles = loadArticles();
const series = seriesMap[articles[0]?.series] || Object.values(seriesMap)[0];

let wrote = 0;
for (const lang of ['zh', 'en']) {
  const L = LANGS[lang];
  const outDir = path.join(root, L.dir);
  fs.mkdirSync(outDir, { recursive: true });

  // 列表页
  fs.writeFileSync(path.join(outDir, 'index.html'), indexPage({ lang, series, articles }));
  wrote++;

  // 文章页
  for (const art of articles) {
    const md = art.md[lang];
    if (!md) {
      console.log(`  ! ${art.slug} 缺少 ${lang}.md，跳过 ${lang} 版`);
      continue;
    }
    const { html, toc } = renderBody(md);
    const html2 = docPage({ lang, art, series, articles, body: html, toc });
    const dir = path.join(outDir, art.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html2);
    wrote++;
  }
}

// 配图直接由 import-wechat.mjs 落在 /media/docs/<slug>/，构建时无需再复制

// sitemap.xml：固定两条工具页 + 全部文档页
const urls = [
  { loc: `${SITE}/`, alt: [['en', `${SITE}/`], ['zh-CN', `${SITE}/zh/`], ['x-default', `${SITE}/`]], p: '1.0' },
  { loc: `${SITE}/zh/`, alt: [['en', `${SITE}/`], ['zh-CN', `${SITE}/zh/`], ['x-default', `${SITE}/`]], p: '0.8' },
];
for (const lang of ['en', 'zh']) {
  const L = LANGS[lang];
  urls.push({ loc: `${SITE}${L.urlBase}/`, alt: [['en', `${SITE}${LANGS.en.urlBase}/`], ['zh-CN', `${SITE}${LANGS.zh.urlBase}/`], ['x-default', `${SITE}${LANGS.en.urlBase}/`]], p: '0.9' });
  for (const a of articles) {
    urls.push({
      loc: `${SITE}${L.urlBase}/${a.slug}/`,
      alt: [['en', `${SITE}${LANGS.en.urlBase}/${a.slug}/`], ['zh-CN', `${SITE}${LANGS.zh.urlBase}/${a.slug}/`], ['x-default', `${SITE}${LANGS.en.urlBase}/${a.slug}/`]],
      p: '0.7',
    });
  }
}
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
${u.alt.map(([h, href]) => `    <xhtml:link rel="alternate" hreflang="${h}" href="${href}"/>`).join('\n')}
    <changefreq>weekly</changefreq>
    <priority>${u.p}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(root, 'sitemap.xml'), sitemap);

console.log(`✅ 文档站已生成：${wrote} 个页面 · ${articles.length} 篇文章 · sitemap 更新`);
