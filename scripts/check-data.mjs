// 构建前的数据校验：任何一项失败都会中止构建。
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

const root = resolve(import.meta.dirname, '..');
const readJson = (...p) => JSON.parse(readFileSync(join(root, ...p), 'utf8'));

const errors = [];
const check = (ok, message) => { if (!ok) errors.push(message); };

const registry = readJson('src', 'data', 'providers.json');
const airports = readJson('src', 'data', 'airports.json');
const batchBrandIds = new Set(readJson('src', 'data', 'brands.json').brands.filter((brand) => brand.isNew).map((brand) => brand.id));
const sourceRegistry = readJson('materials', 'providers.source.json');
const manifest = readJson('materials', 'package', 'manifest.json');

const FIXED_ORDER = readJson('src', 'data', 'editorial-order.json');
check(FIXED_ORDER.length === 29 && new Set(FIXED_ORDER).size === 29, 'editorial-order.json 应列出 29 个不重复的品牌');

const providers = registry.providers;
check(providers.length === 29, `品牌数应为 29，实际 ${providers.length}`);
check(new Set(providers.map((p) => p.id)).size === providers.length, '品牌 ID 有重复');
check(new Set(providers.map((p) => p.affiliateUrl)).size === providers.length, '推广链接有重复');

const orders = providers.map((p) => p.editorialOrder).sort((a, b) => a - b);
check(orders.every((order, i) => order === i + 1), '编辑顺序没有连续覆盖 1–29');

const ordered = [...providers].sort((a, b) => a.editorialOrder - b.editorialOrder);
FIXED_ORDER.forEach((id, i) => check(ordered[i].id === id, `第 ${i + 1} 位应为 ${id}，实际 ${ordered[i].id}`));

// 推广链接必须与原始注册表、资料包 manifest、站点数据三处逐字符一致。
for (const provider of providers) {
  const source = sourceRegistry.providers.find((p) => p.id === provider.id);
  const inManifest = manifest.files.find((f) => f.id === provider.id);
  const airport = airports.find((a) => a.id === provider.id);
  check(source?.affiliateUrl === provider.affiliateUrl, `${provider.id} 与原始注册表的链接不同`);
  check(inManifest?.affiliateUrl === provider.affiliateUrl, `${provider.id} 与 manifest 的链接不同`);
  check(airport?.affiliateUrl === provider.affiliateUrl, `${provider.id} 与站点数据的链接不同`);
  check(airport?.editorialOrder === provider.editorialOrder, `${provider.id} 的顺序与注册表不同`);
  check(inManifest?.couponCode === airport?.coupons?.[0]?.code, `${provider.id} 的优惠码与 manifest 不同`);
}
check(airports.length === 29, `站点资料应为 29 家，实际 ${airports.length}`);

const worryfree = airports.find((a) => a.id === 'worryfree');
check(worryfree?.coupons?.[0]?.code === 'woyou666', '无忧优惠码必须保持 woyou666');

// 统一优惠规则：站长确认 8 折、每人一次、一次性流量包不参与，不能标成已核验。
for (const airport of airports) {
  const coupon = airport.coupons?.[0];
  check(coupon?.discountLabel === '8折' && coupon?.payableMultiplier === 0.8, `${airport.id} 的优惠规则不是 8 折`);
  check(coupon?.usageLimit?.maxRedemptions === 1, `${airport.id} 缺少每人限用一次的规则`);
  check(coupon?.excludedPlanTypes?.includes('one-time-traffic-package'), `${airport.id} 缺少一次性流量包排除规则`);
  check(!coupon?.verifiedAt, `${airport.id} 的优惠码没有结算核验记录，不能标为已核验`);
}

// 报价口径。
const quotes = airports.flatMap((a) => a.packages ?? []);
check(quotes.length === manifest.representativeQuoteCount,
  `代表报价应为 ${manifest.representativeQuoteCount}，实际 ${quotes.length}`);
const blocked = quotes.filter((q) => q.eligibleForReferenceComparison !== true);
check(blocked.length === manifest.comparisonExcludedQuoteCount,
  `不参与比较的报价应为 ${manifest.comparisonExcludedQuoteCount}，实际 ${blocked.length}`);
check(quotes.filter((q) => q.priceStatus === 'conflicting-or-pending').length === manifest.pendingOrConflictQuoteCount,
  `冲突报价应为 ${manifest.pendingOrConflictQuoteCount}`);
check(quotes.filter((q) => q.priceStatus === 'custom-contact-required').length === manifest.customQuoteCount,
  `定制展示应为 ${manifest.customQuoteCount}`);
const EXPECTED_MONTHS = { month: 1, quarter: 3, half_year: 6, year: 12, one_time: null };
for (const quote of quotes) {
  check(!['conflicting-or-pending', 'custom-contact-required'].includes(quote.priceStatus) || quote.eligibleForReferenceComparison === false,
    `${quote.id} 是冲突或定制报价，却可参与排序`);
  check(Boolean(quote.retrievedOn && (quote.sourceImage || (quote.sourceUrl && quote.sourceUpdatedOn))), `${quote.id} 缺少来源或日期`);
  check(quote.officialPriceVerified === false || airports.find((a) => a.packages?.includes(quote))?.providerVerifiedAt,
    `${quote.id} 标为官网核验，但没有核验日期`);
  // 付款周期和流量周期要分开：周期套餐按每月，一次性流量包按总量。
  check(quote.billingPeriod in EXPECTED_MONTHS && quote.billingMonths === EXPECTED_MONTHS[quote.billingPeriod], `${quote.id} 的付款周期和月数不一致`);
  if (quote.billingPeriod === 'one_time') check(quote.trafficPeriod === 'total', `${quote.id} 是一次性流量包，流量应按总量`);
  else if (quote.priceStatus !== 'custom-contact-required') check(quote.trafficPeriod === 'month', `${quote.id} 是周期套餐，流量应按每月`);
  check(quote.trafficGB !== 0, `${quote.id} 的 0GB 不能当作实际额度`);
}

// 套餐截图：每条报价引用的图都要在截图清单里，公开的图文件也要存在。
// 站长决定不公开截图的品牌（hidden-pricing-images.json）只记在清单里，public 里不能有它的图。
const pricingImages = readJson('src', 'data', 'pricing-images.json');
const hiddenPricing = readJson('src', 'data', 'hidden-pricing-images.json');
const hiddenPricingIds = new Set(hiddenPricing.map((item) => item.id));
for (const item of hiddenPricing) {
  check(Boolean(pricingImages[item.id]?.length), `hidden-pricing-images.json 里的 ${item.id} 没有套餐截图，这条设置已过期`);
  check(Boolean(item.decidedOn && item.note), `hidden-pricing-images.json 里的 ${item.id} 缺少决定日期或说明`);
  check(!existsSync(join(root, 'public', 'assets', 'pricing', item.id)), `${item.id} 的套餐截图已决定不公开，public/assets/pricing/${item.id}/ 不应存在`);
}
const pricingList = Object.values(pricingImages).flat();
check(pricingList.length === manifest.pricingScreenshotCount, `套餐截图应为 ${manifest.pricingScreenshotCount} 张，实际 ${pricingList.length}`);
check(Object.keys(pricingImages).length === manifest.pricingScreenshotUpdatedProviderCount, '有套餐截图的品牌数量不符');
for (const [id, images] of Object.entries(pricingImages)) {
  for (const image of images) {
    if (!hiddenPricingIds.has(id)) check(existsSync(join(root, 'public', image.src)), `套餐截图文件不存在：${image.src}`);
    check(image.width > 0 && image.height > 0 && image.alt, `套餐截图缺少尺寸或 alt：${image.src}`);
  }
}
for (const quote of quotes.filter((q) => q.sourceImage)) {
  check(pricingList.some((image) => image.source === quote.sourceImage), `${quote.id} 引用的截图不在截图清单里`);
}

// Logo 映射：数量以资料包的 logo-manifest.json 为准（2026-11-06 起 29 家都有图）。
const logoManifestPath = join(root, 'materials', 'package', 'logo-manifest.json');
const logoManifest = existsSync(logoManifestPath) ? JSON.parse(readFileSync(logoManifestPath, 'utf8')) : null;
const mappedLogos = airports.filter((a) => a.logoPath);
const expectedLogoCount = logoManifest?.mappedProviderCount ?? 16;
check(mappedLogos.length === expectedLogoCount, `已关联 Logo 应为 ${expectedLogoCount} 家，实际 ${mappedLogos.length}`);
for (const item of logoManifest?.files ?? []) {
  const airport = airports.find((a) => a.id === item.id);
  check(Boolean(airport), `logo-manifest.json 的 ${item.id} 不在品牌名单里`);
  check(Boolean(item.logoPath) === Boolean(airport?.logoPath), `${item.id} 的 Logo 关联与 logo-manifest.json 不一致`);
}
for (const airport of mappedLogos) {
  check(existsSync(join(root, 'public', airport.logoPath)), `${airport.id} 的 Logo 文件不存在`);
  const { logoCrop: crop, logoSourceImageSize: size } = airport;
  check(crop && size && crop.x + crop.width <= size.width && crop.y + crop.height <= size.height,
    `${airport.id} 的 Logo 裁切超出原图`);
}

// 资料包里的替换图（2026-11-05 的六张、2026-11-06 补充的 13 家展示图）必须是新文件和整图坐标，
// 不能沿用旧拼图 crop；原图快照的哈希、状态和可见文字要与清单一致。
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const overridesPath = join(root, 'materials', 'package', 'logo-overrides.json');
if (existsSync(overridesPath)) {
  const { files: overrides } = JSON.parse(readFileSync(overridesPath, 'utf8'));
  check(new Set(overrides.map((item) => item.id)).size === overrides.length, 'logo-overrides.json 有重复品牌');
  for (const item of overrides) {
    const airport = airports.find((a) => a.id === item.id);
    const expected = `/assets/logos/${item.logoPath.split('/').pop().replace(/\.png$/, '.webp')}`;
    check(airport?.logoPath === expected, `${item.id} 没有使用替换图 ${expected}`);
    const { logoCrop: crop, logoSourceImageSize: size } = airport ?? {};
    check(crop?.x === 0 && crop?.y === 0 && crop?.width === size?.width && crop?.height === size?.height,
      `${item.id} 的替换图没有使用整图坐标`);
    const original = join(root, 'materials', 'package', item.logoPath);
    check(existsSync(original) && sha256(readFileSync(original)) === item.sha256, `${item.id} 的替换图快照与清单哈希不一致`);
    if (item.status) check(airport?.logoStatus === item.status, `${item.id} 的 Logo 状态应为 ${item.status}，实际 ${airport?.logoStatus}`);
    if (item.visibleText) check(airport?.logoVisibleText === item.visibleText, `${item.id} 的 Logo 可见文字与清单不一致`);
  }
  // 机场梦设计的展示图：一家一张，文件名带品牌 ID，整张就是 3:1 横幅。
  const designed = overrides.filter((item) => item.status === 'blog-designed-not-official');
  for (const item of designed) {
    check(item.logoPath.endsWith(`/${item.id}-blog-v1.png`), `${item.id} 的展示图文件名没有对应品牌 ID`);
    check(item.sourceImageSize?.width === 3 * item.sourceImageSize?.height, `${item.id} 的展示图不是 3:1`);
  }
  check(new Set(designed.map((item) => item.logoPath)).size === designed.length, '展示图有多家共用同一文件');
}

// 站长单独提供的替换图同样必须生效，并使用整图坐标。
for (const item of readJson('src', 'data', 'logo-overrides.json')) {
  const airport = airports.find((a) => a.id === item.id);
  const expected = `/assets/logos/${item.file.split('/').pop().replace(/\.[^.]+$/, '.webp')}`;
  check(existsSync(join(root, item.file)), `${item.id} 的替换图原文件不存在`);
  check(airport?.logoPath === expected, `${item.id} 没有使用替换图 ${expected}`);
  const { logoCrop: crop, logoSourceImageSize: size } = airport ?? {};
  check(crop?.x === 0 && crop?.y === 0 && crop?.width === size?.width && crop?.height === size?.height,
    `${item.id} 的替换图没有使用整图坐标`);
}

// Logo 展示图（scripts/build-logos.mjs，2026-11-06）：每家都有卡片和大图两档，裁切与资料记录一致、原图没有变过，
// 比例与裁切区域相同，否则外框里的 Logo 会和原来不一样。不一致时运行 npm run logos 重新生成。
const logoDisplayPath = join(root, 'src', 'data', 'logo-display.json');
const logoDisplay = existsSync(logoDisplayPath) ? JSON.parse(readFileSync(logoDisplayPath, 'utf8')) : {};
for (const airport of mappedLogos) {
  const entry = logoDisplay[airport.id];
  check(Boolean(entry), `${airport.id} 缺少 Logo 展示图，请运行 npm run logos`);
  if (!entry) continue;
  check(JSON.stringify(entry.crop) === JSON.stringify(airport.logoCrop), `${airport.id} 的 Logo 展示图裁切与资料不一致，请运行 npm run logos`);
  const source = join(root, entry.source);
  check(existsSync(source) && sha256(readFileSync(source)) === entry.sourceSha256, `${airport.id} 的 Logo 原图已经变化，请运行 npm run logos`);
  const cropRatio = airport.logoCrop.width / airport.logoCrop.height;
  for (const variant of ['card', 'large']) {
    const image = entry[variant];
    check(Boolean(image) && existsSync(join(root, 'public', image.src)), `${airport.id} 的 ${variant} 展示图不存在，请运行 npm run logos`);
    if (image) check(Math.abs(image.width / image.height - cropRatio) <= cropRatio * 0.01, `${airport.id} 的 ${variant} 展示图比例与裁切区域不一致`);
  }
}

// 页面读取 brands.json：29 家的 Logo 字段要与基础层一致，不能在数据层里另写一套。
const brandLayer = readJson('src', 'data', 'brands.json').brands;
for (const airport of airports) {
  const brand = brandLayer.find((item) => item.id === airport.id);
  for (const key of ['logoPath', 'logoStatus', 'logoCrop', 'logoSourceImageSize', 'logoVisibleText', 'logoNote']) {
    check(JSON.stringify(brand?.[key] ?? null) === JSON.stringify(airport[key] ?? null), `brands.json 中 ${airport.id} 的 ${key} 与 airports.json 不一致`);
  }
}

// 卡片优势：每家 1–3 条，与资料包一致，不含价格和绝对化承诺。
const highlightsPath = join(root, 'materials', 'package', 'card-highlights.json');
if (existsSync(highlightsPath)) {
  const highlightFile = JSON.parse(readFileSync(highlightsPath, 'utf8'));
  for (const airport of airports) {
    const list = airport.cardHighlights ?? [];
    const source = highlightFile.find((h) => h.id === airport.id);
    check(list.length >= 1 && list.length <= 3, `${airport.id} 的优势条数应为 1–3，实际 ${list.length}`);
    check(JSON.stringify(list) === JSON.stringify(source?.highlights), `${airport.id} 的优势与 card-highlights.json 不一致`);
    for (const text of list) {
      check(!/[¥￥]|\d+\s*元|最快|最稳|全解锁|永久可用|亲测/.test(text), `${airport.id} 的优势含价格或绝对化承诺：${text}`);
    }
  }
}

// 本站未做实测，不能出现第一方测试记录。
for (const airport of airports) {
  check(airport.firstPartyTestCount === 0 && airport.tests.length === 0 || airport.providerVerifiedAt,
    `${airport.id} 有实测记录，请确认证据后再调整此校验`);
}

// 历史样本和本站测试必须分开保存。
const samples = airports.find((a) => a.id === 'lingdongyun')?.historicalTests ?? [];
check(samples.length === 11, `灵动云应保存 11 条历史样本，实际 ${samples.length}`);
check(samples.every((sample) => sample.firstPartyTest === false), '历史样本不能标记为本站测试');

// 发布门槛：draft:false 的编辑稿必须有摘要、发布日期和足够的独有正文。
const editorialDir = join(root, 'src', 'content', 'airports');
for (const airport of airports) {
  const file = join(editorialDir, `${airport.id}.md`);
  check(existsSync(file), `缺少编辑稿 ${airport.id}.md`);
}
for (const name of readdirSync(editorialDir)) {
  const text = readFileSync(join(editorialDir, name), 'utf8');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const id = name.replace(/\.md$/, '');
  // 新收录品牌只在资料批次数据层（brands.json）中，草稿占位由 npm run import:md 创建。
  check(airports.some((a) => a.id === id) || batchBrandIds.has(id), `编辑稿 ${name} 没有对应品牌`);
  if (!airports.some((a) => a.id === id) && match) check(/^draft:\s*true\s*$/m.test(match[1]), `新收录品牌 ${name} 只能是草稿`);
  if (!match) { errors.push(`${name} 的 frontmatter 无效`); continue; }
  const front = parseYaml(match[1]) ?? {};
  if (front.draft === false) {
    check(Boolean(front.summary), `${name} 已发布但缺少 summary`);
    check(Boolean(front.publishedAt), `${name} 已发布但缺少 publishedAt`);
    check(Boolean(front.updatedAt), `${name} 已发布但缺少 updatedAt`);
    check(match[2].trim().length >= 300, `${name} 已发布但独有正文不足 300 字`);
  }
}

// 不公开的资料不能进入 public/。
check(!existsSync(join(root, 'public', 'internal')), 'internal 不能放入 public');

// 历史截图决定不公开，原文件只保留在 materials/ 里。
check(!existsSync(join(root, 'public', 'assets', 'tests')), '历史截图决定不公开，不能放入 public');

// 公开内容必须有发布日期、标题和描述。
for (const section of ['guides', 'compare', 'reviews']) {
  const dir = join(root, 'src', 'content', section);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    if (name.startsWith('_')) continue;
    const match = readFileSync(join(dir, name), 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    const front = parseYaml(match?.[1] ?? '') ?? {};
    if (front.draft === false) {
      check(Boolean(front.title && front.description && front.publishedAt && front.updatedAt), `${section}/${name} 缺少标题、描述或日期`);
      check((match?.[2] ?? '').trim().length >= 300, `${section}/${name} 正文不足 300 字`);
    }
  }
}

if (errors.length) {
  console.error(`数据校验失败（${errors.length} 项）：\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`数据校验通过：${providers.length} 家品牌，${quotes.length} 条报价（${blocked.length} 条不参与排序），${mappedLogos.length} 家 Logo。`);
