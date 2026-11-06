// 社交分享图（og:image）与文章结构化数据的配图（站长 2026-11-06 同意设计）。
// 每个可索引页面一张 1200×630：深色极光背景、品牌标记和站名、栏目标签、页面 H1、口号；
// 品牌资料页另外放上页面里同一个 Logo 外框（直接复用页面的标记和样式，Logo 与外框和网站一致）。
// 用本机 Edge 无界面模式渲染（中文用系统字体），不在 Cloudflare 构建时生成；图上不印域名，域名改了也不用重做。
//
// 用法：先 npm run build 并 npm run preview（http://localhost:4321），再 npm run og。
// 页面标题、Logo 改了或新增页面后要重新运行；verify-dist 会提示标题已经变了的分享图。
// 输出：public/assets/og/<页面>-<哈希>.jpg 和 src/data/og-images.json。
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const base = process.env.PREVIEW_URL || 'http://localhost:4321';
const outDir = join(root, 'public', 'assets', 'og');
const SIZE = { width: 1200, height: 630 };
const SLOGAN = '一个小小的机场，拥有大大的梦想';
const SECTION_KIND = { '/airports/': '机场资料', '/guides/': '选购指南', '/reviews/': '评析与测试解读', '/compare/': '条件对比' };

const browserPath = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((path) => existsSync(path));
if (!browserPath) throw new Error('找不到本机的 Edge 或 Chrome');
if (!existsSync(join(dist, 'index.html'))) throw new Error('dist/ 里没有构建产物，先运行 npm run build');
try { await fetch(base); } catch { throw new Error(`连不上 ${base}，先运行 npm run preview`); }

// ---------- 读取页面：H1、栏目、品牌 Logo 外框 ----------
const files = [];
const walk = (dir) => { for (const name of readdirSync(dir)) { const path = join(dir, name); if (statSync(path).isDirectory()) walk(path); else if (name === 'index.html') files.push(path); } };
walk(dist);
const escapeHtml = (text) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const decode = (text) => text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const plain = (html) => decode(html.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').trim();

const pages = [];
for (const file of files) {
  const route = `/${relative(dist, file).replaceAll('\\', '/')}`.replace(/index\.html$/, '');
  if (route === '/search/') continue; // 搜索页 noindex，用全站默认分享图
  const html = readFileSync(file, 'utf8');
  const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  const h1 = main.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1];
  if (!h1) throw new Error(`${route} 没有 H1`);
  const kind = main.match(/<p class="article-kind"[^>]*>([^<]+)<\/p>/)?.[1]?.trim() ?? (route === '/' ? null : SECTION_KIND[route] ?? '本站说明');
  // 品牌资料页：取页面里第一个 Logo 外框（BrandLogo 的标记：外框 div、SVG、加载失败时的文字层）。
  const logo = /^\/airports\/[^/]+\/$/.test(route) ? main.match(/<div class="brand-media">[\s\S]*?<div class="brand-fallback"[\s\S]*?<\/div><\/div>/)?.[0] ?? null : null;
  if (/^\/airports\/[^/]+\/$/.test(route) && !logo) throw new Error(`${route} 找不到 Logo 外框`);
  const css = [...html.matchAll(/<link rel="stylesheet" href="([^"]+\.css)"/g)].map((m) => m[1]);
  pages.push({ route, title: plain(h1), kind, logo, css });
}
pages.sort((a, b) => a.route.localeCompare(b.route));

// ---------- 版面 ----------
const cjkLength = (text) => [...text.replace(/\s/g, '')].reduce((n, ch) => n + (/[\u2e80-\uffff]/.test(ch) ? 1 : 0.55), 0);
const titleSize = (text, withLogo) => {
  const n = cjkLength(text);
  const size = n <= 12 ? 72 : n <= 18 ? 64 : n <= 26 ? 58 : n <= 34 ? 52 : 46;
  return withLogo ? Math.min(size, 54) : size;
};
const template = (page) => `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
${page.css.map((href) => `<link rel="stylesheet" href="${href}">`).join('\n')}
<style>
  html, body { margin: 0; width: ${SIZE.width}px; height: ${SIZE.height}px; overflow: hidden; background: #060812; }
  body { display: block; min-height: 0; }
  .og { position: relative; box-sizing: border-box; width: ${SIZE.width}px; height: ${SIZE.height}px; padding: 54px 72px; overflow: hidden; color: var(--text); font-family: var(--font);
    background:
      radial-gradient(70% 90% at 96% -6%, rgba(169, 155, 239, 0.36), transparent 62%),
      radial-gradient(55% 80% at -4% 104%, rgba(105, 221, 214, 0.26), transparent 64%),
      radial-gradient(45% 55% at 70% 118%, rgba(220, 157, 213, 0.24), transparent 70%),
      linear-gradient(160deg, #0e1528 0%, #060812 72%); }
  .og::before { content: ''; position: absolute; inset: 0; opacity: 0.55; pointer-events: none;
    background-image:
      radial-gradient(1.6px 1.6px at 8% 18%, #fff, transparent), radial-gradient(1.2px 1.2px at 23% 72%, #cfe9ff, transparent),
      radial-gradient(1.4px 1.4px at 41% 12%, #fff, transparent), radial-gradient(1px 1px at 57% 84%, #e9e2ff, transparent),
      radial-gradient(1.6px 1.6px at 76% 30%, #fff, transparent), radial-gradient(1.2px 1.2px at 88% 66%, #d8fff9, transparent),
      radial-gradient(1px 1px at 64% 48%, #fff, transparent), radial-gradient(1.3px 1.3px at 33% 40%, #f4e4f2, transparent); }
  .og__top { position: relative; display: flex; align-items: center; justify-content: space-between; }
  .og__brand { display: flex; align-items: center; gap: 16px; font-size: 34px; font-weight: 800; letter-spacing: 0.06em; }
  .og__mark { width: 42px; height: 42px; flex: none; border-radius: 50%;
    background: conic-gradient(from 210deg, var(--cyan), var(--lilac), var(--pink), var(--cyan));
    -webkit-mask: radial-gradient(farthest-side, transparent 58%, #000 62%); mask: radial-gradient(farthest-side, transparent 58%, #000 62%); }
  .og__kind { padding: 8px 24px; color: #0b1020; font-size: 24px; font-weight: 700; letter-spacing: 0.08em; background: var(--aurora); border-radius: 999px; }
  .og__body { position: absolute; left: 72px; right: 72px; top: 138px; bottom: 116px; display: flex; flex-direction: column; justify-content: center; gap: 26px; }
  /* 标题优先在标点处换行（keep-all），某一段放不下时脚本会改回普通换行。 */
  .og__title { margin: 0; font-weight: 800; line-height: 1.3; letter-spacing: 0.01em; text-wrap: balance; word-break: keep-all; overflow-wrap: anywhere;
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .og__title.is-loose { word-break: normal; }
  /* 右侧的大圆环：品牌标记放大做水印，补足右边的空白。 */
  .og__ring { position: absolute; top: 96px; right: -120px; width: 520px; height: 520px; border-radius: 50%; opacity: 0.2;
    background: conic-gradient(from 210deg, var(--cyan), var(--lilac), var(--pink), var(--cyan));
    -webkit-mask: radial-gradient(farthest-side, transparent 72%, #000 74%, #000 86%, transparent 88%);
    mask: radial-gradient(farthest-side, transparent 72%, #000 74%, #000 86%, transparent 88%); }
  .og__logo { width: 432px; flex: none; }
  .og__logo .brand-media { margin: 0; box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45); }
  .og__foot { position: absolute; left: 72px; right: 72px; bottom: 50px; display: flex; align-items: center; gap: 20px; color: var(--muted); font-size: 24px; letter-spacing: 0.06em; }
  .og__line { flex: 1; height: 3px; border-radius: 3px; background: var(--aurora); opacity: 0.85; }
  .og--home .og__body { gap: 18px; }
  .og__name { font-size: 132px; font-weight: 900; line-height: 1.1; letter-spacing: 0.08em; background: var(--aurora); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .og__slogan { font-size: 44px; font-weight: 700; }
  .og__tagline { color: var(--muted); font-size: 28px; letter-spacing: 0.06em; }
</style></head>
<body>${page.route === '/' ? `
<div class="og og--home">
  <span class="og__ring"></span>
  <div class="og__top"><div class="og__brand"><span class="og__mark"></span>机场梦</div></div>
  <div class="og__body">
    <div class="og__name">机场梦</div>
    <div class="og__slogan">${SLOGAN}</div>
    <div class="og__tagline">机场资料整理 · 新手教程 · 选购方法</div>
  </div>
  <div class="og__foot"><span class="og__line"></span><span>透明整理，用心维护</span></div>
</div>` : `
<div class="og">
  <span class="og__ring"></span>
  <div class="og__top"><div class="og__brand"><span class="og__mark"></span>机场梦</div><div class="og__kind">${escapeHtml(page.kind)}</div></div>
  <div class="og__body">
    ${page.logo ? `<div class="og__logo">${page.logo}</div>` : ''}
    <h1 class="og__title" style="font-size:${titleSize(page.title, Boolean(page.logo))}px">${escapeHtml(page.title.replace(/\n/g, ' '))}</h1>
  </div>
  <div class="og__foot"><span>${SLOGAN}</span><span class="og__line"></span></div>
</div>`}
</body></html>`;

// ---------- 渲染 ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9300 + Math.floor(Math.random() * 600);
const profile = mkdtempSync(join(tmpdir(), 'jcm-og-'));
const child = spawn(browserPath, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
let ws;
const manifest = {};
try {
  let target;
  for (let i = 0; i < 60 && !target; i += 1) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch {} }
  if (!target) throw new Error('无法启动无界面浏览器');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let seq = 0; const pending = new Map(); const listeners = new Set();
  ws.onmessage = (event) => { const m = JSON.parse(event.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.fail(new Error(m.error.message)) : p.ok(m.result); } else for (const l of listeners) l(m); };
  const send = (method, params = {}) => new Promise((ok, fail) => { seq += 1; pending.set(seq, { ok, fail }); ws.send(JSON.stringify({ id: seq, method, params })); });
  const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { ...SIZE, deviceScaleFactor: 1, mobile: false });
  // 先打开预览站的一个页面，模板里的样式和图片按同源地址加载。
  const loaded = new Promise((ok) => { const l = (m) => { if (m.method === 'Page.loadEventFired') { listeners.delete(l); ok(); } }; listeners.add(l); });
  await send('Page.navigate', { url: `${base}/404.html` });
  await loaded;
  const { frameTree } = await send('Page.getFrameTree');

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const page of pages) {
    await send('Page.setDocumentContent', { frameId: frameTree.frame.id, html: template(page) });
    await evaluate(`(async () => {
      await Promise.all([...document.styleSheets].map(() => null));
      await new Promise((r) => { const links = [...document.querySelectorAll('link[rel=stylesheet]')]; let left = links.length; if (!left) r(); links.forEach((l) => { if (l.sheet) { if (!--left) r(); } else { l.onload = l.onerror = () => { if (!--left) r(); }; } }); });
      await document.fonts.ready;
      const hrefs = [...new Set([...document.querySelectorAll('image')].map((i) => i.getAttribute('href')))];
      await Promise.all(hrefs.map((h) => new Promise((ok, fail) => { const im = new Image(); im.onload = ok; im.onerror = () => fail(new Error('图片加载失败 ' + h)); im.src = h; })));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => setTimeout(r, 250));
      const title = document.querySelector('.og__title');
      // 只在标点处断行时，若某一段比一行还长或超过三行，就改回普通换行。
      if (title && (title.scrollWidth > title.clientWidth + 1 || title.scrollHeight > title.clientHeight + 2)) {
        title.classList.add('is-loose');
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      }
      if (title && title.scrollHeight > title.clientHeight + 2) throw new Error('标题超过三行：' + title.textContent);
    })()`);
    const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, ...SIZE, scale: 1 } });
    const jpeg = await sharp(Buffer.from(data, 'base64')).jpeg({ quality: 84, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer();
    const slug = page.route === '/' ? 'home' : page.route.replace(/^\/|\/$/g, '').replaceAll('/', '-');
    const name = `${slug}-${createHash('sha256').update(jpeg).digest('hex').slice(0, 8)}.jpg`;
    writeFileSync(join(outDir, name), jpeg);
    manifest[page.route] = { src: `/assets/og/${name}`, width: SIZE.width, height: SIZE.height, title: page.title, kind: page.kind };
  }
} finally {
  ws?.close();
  child.kill();
  await sleep(1200);
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 }); } catch {}
}
writeFileSync(join(root, 'src', 'data', 'og-images.json'), JSON.stringify(manifest, null, 2) + '\n');
const bytes = readdirSync(outDir).reduce((sum, name) => sum + statSync(join(outDir, name)).size, 0);
console.log(`分享图 ${Object.keys(manifest).length} 张，共 ${Math.round(bytes / 1024)}KB，保存在 public/assets/og/`);
