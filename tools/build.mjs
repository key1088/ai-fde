/*
 * 生成两个静态页：index.html（英文，默认）与 zh/index.html（中文）
 * ------------------------------------------------------------
 * 复用页面自身的渲染逻辑：用 jsdom 分别以 / 和 /zh/ 路径加载源文件，
 * 页面脚本会自动按路径选语言渲染（表格 / 雷达图 / 导图 / 文案），再把
 * 渲染后的 DOM 序列化落盘。这样两种语言的正文都在 HTML 源码里，
 * 爬虫（含百度 / 必应）无需执行 JS 也能收录。
 *
 * 源文件就是 index.html 本身（它同时是英文输出）。改动内容 / 文案后：
 *   npm install        # 仅首次
 *   npm run build
 */
import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'index.html');
const SITE = 'https://ai-fde.dev';

// 先把源读进内存（因为 index.html 同时是英文输出目标）
// trim 去掉末尾换行，否则每次构建都会被 jsdom 当成文本节点塞进 <body>，导致输出漂移
const source = fs.readFileSync(SRC, 'utf8').trim();

function stubCanvas(w) {
  // jsdom 没有 canvas / SVG 布局，用最简桩让渲染逻辑跑完
  w.HTMLCanvasElement.prototype.getContext = () => ({
    font: '',
    measureText: (s) => ({ width: String(s).length * 7 }),
  });
  w.SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 1200, height: 600 });
  const size = (v) => ({ get: () => v, configurable: true });
  Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', size(1240));
  Object.defineProperty(w.HTMLElement.prototype, 'clientHeight', size(600));
  // 固定为英文，避免自动语言跳转在构建时触发
  Object.defineProperty(w.navigator, 'language', { value: 'en-US', configurable: true });
}

async function render(urlPath) {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', (e) => errors.push(e.message));
  const dom = new JSDOM(source, {
    runScripts: 'dangerously',
    url: SITE + urlPath,
    virtualConsole: vc,
    pretendToBeVisual: true,
    beforeParse: stubCanvas,
  });
  const { window } = dom;
  await new Promise((r) => window.addEventListener('load', r, { once: true }));
  await new Promise((r) => setTimeout(r, 400));
  return { doc: window.document, errors };
}

function write(file, doc) {
  let out = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML + '\n';
  // 根相对资源路径兜底（相对路径在 /zh/ 下会解析错）
  out = out.replace(/href="favicon\.ico"/g, 'href="/favicon.ico"')
           .replace(/href="apple-touch-icon\.png"/g, 'href="/apple-touch-icon.png"');
  // 规范化 </body> 前的空白，保证多次构建输出稳定（幂等）
  out = out.replace(/[\s]*<\/body>/, '\n</body>');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out);
  return out.length;
}

function inspect(doc) {
  const visible = ['#tb', '#lvBody', '#gapGrid', 'header', 'nav', 'footer']
    .map((s) => doc.querySelector(s)?.textContent || '')
    .join(' ');
  return {
    lang: doc.documentElement.lang,
    title: doc.title,
    h1: doc.querySelector('h1')?.textContent.trim(),
    skills: doc.querySelectorAll('#tb tr:not(.dh)').length,
    levelRows: doc.querySelectorAll('#lvBody tr').length,
    gapCards: doc.querySelectorAll('#gapGrid .card').length,
    canonical: doc.getElementById('canonicalLink')?.getAttribute('href'),
    ogUrl: doc.querySelector('meta[property="og:url"]')?.getAttribute('content'),
    zhChars: (visible.match(/[\u4e00-\u9fff]/g) || []).length,
  };
}

const problems = [];

// ---- 英文（默认，根路径）----
const en = await render('/');
const enInfo = inspect(en.doc);
write(SRC, en.doc);
if (enInfo.lang !== 'en') problems.push('EN: lang=' + enInfo.lang);
if (enInfo.skills !== 53) problems.push('EN: skills=' + enInfo.skills);
if (!/Self-Assessment|Skill/i.test(enInfo.h1 || '')) problems.push('EN: h1 未翻译 ' + enInfo.h1);
if (enInfo.canonical !== SITE + '/') problems.push('EN: canonical=' + enInfo.canonical);
if (enInfo.zhChars > 0) problems.push('EN: 可见区残留中文 ' + enInfo.zhChars + ' 处');

// ---- 中文（/zh/）----
const zh = await render('/zh/');
const zhInfo = inspect(zh.doc);
write(path.join(root, 'zh', 'index.html'), zh.doc);
if (zhInfo.lang !== 'zh-CN') problems.push('ZH: lang=' + zhInfo.lang);
if (zhInfo.skills !== 53) problems.push('ZH: skills=' + zhInfo.skills);
if (zhInfo.canonical !== SITE + '/zh/') problems.push('ZH: canonical=' + zhInfo.canonical);
if (zhInfo.zhChars < 50) problems.push('ZH: 中文内容异常，仅 ' + zhInfo.zhChars + ' 字');

console.log('EN /      :', enInfo);
console.log('ZH /zh/   :', zhInfo);
if (en.errors.length || zh.errors.length) {
  console.log('jsdom errors (canvas/SVG 桩产生的可忽略):', [...en.errors, ...zh.errors].slice(0, 3));
}
if (problems.length) {
  console.error('\n❌ 未通过自检:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
console.log('\n✅ 已生成 index.html（英文）与 zh/index.html（中文）');
