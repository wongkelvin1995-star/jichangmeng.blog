#!/usr/bin/env node
// 校验品牌数据层 src/data/brands.json（npm run import:md 的输出）。
// 只检查、不修正：发现资料冲突时保留状态，不为了通过而删除记录或填默认值。
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseBrandMd, textValue } from './lib/parse-brand-md.mjs';

const root = resolve(import.meta.dirname, '..');
const readText = (...parts) => readFileSync(join(root, ...parts), 'utf8');
const readJson = (...parts) => JSON.parse(readText(...parts));
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

const errors = [];
const warnings = [];
const check = (ok, message) => { if (!ok) errors.push(message); };

const baseText = readText('src', 'data', 'airports.json');
const rulesText = readText('src', 'data', 'brand-md-rules.json');
const base = JSON.parse(baseText);
const rules = JSON.parse(rulesText);
const data = readJson('src', 'data', 'brands.json');
const registry = readJson('src', 'data', 'providers.json');
const brands = data.brands;
const byId = new Map(brands.map((brand) => [brand.id, brand]));

// 1. 输出与输入一致（基础层或规则改了却没重新导入，会在这里被发现）。
check(data.inputs.baseSha256 === sha256(baseText), 'brands.json 与当前 airports.json 不一致：请重新运行 npm run import:md');
check(data.inputs.rulesSha256 === sha256(rulesText), 'brands.json 与当前 brand-md-rules.json 不一致：请重新运行 npm run import:md');
check(data.inputs.files.length === rules.batch.expectedFiles, `资料批次应记录 ${rules.batch.expectedFiles} 份文件，实际 ${data.inputs.files.length}`);

// 2. 34 份品牌文件都有处理结果；ID、slug、编号不重复；既有品牌一个不少。
const brandFiles = data.inputs.files.filter((file) => file.role === '品牌资料');
check(brandFiles.length === rules.batch.expectedBrandFiles, `应有 ${rules.batch.expectedBrandFiles} 份品牌文件，实际 ${brandFiles.length}`);
for (const file of brandFiles) {
  const owners = brands.filter((brand) => brand.mdSource?.file === file.file);
  check(owners.length === 1, `${file.file} 应对应 1 个品牌记录，实际 ${owners.length}`);
  if (owners[0]) check(owners[0].mdSource.sha256 === file.sha256, `${file.file} 的哈希与品牌记录不一致`);
  check(Boolean(owners[0]?.importResult), `${file.file} 没有处理结果`);
}
const ids = brands.map((brand) => brand.id);
check(new Set(ids).size === ids.length, `品牌 ID 重复：${ids.filter((id, i) => ids.indexOf(id) !== i).join('、')}`);
for (const id of ids) check(/^[a-z0-9][a-z0-9-]*$/.test(id), `品牌 ID 不能用作 URL：${id}`);
const nos = brands.map((brand) => brand.mdSource?.no).filter(Boolean);
check(new Set(nos).size === nos.length, '资料编号重复');
for (const airport of base) check(byId.has(airport.id), `既有品牌 ${airport.id} 在数据层中丢失`);
const allowedResults = new Set(['新增', '更新', '保留', '待核验', '保留（本批无资料）']);
for (const brand of brands) check(allowedResults.has(brand.importResult), `${brand.id} 的处理结果不规范：${brand.importResult}`);

// 3. 推广链接：既有品牌保持站长原链接并与注册表一致；新品牌必须总目录与品牌 MD 一致才采用。
for (const brand of brands) {
  const old = base.find((airport) => airport.id === brand.id);
  const provider = registry.providers.find((item) => item.id === brand.id);
  if (old) {
    check(brand.affiliateUrl === old.affiliateUrl, `${brand.id} 的推广链接被改动`);
    if (provider) check(brand.affiliateUrl === provider.affiliateUrl, `${brand.id} 的推广链接与注册表不一致`);
  } else if (brand.affiliateUrl) {
    check(brand.link.toc === brand.affiliateUrl && brand.link.md === brand.affiliateUrl, `${brand.id} 采用的推广链接没有同时与总目录和品牌 MD 一致`);
  }
  if (brand.affiliateUrl) {
    const url = new URL(brand.affiliateUrl);
    check(url.protocol === 'https:', `${brand.id} 推广链接不是 https`);
    check(brand.inviteCode === (brand.affiliateUrl.match(/[?&]code=([^&#\s]+)/)?.[1] ?? null), `${brand.id} 的邀请码与推广链接不一致`);
  }
  if (brand.link && brand.link.status !== 'match') check(brand.fieldConflicts.some((item) => item.field === 'affiliateUrl'), `${brand.id} 的链接差异没有记录为冲突`);
}
const urls = brands.map((brand) => brand.affiliateUrl).filter(Boolean);
check(new Set(urls).size === urls.length, '不同品牌使用了同一个推广链接');

// 4. 价格、周期、流量口径。
const PERIODS = new Set(['month', 'quarter', 'half_year', 'year', 'two_year', 'three_year', 'one_time', 'day', 'week']);
const MONTHS = { month: 1, quarter: 3, half_year: 6, year: 12, two_year: 24, three_year: 36 };
const NEVER_COMPARABLE = new Set(['conflicting-or-pending', 'custom-contact-required', 'md-doubtful', 'md-unseen-in-screenshots', 'md-demo-unverified']);
const quoteIds = new Set();
for (const brand of brands) {
  for (const quote of brand.packages) {
    const label = `${brand.id} / ${quote.name} / ${quote.billingPeriod}`;
    check(!quoteIds.has(quote.id), `报价 ID 重复：${quote.id}`);
    quoteIds.add(quote.id);
    check(typeof quote.amount === 'number' && quote.amount > 0, `${label}：金额无效`);
    check(quote.billingPeriod === null || PERIODS.has(quote.billingPeriod), `${label}：付款周期不规范`);
    check((MONTHS[quote.billingPeriod] ?? null) === quote.billingMonths, `${label}：付款月数与周期不一致`);
    check(quote.trafficGB === null || (typeof quote.trafficGB === 'number' && quote.trafficGB > 0), `${label}：流量为 0 或不是数字`);
    // 额度未知时可以知道发放方式（例如总量包），但不能参与比较。
    if (quote.trafficGB === null) check(!quote.eligibleForReferenceComparison, `${label}：额度未知却参与价格比较`);
    if (quote.planType === 'one-time') check(quote.trafficPeriod === 'total' || quote.trafficGB === null, `${label}：一次性流量包被写成每月流量`);
    if (quote.trafficPeriod === 'total') check(quote.billingPeriod === 'one_time' || quote.planType === 'custom', `${label}：总流量只能属于一次性流量包`);
    if (quote.planType === 'annual-small') check(quote.billingMonths >= 12 && quote.trafficPeriod === 'month', `${label}：年付小包应为一次付一年、每月发放`);
    if (quote.billingPeriod === 'day' || quote.billingPeriod === 'week') check(quote.trafficGB === null || quote.origin === 'package', `${label}：日付、周付的额度不能补造`);
    if (NEVER_COMPARABLE.has(quote.priceStatus)) check(!quote.eligibleForReferenceComparison, `${label}：${quote.priceStatus} 不能参与价格比较`);
    if (quote.eligibleForReferenceComparison) {
      check(quote.trafficGB !== null && quote.billingPeriod !== null, `${label}：可比较的报价缺少额度或周期`);
      check(!['day', 'week'].includes(quote.billingPeriod), `${label}：日付、周付不参与比较`);
    }
    check(Array.isArray(quote.flags), `${label}：缺少 flags`);
    check(['package', 'md'].includes(quote.origin), `${label}：来源未标明`);
  }
}

// 5. 优惠码：原有 29 家保留站长确认的规则；新收录品牌只是资料记录，不套用 8 折规则。
for (const brand of brands) {
  const old = base.find((airport) => airport.id === brand.id);
  const coupon = brand.coupons[0];
  if (old) {
    const before = old.coupons[0];
    check(coupon?.code === before?.code, `${brand.id} 的优惠码被改动`);
    check(coupon?.discountLabel === '8折' && coupon?.usageLimit?.maxRedemptions === 1 && coupon?.excludedPlanTypes?.includes('one-time-traffic-package'), `${brand.id} 缺少站长确认的优惠规则`);
  } else if (coupon) {
    check(coupon.status === 'md-recorded-unverified' && !coupon.discountLabel && !coupon.usageLimit, `${brand.id}：新收录品牌不能套用站长确认的优惠规则`);
    check(!/[一-龥\s]/.test(coupon.code), `${brand.id}：疑似套餐名被当成优惠码`);
  }
  if (brand.mdCoupon && coupon && brand.mdCoupon.code !== coupon.code) {
    check(brand.fieldConflicts.some((item) => item.field === 'coupon.code'), `${brand.id}：优惠码差异没有记录`);
  }
}
check(byId.get('worryfree')?.coupons[0]?.code === 'woyou666', '无忧的优惠码应保留站长确认的 woyou666');

// 6. 发布与推荐：待核验记录不进推荐，新品牌只在审稿版本出现，排序不按资料编号。
for (const brand of brands) {
  if (brand.isNew) {
    check(brand.listing === 'drafts-only', `${brand.id}：新收录品牌应只在审稿版本出现`);
    check(brand.editorialOrder === null, `${brand.id}：新收录品牌不应有编辑顺序`);
    check(!brand.homeEligible && !brand.featuredEligible, `${brand.id}：新收录品牌不能进入推荐`);
    check(existsSync(join(root, 'src', 'content', 'airports', `${brand.id}.md`)), `${brand.id}：缺少详情页草稿占位`);
  }
  if (['contradictory', 'static-demo-suspected'].includes(brand.operatingStatus?.status)) {
    check(!brand.homeEligible && !brand.featuredEligible, `${brand.id}：运营状态待核，不能进首页推荐`);
  }
}
for (const id of registry.featuredProviderIds) check(byId.get(id)?.featuredEligible, `精选品牌 ${id} 不符合推荐条件`);
const order = readJson('src', 'data', 'editorial-order.json');
const publicOrder = brands.filter((brand) => brand.listing === 'public').sort((a, b) => a.editorialOrder - b.editorialOrder).map((brand) => brand.id);
check(publicOrder.join() === order.join(), '公开品牌的顺序与 editorial-order.json 不一致');

// 7. 指定的疑点按原值保留。
const twilightHalf = byId.get('twilight')?.packages.find((q) => q.name === '基础版' && q.billingPeriod === 'half_year');
check(twilightHalf?.amount === 103 && twilightHalf?.priceStatus === 'md-doubtful', '暮光基础版半年付应保留 ¥103 并标为存疑');
const flycat = byId.get('flycat');
check(flycat?.nodeCountDisplay === base.find((a) => a.id === 'flycat').nodeCountDisplay && flycat.network.doubts.length > 0, '飞猫云节点数应保留原值并记录疑点');
const breezeOld = base.find((a) => a.id === 'breezenet').packages;
const breezeNow = byId.get('breezenet').packages.filter((q) => q.origin === 'package');
check(breezeNow.length === breezeOld.length && breezeNow.every((q, i) => q.amount === breezeOld[i].amount && q.trafficGB === breezeOld[i].trafficGB), '微风网络的截图价格不能被资料批次覆盖');
for (const brand of brands.filter((b) => b.pricingPriority === 'screenshot')) {
  const old = base.find((a) => a.id === brand.id).packages;
  for (const quote of brand.packages.filter((q) => q.origin === 'package')) {
    const before = old.find((q) => q.id === quote.id);
    check(before && before.amount === quote.amount && before.trafficGB === quote.trafficGB && before.priceStatus === quote.priceStatus, `${brand.id}：截图报价 ${quote.name} 被改动`);
  }
}
check(byId.get('v2yun')?.operatingStatus?.status === 'contradictory', '唯兔云应标记运营状态待核');
check(byId.get('shandianyun')?.packages.every((q) => q.priceStatus === 'md-demo-unverified' && !q.eligibleForReferenceComparison), '闪电云的示例价格不能当作确认价格');
check(byId.get('flyv')?.pricingPriority === 'owner-version', '飞V 应按站长版本处理');
for (const brand of brands) for (const test of brand.thirdPartyTests ?? []) check(test.firstParty === false && test.evidence, `${brand.id}：第三方测试不能标为本站实测`);

// 8. 未知值原样保留：品牌 MD 里写的文字，在数据层中逐字存在（不被换成 0、false、无限制）。
// defaultSourceDir 用 ~ 表示用户主目录；Cloudflare 上两处都找不到时跳过逐字核对（只提醒）。
const homeDir = (path) => (path?.startsWith('~') ? join(homedir(), path.slice(1)) : path);
const sourceDir = [homeDir(rules.batch.defaultSourceDir), join(root, rules.batch.snapshotDir)].find((dir) => dir && existsSync(dir));
if (sourceDir) {
  const FIELDS = [
    ['设备与客户端', '订阅链接', (b) => b.client.subscription.text],
    ['设备与客户端', '第三方客户端', (b) => b.client.thirdParty.text],
    ['设备与客户端', '设备数', (b) => b.client.devices],
    ['设备与客户端', '支持系统', (b) => b.client.systems],
    ['客服与防骗', '退款', (b) => b.service.refund],
    ['客服与防骗', '试用', (b) => b.service.trial],
    ['客服与防骗', '客服渠道', (b) => b.service.channels],
    ['优惠码', '优惠码', (b) => b.mdCoupon?.code ?? null],
    ['优惠码', '折扣', (b) => b.mdCoupon?.discountText ?? null],
    ['流媒体与AI', 'AI 工具', (b) => b.claims.ai],
    ['基本信息', '适合人群', (b) => b.profile.audience],
  ];
  for (const file of readdirSync(sourceDir).filter((name) => /^\d\d_/.test(name) && !name.startsWith('00_'))) {
    const brand = brands.find((b) => b.mdSource?.file === file);
    if (!brand) continue;
    const doc = parseBrandMd(readFileSync(join(sourceDir, file), 'utf8'));
    for (const [section, key, pick] of FIELDS) {
      const expected = textValue(doc.sections[section]?.kv?.[key]);
      check(pick(brand) === expected, `${file}：${section}/${key} 应原样保留为「${expected ?? '（资料未写）'}」，实际「${pick(brand)}」`);
    }
  }
} else {
  warnings.push('找不到资料目录或快照，跳过逐字核对');
}

// 9. 文章表格里的价格：只提到一个品牌的表格行，其中的“N元”应能在该品牌的报价中找到（只提示，不阻断）。
const shortName = (brand) => brand.name.split(/\s/)[0].replace(/(云|网络|加速)$/, '');
let articleRows = 0;
for (const dir of ['compare', 'guides', 'reviews']) {
  for (const name of readdirSync(join(root, 'src', 'content', dir)).filter((n) => n.endsWith('.md') && !n.startsWith('_'))) {
    const text = readText('src', 'content', dir, name).replace(/^---[\s\S]*?---/, '');
    for (const row of text.split('\n').filter((line) => line.startsWith('|'))) {
      const mentioned = brands.filter((brand) => brand.listing === 'public' && [brand.name, shortName(brand), ...brand.aliases].some((alias) => alias.length >= 2 && row.includes(alias)));
      if (mentioned.length !== 1) continue;
      const cells = row.split('|').map((cell) => cell.trim());
      for (const cell of cells) {
        const match = cell.match(/^(\d+(?:\.\d+)?)\s*元$/);
        if (!match) continue;
        articleRows += 1;
        if (!mentioned[0].packages.some((q) => q.amount === Number(match[1]))) {
          warnings.push(`${dir}/${name}：表格行「${row.slice(0, 40)}」中的 ${match[1]} 元在 ${mentioned[0].id} 的报价里找不到`);
        }
      }
    }
  }
}

// 10. 卡片价格下方的优势（站长 2026-11-06 要求）：公开品牌每家 2–3 条，来自规则文件且逐条注明依据；
// 只放优势，不写价格、测速、稳定性或排名，不重复卡片上已有的地区标签，也不套用同一份模板。
const PRICE_WORDS = /[¥￥]|\d+(\.\d+)?\s*元|每\s*GB|单价|\/\s*月/;
const CLAIM_WORDS = /最快|最稳|稳定|不卡|不降速|不限速|低延迟|延迟低|全解锁|永久可用|亲测|实测|排名|第\s*\d+|最低|最便宜|性价比|\d+(\.\d+)?\s*Gbps/i;
const highlightUse = new Map();
for (const brand of brands.filter((item) => item.listing === 'public')) {
  const rule = rules.brands.find((item) => item.id === brand.id);
  const list = brand.cardHighlights ?? [];
  check(Array.isArray(rule?.highlights), `${brand.id} 的卡片优势没有写在规则文件里`);
  check(list.length >= 2 && list.length <= 3, `${brand.id} 的卡片优势应为 2–3 条，实际 ${list.length}`);
  check(JSON.stringify(list) === JSON.stringify((rule?.highlights ?? []).map((item) => item.text)), `${brand.id} 的卡片优势与规则文件不一致，请重新运行 npm run import:md`);
  for (const item of rule?.highlights ?? []) {
    const text = item.text ?? '';
    check(Boolean(item.basis), `${brand.id} 的优势「${text}」没有写依据`);
    check([...text].length <= 16, `${brand.id} 的优势「${text}」太长，卡片上会折行`);
    check(!PRICE_WORDS.test(text), `${brand.id} 的优势「${text}」含价格`);
    check(!CLAIM_WORDS.test(text), `${brand.id} 的优势「${text}」含测速、稳定性或排名说法`);
    // 单独提到某地的定制产品（如“美国原生家宽 IP”）可以，罗列地区就和卡片的地区标签重复了。
    const regionHits = (brand.regions ?? []).filter((region) => text.includes(region)).length;
    check(regionHits < 2 && !/港日|港台|日新|新美/.test(text), `${brand.id} 的优势「${text}」重复了卡片上的地区标签`);
    highlightUse.set(text, [...(highlightUse.get(text) ?? []), brand.id]);
  }
}
for (const [text, ids] of highlightUse) check(ids.length <= 2, `优势「${text}」被 ${ids.length} 家共用，像是通用模板：${ids.join('、')}`);
const highlightSets = brands.filter((item) => item.listing === 'public').map((item) => JSON.stringify(item.cardHighlights));
check(new Set(highlightSets).size === highlightSets.length, '有品牌的卡片优势完全相同');

for (const message of warnings) console.warn(`提示：${message}`);
if (errors.length) {
  console.error(`品牌数据检查失败（${errors.length} 项）：\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
const tally = brands.reduce((acc, brand) => ({ ...acc, [brand.importResult]: (acc[brand.importResult] ?? 0) + 1 }), {});
console.log(`品牌数据检查通过：${brands.length} 家（${Object.entries(tally).map(([k, v]) => `${k} ${v}`).join('，')}），报价 ${quoteIds.size} 条；文章表格价格核对 ${articleRows} 处。`);
