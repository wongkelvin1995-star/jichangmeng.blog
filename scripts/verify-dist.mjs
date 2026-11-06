// 构建后检查 dist/ 的实际产物，而不是源数据。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describeSiteEnv, resolveSiteEnv } from './site-mode.mjs';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const providers = JSON.parse(readFileSync(join(root, 'src', 'data', 'providers.json'), 'utf8')).providers;
const order = JSON.parse(readFileSync(join(root, 'src', 'data', 'editorial-order.json'), 'utf8'));

const errors = [];
const check = (ok, message) => { if (!ok) errors.push(message); };
const read = (...p) => readFileSync(join(dist, ...p), 'utf8');

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const full = join(dir, name);
  return statSync(full).isDirectory() ? walk(full) : [full];
});

const home = read('index.html');
const directory = read('airports', 'index.html');

check(home.includes('<html lang="zh-CN"'), '首页缺少 lang="zh-CN"');
check(/<h1[^>]*>[\s\S]*?按预算和使用场景选机场[\s\S]*?<\/h1>/.test(home), '首页 H1 不正确');
check(home.includes('一个小小的机场，拥有大大的梦想'), '首页缺少品牌口号');

// 目录必须在初始 HTML 里完整列出 29 家，并保留逐字符一致的推广链接。
const ordered = [...providers].sort((a, b) => a.editorialOrder - b.editorialOrder);
check(ordered.map((p) => p.id).join() === order.join(), '编辑顺序与 editorial-order.json 不一致');
const positions = [];
for (const provider of ordered) {
  const link = `href="${provider.affiliateUrl}" rel="sponsored noopener" target="_blank"`;
  check(directory.includes(link), `目录缺少 ${provider.id} 的推广链接`);
  check(directory.includes(provider.name), `目录缺少品牌名 ${provider.name}`);
  check(directory.includes(`id="${provider.id}"`), `目录缺少锚点 ${provider.id}`);
  positions.push(directory.indexOf(`id="${provider.id}"`));
}
check(positions.every((pos, i) => i === 0 || pos > positions[i - 1]), '目录 HTML 的顺序不符合编辑顺序');
check(directory.includes('woyou666'), '目录缺少无忧优惠码 woyou666');
check((directory.match(/享8折，每位用户限用一次，一次性流量包不参与/g) ?? []).length === ordered.length, '目录应有 29 条优惠规则');
check(!/折后|到手价/.test(directory), '目录不能出现未经结算确认的到手价');

// 卡片：主价格下方只有优势，每个 SVG 内部 ID 在页面内唯一。
for (const [label, html] of [['首页', home], ['目录', directory]]) {
  for (const card of html.split('<article class="card"').slice(1)) {
    // 优势列表可以提到“年付小包”这类套餐类型（不含价格，由 check-brands 把关），检查第二段报价时不算在内。
    const main = card.slice(0, card.indexOf('<details')).replace(/<ul class="brand-highlights">[\s\S]*?<\/ul>/, '');
    check(!/年付|折合/.test(main), `${label}卡片的主价格区仍有第二段报价`);
    check(main.includes('class="brand-media'), `${label}卡片缺少统一 Logo 框`);
  }
}
check((directory.match(/class="brand-highlights"/g) ?? []).length === ordered.length, '目录应有 29 组优势');

// 约定要公开的路径。
const expected = [
  ...['lingdongyun', 'twilight', 'breezenet', 'flycat', 'dalaoyun', 'invisible', 'flyv', 'wavenet', 'worryfree', 'firefly', 'globalcloud', 'v2yun', 'civet', 'flashleap', 'sogoyun', 'edgenova'].map((id) => `airports/${id}`),
  ...['airport-plan-checklist', 'client-subscription-troubleshooting', 'how-to-test-evening', 'iepl-iplc-bgp-evidence', 'latency-speed-jitter', 'monthly-annual-total-traffic', 'streaming-ai-availability', 'traffic-multiplier-reset'].map((slug) => `guides/${slug}`),
  // SEO_KEYWORD_PLAN 第 1 批新增的新手教程和本站使用说明（2026-11-06）。
  ...['xinshou-jichang-wubu', 'dingyue-lianjie-shuoming', 'clash-kehuduan-xiazai', 'disanfang-kehuduan-daoru', 'jichangmeng-shiyong-shuoming'].map((slug) => `guides/${slug}`),
  // 第 2 批：科学上网支柱页和推荐类长尾（2026-11-06）。
  ...['kexue-shangwang-rumen', 'pianyi-jichang-zenme-zhao', 'wending-jichang-panduan', 'chatgpt-jichang-jiedian', 'jiedian-diqu-xuanze'].map((slug) => `guides/${slug}`),
  // 第 3 批：推荐类大词改写成的品牌介绍支柱页（2026-11-06）。
  ...['jichang-tuijian-zenme-kan', 'tizi-shi-shenme'].map((slug) => `guides/${slug}`),
  'compare/lingdongyun-vs-twilight', 'compare/lingdongyun-vs-flycat', 'reviews/lingdongyun-historical-samples',
  'airports', 'guides', 'reviews', 'compare', 'about', 'editorial-policy', 'disclosure', 'privacy',
];
for (const path of expected) check(existsSync(join(dist, path, 'index.html')), `缺少页面 /${path}/`);

// 草稿不能产生公开页面。
const editorialDir = join(root, 'src', 'content', 'airports');
for (const name of readdirSync(editorialDir)) {
  const id = name.replace(/\.md$/, '');
  const isDraft = !/^draft:\s*false\s*$/m.test(readFileSync(join(editorialDir, name), 'utf8'));
  if (isDraft) check(!existsSync(join(dist, 'airports', id)), `草稿 ${id} 生成了公开详情页`);
}

// 内部资料不能出现在产物中。
const files = walk(dist);
check(!files.some((f) => /[\\/](internal|editorial|materials)[\\/]/.test(f)), 'dist 中出现内部目录');
const pages = files.filter((f) => f.endsWith('.html'));
const relative = (file) => file.slice(dist.length).replaceAll('\\', '/');

const titles = new Map();
const descriptions = new Map();
const affiliateHosts = new Set(providers.map((p) => new URL(p.affiliateUrl).host));
const stripScripts = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '');

for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  const path = relative(file);
  const body = stripScripts(html);

  check(!/\.\.\/assets|assets\/tests|本稿|待审核草稿|来源整理稿/.test(body), `${path} 含内部提示、历史截图或错误资源路径`);
  check(!/晚高峰不卡|业内最快|亲测稳定|全部流媒体解锁/.test(body.replace(/“[^”]*”/g, '')), `${path} 含未经实测的宣传语`);

  // 每页唯一的 title、description，且只有一个 H1。
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
  const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1];
  check(Boolean(title), `${path} 缺少 title`);
  check(Boolean(description), `${path} 缺少 description`);
  check((body.match(/<h1[\s>]/g) ?? []).length === 1, `${path} 的 H1 数量不是 1`);
  if (titles.has(title)) errors.push(`${path} 与 ${titles.get(title)} 的 title 重复`);
  titles.set(title, path);
  if (descriptions.has(description)) errors.push(`${path} 与 ${descriptions.get(description)} 的 description 重复`);
  descriptions.set(description, path);

  // 重复 ID。
  const ids = [...body.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  check(duplicates.length === 0, `${path} 有重复 ID：${[...new Set(duplicates)].join('、')}`);

  // 站内链接和锚点必须真实存在。
  for (const [, href] of body.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)) {
    if (href.startsWith('#')) {
      const id = decodeURIComponent(href.slice(1));
      check(ids.includes(id), `${path} 的锚点 ${href} 不存在`);
    } else if (href.startsWith('/')) {
      const [pathname, hash] = href.split('#');
      const target = join(dist, decodeURIComponent(pathname));
      const targetFile = existsSync(join(target, 'index.html')) ? join(target, 'index.html') : target;
      const found = existsSync(targetFile) && statSync(targetFile).isFile();
      check(found, `${path} 的站内链接 ${href} 指向不存在的页面`);
      if (found && hash) {
        check(readFileSync(targetFile, 'utf8').includes(`id="${decodeURIComponent(hash)}"`), `${path} 的链接 ${href} 锚点不存在`);
      }
    }
  }

  // 所有指向推广平台的链接都要标记 sponsored。
  for (const [tag, href] of body.matchAll(/<a\b[^>]*\shref="(https?:[^"]+)"[^>]*>/g)) {
    const host = new URL(href).host;
    if (affiliateHosts.has(host)) {
      check(/rel="sponsored noopener"/.test(tag), `${path} 的推广链接缺少 sponsored：${href}`);
      check(providers.some((p) => p.affiliateUrl === href), `${path} 的推广链接与注册表不一致：${href}`);
    }
  }

  // 图片：文件存在、有尺寸和 alt。
  for (const [tag, src] of body.matchAll(/<img\b[^>]*\ssrc="([^"]+)"[^>]*>/g)) {
    check(src.startsWith('/') && existsSync(join(dist, src)), `${path} 的图片不存在：${src}`);
    check(/\swidth="\d+"/.test(tag) && /\sheight="\d+"/.test(tag), `${path} 的图片缺少尺寸：${src}`);
    check(/\salt="[^"]+"/.test(tag), `${path} 的图片缺少 alt：${src}`);
    // 只写“2x”时，1 倍屏会按原图像素宽度显示，截图被放大发糊。
    if (/\ssrcset="/.test(tag)) check(/\ssrcset="[^"]*\s\d+w"/.test(tag) && /\ssizes="[^"]+"/.test(tag), `${path} 的图片 srcset 要写像素宽度并配 sizes：${src}`);
  }

  // JSON-LD 可解析；文章必须有真实日期和作者，不能有评分。
  for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let data;
    try { data = JSON.parse(json); } catch { errors.push(`${path} 的 JSON-LD 无法解析`); continue; }
    check(!/aggregateRating|reviewRating/.test(json), `${path} 含评分结构化数据`);
    if (['Article', 'BlogPosting'].includes(data['@type'])) {
      check(/^\d{4}-\d{2}-\d{2}$/.test(data.datePublished ?? ''), `${path} 缺少 datePublished`);
      check(/^\d{4}-\d{2}-\d{2}$/.test(data.dateModified ?? ''), `${path} 缺少 dateModified`);
      check(Boolean(data.author?.name), `${path} 缺少作者`);
    }
  }
}

// 历史截图决定不公开。
check(!existsSync(join(dist, 'assets', 'tests')), 'dist 中不应有历史截图');

// 套餐截图：文件进入产物，并出现在对应品牌页。
// 站长决定不公开截图的品牌（hidden-pricing-images.json，微风网络 2026-11-06）：产物和所有页面里都不能有它的截图。
const pricingImages = JSON.parse(readFileSync(join(root, 'src', 'data', 'pricing-images.json'), 'utf8'));
const hiddenPricingIds = new Set(JSON.parse(readFileSync(join(root, 'src', 'data', 'hidden-pricing-images.json'), 'utf8')).map((item) => item.id));
for (const id of hiddenPricingIds) {
  check(!existsSync(join(dist, 'assets', 'pricing', id)), `${id} 的套餐截图已决定不公开，dist 里不应有 assets/pricing/${id}/`);
  for (const file of pages) check(!readFileSync(file, 'utf8').includes(`/assets/pricing/${id}/`), `${relative(file)} 引用了不公开的 ${id} 套餐截图`);
}
for (const [id, images] of Object.entries(pricingImages)) {
  const page = read('airports', id, 'index.html');
  if (hiddenPricingIds.has(id)) {
    check(!page.includes('id="screenshots"'), `/airports/${id}/ 仍有“套餐截图”一节`);
    continue;
  }
  for (const image of images) {
    check(existsSync(join(dist, image.src)), `缺少套餐截图文件 ${image.src}`);
    check(page.includes(`src="${image.src}"`), `/airports/${id}/ 没有展示 ${image.src}`);
  }
}

// 矛盾报价和定制展示不能成为卡片主价格。
for (const label of ['SOGO强化餐不限时版', 'SOGO至尊餐不限时版', '灵猫·大流量定制']) {
  const card = directory.split('<article class="card"').find((item) => item.includes(label));
  check(Boolean(card), `目录没有展示 ${label}`);
  check(card && !card.slice(0, card.indexOf('<details')).includes(label), `${label} 不应作为主价格`);
}

// 「机场MD」资料批次：品牌数据层在页面上的落点。
const brandData = JSON.parse(readFileSync(join(root, 'src', 'data', 'brands.json'), 'utf8'));
const publicBrands = brandData.brands.filter((brand) => brand.listing === 'public');
const pendingBrands = brandData.brands.filter((brand) => brand.listing !== 'public');
const allHtml = pages.map((file) => readFileSync(file, 'utf8')).join('\n');
const sitemapText = read('sitemap.xml');
for (const brand of pendingBrands) {
  // 待核验品牌只在本地审稿版本出现：没有公开详情页，推广链接也不进入公开产物。
  check(!existsSync(join(dist, 'airports', brand.id)), `待核验品牌 ${brand.id} 生成了公开详情页`);
  if (brand.affiliateUrl) check(!allHtml.includes(brand.affiliateUrl), `待核验品牌 ${brand.id} 的推广链接出现在公开页面`);
  check(!sitemapText.includes(`/airports/${brand.id}/`), `sitemap 含待核验品牌 ${brand.id}`);
}
check(!/00_差异报告|00_总目录|00_官网客户端说明|00_空白模板|md-import-md-/.test(allHtml), '公开页面出现了原始资料文件名或内部报告');
for (const brand of brandData.brands) {
  for (const note of [...(brand.reviewNotes ?? []), ...(brand.fieldConflicts ?? [])].filter((item) => !item.public)) {
    check(!allHtml.includes(note.text), `${brand.id} 的内部备注出现在公开页面：${note.text.slice(0, 30)}`);
  }
}
check(!/机场梦亲测|本站亲测/.test(allHtml.replace(/不能写成[^。]*。|不写成[^。]*。|不是[^。]*亲测[^。]*。/g, '')), '公开页面把测试写成了本站亲测');
// 卡片主价格只能来自可比较的报价，且等于其中的最低月付。
for (const card of directory.split('<article class="card"').slice(1)) {
  const id = card.match(/id="([^"]+)"/)?.[1];
  const brand = publicBrands.find((item) => item.id === id);
  if (!brand) continue;
  const main = card.slice(0, card.indexOf('<details'));
  const shown = main.match(/class="price__main"><strong>¥([\d.]+)<\/strong>/)?.[1];
  const eligible = brand.packages.filter((q) => q.billingPeriod === 'month' && q.eligibleForReferenceComparison).map((q) => q.amount);
  const blocked = eligible.length > 0 && brand.packages.some((q) => q.billingPeriod === 'month' && ['conflicting-or-pending', 'md-doubtful'].includes(q.priceStatus) && q.amount < Math.min(...eligible));
  if (eligible.length && !blocked) check(shown !== undefined && Number(shown) === Math.min(...eligible), `${id} 卡片主价格 ¥${shown} 不是可比较报价中的最低月付 ¥${Math.min(...eligible)}`);
  else check(shown === undefined, `${id} 的最低月付有冲突或没有可比较报价，卡片却显示了主价格 ¥${shown}`);
}
// 卡片价格下方的优势：目录里每张卡片显示的就是数据层的 2–3 条，且位于主价格之后。
for (const card of directory.split('<article class="card"').slice(1)) {
  const id = card.match(/id="([^"]+)"/)?.[1];
  const brand = publicBrands.find((item) => item.id === id);
  if (!brand) continue;
  const list = card.match(/<ul class="brand-highlights">([\s\S]*?)<\/ul>/)?.[1] ?? '';
  const shown = [...list.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(([, text]) => text.trim());
  check(JSON.stringify(shown) === JSON.stringify(brand.cardHighlights), `${id} 卡片上的优势与数据层不一致`);
  const priceAt = card.indexOf('class="price');
  check(priceAt === -1 || card.indexOf('class="brand-highlights"') > priceAt, `${id} 的优势框不在价格下方`);
}
// 首页推荐区不放运营状态待核的品牌。
for (const brand of publicBrands.filter((item) => !item.homeEligible)) {
  const rows = home.slice(home.indexOf('id="preview-title"'), home.indexOf('class="btn" href="/airports/"'));
  check(!rows.includes(`>${brand.name}<`), `首页继续浏览区不应出现 ${brand.name}`);
}
// 已发布的详情页：客户端 A/B 分开、套餐表行数与数据一致、资料记录的优惠码有说明。
for (const brand of publicBrands) {
  const file = join(dist, 'airports', brand.id, 'index.html');
  if (!existsSync(file)) continue;
  const page = readFileSync(file, 'utf8');
  check(page.includes('id="client"') && page.includes(brandData.siteClientRecommendation), `/airports/${brand.id}/ 缺少客户端说明或本站建议`);
  const table = page.slice(page.indexOf('class="plan-table"'), page.indexOf('</table>', page.indexOf('class="plan-table"')));
  const rows = (table.match(/<tr\b/g) ?? []).length - 1;
  check(rows === brand.packages.length, `/airports/${brand.id}/ 套餐表应有 ${brand.packages.length} 行，实际 ${rows}`);
  if (brand.affiliateUrl) check(page.includes(`href="${brand.affiliateUrl}"`), `/airports/${brand.id}/ 缺少推广链接`);
  if (brand.mdCoupon) check(page.includes('资料记录的优惠码，结算时确认'), `/airports/${brand.id}/ 缺少资料优惠码的说明`);
  if ((brand.thirdPartyTests ?? []).length) check(page.includes('不是机场梦实测'), `/airports/${brand.id}/ 的第三方测试缺少说明`);
}
const lingdong = read('airports', 'lingdongyun', 'index.html');
check(lingdong.includes('ChatGPT、Claude、Midjourney') && lingdong.includes('Claude 三地均无法连接'), '灵动云页面应同时展示 Claude 声明与第三方测试结果');
check(lingdong.includes('恢复时间</th><td>未知'), '灵动云页面应写明订阅恢复时间未知');

// Logo：公开品牌都有图，统一 3:1 框；每个框带尺寸、可访问名称、同图前景与背景，以及加载失败时的品牌文字。
check(!home.includes('class="brand-media is-placeholder"') && !directory.includes('class="brand-media is-placeholder"'), '首页或目录仍有文字占位的 Logo 框');
// 压缩后的 CSS 会把 3 / 1 写成 3。
check(files.filter((file) => file.endsWith('.css')).some((file) => /\.brand-media\{[^}]*aspect-ratio:3(\s*\/\s*1)?[;}]/.test(readFileSync(file, 'utf8'))), 'Logo 框的 3:1 样式没有进入产物');
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 外框引用的是 scripts/build-logos.mjs 裁好的展示图：卡片用 card，资料页和主推区用 large。
const logoDisplay = JSON.parse(readFileSync(join(root, 'src', 'data', 'logo-display.json'), 'utf8'));
check(!/<image href="\/assets\/logos\//.test(allHtml), '页面还在引用整张 Logo 原图，应使用 /assets/logo-display/ 的展示图');
for (const brand of publicBrands) {
  check(Boolean(brand.logoPath), `公开品牌 ${brand.id} 没有 Logo`);
  if (!brand.logoPath) continue;
  check(existsSync(join(dist, brand.logoPath)), `${brand.id} 的 Logo 文件没有进入产物：${brand.logoPath}`);
  const views = [['目录', directory, 'directory']];
  if (home.includes(`brand-featured-${brand.id}-title`)) views.push(['首页', home, 'featured']);
  const detailFile = join(dist, 'airports', brand.id, 'index.html');
  if (existsSync(detailFile)) views.push([`/airports/${brand.id}/`, readFileSync(detailFile, 'utf8'), 'detail']);
  for (const [label, html, instance] of views) {
    const titleId = `brand-${instance}-${brand.id}-title`;
    const at = html.indexOf(`<title id="${titleId}">`);
    check(at > -1, `${label}缺少 ${brand.id} 的 Logo`);
    if (at === -1) continue;
    const frame = html.slice(html.lastIndexOf('<div class="brand-media', at), html.indexOf('class="brand-fallback"', at));
    const image = logoDisplay[brand.id]?.[instance === 'detail' ? 'large' : 'card'];
    check(Boolean(image), `${brand.id} 缺少 Logo 展示图（npm run logos）`);
    if (!image) continue;
    check(existsSync(join(dist, image.src)), `${brand.id} 的 Logo 展示图没有进入产物：${image.src}`);
    check(/<svg[^>]*viewBox="0 0 1200 400" width="1200" height="400" role="img"/.test(frame), `${label}的 ${brand.id} Logo 缺少 3:1 尺寸`);
    check(frame.includes(`<title id="${titleId}">${brand.name} 标识</title>`), `${label}的 ${brand.id} Logo 缺少可访问名称`);
    check((frame.match(new RegExp(`<image href="${escapeRegExp(image.src)}"`, 'g')) ?? []).length === 2, `${label}的 ${brand.id} Logo 前景和背景应是同一张展示图`);
    check(frame.includes(`viewBox="0 0 ${image.width} ${image.height}"`), `${label}的 ${brand.id} Logo 展示图的裁切与清单不一致`);
    check(html.indexOf('class="brand-fallback__name"', at) > -1, `${label}的 ${brand.id} Logo 缺少加载失败时的品牌文字`);
  }
}
// 机场梦设计的 13 家展示图：一家一个新文件、整图坐标；已发布的详情页注明不是官方标志。
const designedLogos = publicBrands.filter((brand) => brand.logoStatus === 'blog-designed-not-official');
check(designedLogos.length === 13, `机场梦展示图应为 13 家，实际 ${designedLogos.length}`);
for (const brand of designedLogos) {
  const { logoCrop: crop, logoSourceImageSize: size } = brand;
  check(brand.logoPath === `/assets/logos/${brand.id}-blog-v1.webp`, `${brand.id} 的展示图文件名应为 ${brand.id}-blog-v1.webp`);
  check(crop.x === 0 && crop.y === 0 && crop.width === size.width && crop.height === size.height && size.width === 3 * size.height, `${brand.id} 的展示图不是整张 3:1`);
  const detailFile = join(dist, 'airports', brand.id, 'index.html');
  if (existsSync(detailFile)) check(readFileSync(detailFile, 'utf8').includes('页首标识：机场梦设计的展示图'), `/airports/${brand.id}/ 缺少展示图说明`);
}
check(read('editorial-policy', 'index.html').includes('机场梦设计的展示图，不是服务商的官方标志'), '编辑方法页缺少品牌标识说明');
check(!/image_gen|final-promptset|logo-prompts|group-[abc]-prompts/.test(allHtml), '公开页面出现了 Logo 设计提示词');
check(!files.some((file) => /prompt/i.test(relative(file))), '产物里有 Logo 提示词文件');

// SEO_KEYWORD_PLAN（第 8 节第 4 步）：主关键词在 title 开头、H1、导语和正文首段前 100 字；
// title 不超过 30 个汉字且与 H1 不完全相同；有表格或有序步骤、相关文章、最后更新日期和对应的结构化数据；一词一页。
// 推荐类页面（promo）按站点角度不做排行榜：注明没有推广链接，正文里也确实没有推广链接。
const textOf = (html) => html.replace(/<[^>]+>/g, '').replace(/&[a-z]+;|&#\d+;/g, ' ').replace(/\s+/g, ' ').trim();
const SEO_PAGES = [
  // 第 1 批
  { path: 'guides/xinshou-jichang-wubu', keyword: /机场新手教程/, howTo: true },
  { path: 'guides/dingyue-lianjie-shuoming', keyword: /机场订阅链接是什么/ },
  { path: 'guides/clash-kehuduan-xiazai', keyword: /Clash ?下载/ },
  { path: 'guides/disanfang-kehuduan-daoru', keyword: /第三方客户端导入机场/ },
  { path: 'guides/client-subscription-troubleshooting', keyword: /机场连接不上怎么办/ },
  { path: 'guides/latency-speed-jitter', keyword: /机场测速/ },
  { path: 'guides/iepl-iplc-bgp-evidence', keyword: /IEPL ?和 ?IPLC ?区别/ },
  { path: 'guides/jichangmeng-shiyong-shuoming', keyword: /机场梦使用说明/, howTo: true },
  // 第 2 批
  { path: 'guides/kexue-shangwang-rumen', keyword: /科学上网/ },
  { path: 'guides/pianyi-jichang-zenme-zhao', keyword: /便宜机场推荐/, promo: true },
  { path: 'guides/wending-jichang-panduan', keyword: /稳定机场推荐/, promo: true },
  { path: 'guides/chatgpt-jichang-jiedian', keyword: /ChatGPT ?机场推荐/, promo: true },
  { path: 'guides/monthly-annual-total-traffic', keyword: /机场套餐推荐/, promo: true },
  { path: 'guides/jiedian-diqu-xuanze', keyword: /机场节点推荐/, promo: true },
  // 第 3 批：用 ^ 锚定开头，避免把“便宜机场推荐”等长尾词当成同一个关键词。
  { path: 'guides/jichang-tuijian-zenme-kan', keyword: /^机场推荐/, promo: true },
  { path: 'guides/tizi-shi-shenme', keyword: /^梯子推荐/, promo: true },
];
const startsWithKeyword = (text, keyword) => { const at = text.search(keyword); return at >= 0 && at <= 2; };
for (const item of SEO_PAGES) {
  const label = `/${item.path}/`;
  const page = read(item.path, 'index.html');
  const title = page.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
  const h1 = textOf(page.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '');
  const lead = page.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';
  const prose = page.slice(page.indexOf('<article class="prose">'));
  const firstParagraph = textOf(prose.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? '');
  check(startsWithKeyword(title, item.keyword), `${label} 的 title 开头没有主关键词`);
  check((title.match(/[一-鿿]/g) ?? []).length <= 30, `${label} 的 title 超过 30 个汉字`);
  check(item.keyword.test(h1) && h1 !== title.replace(/｜机场梦$/, ''), `${label} 的 H1 应含主关键词，且与 title 不完全相同`);
  check(item.keyword.test(lead.slice(0, 100)), `${label} 的导语前 100 字没有主关键词`);
  check(item.keyword.test(firstParagraph.slice(0, 100)), `${label} 的正文首段前 100 字没有主关键词`);
  check(/<table|<ol>/.test(prose), `${label} 至少要有一个表格或有序步骤`);
  check(page.includes('id="related-title"'), `${label} 缺少相关文章`);
  check(/最后更新：\d{4}-\d{2}-\d{2}/.test(page), `${label} 顶部缺少“最后更新”日期`);
  const types = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(([, json]) => JSON.parse(json)['@type']);
  check(types.includes('BlogPosting') && types.includes('BreadcrumbList'), `${label} 缺少文章或面包屑结构化数据`);
  if (page.includes('id="常见问题"')) check(types.includes('FAQPage'), `${label} 有常见问题却没有 FAQPage`);
  if (item.howTo) check(types.includes('HowTo'), `${label} 缺少 HowTo`);
  if (item.promo) {
    check(prose.includes('本文没有推广链接'), `${label} 是推荐类页面，缺少推广链接说明`);
    const hosts = [...stripScripts(prose).matchAll(/<a\b[^>]*\shref="(https?:[^"]+)"/g)].map(([, href]) => new URL(href).host);
    check(!hosts.some((host) => affiliateHosts.has(host)), `${label} 写了“本文没有推广链接”，正文却有推广链接`);
  }
}
for (const file of pages) {
  const path = relative(file).replace(/^\//, '').replace(/\/?index\.html$/, '');
  const title = readFileSync(file, 'utf8').match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
  for (const item of SEO_PAGES) {
    if (item.path !== path && startsWithKeyword(title, item.keyword)) errors.push(`/${path}/ 的 title 也以 ${item.keyword.source} 开头，和 /${item.path}/ 抢同一个关键词`);
  }
}
// 资料包 00/03（2026-11-06）：每一页的页脚都有两段式品牌介绍和四个固定链接；
// 首页在品牌卡片之前渲染四张说明卡；三个说明页保留资料包补充的各节。
const FOOTER_TEXT = ['机场梦独立整理机场与代理订阅服务的套餐、流量口径、付款周期、优惠规则与选购资料', '本站不虚构价格，也不把最低价直接等同于最佳选择', '部分链接含推广参数'];
for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  const start = html.indexOf('class="site-footer__about"');
  const about = start > -1 ? html.slice(start, html.indexOf('</div>', start)) : '';
  check(FOOTER_TEXT.every((text) => about.includes(text)), `${relative(file)} 的页脚缺少两段式品牌介绍`);
  for (const href of ['/airports/', '/guides/', '/editorial-policy/', '/disclosure/']) check(about.includes(`href="${href}"`), `${relative(file)} 的页脚介绍缺少链接 ${href}`);
}
const basicsAt = home.indexOf('id="basics"');
check(basicsAt > -1 && basicsAt < home.indexOf('<article class="card"'), '首页的“先理解条件，再开始比较”应在品牌卡片之前');
const basicsHtml = basicsAt > -1 ? home.slice(basicsAt, home.indexOf('</section>', basicsAt)) : '';
check((basicsHtml.match(/class="choose choose--link"/g) ?? []).length === 4, '首页说明卡应为 4 张');
for (const href of ['/guides/airport-plan-checklist/', '/editorial-policy/', '/reviews/', '/disclosure/']) check(basicsHtml.includes(`href="${href}"`), `首页说明卡缺少链接 ${href}`);
for (const [path, heads] of [
  ['about', ['本站整理什么', '怎样阅读一张机场资料卡', '我们不把什么写成结论']],
  ['editorial-policy', ['怎样阅读三类内容', '推荐顺序与修订方式']],
  ['disclosure', ['下单前的四步核对', '优惠规则怎么理解', '免责声明']],
]) {
  const page = read(path, 'index.html');
  for (const head of heads) check(new RegExp(`<h2[^>]*>${head}</h2>`).test(page), `/${path}/ 缺少“${head}”一节`);
}

// 页脚“本站说明”标题旁的 Telegram 纸飞机图标（站长 2026-11-06 要求）：每页只有这一个，
// 链接逐字一致，新窗口打开，有可读名称；顶部导航不放。
for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  const tags = html.match(/<a class="tg-link"[^>]*>/g) ?? [];
  const [tag = ''] = tags;
  const at = html.indexOf('<a class="tg-link"');
  const head = html.lastIndexOf('<nav aria-label="本站说明">', at);
  check(tags.length === 1 && tag.includes('href="https://t.me/+362P1c5l2QU3OTU1"') && tag.includes('target="_blank"') && /rel="[^"]*noopener/.test(tag) && /aria-label="[^"]+"/.test(tag),
    `${relative(file)} 的 Telegram 图标缺失、重复或链接不对`);
  check(head > html.indexOf('class="site-footer"') && html.slice(head, at).includes('<h2>本站说明</h2>'), `${relative(file)} 的 Telegram 图标不在页脚“本站说明”标题旁`);
}

// 顶部导航“搜索”旁的社交图标：每页都有 Telegram，链接逐字一致；GitHub 只有配置了链接才出现，同样新窗口打开。
for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  const header = html.slice(html.indexOf('<header class="site-header"'), html.indexOf('</header>'));
  const links = header.match(/<a class="social-link"[^>]*>/g) ?? [];
  check(links.some((tag) => tag.includes('href="https://t.me/+362P1c5l2QU3OTU1"')), `${relative(file)} 的顶部导航缺少 Telegram 图标`);
  for (const tag of links) {
    check(tag.includes('target="_blank"') && /rel="[^"]*noopener/.test(tag) && /aria-label="[^"]+"/.test(tag), `${relative(file)} 的顶部社交图标缺少新窗口或可读名称`);
    check(/href="https:\/\/(t\.me|github\.com)\//.test(tag), `${relative(file)} 的顶部社交图标链接不是 Telegram 或 GitHub`);
  }
}

// 首页站长主推模块：在“需求入口”之前；推广链接逐字一致并标 sponsored；优惠码、价格与数据层一致；
// 推广披露、未核验说明和客户端限制都在模块里。
const spotlightAt = home.indexOf('id="spotlight"');
if (spotlightAt > -1) {
  const block = home.slice(spotlightAt, home.indexOf('</section>', spotlightAt));
  const brand = publicBrands.find((item) => block.includes(`href="${item.affiliateUrl}"`));
  check(spotlightAt < home.indexOf('id="start"'), '首页主推模块应在“需求入口”之前');
  check(Boolean(brand), '首页主推模块缺少推广链接，或链接与数据层不一致');
  if (brand) {
    check(block.includes(`href="${brand.affiliateUrl}" rel="sponsored noopener"`), '首页主推模块的推广链接缺少 sponsored');
    check(!brand.coupons?.[0] || block.includes(`data-copy="${brand.coupons[0].code}"`), '首页主推模块缺少优惠码复制');
    check(block.includes('含推广链接') && block.includes('未独立核验'), '首页主推模块缺少推广披露或未核验说明');
    const eligibleMonthly = brand.packages.filter((q) => q.billingPeriod === 'month' && q.eligibleForReferenceComparison).map((q) => q.amount);
    const shown = block.match(/class="price__main"><strong>¥([\d.]+)<\/strong>/)?.[1];
    if (shown) check(Number(shown) === Math.min(...eligibleMonthly), `首页主推模块的价格 ¥${shown} 不是可比较报价中的最低月付`);
    if (['paused', 'not-supported'].includes(brand.client?.subscription?.status)) check(block.includes('需用官方客户端'), '首页主推模块缺少客户端限制说明');

    // 主推面板上方的“为什么主推”简介（AI 旁观视角，站长 2026-11-06 要求）：在面板之前，先讲推广关系，
    // 再分开写理由和核对事项；价格与数据层一致；不出现速度、稳定性、排名类说法。
    const whyAt = block.indexOf('class="spotlight-why"');
    if (whyAt > -1) {
      const panelAt = block.indexOf('class="spotlight"');
      const whyText = textOf(block.slice(whyAt, panelAt));
      check(panelAt > whyAt, '首页主推简介应在主推面板之前');
      check(whyText.includes('AI') && whyText.includes('推广链接') && whyText.includes('佣金') && whyText.includes('需要你自己核对'), '首页主推简介缺少 AI 说明、推广关系或核对事项');
      const price = whyText.match(/月付 ¥([\d.]+) 就有/)?.[1];
      check(Boolean(price) && Number(price) === Math.min(...eligibleMonthly), `首页主推简介的月付起价 ¥${price} 与数据层不一致`);
      const claim = whyText.match(/最快|最稳|稳定|不卡|不降速|不限速|低延迟|延迟低|全解锁|永久可用|亲测|排名第|第\s*\d+\s*名|最便宜|性价比/);
      check(!claim, `首页主推简介出现了速度、稳定性或排名类说法：${claim?.[0]}`);
      check(!/\{\w+\}/.test(whyText), '首页主推简介还有没替换的占位符');
    }
  }
}

// 页脚“隐私说明”下面的 Telegram 文字链接和站长邮箱（站长 2026-11-06 要求），每页都有。
for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  const navAt = html.indexOf('<nav aria-label="本站说明">');
  const nav = navAt > -1 ? html.slice(navAt, html.indexOf('</nav>', navAt)) : '';
  const list = nav.slice(nav.indexOf('<ul>'));
  const privacyAt = list.indexOf('href="/privacy/"');
  const tgAt = list.indexOf('<a href="https://t.me/+362P1c5l2QU3OTU1" target="_blank" rel="noopener">');
  const mailAt = list.indexOf('href="mailto:wongkelvin1995@gmail.com"');
  check(privacyAt > -1 && tgAt > privacyAt && mailAt > tgAt, `${relative(file)} 的页脚“隐私说明”下面缺少 Telegram 文字链接或站长邮箱`);
}

// 页脚“核心内容”一栏（站长 2026-11-06 要求）：每页都有，6 个链接都指向已发布的指南。
for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  const at = html.indexOf('<nav aria-label="核心内容">');
  const nav = at > -1 ? html.slice(at, html.indexOf('</nav>', at)) : '';
  const hrefs = [...nav.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);
  check(at > html.indexOf('class="site-footer"') && nav.includes('<h2>核心内容</h2>') && hrefs.length === 6, `${relative(file)} 的页脚缺少“核心内容”一栏`);
  for (const href of hrefs) check(existsSync(join(dist, href, 'index.html')), `${relative(file)} 的页脚“核心内容”链接 ${href} 不存在`);
}

// 2026-11-06 全站审计修复的复查项。
// 1. 教程截图在加载前就要确定宽度：每个截图的 width 都要有对应的 CSS 规则，否则桌面上会整段跳动。
const builtCss = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(f, 'utf8')).join('\n');
const shotWidths = new Set();
for (const file of pages) for (const [, width] of readFileSync(file, 'utf8').matchAll(/<figure class="shot">\s*<img[^>]*\swidth="(\d+)"/g)) shotWidths.add(width);
for (const width of shotWidths) check(builtCss.includes(`.shot img[width="${width}"]`) || builtCss.includes(`.shot img[width=${width}]`), `截图宽度 ${width} 没有对应的 .prose .shot img[width="${width}"] 规则，桌面上会出现布局偏移`);
// 2. 机场目录的标题层级：卡片品牌名是 H3，前面要有 H2。
const directoryHtml = read('airports', 'index.html');
const firstCardName = directoryHtml.indexOf('class="card__name"');
check(firstCardName > -1 && /<h2[^>]*>[^<]+<\/h2>/.test(directoryHtml.slice(directoryHtml.indexOf('</h1>'), firstCardName)), '/airports/ 的卡片标题前缺少 H2，标题层级从 H1 跳到 H3');
// 3. 品牌资料页的“最后更新”和 dateModified 不早于资料批次日期，且两者一致。
for (const brand of publicBrands) {
  const path = join(dist, 'airports', brand.id, 'index.html');
  if (!existsSync(path) || !brand.mdSource?.collectedOn) continue;
  const page = readFileSync(path, 'utf8');
  const shown = page.match(/最后更新：(\d{4}-\d{2}-\d{2})/)?.[1];
  const modified = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(([, json]) => JSON.parse(json)).find((data) => data['@type'] === 'Article')?.dateModified?.slice(0, 10);
  check(shown && shown >= brand.mdSource.collectedOn && shown === modified, `/airports/${brand.id}/ 的“最后更新”（${shown}）应不早于资料批次 ${brand.mdSource.collectedOn}，并与 dateModified（${modified}）一致`);
}
// 4. 每页都声明 og:locale。
for (const file of pages) check(readFileSync(file, 'utf8').includes('<meta property="og:locale" content="zh_CN">'), `${relative(file)} 缺少 og:locale`);

// 结构化数据只写页面上看得到的问答：FAQPage 里的每个问题都要在正文出现。
for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const data = JSON.parse(json);
    if (data['@type'] !== 'FAQPage') continue;
    for (const question of data.mainEntity) {
      check(textOf(stripScripts(html)).includes(question.name), `${relative(file)} 的 FAQPage 问题不在正文里：${question.name}`);
      check(question.acceptedAnswer?.text?.length > 10, `${relative(file)} 的 FAQPage 回答为空：${question.name}`);
    }
  }
}

// 索引配置必须和当前模式一致。
const config = JSON.parse(readFileSync(join(root, 'site.config.json'), 'utf8'));
// 与 astro.config.mjs 用同一个判断（scripts/site-mode.mjs）：Cloudflare 正式分支用默认 npm run build 也按正式构建检查。
const production = resolveSiteEnv(process.env, config) === 'production';
const origin = process.env.SITE_ORIGIN || config.origin;
const indexNowKey = process.env.INDEXNOW_KEY || config.indexNowKey;
check(existsSync(join(dist, `${indexNowKey}.txt`)) === production, '只有正式构建才应该生成 IndexNow 密钥文件');
const sitemap = read('sitemap.xml');
const robotsTxt = read('robots.txt');
const homeRobots = home.match(/<meta name="robots" content="([^"]+)"/)?.[1];
check(read('search', 'index.html').includes('content="noindex,follow"'), '搜索页必须 noindex');
check(!sitemap.includes('/search/'), 'sitemap 不能包含搜索页');
check(read('404.html').includes('content="noindex,follow"'), '404 页必须 noindex');
check(!providers.some((p) => sitemap.includes(new URL(p.affiliateUrl).host)), 'sitemap 不能包含推广地址');

if (production) {
  check(homeRobots === 'index,follow', '正式环境首页应可索引');
  check(robotsTxt.includes('Sitemap:'), 'robots.txt 缺少 Sitemap');
  for (const file of pages) {
    const path = relative(file);
    const html = readFileSync(file, 'utf8');
    if (path === '/404.html' || path === '/search/index.html') {
      check(!html.includes('rel="canonical"'), `${path} 不应有 canonical`);
      continue;
    }
    const url = new URL(path.replace(/index\.html$/, ''), origin).href;
    check(html.includes(`<link rel="canonical" href="${url}"`), `${path} 的 canonical 不是自身`);
    check(html.includes('content="index,follow"'), `${path} 应可索引`);
    check(sitemap.includes(`<loc>${url}</loc>`), `sitemap 缺少 ${url}`);
    // 分享图：正式域名的绝对地址，文件在产物里，大图卡片；文章结构化数据带同一张配图。
    const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
    check(Boolean(ogImage?.startsWith(`${new URL('/assets/og/', origin).href}`)) && existsSync(join(dist, new URL(ogImage).pathname)), `${path} 缺少 og:image，或不是正式域名下存在的分享图`);
    check(html.includes('<meta property="og:image:width" content="1200">') && html.includes('<meta property="og:image:height" content="630">'), `${path} 的 og:image 缺少尺寸`);
    check(html.includes('<meta name="twitter:card" content="summary_large_image">'), `${path} 缺少大图分享卡片 twitter:card`);
    for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      const data = JSON.parse(json);
      if (!['Article', 'BlogPosting'].includes(data['@type'])) continue;
      check(Boolean(data.image?.url?.startsWith(origin)) && existsSync(join(dist, new URL(data.image.url).pathname)), `${path} 的 ${data['@type']} 缺少配图 image`);
    }
  }
  const locs = sitemap.match(/<loc>/g)?.length ?? 0;
  check(locs === pages.length - 2, `sitemap 应有 ${pages.length - 2} 个地址，实际 ${locs}`);
} else {
  check(homeRobots === 'noindex,follow', '预览环境首页必须 noindex');
  check(!home.includes('rel="canonical"'), '预览环境不应输出 canonical');
  check(!sitemap.includes('<url>'), '预览环境 sitemap 应为空');
}

check(existsSync(join(dist, 'pagefind', 'pagefind.js')), 'Pagefind 索引未生成');

// 分享图是否跟得上页面（scripts/build-og-images.mjs）：文件必须存在；标题改了或新页面还没有专属图时只提醒，
// 不中止构建，因为旧分享图不影响抓取，重新运行 npm run og 即可。
const ogList = JSON.parse(readFileSync(join(root, 'src', 'data', 'og-images.json'), 'utf8'));
const warnings = [];
const decodeHtml = (text) => text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
for (const file of pages) {
  const path = relative(file).replace(/index\.html$/, '');
  if (path === '/404.html' || path === '/search/') continue;
  const html = readFileSync(file, 'utf8');
  const h1 = decodeHtml((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').trim();
  const entry = ogList[path];
  if (!entry) { warnings.push(`${path} 还没有专属分享图（暂用首页那张），运行 npm run og`); continue; }
  check(existsSync(join(dist, entry.src)), `${path} 的分享图文件不存在：${entry.src}`);
  if (entry.title !== h1) warnings.push(`${path} 的标题改了，分享图上还是旧标题，运行 npm run og`);
}
for (const path of Object.keys(ogList)) if (!pages.some((file) => relative(file).replace(/index\.html$/, '') === path)) warnings.push(`分享图清单里的 ${path} 已经没有对应页面，运行 npm run og 清理`);
// 仓库首页 README.md 由 scripts/build-readme.mjs 根据网站资料生成：资料或文章改了却没重新生成时提醒（不影响构建）。
try {
  const { renderReadme } = await import('./build-readme.mjs');
  if (readFileSync(join(root, 'README.md'), 'utf8') !== renderReadme()) warnings.push('README.md 与网站资料不一致，运行 npm run readme 重新生成');
} catch (error) {
  warnings.push(`无法检查 README.md：${error.message}`);
}
if (warnings.length) console.warn(`提醒（${warnings.length} 项，不影响构建）：\n- ${warnings.join('\n- ')}`);

if (errors.length) {
  console.error(`产物检查失败（${errors.length} 项）：\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`产物检查通过：${pages.length} 个页面，模式：${production ? '正式' : '预览（noindex）'}。构建模式来源：${describeSiteEnv(process.env, config)}`);
