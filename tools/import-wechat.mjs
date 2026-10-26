/*
 * 公众号文章 → 站点文档
 * ------------------------------------------------------------
 * 把 mp.weixin.qq.com 的图文抓下来，转成干净的中文 Markdown，图片落到本地：
 *
 *   content/docs/<slug>/zh.md        正文（生成后建议人工过一遍）
 *   media/docs/<slug>/*              文中图片（站内以 /media/docs/<slug>/ 对外）
 *   content/docs/<slug>/meta.json    标题 / 日期 / 来源 / 顺序（en 字段留给翻译）
 *
 * 用法：
 *   node tools/import-wechat.mjs --all            # 导入 sources.json 里所有文章
 *   node tools/import-wechat.mjs 00-intro         # 只导入某篇（slug）
 *   node tools/import-wechat.mjs --all --force    # 覆盖已存在的 zh.md
 *
 * 设计原则：这是「一次性把内容搬进来 + 以后每加一篇都走同一个口」的脚本。
 * 它只生成中文底稿；英文（en.md）由人工/翻译补，脚本绝不覆盖 en.md。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sources = JSON.parse(fs.readFileSync(path.join(root, 'content/sources.json'), 'utf8'));
const force = process.argv.includes('--force');
const wantAll = process.argv.includes('--all');
const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
  strongDelimiter: '**',
  linkStyle: 'inlined',
});
turndown.use(gfm);
// 去掉 <img> 默认产生的 "![]()" 里冗余的空 alt，保留有序图注
turndown.addRule('figure', {
  filter: 'figure',
  replacement: (content) => `\n\n${content.trim()}\n\n`,
});

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://mp.weixin.qq.com/' },
  });
  if (!res.ok) throw new Error(`抓取失败 ${res.status} ${url}`);
  return await res.text();
}

async function downloadImage(url, dest) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://mp.weixin.qq.com/' },
  });
  if (!res.ok) throw new Error(`图片下载失败 ${res.status}`);
  const type = res.headers.get('content-type') || '';
  const ext = type.includes('jpeg') || type.includes('jpg')
    ? 'jpg'
    : type.includes('gif')
      ? 'gif'
      : type.includes('webp')
        ? 'webp'
        : 'png';
  const file = dest.replace(/\.[a-z]+$/, '.' + ext);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return path.basename(file);
}

// 把公众号那套内联样式 / 自定义标签，整理成 turndown 能读懂的结构
function normalize(container, slug, assetsDir) {
  container.querySelectorAll('mp-style-type,sc-clipboard,script,style').forEach((n) => n.remove());

  // 1) 行内 font-weight:bold 的 span → <strong>；其余 span 直接展开
  [...container.querySelectorAll('span')].reverse().forEach((span) => {
    const style = span.getAttribute('style') || '';
    const bold = /font-weight:\s*(bold|[6-9]00)/i.test(style);
    const em = /font-style:\s*italic/i.test(style);
    const inner = span.innerHTML;
    let replacement;
    if (bold) replacement = `<strong>${inner}</strong>`;
    else if (em) replacement = `<em>${inner}</em>`;
    else replacement = inner;
    span.insertAdjacentHTML('beforebegin', replacement);
    span.remove();
  });

  // 2) <pre> 里通常是「一行一个 <span>」或「一行一个 <code>」→ 合并成单个 <code> 块
  //    公众号很多代码块把 <br> 放在 span 里，必须先把 <br> 换成换行再取 textContent，
  //    否则整段代码会被粘成一行（缩进全丢）。
  container.querySelectorAll('pre').forEach((pre) => {
    const lineText = (el) => {
      const clone = el.cloneNode(true);
      clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
      return clone.textContent.replace(/\u00a0/g, ' ');
    };
    const directCodes = [...pre.children].filter((el) => el.tagName === 'CODE');
    const code = (directCodes.length > 1
      ? directCodes.map(lineText).join('\n')
      : lineText(pre)
    )
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s+$/, '');
    pre.innerHTML = `<code>${esc(code)}</code>`;
    pre.removeAttribute('data-lang');
    pre.removeAttribute('class');
  });

  // 3) 图片：data-src → 下载到本地 assets，src 指向站内绝对路径
  const images = [];
  const imgEls = [...container.querySelectorAll('img')];
  fs.mkdirSync(assetsDir, { recursive: true });
  for (let i = 0; i < imgEls.length; i++) {
    const img = imgEls[i];
    const src = img.getAttribute('data-src') || img.getAttribute('src');
    if (!src) {
      img.remove();
      continue;
    }
    const name = `img-${String(i + 1).padStart(2, '0')}.png`;
    img.setAttribute('src', `/media/docs/${slug}/${name}`);
    img.setAttribute('alt', img.getAttribute('alt') || '');
    img.removeAttribute('data-src');
    img.removeAttribute('data-aistatus');
    images.push({ name, originalName: name, src });
  }

  // 4) 表格：公众号的表没有 <thead>、单元格里还套着 <p>/<section>，turndown 认不出来。
  //    统一补 <thead>（首行转 <th>）、把单元格里的块级标签摊平（section 也要摊）。
  container.querySelectorAll('table').forEach((table) => {
    const doc = container.ownerDocument;
    const rows = [...table.querySelectorAll('tr')];
    if (!rows.length) return;
    if (!table.querySelector('thead') && rows[0]) {
      const thead = doc.createElement('thead');
      const headRow = rows[0];
      headRow.querySelectorAll('td').forEach((td) => {
        const th = doc.createElement('th');
        th.innerHTML = td.innerHTML;
        td.replaceWith(th);
      });
      headRow.parentNode.insertBefore(thead, headRow);
      thead.appendChild(headRow);
    }
    table.querySelectorAll('th,td').forEach((cell) => {
      cell.querySelectorAll('br').forEach((br) => br.replaceWith(' '));
      // 逐层摊平 p/section/div/li，嵌套结构也能处理
      for (let guard = 0; guard < 6; guard++) {
        const blocks = [...cell.querySelectorAll('p,section,div,li,blockquote')];
        if (!blocks.length) break;
        blocks.forEach((el) => el.replaceWith(...el.childNodes));
      }
      cell.innerHTML = cell.innerHTML.replace(/\s+/g, ' ').trim();
    });
  });

  // 5) 标题归一化：
  //    公众号里正文段落有时也用 <h2>（只是排版字号），反过来有些小标题是纯 <p>。
  //    规则：有「一、/第X章/1.」等编号且不长 → 统一成 <h2>；其余 h1-h4 → 降回 <p>。
  const HEADING_RE = /^([一二三四五六七八九十百]+、|第[一二三四五六七八九十百\d]+[章节条]|[0-9]+[、.．])/;
  container.querySelectorAll('h1,h2,h3,h4').forEach((h) => {
    const text = h.textContent.replace(/\*\*/g, '').trim();
    if (text && text.length <= 80 && HEADING_RE.test(text)) {
      const nh = container.ownerDocument.createElement('h2');
      nh.textContent = text;
      h.replaceWith(nh);
    } else {
      const p = container.ownerDocument.createElement('p');
      p.innerHTML = h.innerHTML;
      h.replaceWith(p);
    }
  });

  // 6) 纯文本小标题提升为 <h2>（只认「一、」这种强编号，且要求是不含子块的叶子节点）
  container.querySelectorAll('p,section').forEach((el) => {
    if (el.querySelector('p,section,div,table,img,pre')) return;
    const text = el.textContent.replace(/\*\*/g, '').trim();
    if (text && text.length <= 60 && /^[一二三四五六七八九十百]+、/.test(text) && !/[。；]$/.test(text)) {
      const h = container.ownerDocument.createElement('h2');
      h.textContent = text;
      el.replaceWith(h);
    }
  });

  // 7) 「整段加粗 + 以一/二/… 开头」的 <p> 其实是小标题 → 提升为 <h2>
  container.querySelectorAll('p').forEach((p) => {
    const text = p.textContent.trim();
    if (!text || text.length > 40) return;
    const boldSpan = /font-weight:\s*(bold|[6-9]00)/i.test(p.innerHTML);
    const strongText = [...p.querySelectorAll('strong')].map((s) => s.textContent).join('').trim();
    const allBold = strongText === text || (boldSpan && p.children.length <= 2);
    if (allBold && /^(一|二|三|四|五|六|七|八|九|十|第[一二三四五六七八九十\d]+[、.．]|\d+[、.．])/.test(text)) {
      const h = container.ownerDocument.createElement('h2');
      h.textContent = text;
      p.replaceWith(h);
    }
  });

  // 8) 清理：纯空段、纯 <br> 段
  container.querySelectorAll('p').forEach((p) => {
    if (!p.textContent.trim() && !p.querySelector('img')) p.remove();
  });

  // 9) 标题里残留的加粗标记直接去掉（公众号常见 <strong> 被拆成多段）
  container.querySelectorAll('h1,h2,h3').forEach((h) => {
    h.textContent = h.textContent.replace(/\*\*/g, '').trim();
  });

  return images;
}

function buildMeta(entry, doc, images) {
  const rawTitle = doc.querySelector('#activity-name')?.textContent.trim() || '';
  const m = rawTitle.split(/[｜|]/);
  const titleZh = (m[0] || rawTitle).trim();
  const subtitleZh = m.slice(1).join('｜').trim();
  return {
    slug: entry.slug,
    series: entry.series,
    order: entry.order,
    source: entry.url,
    date: entry.date || '',
    images,
    title: { zh: titleZh, en: '' },
    subtitle: { zh: subtitleZh, en: '' },
    summary: { zh: entry.summaryZh || '', en: '' },
    tags: entry.tags || [],
  };
}

function mergeMeta(dir, fresh) {
  const file = path.join(dir, 'meta.json');
  if (!fs.existsSync(file)) return fresh;
  const old = JSON.parse(fs.readFileSync(file, 'utf8'));
  const merged = { ...fresh, ...old };
  // 只回填生成字段；人工翻译（en）和人工填写一律保留
  merged.slug = fresh.slug;
  merged.series = fresh.series;
  merged.order = fresh.order;
  merged.source = fresh.source;
  merged.images = fresh.images;
  merged.date = old.date || fresh.date;
  for (const k of ['title', 'subtitle', 'summary']) {
    merged[k] = { zh: old[k]?.zh || fresh[k].zh, en: old[k]?.en || '' };
  }
  return merged;
}

async function run(entry) {
  const dir = path.join(root, 'content/docs', entry.slug);
  const assetsDir = path.join(root, 'media/docs', entry.slug);
  const zhFile = path.join(dir, 'zh.md');
  fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(zhFile) && !force) {
    console.log(`↷ ${entry.slug} 已存在 zh.md（用 --force 覆盖），跳过`);
    return;
  }

  const html = await fetchHtml(entry.url);
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const content = doc.querySelector('#js_content');
  if (!content) throw new Error(`没抓到正文：#js_content（${entry.url}）`);

  // 发布日期
  let date = '';
  const ctMatch = html.match(/var\s+ct\s*=\s*"(\d+)"/);
  if (ctMatch) date = new Date(+ctMatch[1] * 1000).toISOString().slice(0, 10);

  const images = normalize(content, entry.slug, assetsDir);
  for (const img of images) {
    img.name = await downloadImage(img.src, path.join(assetsDir, img.name));
  }

  let md = turndown.turndown(content.innerHTML);
  // 图片可能实际是 jpg/webp，下载后扩展名会变；把正文里的路径同步成真实文件名
  for (const img of images) {
    if (img.originalName && img.name !== img.originalName) {
      md = md.split(`/media/docs/${entry.slug}/${img.originalName}`).join(`/media/docs/${entry.slug}/${img.name}`);
    }
  }
  md = md
    // 整行加粗的标题 → 去掉 **
    .replace(/^(#{1,6}) \*\*(.+?)\*\*$/gm, '$1 $2')
    // 标题里任何残留的 ** 都去掉
    .replace(/^(#{1,6}) (.*)$/gm, (line, hashes, text) => `${hashes} ${text.replace(/\*\*/g, '')}`)
    // 列表项统一成 "- "
    .replace(/^[-*]\s{2,}/gm, '- ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
  // 作者偶尔把一句话/链接当成了 h2：含链接或疑问句的 h2 降回正文
  md = md.replace(/^## (?![一二三四五六七八九十第\d])(.+[？?]|.*https?:\/\/.*)$/gm, '$1');
  fs.writeFileSync(zhFile, md + '\n');

  const meta = mergeMeta(dir, buildMeta({ ...entry, date }, doc, images));
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');

  console.log(`✓ ${entry.slug}  zh.md ${md.length}字 · 图片 ${images.length} 张 · ${date}`);
  if (!meta.title.en) console.log(`  ↳ 待翻译：title.en / summary.en / en.md`);
}

const targets = wantAll
  ? sources.articles
  : sources.articles.filter((a) => wanted.includes(a.slug) || wanted.includes(a.url));
if (!targets.length) {
  console.error('没有匹配的文章。用法：node tools/import-wechat.mjs --all | <slug>');
  process.exit(1);
}
for (const t of targets) await run(t);
console.log('\n✅ 导入完成。下一步：人工校对 content/docs/<slug>/zh.md，再补 en.md。');
