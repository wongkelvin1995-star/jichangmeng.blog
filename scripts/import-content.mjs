// 把内容资料包的正文导入项目内容集合。
// 用法：node scripts/import-content.mjs "<内容资料包目录>" --published-on 2026-11-05 [--overwrite]
//
// 默认不覆盖已有文件，避免冲掉人工修改；--overwrite 才会重写。
// 正文中的资料包内部提示和历史截图会被移除；截图决定不公开，原文件留在 materials/package/assets/tests/。
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const args = process.argv.slice(2);
const packageDir = args[0] ? resolve(args[0]) : null;
const publishedOn = args[args.indexOf('--published-on') + 1];
const overwrite = args.includes('--overwrite');
if (!packageDir || !args.includes('--published-on') || !/^\d{4}-\d{2}-\d{2}$/.test(publishedOn)) {
  console.error('用法：node scripts/import-content.mjs "<内容资料包目录>" --published-on YYYY-MM-DD [--overwrite]');
  process.exit(1);
}

const root = resolve(import.meta.dirname, '..');
const readJson = async (name) => JSON.parse(await readFile(join(packageDir, name), 'utf8'));
const manifest = await readJson('publication-manifest.json');
const seoMap = await readJson('seo-page-map.json');
const linkMap = await readJson('link-map.json');
const seoByPath = new Map(seoMap.pages.map((page) => [page.targetPath, page]));
const linksByPath = new Map(linkMap.pages.map((page) => [page.targetPath, page]));

const GUIDE_CATEGORY = {
  'airport-plan-checklist': '选购与付款',
  'monthly-annual-total-traffic': '选购与付款',
  'traffic-multiplier-reset': '选购与付款',
  'iepl-iplc-bgp-evidence': '线路与测试',
  'latency-speed-jitter': '线路与测试',
  'how-to-test-evening': '线路与测试',
  'streaming-ai-availability': '线路与测试',
  'client-subscription-troubleshooting': '使用排查',
};

const splitFrontmatter = (text) => {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error('缺少 frontmatter');
  return { front: parseYaml(match[1]), body: match[2].replace(/\r\n/g, '\n') };
};

// 面向编辑的提示和内部称呼换成读者能看懂的说法。
function cleanBody(body) {
  return body
    .replace(/^# .*\n/m, '')
    .replace(/^> 来源整理稿[^\n]*\n/m, '')
    .replace(/本稿/g, '本文')
    .replace(/旧稿|旧汇编/g, '旧资料')
    .replace(/本轮/g, '本次')
    .replace(/站长补充/g, '本站补充')
    .replace(/本站新设计的飞猫图形用于品牌展示，也不构成官方认证或服务能力证据。/g, '')
    .replace(/本站采用站长明确更正的优惠码/g, '本站收录的优惠码为')
    .replace(/本站记录已按站长更正使用/g, '本站记录使用')
    .replace(/已按站长确认关联到/g, '经本站确认对应')
    .replace(/，并确认(两码|8折)/g, '，站长确认$1')
    .replace(/站长提供的代码/g, '本站收录的优惠码')
    .replace(/站长提供/g, '本站收录')
    .replace(/站长指定的参考网站/g, '第三方参考资料')
    .replace(/参考站|参考页/g, '参考资料')
    .trim();
}

// 文末的问答没有上级标题时补一个，目录和阅读都更清楚。
function addFaqHeading(body) {
  if (/^## 常见问题/m.test(body)) return body;
  const first = body.search(/^### .*[？?]\s*$/m);
  if (first === -1 || /^## /m.test(body.slice(first))) return body;
  return `${body.slice(0, first)}## 常见问题\n\n${body.slice(first)}`;
}

// 历史截图不公开：去掉“四张界面样本”整节；其他地方再出现资料包图片就报错，避免漏网。
function stripHistoricalImages(body) {
  const result = body.replace(/^## 四张界面样本\n[\s\S]*?(?=^## )/m, '');
  if (/\.\.\/assets/.test(result)) throw new Error('正文仍有资料包图片路径');
  return result;
}

async function writeEntry(collection, slug, front, body) {
  const dir = join(root, 'src', 'content', collection);
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${slug}.md`);
  if (existsSync(file) && !overwrite) {
    const existing = await readFile(file, 'utf8');
    // 目录品牌的空编辑稿可以被替换，其他已有文件保留。
    if (!/^---\r?\ndraft: true\r?\n---\r?\n?$/.test(existing)) {
      console.log(`跳过（已存在）：${collection}/${slug}.md`);
      return;
    }
  }
  await writeFile(file, `---\n${stringifyYaml(front).trim()}\n---\n\n${body}\n`);
  written.push(`${collection}/${slug}`);
}

const written = [];

for (const page of manifest.pages) {
  // 首页和栏目页由 Astro 页面实现，文案已写进模板。
  if (!page.file || page.kind === 'home' || page.kind === 'collection') continue;
  const { front, body } = splitFrontmatter(await readFile(join(packageDir, page.file), 'utf8'));
  const seo = seoByPath.get(page.targetPath);
  if (!seo) throw new Error(`seo-page-map 缺少 ${page.targetPath}`);
  const links = linksByPath.get(page.targetPath);
  const dates = { publishedAt: publishedOn, updatedAt: publishedOn };
  const base = {
    title: seo.h1,
    seoTitle: seo.title,
    description: seo.description,
    draft: false,
    ...dates,
    relatedPaths: links?.relatedPaths ?? page.relatedPaths ?? [],
  };

  if (page.kind === 'brand-analysis') {
    // 只取正文开头的评析部分；后面的套餐和线路表由模板按结构化数据渲染。
    const markers = ['<a id="plan-details"></a>', '## 基本信息与资料时间', '## 套餐价格与付款周期'];
    const positions = markers.map((marker) => body.indexOf(marker)).filter((position) => position !== -1);
    if (!positions.length) throw new Error(`${page.file} 找不到资料部分`);
    const end = Math.min(...positions);
    const analysis = addFaqHeading(cleanBody(body.slice(0, end)));
    const { title, seoTitle, description, ...rest } = base;
    await writeEntry('airports', page.id, { title, seoTitle, summary: description, ...rest, sourceDataOn: '2026-11-01' }, stripHistoricalImages(analysis));
    continue;
  }

  const content = stripHistoricalImages(addFaqHeading(cleanBody(body)));
  const slug = basename(page.file, '.md');
  if (page.kind === 'guide') {
    await writeEntry('guides', slug, { ...base, category: GUIDE_CATEGORY[slug] }, content);
  } else if (page.kind === 'conditional-comparison') {
    await writeEntry('compare', slug, base, content);
  } else if (page.kind === 'historical-evidence-analysis') {
    await writeEntry('reviews', slug, { ...base, sampleDates: ['2026-10-28', '2026-10-31'] }, content);
  } else if (page.kind === 'site-page') {
    await writeEntry('pages', slug, { title: seo.h1, seoTitle: seo.title, description: seo.description }, content);
  } else {
    throw new Error(`未知内容类型 ${page.kind}`);
  }
}

console.log(`已写入 ${written.length} 篇：\n${written.join('\n')}`);
