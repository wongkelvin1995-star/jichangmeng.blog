// 将「机场梦-29家机场MD」资料包导入项目。
// 用法：npm run import:package -- "<资料包目录>" "<providers.json 路径>"
//
// 产物：
//   materials/package/         资料包快照（不公开；不含 internal/）
//   src/data/providers.json    品牌注册表（名单、顺序、推广链接的唯一来源）
//   src/data/airports.json     29 家的结构化资料（来自 MD frontmatter）
//   public/assets/logos/*.webp 由原图等比缩小的展示图，裁切坐标按比例继续有效
//   public/assets/pricing/     套餐原图的展示版本（WebP），清单在 src/data/pricing-images.json
//   src/content/airports/*.md  编辑稿，仅在不存在时创建，重新导入不会覆盖
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import sharp from 'sharp';
import { parse as parseYaml } from 'yaml';

const [packageArg, providersArg] = process.argv.slice(2);
if (!packageArg || !providersArg) {
  console.error('用法：npm run import:package -- "<资料包目录>" "<providers.json 路径>"');
  process.exit(1);
}

const packageDir = resolve(packageArg);
const root = resolve(import.meta.dirname, '..');
const LOGO_DISPLAY_WIDTH = 1400;

// 公开页面需要的字段。历史测试图、内部追溯记录和 Markdown 正文不进入站点数据。
const PUBLIC_FIELDS = [
  'id', 'name', 'aliases', 'editorialOrder', 'fixedPosition', 'affiliateUrl', 'officialUrl',
  'verificationStatus', 'providerVerifiedAt', 'sourceUpdatedOn', 'referenceReviewedOn', 'sourceUrl',
  'logoPath', 'logoStatus', 'logoCrop', 'logoSourceImageSize', 'logoVisibleText', 'logoNote',
  'sourceHeadlineMonthly', 'nodeCountDisplay', 'regions', 'lineTypes', 'protocols',
  'lineTypesStatus', 'clientSupportStatus', 'operatingStatus', 'eligibleForConfirmedRouteFilter',
  'deviceLimitText', 'paymentMethods', 'refundPolicy', 'packages', 'packageCoverage', 'coupons',
  'referenceCouponCode', 'pricingEvidenceReceivedOn', 'pricingEvidenceCapturedAt', 'primaryPricingSourceId',
  'cardHighlights', 'providerClaims', 'verifiedFacts', 'tests', 'historicalTests', 'firstPartyTestCount', 'sourceConflicts', 'sourceNotes',
  'noExtraChargeVerified',
];

function frontmatterOf(text, file) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error(`${file} 缺少 frontmatter`);
  return parseYaml(match[1]);
}

const webpName = (logoPath) => `${basename(logoPath).replace(/\.[^.]+$/, '')}.webp`;

const providersFile = JSON.parse(await readFile(resolve(providersArg), 'utf8'));
const manifest = JSON.parse(await readFile(join(packageDir, 'manifest.json'), 'utf8'));

// 编辑顺序以 src/data/editorial-order.json 为准，重新导入资料包不会把顺序改回去。
const editorialOrder = JSON.parse(await readFile(join(root, 'src', 'data', 'editorial-order.json'), 'utf8'));
for (const provider of providersFile.providers) {
  const position = editorialOrder.indexOf(provider.id);
  if (position === -1) throw new Error(`品牌 ${provider.id} 不在 editorial-order.json`);
  provider.editorialOrder = position + 1;
}

// 替换图如有清单，先核对文件哈希。
const overridesFile = join(packageDir, 'logo-overrides.json');
if (existsSync(overridesFile)) {
  const overrides = JSON.parse(await readFile(overridesFile, 'utf8'));
  for (const item of overrides.files) {
    const hash = createHash('sha256').update(await readFile(join(packageDir, item.logoPath))).digest('hex');
    if (hash !== item.sha256) throw new Error(`${item.logoPath} 的哈希与 logo-overrides.json 不一致`);
  }
}

// 套餐原图如有清单，同样先核对文件哈希。
const pricingManifestFile = join(packageDir, 'internal', 'screenshot-evidence-manifest.json');
if (existsSync(pricingManifestFile)) {
  const { images } = JSON.parse(await readFile(pricingManifestFile, 'utf8'));
  for (const item of images) {
    const hash = createHash('sha256').update(await readFile(join(packageDir, item.image))).digest('hex');
    if (hash !== item.sha256) throw new Error(`${item.image} 的哈希与截图清单不一致`);
  }
}

// 1. 校验 MD 的完整性后再写入任何文件。
const airports = [];
const pricingOrder = new Map();
const sourceLogoPaths = [];
const localLogoOverrides = JSON.parse(await readFile(join(root, 'src', 'data', 'logo-overrides.json'), 'utf8'));
for (const entry of manifest.files) {
  const text = await readFile(join(packageDir, entry.file), 'utf8');
  const hash = createHash('sha256').update(text).digest('hex');
  if (hash !== entry.sha256) throw new Error(`${entry.file} 的哈希与 manifest 不一致`);
  const data = frontmatterOf(text, entry.file);
  const provider = providersFile.providers.find((p) => p.id === data.id);
  if (!provider) throw new Error(`品牌 ${data.id} 不在 providers.json`);
  if (provider.affiliateUrl !== data.affiliateUrl) throw new Error(`${data.id} 推广链接与注册表不一致`);
  const record = Object.fromEntries(PUBLIC_FIELDS.map((key) => [key, data[key] ?? null]));
  // 套餐截图按 MD 正文里“查看套餐截图 N”的顺序展示。
  pricingOrder.set(data.id, [...new Set([...text.matchAll(/\]\(\.\.\/(assets\/pricing\/[^)\s]+)\)/g)].map((m) => m[1]))]);
  // 注册表里的别名更完整（FLY V、V2云等），以注册表为准。
  record.aliases = provider.aliases;
  record.editorialOrder = provider.editorialOrder;
  // 站长单独提供的替换图优先于资料包，重新导入不会被改回去。
  const logoOverride = localLogoOverrides.find((item) => item.id === data.id);
  if (logoOverride) {
    const sourcePath = join(root, logoOverride.file);
    const { width, height } = await sharp(sourcePath).metadata();
    sourceLogoPaths.push(sourcePath);
    record.logoPath = `/assets/logos/${webpName(sourcePath)}`;
    record.logoStatus = 'user-replacement-selected';
    record.logoCrop = { x: 0, y: 0, width, height };
    record.logoSourceImageSize = { width, height };
    record.logoVisibleText = logoOverride.visibleText;
    record.logoNote = logoOverride.note;
  } else {
    if (data.logoPath) sourceLogoPaths.push(join(packageDir, data.logoPath));
    record.logoPath = data.logoPath ? `/assets/logos/${webpName(data.logoPath)}` : null;
  }
  airports.push(record);
}
airports.sort((a, b) => a.editorialOrder - b.editorialOrder);

// 2. 资料包快照（不公开）。
const snapshot = join(root, 'materials', 'package');
await rm(snapshot, { recursive: true, force: true });
await mkdir(snapshot, { recursive: true });
for (const name of await readdir(packageDir)) {
  // internal 含追溯记录，留在资料包原处；assets 在下面单独复制。
  // qa、reference、示例页是交接用的过程文件，不属于站点资料。
  if (['internal', 'assets', 'qa', 'reference'].includes(name) || name.endsWith('.html')) continue;
  await cp(join(packageDir, name), join(snapshot, name), { recursive: true });
}
await cp(join(packageDir, 'assets', 'logos'), join(snapshot, 'assets', 'logos'), { recursive: true });
// 历史图和套餐原图都随快照保存。历史图不公开；套餐图的公开版本在下面第 4.1 步生成。
for (const folder of ['tests', 'pricing']) {
  if (existsSync(join(packageDir, 'assets', folder))) {
    await cp(join(packageDir, 'assets', folder), join(snapshot, 'assets', folder), { recursive: true });
  }
}
await cp(resolve(providersArg), join(root, 'materials', 'providers.source.json'));

// 3. 站点数据。
await mkdir(join(root, 'src', 'data'), { recursive: true });
await writeFile(join(root, 'src', 'data', 'providers.json'), JSON.stringify(providersFile, null, 2) + '\n');
await writeFile(join(root, 'src', 'data', 'airports.json'), JSON.stringify(airports, null, 2) + '\n');

// 4. Logo 展示图：只导出正在使用的素材，等比缩小，不重绘、不裁切，原图保留在 materials/。
const logoOut = join(root, 'public', 'assets', 'logos');
await rm(logoOut, { recursive: true, force: true });
await mkdir(logoOut, { recursive: true });
const usedLogos = new Set(sourceLogoPaths);
for (const source of usedLogos) {
  const file = basename(source);
  const output = join(logoOut, webpName(file));
  await sharp(source)
    .resize({ width: LOGO_DISPLAY_WIDTH, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(output);
  const [before, after] = await Promise.all([stat(source), stat(output)]);
  console.log(`logo ${file}: ${(before.size / 1048576).toFixed(1)}MB → ${(after.size / 1024).toFixed(0)}KB`);
}

// 4.0 Logo 展示图：按每家的裁切区域生成卡片和大图两档（scripts/build-logos.mjs），页面只引用这些小图。
await import('./build-logos.mjs');

// 4.1 套餐原图：转成 WebP 放进公开目录，不缩小、不裁切；原图保留在 materials/。
// 站长决定不公开截图的品牌（src/data/hidden-pricing-images.json）：清单照常记录，价格仍按截图整理，但不输出公开图片。
const hiddenPricingFile = join(root, 'src', 'data', 'hidden-pricing-images.json');
const hiddenPricing = new Set(existsSync(hiddenPricingFile) ? JSON.parse(await readFile(hiddenPricingFile, 'utf8')).map((item) => item.id) : []);
const pricingOut = join(root, 'public', 'assets', 'pricing');
await rm(pricingOut, { recursive: true, force: true });
const pricingImages = {};
for (const airport of airports) {
  const order = pricingOrder.get(airport.id) ?? [];
  if (!order.length) continue;
  const publish = !hiddenPricing.has(airport.id);
  if (publish) await mkdir(join(pricingOut, airport.id), { recursive: true });
  pricingImages[airport.id] = [];
  for (const [index, relativePath] of order.entries()) {
    const source = join(packageDir, relativePath);
    const fileName = basename(relativePath);
    const shortId = fileName.match(/codex-clipboard-([0-9a-f]{8})/)?.[1] ?? String(index + 1);
    const name = `${airport.id}-${shortId}.webp`;
    if (publish) await sharp(source).webp({ quality: 88 }).toFile(join(pricingOut, airport.id, name));
    const { width, height } = await sharp(source).metadata();
    // alt 写明图里实际出现的套餐，而不是笼统的“截图”。
    const plans = [...new Set(airport.packages
      .filter((quote) => quote.sourceImage === relativePath || quote.corroboratingImages?.includes(fileName))
      .map((quote) => quote.name))];
    const alt = plans.length
      ? `${airport.name}套餐截图：${plans.slice(0, 4).join('、')}${plans.length > 4 ? '等' : ''}`
      : `${airport.name}套餐截图 ${index + 1}`;
    pricingImages[airport.id].push({ src: `/assets/pricing/${airport.id}/${name}`, width, height, alt, source: relativePath });
  }
}
await writeFile(join(root, 'src', 'data', 'pricing-images.json'), JSON.stringify(pricingImages, null, 2) + '\n');

// 5. 编辑稿：已存在的不动，避免覆盖人工审核内容。
const editorialDir = join(root, 'src', 'content', 'airports');
await mkdir(editorialDir, { recursive: true });
let created = 0;
for (const airport of airports) {
  const file = join(editorialDir, `${airport.id}.md`);
  if (existsSync(file)) continue;
  await writeFile(file, `---\ndraft: true\n---\n`);
  created += 1;
}

console.log(`导入完成：${airports.length} 家，新建编辑稿 ${created} 份，已有编辑稿未改动。`);
