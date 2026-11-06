// 截取教程配图：只截机场梦自己的页面。用本机 Edge（或 Chrome）的无界面模式，
// 按手机宽度 390px、2 倍清晰度截取指定区块，界面改动后重新运行即可更新配图。
//
// 用法：先 npm run build && npm run preview（默认 http://localhost:4321），再运行
//   node scripts/capture-guide-shots.mjs              重截全部
//   node scripts/capture-guide-shots.mjs 名称 名称 …   只截指定的几张（其余保持不变）
// 产物：materials/guide-screenshots/<日期>/*.png（原图，不公开）和 MANIFEST.json，
//       public/assets/guides/*.webp（文章引用的公开版本）。
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..');
const base = process.env.SHOT_BASE || 'http://localhost:4321';
const takenOn = new Date().toLocaleDateString('sv-SE');
const WIDTH = 390;
const SCALE = 2;

// selector：截整个元素；from：从这个 H2 截到下一个 H2 之前。maxHeight 以 CSS 像素计。
// width：视口宽度，默认手机 390px；clipTo：横向只截到这个容器（例如正文栏）。
// untilBottom：截到这个元素的底部为止；setup：截图前在页面里执行的脚本（例如切换筛选项）。
const SHOTS = [
  {
    name: 'directory-filters',
    path: '/airports/',
    selector: '[data-filters]',
    alt: '机场梦机场资料目录的筛选栏：可按品牌名称或别名搜索，按地区和付款方式筛选，并选择编辑顺序或价格排序',
  },
  {
    name: 'directory-card',
    path: '/airports/',
    selector: '#lingdongyun',
    maxHeight: 1100,
    alt: '机场梦目录里的一张品牌卡片：编辑顺序、资料状态、最低月付、资料要点、客户端提示、优惠码和查看全部报价',
  },
  {
    name: 'brand-plan-table',
    path: '/airports/twilight/',
    from: '#plan-details',
    width: 820,
    clipTo: '.prose',
    maxHeight: 900,
    alt: '暮光加速资料页的套餐表：每行一条报价，列出付款周期、一次付款标价、流量和资料状态',
  },
  {
    name: 'brand-client-paused',
    path: '/airports/lingdongyun/',
    from: '#client',
    // 截到“恢复时间”一行为止。
    maxHeight: 656,
    alt: '灵动云资料页的“客户端与订阅”一节：上方是本站建议，下方表格是资料记录的服务商说明、公告出处和恢复时间',
  },
  {
    name: 'brand-client-unsupported',
    path: '/airports/breezenet/',
    from: '#client',
    // 截到“第三方客户端”一行为止。
    maxHeight: 506,
    alt: '微风网络资料页的“客户端与订阅”一节：本站建议和资料记录的第三方客户端支持情况分开列出',
  },
  {
    name: 'search-results',
    path: '/search/?q=FLY%20V',
    selector: 'main .section',
    wait: 2000,
    alt: '机场梦站内搜索：输入别名“FLY V”，结果先列出品牌飞V的资料页，再列出相关文章',
  },
  {
    name: 'directory-notice',
    path: '/airports/',
    selector: 'main .page-head',
    untilBottom: 'main .section > p.notice',
    alt: '机场梦机场资料目录的页首：列出收录的品牌数和价格记录数，下方说明编辑顺序只是展示顺序，不代表统一测评、销量或绝对排名',
  },
  {
    name: 'directory-sort-price',
    path: '/airports/',
    selector: '[data-filters]',
    untilBottom: '[data-status-bar]',
    setup: "const s = document.querySelector('#filter-sort'); s.value = 'month'; s.dispatchEvent(new Event('input', { bubbles: true }));",
    alt: '机场梦目录选择“最低月付从低到高”排序后，状态栏提示有几家没有可比较的报价、排在末尾',
  },
  {
    name: 'directory-billing-onetime',
    path: '/airports/',
    selector: '[data-filters]',
    untilBottom: '[data-status-bar]',
    setup: "const s = document.querySelector('#filter-billing'); s.value = 'one_time'; s.dispatchEvent(new Event('input', { bubbles: true }));",
    alt: '机场梦目录的付款方式选择“有一次性流量包”后，状态栏显示符合条件的品牌数',
  },
  {
    name: 'brand-claims-tests',
    path: '/airports/lingdongyun/',
    from: '#claims',
    maxHeight: 1500,
    alt: '灵动云资料页的“流媒体、AI 声明与测试记录”一节：上方是资料声明支持 ChatGPT、Claude，下方是 2026-10-28 的第三方测试记录，写明 Claude 三地均无法连接，且不是机场梦实测',
  },
  {
    name: 'brand-network-doubt',
    path: '/airports/flycat/',
    from: '#network',
    // 截到“节点数疑点”一条为止。
    maxHeight: 776,
    alt: '飞猫云资料页的“节点与线路”一节：列出资料记载的地区和节点数，并标出节点总数与分区合计对不上的疑点',
  },
];
const only = process.argv.slice(2);
const selected = only.length ? SHOTS.filter((shot) => only.includes(shot.name)) : SHOTS;
if (only.length && selected.length !== only.length) throw new Error(`没有这些截图名称：${only.filter((name) => !SHOTS.some((shot) => shot.name === name)).join('、')}`);

const browsers = [
  process.env.SHOT_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean);
const browserPath = browsers.find((path) => existsSync(path));
if (!browserPath) throw new Error('没有找到 Edge 或 Chrome，可用 SHOT_BROWSER 指定浏览器路径');

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const port = 9300 + Math.floor(Math.random() * 600);
const profile = mkdtempSync(join(tmpdir(), 'jcm-shots-'));
const child = spawn(browserPath, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });

let ws;
try {
  let target;
  for (let i = 0; i < 60 && !target; i += 1) {
    await sleep(250);
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((item) => item.type === 'page');
    } catch {}
  }
  if (!target) throw new Error('无法连接无界面浏览器');

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => { ws.onopen = resolveOpen; ws.onerror = rejectOpen; });
  let seq = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { ok, fail } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) fail(new Error(message.error.message));
      else ok(message.result);
    } else {
      for (const listener of listeners) listener(message);
    }
  };
  const send = (method, params = {}) => new Promise((ok, fail) => {
    seq += 1;
    pending.set(seq, { ok, fail });
    ws.send(JSON.stringify({ id: seq, method, params }));
  });
  const waitFor = (name, timeout = 20000) => new Promise((ok, fail) => {
    const listener = (message) => {
      if (message.method !== name) return;
      clearTimeout(timer);
      listeners.delete(listener);
      ok(message.params);
    };
    const timer = setTimeout(() => { listeners.delete(listener); fail(new Error(`等待 ${name} 超时`)); }, timeout);
    listeners.add(listener);
  });
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.text);
    return result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');

  const rawDir = join(root, 'materials', 'guide-screenshots', takenOn);
  const publicDir = join(root, 'public', 'assets', 'guides');
  mkdirSync(rawDir, { recursive: true });
  mkdirSync(publicDir, { recursive: true });
  const manifestFile = join(rawDir, 'MANIFEST.json');
  // 只截部分图时，保留清单里其他图的记录。
  const manifest = existsSync(manifestFile) && only.length
    ? JSON.parse(readFileSync(manifestFile, 'utf8')).shots.filter((entry) => !only.includes(entry.name))
    : [];

  for (const shot of selected) {
    const width = shot.width ?? WIDTH;
    await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: SCALE, mobile: width < 768 });
    const loaded = waitFor('Page.loadEventFired');
    await send('Page.navigate', { url: new URL(shot.path, base).href });
    await loaded;
    await sleep(shot.wait ?? 800);
    // 截图时把吸顶导航改回普通流，避免它盖住区块。
    const rect = await evaluate(`(async (shot) => {
      const style = document.createElement('style');
      style.textContent = '.site-header{position:static !important}';
      document.head.append(style);
      if (shot.setup) new Function(shot.setup)();
      await new Promise((r) => setTimeout(r, 300));
      const element = document.querySelector(shot.selector || shot.from);
      if (!element) return { error: '找不到 ' + (shot.selector || shot.from) };
      const top = (node) => node.getBoundingClientRect().top + window.scrollY;
      const pad = 12;
      let y1;
      let y2;
      if (shot.from) {
        const heads = [...document.querySelectorAll('h2')];
        const next = heads[heads.indexOf(element) + 1];
        y1 = top(element) - pad;
        y2 = next ? top(next) - pad : y1 + 900;
      } else {
        const box = element.getBoundingClientRect();
        const end = shot.untilBottom ? document.querySelector(shot.untilBottom) : null;
        y1 = box.top + window.scrollY - pad;
        y2 = (end ? end.getBoundingClientRect().bottom : box.bottom) + window.scrollY + pad;
      }
      y1 = Math.max(0, Math.round(y1));
      const height = Math.min(Math.round(y2) - y1, shot.maxHeight || 2000);
      const viewportWidth = document.documentElement.clientWidth;
      const column = shot.clipTo ? element.closest(shot.clipTo) : null;
      if (!column) return { x: 0, y: y1, width: viewportWidth, height };
      const box = column.getBoundingClientRect();
      const x = Math.max(0, Math.round(box.left - pad));
      return { x, y: y1, width: Math.min(viewportWidth - x, Math.round(box.width + pad * 2)), height };
    })(${JSON.stringify(shot)})`);
    if (rect.error) throw new Error(`${shot.name}：${rect.error}`);

    const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 1 }, captureBeyondViewport: true });
    const png = Buffer.from(data, 'base64');
    writeFileSync(join(rawDir, `${shot.name}.png`), png);
    const info = await sharp(png).webp({ quality: 85 }).toFile(join(publicDir, `${shot.name}.webp`));
    const entry = {
      name: shot.name,
      src: `/assets/guides/${shot.name}.webp`,
      pixelWidth: info.width,
      pixelHeight: info.height,
      cssWidth: Math.round(info.width / SCALE),
      cssHeight: Math.round(info.height / SCALE),
      alt: shot.alt,
      page: shot.path,
      takenOn,
    };
    manifest.push(entry);
    console.log(`${shot.name}: ${entry.cssWidth}×${entry.cssHeight}（${info.width}×${info.height} 像素，${(info.size / 1024).toFixed(0)}KB）`);
    // 文章里直接可用的写法：srcset 写像素宽度并配 sizes，1 倍屏和 2 倍屏都按 CSS 宽度显示。
    console.log(`  <img src="${entry.src}" srcset="${entry.src} ${info.width}w" sizes="(max-width: ${entry.cssWidth + 40}px) 100vw, ${entry.cssWidth}px" width="${entry.cssWidth}" height="${entry.cssHeight}" alt="${shot.alt}" loading="lazy" decoding="async" />`);
  }
  manifest.sort((a, b) => SHOTS.findIndex((shot) => shot.name === a.name) - SHOTS.findIndex((shot) => shot.name === b.name));
  writeFileSync(manifestFile, JSON.stringify({ takenOn, base, width: WIDTH, scale: SCALE, shots: manifest }, null, 2) + '\n');
  console.log(`截图完成：本次 ${selected.length} 张，清单共 ${manifest.length} 张，原图在 materials/guide-screenshots/${takenOn}/`);
} finally {
  ws?.close();
  child.kill();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true });
}
