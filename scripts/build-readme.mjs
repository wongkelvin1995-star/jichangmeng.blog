// 生成 GitHub 仓库首页的 README.md（站长 2026-11-07 要求：介绍网站、放入机场推荐、列出文章和内容）。
// 网站介绍、机场推荐（价格、亮点、优惠码）和文章目录都从网站的配置、数据层和内容文件读取，与网站用同一套口径：
// 最低月付只算可参与比较的月付报价，更便宜的档位因来源冲突被排除时不显示最低价（同 src/lib/airports.ts）。
// 推荐列表只链接到网站上的资料页，不在 README 里直接放推广链接；推广披露和价格说明在网站页面上。
//
// 用法：npm run readme（写入 README.md）。资料或文章改动后重新运行；verify-dist 会在 README 过期时提醒。
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(import.meta.dirname, '..');
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');
const json = (...parts) => JSON.parse(read(...parts));

// 与 src/lib/content.ts、src/lib/airports.ts 保持一致。
const GUIDE_GROUPS = ['新手入门', '选购与付款', '线路与测试', '使用排查'];
const BLOCKING_STATUS = new Set(['conflicting-or-pending', 'md-doubtful']);

const frontmatter = (text) => {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match ? parseYaml(match[1]) ?? {} : {};
};
const published = (dir) =>
  readdirSync(join(root, 'src', 'content', dir))
    .filter((name) => name.endsWith('.md') && !name.startsWith('_'))
    .map((name) => ({ slug: name.replace(/\.md$/, ''), data: frontmatter(read('src', 'content', dir, name)) }))
    .filter((entry) => entry.data.draft === false);
const day = (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? '').slice(0, 10));
const newestFirst = (a, b) => day(b.data.publishedAt).localeCompare(day(a.data.publishedAt)) || a.slug.localeCompare(b.slug);
const cell = (text) => String(text).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');

export function renderReadme() {
  const origin = json('site.config.json').origin.replace(/\/$/, '');
  const url = (path) => origin + path;
  const siteTs = read('src', 'config', 'site.ts');
  const pick = (re, label) => {
    const match = siteTs.match(re);
    if (!match) throw new Error(`src/config/site.ts 里找不到 ${label}`);
    return match[1];
  };
  const headline = pick(/headline:\s*'([^']+)'/, 'headline');
  const telegram = pick(/telegram:\s*'([^']+)'/, 'telegram');
  const spotlightId = pick(/spotlight:\s*\{\s*brandId:\s*'([^']+)'/, 'spotlight.brandId');

  // ---------- 品牌数据 ----------
  const data = json('src', 'data', 'brands.json');
  const brands = data.brands.filter((brand) => brand.listing === 'public').sort((a, b) => a.editorialOrder - b.editorialOrder);
  const byId = new Map(brands.map((brand) => [brand.id, brand]));
  const featured = new Set(json('src', 'data', 'providers.json').featuredProviderIds.filter((id) => byId.get(id)?.featuredEligible !== false));
  const detailIds = new Set(published('airports').map((entry) => entry.slug));
  const brandUrl = (brand) => (detailIds.has(brand.id) ? url(`/airports/${brand.id}/`) : url(`/airports/#${brand.id}`));
  const yuan = (amount) => `¥${Number.isInteger(amount) ? amount : amount.toFixed(2).replace(/0$/, '')}`;
  const traffic = (quote) =>
    quote.trafficGB === null ? '额度待核实' : quote.trafficPeriod === 'month' ? `每月 ${quote.trafficGB}GB` : quote.trafficPeriod === 'total' ? `总量 ${quote.trafficGB}GB` : `${quote.trafficGB}GB`;
  const lowestMonthly = (brand) => {
    const best = brand.packages
      .filter((quote) => quote.billingPeriod === 'month' && quote.eligibleForReferenceComparison)
      .sort((a, b) => a.amount - b.amount)[0] ?? null;
    if (best && brand.packages.some((quote) => quote.billingPeriod === 'month' && BLOCKING_STATUS.has(quote.priceStatus) && quote.amount < best.amount)) return null;
    return best;
  };
  const priceText = (brand) => {
    const quote = lowestMonthly(brand);
    return quote ? `${yuan(quote.amount)} / ${traffic(quote)}` : '资料未列可比较的月付';
  };
  const specialStatus = (brand) =>
    brand.operatingStatus?.status === 'contradictory' ? '运营状态待核' : brand.operatingStatus?.status === 'static-demo-suspected' ? '疑似演示站，待核' : null;
  const couponText = (coupon) => {
    if (!coupon?.discountLabel) return null;
    const parts = [`享${coupon.discountLabel}`];
    if (coupon.usageLimit?.scope === 'per-user' && coupon.usageLimit.maxRedemptions === 1) parts.push('每位用户限用一次');
    if (coupon.excludedPlanTypes?.includes('one-time-traffic-package')) parts.push('一次性流量包不参与');
    return parts.join('，');
  };

  // ---------- 文章 ----------
  const guides = published('guides').sort(newestFirst);
  const compares = published('compare').sort(newestFirst);
  const reviews = published('reviews').sort(newestFirst);
  const link = (title, path) => `[${title}](${url(path)})`;
  const pillar = guides.find((entry) => entry.slug === 'jichang-tuijian-zenme-kan');
  const sourceDate = brands.find((brand) => brand.sourceUpdatedOn)?.sourceUpdatedOn;
  const batchDate = data.batch.collectedOn;

  const lines = [];
  const push = (...items) => lines.push(...items);

  // ---------- 介绍 ----------
  push(
    '# 机场梦',
    '',
    `> ${headline}`,
    '',
    `**网站：[${origin.replace(/^https?:\/\//, '')}](${origin})**　｜　**Telegram：[加入机场梦](${telegram})**`,
    '',
    '机场梦是一个中文的机场资料与新手教程网站。我们把机场（代理订阅服务）的套餐、流量规则、付款周期和优惠规则整理在一起，再写图文新手教程和本站使用说明，帮你在付款前看清价格、流量和使用条件，再决定哪种订阅适合自己。',
    '',
    '## 网站里有什么',
    '',
    `- ${link('机场资料目录', '/airports/')}：${brands.length} 家品牌的代表套餐、付款周期、资料状态和已知限制，可按地区、付款方式和价格筛选；${detailIds.size} 家有独立的资料评析页。`,
    `- ${link('选购与使用指南', '/guides/')}：${guides.length} 篇，从新手入门、订阅链接、客户端下载到测速和排查。`,
    `- ${link('条件对比', '/compare/')}和${link('评析与测试解读', '/reviews/')}：用同一口径比较价格和流量，分清资料分析、历史样本和实际测试。`,
    `- ${link('站内搜索', '/search/')}：按品牌名、别名或关键词查找。`,
    '',
    '## 我们怎么整理资料',
    '',
    '- 每条价格都写明来源和日期；不虚构价格，也不把最低价直接当成最好的选择。',
    '- 事实、编辑分析和还没确认的部分分开写；没有实测，就不写速度和稳定性结论。',
    '- 不做第三方机场排行榜。推荐顺序是编辑展示顺序，不是统一测评、销量或排名。',
    `- 部分入口含推广链接，通过本站注册或购买可能使本站获得佣金，本站不另收费用。详见${link('推广与价格说明', '/disclosure/')}。`,
    '',
  );

  // ---------- 机场推荐 ----------
  push('## 机场推荐', '');
  if (pillar) push(`想先学会自己挑，可以看${link(pillar.data.title, '/guides/jichang-tuijian-zenme-kan/')}。`, '');
  const spotlight = byId.get(spotlightId);
  if (spotlight) {
    const spotlightLinks = [
      `[${spotlight.name}完整资料](${brandUrl(spotlight)})`,
      ...reviews.filter((entry) => entry.slug.includes(spotlight.id)).map((entry) => link(entry.data.title, `/reviews/${entry.slug}/`)),
      ...compares.filter((entry) => entry.slug.includes(spotlight.id)).map((entry) => link(entry.data.title, `/compare/${entry.slug}/`)),
    ];
    const coupon = spotlight.coupons?.[0];
    push(
      `### 站长主推：${spotlight.name}`,
      '',
      `- 月付起：${priceText(spotlight)}（资料摘录的最低月付）`,
      ...(spotlight.cardHighlights?.length ? [`- 亮点：${spotlight.cardHighlights.join('；')}`] : []),
      ...(coupon && couponText(coupon) ? [`- 优惠码：\`${coupon.code}\`（${couponText(coupon)}；具体套餐和有效期以结算页为准）`] : []),
      `- 资料：${spotlightLinks.join(' · ')}`,
      '',
      '站长主推含推广链接，不是统一测评或排名；价格来自资料摘录，未独立核验，最终金额与规则以购买页为准。',
      '',
    );
  }
  push(
    `### 编辑推荐顺序（共 ${brands.length} 家）`,
    '',
    '| 顺序 | 品牌 | 月付起 | 亮点 | 资料 |',
    '|---|---|---|---|---|',
    ...brands.map((brand, index) => {
      const tags = [brand.id === spotlightId ? '站长主推' : featured.has(brand.id) ? '精选' : null, specialStatus(brand)].filter(Boolean);
      const name = `**${cell(brand.name)}**${tags.map((tag) => ` · ${tag}`).join('')}`;
      return `| ${index + 1} | ${name} | ${cell(priceText(brand))} | ${cell((brand.cardHighlights ?? []).join('；') || '—')} | [${detailIds.has(brand.id) ? '资料页' : '目录'}](${brandUrl(brand)}) |`;
    }),
    '',
    `价格是资料摘录的最低月付（参考资料 ${sourceDate}、站长提供的套餐截图、资料批次 ${batchDate}），不是完整套餐表，也没有逐家核验官网当前价格；购买前请以结算页为准。`,
    '',
  );

  // ---------- 文章与教程 ----------
  push('## 文章与教程', '');
  for (const group of GUIDE_GROUPS) {
    const items = guides.filter((entry) => entry.data.category === group);
    if (!items.length) continue;
    push(`### ${group}`, '', ...items.map((entry) => `- ${link(entry.data.title, `/guides/${entry.slug}/`)}`), '');
  }
  if (compares.length) push('### 条件对比', '', ...compares.map((entry) => `- ${link(entry.data.title, `/compare/${entry.slug}/`)}`), '');
  if (reviews.length) push('### 评析与测试解读', '', ...reviews.map((entry) => `- ${link(entry.data.title, `/reviews/${entry.slug}/`)}`), '');
  const pageTitle = (slug, fallback) => frontmatter(read('src', 'content', 'pages', `${slug}.md`)).title ?? fallback;
  push(
    '### 本站说明',
    '',
    `- ${link(pageTitle('about', '关于机场梦'), '/about/')}`,
    `- ${link(pageTitle('editorial-policy', '编辑方法'), '/editorial-policy/')}`,
    `- ${link(pageTitle('disclosure', '推广与价格说明'), '/disclosure/')}`,
    `- ${link('隐私说明', '/privacy/')}`,
    '',
  );

  // ---------- 免责声明与仓库说明 ----------
  push(
    '## 免责声明',
    '',
    '机场梦是资料整理与教程网站，不提供网络接入服务。使用任何网络服务前，请先了解并遵守所在地的法律法规和服务商条款。网站上的价格、套餐和规则来自注明日期的资料，可能已经变化，请以服务商购买页面为准。',
    '',
    '## 关于这个仓库',
    '',
    `这是机场梦网站的源码：Astro 静态站，部署在 Cloudflare Pages。维护说明见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。本页由 \`npm run readme\` 根据网站资料生成（资料日期 ${batchDate}），请不要手改。`,
    '',
  );
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const text = renderReadme();
  writeFileSync(join(root, 'README.md'), text);
  console.log(`README.md 已生成：${text.split('\n').length} 行`);
}
