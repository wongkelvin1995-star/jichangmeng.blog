// 通知 IndexNow 本站有页面变化。默认只预览，不发送。
//   npm run indexnow -- --since 2026-11-05            预览 lastmod 不早于该日期的 URL（读取 dist/sitemap.xml）
//   npm run indexnow -- --urls /airports/,/about/     预览指定路径
//   加 --submit 才会真正提交，必须已经部署了正式构建
// 提交成功只表示通知已送达，不代表页面被抓取或收录。
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv } from 'vite';

const env = { ...loadEnv('production', process.cwd(), ''), ...process.env };
const config = JSON.parse(readFileSync(resolve('site.config.json'), 'utf8'));
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
};
const submit = args.includes('--submit');
const since = option('--since');
const paths = option('--urls');
const originText = env.SITE_ORIGIN || config.origin;
const key = env.INDEXNOW_KEY || config.indexNowKey;

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

if (!originText) fail('缺少正式域名，请设置 site.config.json 的 origin');
if (!since && !paths) fail('请用 --since <日期> 或 --urls <路径,路径> 指定变化的页面');

const origin = new URL(originText);
let urls;
if (paths) {
  urls = paths.split(',').map((path) => new URL(path.trim(), origin).href);
} else {
  const sitemap = readFileSync(resolve('dist', 'sitemap.xml'), 'utf8');
  urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>\s*<lastmod>(.*?)<\/lastmod>/g)]
    .filter(([, , lastmod]) => lastmod >= since)
    .map(([, loc]) => loc);
}

urls = [...new Set(urls)];

// 只允许提交本站地址，推广链接等站外 URL 一律拦下。
const foreign = urls.filter((url) => new URL(url).host !== origin.host);
if (foreign.length) fail(`发现非本站 URL，已停止：\n${foreign.join('\n')}`);
if (!urls.length) fail('没有符合条件的 URL。如果当前是预览构建，请先运行 npm run build:production。');

console.log(`将通知 ${urls.length} 个 URL：\n${urls.join('\n')}`);
if (!submit) {
  console.log('\n预览结束，未发送。确认后加 --submit。');
  process.exit(0);
}

if (!key) fail('缺少 IndexNow 密钥');
if (!existsSync(resolve('dist', `${key}.txt`))) fail('dist 里没有密钥文件，请先运行 npm run build:production 并部署。');

const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host: origin.host,
    key,
    keyLocation: new URL(`/${key}.txt`, origin).href,
    urlList: urls,
  }),
});

const meaning = {
  200: '已接收',
  202: '已接收，密钥待验证',
  400: '请求格式错误',
  403: '密钥无效，或密钥文件无法访问',
  422: 'URL 不属于该站点，或密钥与域名不匹配',
  429: '请求过于频繁',
};
console.log(`IndexNow 返回 ${response.status}：${meaning[response.status] ?? '未知状态'}`);

// 记录每次真实提交的结果，便于之后和 Bing 后台分开核对。
mkdirSync('logs', { recursive: true });
appendFileSync(
  resolve('logs', 'indexnow.jsonl'),
  JSON.stringify({ at: new Date().toISOString(), status: response.status, urls }) + '\n',
);
if (!response.ok) process.exit(1);
