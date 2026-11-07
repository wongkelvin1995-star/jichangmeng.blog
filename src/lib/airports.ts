import { getCollection } from 'astro:content';
import data from '../data/brands.json';
import pricingImages from '../data/pricing-images.json';
import hiddenPricingImages from '../data/hidden-pricing-images.json';
import logoDisplay from '../data/logo-display.json';
import registry from '../data/providers.json';
import { site } from '../config/site';

// 品牌数据层：src/data/brands.json 由 npm run import:md 生成，
// 合并了资料包基础层（src/data/airports.json）与「机场MD」资料批次。页面只从这里读取。

export type BillingPeriod = 'month' | 'quarter' | 'half_year' | 'year' | 'two_year' | 'three_year' | 'one_time' | 'day' | 'week';
export type PlanType = 'periodic' | 'annual-small' | 'one-time' | 'custom' | 'short-term' | 'trial' | 'addon';

export interface Quote {
  id: string;
  name: string;
  amount: number;
  currency: string;
  /** null = 资料没写付款周期，不自行推断。 */
  billingPeriod: BillingPeriod | null;
  billingMonths: number | null;
  trafficGB: number | null;
  trafficPeriod: 'month' | 'total' | null;
  couponEligible: boolean | null;
  sourceNote: string | null;
  priceStatus: string;
  eligibleForReferenceComparison: boolean;
  sourceUrl: string | null;
  sourceUpdatedOn: string | null;
  retrievedOn: string;
  sourceImage?: string;
  displayedTrafficText?: string;
  nameNotes?: string;
  planType: PlanType;
  origin: 'package' | 'md';
  flags: string[];
  md: { match: string; mdName?: string; candidate?: { amount: number; trafficGB: number | null; name: string }; raw?: string };
  validityText?: string;
  trafficCycleNote?: string;
  resetOption?: { amount: number; text: string; kind: string } | null;
}

export interface Coupon {
  code: string;
  status: string;
  referenceRestrictionNotes: string[] | null;
  /** 站长确认的活动规则，未经服务商结算核验。 */
  discountLabel?: string | null;
  usageLimit?: { scope: string; maxRedemptions: number } | null;
  excludedPlanTypes?: string[] | null;
  /** 新收录品牌：资料记录的折扣文字，未经站长确认。 */
  mdDiscountText?: string | null;
}

export type ClientStatus = 'paused' | 'not-recommended' | 'not-supported' | 'unconfirmed' | 'stated';

export interface FieldConflict {
  field: string;
  adopted: string | null;
  candidate: string | null;
  text: string;
  public: boolean;
  status: string;
}

export interface ThirdPartyTest {
  id: string;
  testedAt: string | null;
  network: string | null;
  tool: string | null;
  regions: { region: string; result: string | null }[];
  services: string | null;
  conclusion: string | null;
  source: string;
  evidence: string;
  firstParty: boolean;
}

export interface Airport {
  id: string;
  name: string;
  aliases: string[];
  /** null = 新收录、未进入编辑顺序。 */
  editorialOrder: number | null;
  affiliateUrl: string | null;
  officialUrl: string | null;
  sourceUrl: string | null;
  sourceUpdatedOn: string | null;
  referenceReviewedOn: string;
  logoPath: string | null;
  /** blog-designed-not-official：机场梦设计的展示图，不是服务商官方标志。 */
  logoStatus: string | null;
  logoCrop: { x: number; y: number; width: number; height: number } | null;
  logoSourceImageSize: { width: number; height: number } | null;
  logoVisibleText: string | null;
  logoNote: string | null;
  sourceHeadlineMonthly: { amount: number; trafficGB: number; planName?: string; limitedOffer?: boolean } | null;
  nodeCountDisplay: string | null;
  regions: string[] | null;
  lineTypes: string[] | null;
  protocols: string[] | null;
  lineTypesStatus: string | null;
  clientSupportStatus: string | null;
  deviceLimitText: string | null;
  packages: Quote[];
  coupons: Coupon[];
  referenceCouponCode: string | null;
  primaryPricingSourceId: string | null;
  pricingEvidenceReceivedOn: string | null;
  /** 卡片主价格下方的非价格优势，来自资料包，每家最多 3 条。 */
  cardHighlights: string[];
  providerClaims: string[] | null;
  sourceConflicts: string[] | null;
  sourceNotes: string[] | null;
  // 以下来自「机场MD」资料批次
  isNew: boolean;
  listing: 'public' | 'drafts-only';
  homeEligible: boolean;
  featuredEligible: boolean;
  operatingStatus: { status: string; text: string | null };
  pricingPriority: 'screenshot' | 'owner-version' | 'reference' | 'md-batch';
  englishName: string | null;
  inviteCode: string | null;
  profile?: { positioning: string | null; strengths: string | null; audience: string | null };
  network?: {
    regionsText: string | null;
    regionCounts: { region: string; count: number; line?: string }[];
    nodeTotal: { value: number; plus: boolean } | null;
    lineText: string | null;
    multiplierText: string | null;
    notes: string[];
    doubts: string[];
  };
  trafficRules?: string[];
  client?: {
    usage: string | null;
    systems: string | null;
    otherDevices: string | null;
    devices: string | null;
    download: string | null;
    note: string | null;
    subscription: { status: ClientStatus; text: string | null };
    thirdParty: { status: ClientStatus; text: string | null };
    restoreTime: string | null;
  };
  claims?: { ipText: string | null; streaming: string | null; ai: string | null; crossBorder: string | null; note: string | null };
  thirdPartyTests?: ThirdPartyTest[];
  service?: { channels: string | null; hours: string | null; refund: string | null; trial: string | null; payment: string | null; antiFraud: string[]; notes: string[] };
  mdCoupon?: { code: string; discountText: string | null; applicable: string | null; excluded: string | null; limits: string | null; stacking: string | null; method: string | null } | null;
  reviewNotes?: { text: string; public: boolean }[];
  fieldConflicts?: FieldConflict[];
  importResult?: string;
  /** 站长核实过的信息（规则文件 ownerVerified）：lines = 线路已核实，pricing = 价格已由站长核对。 */
  ownerVerified?: { verifiedOn: string; lines: boolean; pricing: boolean } | null;
  /** 这家资料在「机场MD」批次里的来源文件；collectedOn 是批次整理日期。 */
  mdSource?: { batchId: string; file: string; no: string; collectedOn: string; sha256: string } | null;
}

export interface PricingImage {
  src: string;
  width: number;
  height: number;
  alt: string;
}

const order = (airport: Airport) => airport.editorialOrder ?? Number.POSITIVE_INFINITY;

/** 资料批次信息与本站对客户端的统一建议（A：本站建议；各品牌的 B：服务商说明，见 airport.client）。 */
export const batch = data.batch;
export const siteClientRecommendation: string = data.siteClientRecommendation;

/** 全部品牌记录，含只在本地审稿版本显示的新收录品牌。 */
export const allBrands = (data.brands as unknown as Airport[]).slice().sort((a, b) => order(a) - order(b));
export const brandById = (id: string) => allBrands.find((airport) => airport.id === id);

/** 公开目录中的品牌（排序、首页、计数都只用这一组）。 */
export const airports = allBrands.filter((airport) => airport.listing === 'public');
/** 新收录、待核验的品牌：只在 npm run build:drafts（PREVIEW_DRAFTS=1）中出现，不参与排序与推荐。 */
export const pendingBrands = site.previewDrafts ? allBrands.filter((airport) => airport.listing !== 'public') : [];

export const featuredIds: string[] = registry.featuredProviderIds.filter((id) => brandById(id)?.featuredEligible !== false);

/** 资料候选（套餐截图中未见、只在详情页列出）不算进价格记录。 */
export const isCandidateQuote = (quote: Quote) => quote.priceStatus === 'md-unseen-in-screenshots';
export const listedQuotes = (airport: Airport) => airport.packages.filter((quote) => !isCandidateQuote(quote));

export const allQuotes = airports.flatMap(listedQuotes);
export const comparableQuoteCount = allQuotes.filter((q) => q.eligibleForReferenceComparison).length;
export const conflictQuoteCount = allQuotes.filter((q) => q.priceStatus === 'conflicting-or-pending' || q.priceStatus === 'md-doubtful').length;
export const customQuoteCount = allQuotes.filter((q) => q.priceStatus === 'custom-contact-required').length;
export const candidateQuoteCount = airports.flatMap((airport) => airport.packages).filter(isCandidateQuote).length;

/** 第三方参考资料的日期，以及资料整理日期。套餐截图的拍摄时间未知，不算进这些日期。 */
export const sourceDate = airports.find((airport) => airport.sourceUpdatedOn)?.sourceUpdatedOn ?? batch.collectedOn;
export const batchDate: string = batch.collectedOn;
export const materialsDate = [batchDate, ...airports.map((airport) => airport.referenceReviewedOn)].sort().at(-1)!;

export const usesPricingScreenshots = (airport: Airport) => Boolean(airport.primaryPricingSourceId);
export const screenshotBrandCount = airports.filter(usesPricingScreenshots).length;
export const ownerVersionBrandCount = airports.filter((airport) => airport.pricingPriority === 'owner-version').length;
export const referenceBrandCount = airports.length - screenshotBrandCount - ownerVersionBrandCount;

/**
 * Logo 展示图（scripts/build-logos.mjs 生成）：按资料里的裁切区域裁好这一家，card 给卡片用，large 给主推区和资料页用。
 * 找不到时返回 null，BrandLogo 仍按原图加裁切显示。
 */
export interface LogoDisplayImage { src: string; width: number; height: number }
export const logoDisplayOf = (id: string, variant: 'card' | 'large'): LogoDisplayImage | null =>
  (logoDisplay as Record<string, Record<'card' | 'large', LogoDisplayImage>>)[id]?.[variant] ?? null;

/** 站长决定不在站上公开套餐截图的品牌（src/data/hidden-pricing-images.json）：价格仍按截图整理，资料页不显示截图。 */
const hiddenPricingImageIds = new Set((hiddenPricingImages as { id: string }[]).map((item) => item.id));
export const pricingScreenshotsHidden = (id: string) => hiddenPricingImageIds.has(id);
export const pricingImagesOf = (id: string) => (pricingScreenshotsHidden(id) ? [] : ((pricingImages as Record<string, PricingImage[]>)[id] ?? []));
// 含不公开的截图：“几家的价格以几张截图为准”说的是价格依据，不是页面上能看到几张。
export const pricingImageCount = Object.values(pricingImages as Record<string, PricingImage[]>).flat().length;

export const formatYuan = (amount: number) => `¥${Number.isInteger(amount) ? amount : amount.toFixed(2).replace(/0$/, '')}`;

const BILLING_LABEL: Record<BillingPeriod, string> = {
  month: '月付',
  quarter: '季付',
  half_year: '半年付',
  year: '年付',
  two_year: '两年付',
  three_year: '三年付',
  one_time: '一次性',
  day: '日付',
  week: '周付',
};
export const billingLabel = (quote: Quote) => (quote.billingPeriod ? BILLING_LABEL[quote.billingPeriod] : '周期未写明');

const PLAN_TYPE_LABEL: Record<PlanType, string> = {
  periodic: '周期套餐',
  'annual-small': '年付，每月发放流量',
  'one-time': '一次性总流量',
  custom: '私人定制',
  'short-term': '短期套餐',
  trial: '试用档',
  addon: '加购包',
};
export const planTypeLabel = (quote: Quote) => PLAN_TYPE_LABEL[quote.planType] ?? '套餐';

/** 流量额度和发放周期分开：季付、年付的每月额度仍然是每月，不是整段时间的总量。 */
export const trafficAmount = (quote: Quote) => {
  if (quote.trafficGB === null) return quote.displayedTrafficText ? `页面显示 ${quote.displayedTrafficText}，实际额度未知` : '资料未写明';
  return `${quote.trafficGB}GB`;
};
export const trafficCycle = (quote: Quote) => {
  if (quote.trafficPeriod === 'month') return quote.trafficCycleNote ? `每月（${quote.trafficCycleNote}）` : '每月';
  if (quote.trafficPeriod === 'total') return quote.validityText ? `一次性总量（${quote.validityText}）` : '一次性总量';
  return '未明确';
};
export const trafficLabel = (quote: Quote) => {
  if (quote.trafficGB === null) return '额度待核实';
  return quote.trafficPeriod === 'month' ? `每月 ${quote.trafficGB}GB` : quote.trafficPeriod === 'total' ? `总量 ${quote.trafficGB}GB` : `${quote.trafficGB}GB（周期未明确）`;
};

/** 折合月均只是算术参考，展示时必须同时写明一次付款金额。 */
export const monthlyEquivalent = (quote: Quote) =>
  quote.billingMonths && quote.billingMonths > 1 ? quote.amount / quote.billingMonths : null;

const BLOCKING_STATUS = new Set(['conflicting-or-pending', 'md-doubtful']);
const lowest = (airport: Airport, period: BillingPeriod) => {
  const best = airport.packages
    .filter((q) => q.billingPeriod === period && q.eligibleForReferenceComparison)
    .sort((a, b) => a.amount - b.amount)[0] ?? null;
  // 更便宜的档位只是因为来源冲突或标价存疑被排除时，剩下的“最低价”会误导，宁可不显示。
  if (best && airport.packages.some((q) => q.billingPeriod === period && BLOCKING_STATUS.has(q.priceStatus) && q.amount < best.amount)) return null;
  return best;
};

/** 可比较报价中的最低月付；冲突、存疑、待核实和定制报价不参与，比它们更贵的也不冒充最低价。 */
export const lowestMonthly = (airport: Airport) => lowest(airport, 'month');
export const lowestYearly = (airport: Airport) => lowest(airport, 'year');

/** 限时、体验或试用档和常规套餐条件不同，用作主价格时必须标明。 */
export const limitedQuoteCondition = (airport: Airport, quote: Quote | null) => {
  if (!quote) return null;
  const head = airport.sourceHeadlineMonthly;
  const limited = (head?.limitedOffer && head.planName === quote.name) || /限时|体验|试用/.test(quote.name);
  if (!limited) return null;
  return `${quote.name}：限时或体验档，条件与常规套餐不同${quote.couponEligible === false ? '，不可用优惠码' : ''}`;
};

/** 站长确认的活动规则文案。只说明规则，不据此计算到手价。 */
export const couponTerms = (coupon: Coupon) => {
  if (!coupon.discountLabel) return null;
  const parts = [`享${coupon.discountLabel}`];
  if (coupon.usageLimit?.scope === 'per-user' && coupon.usageLimit.maxRedemptions === 1) parts.push('每位用户限用一次');
  if (coupon.excludedPlanTypes?.includes('one-time-traffic-package')) parts.push('一次性流量包不参与');
  return parts.join('，');
};

/** 只有资料记录、站长尚未确认规则的优惠码（新收录品牌）。 */
export const isRecordedOnlyCoupon = (coupon: Coupon | null) => coupon?.status === 'md-recorded-unverified';
export const recordedCouponNote = (coupon: Coupon) =>
  `资料记录的优惠码，结算时确认${coupon.mdDiscountText ? `（资料记为 ${coupon.mdDiscountText}）` : ''}`;

export const couponExcludesQuote = (coupon: Coupon | null, quote: Quote) =>
  quote.billingPeriod === 'one_time' && Boolean(coupon?.excludedPlanTypes?.includes('one-time-traffic-package'));

/** 单条报价和优惠码的关系；未明确的不写，不等于可用。 */
export const quoteCouponNote = (coupon: Coupon | null, quote: Quote) => {
  if (couponExcludesQuote(coupon, quote)) return '不参与优惠码';
  if (quote.couponEligible === false) return '标注不可用优惠码';
  return null;
};

/** 除一次性流量包外，还被单独标注不可用优惠码的套餐。 */
export const couponExceptionNames = (airport: Airport) => [
  ...new Set(listedQuotes(airport)
    .filter((quote) => quote.couponEligible === false && quote.billingPeriod !== 'one_time')
    .map((quote) => quote.name)),
];

export const quoteStatusLabel = (quote: Quote) => {
  switch (quote.priceStatus) {
    case 'conflicting-or-pending': return '冲突／待核实';
    case 'custom-contact-required': return '定制，需联系客服';
    case 'user-screenshot-listed-unverified': return '套餐截图，未核验结算';
    case 'owner-provided-unverified': return '站长资料，未核验结算';
    case 'md-listed-unverified': return '资料批次列示，未核验官网';
    case 'md-doubtful': return '资料标价存疑';
    case 'md-unseen-in-screenshots': return '资料候选，截图中未见';
    case 'md-demo-unverified': return '示例价格，未确认';
    default: return '参考资料，未核验官网';
  }
};

const PLAN_ORDER: PlanType[] = ['periodic', 'trial', 'annual-small', 'short-term', 'one-time', 'addon', 'custom'];
/** 详情页套餐表：按套餐类型、方案首次出现的位置、付款月数排列；资料候选排在同类最后。 */
export const sortedQuotes = (quotes: Quote[]) => {
  const firstSeen = new Map<string, number>();
  quotes.forEach((quote, index) => {
    const key = quote.md?.mdName ?? quote.name;
    if (!firstSeen.has(key)) firstSeen.set(key, index);
  });
  const months = (quote: Quote) => quote.billingMonths ?? (quote.billingPeriod === 'day' ? 0.03 : quote.billingPeriod === 'week' ? 0.25 : 99);
  return quotes.slice().sort((a, b) =>
    PLAN_ORDER.indexOf(a.planType) - PLAN_ORDER.indexOf(b.planType) ||
    Number(isCandidateQuote(a)) - Number(isCandidateQuote(b)) ||
    (firstSeen.get(a.md?.mdName ?? a.name) ?? 0) - (firstSeen.get(b.md?.mdName ?? b.name) ?? 0) ||
    months(a) - months(b),
  );
};

/** 详情页“来源差异与待确认事项”：资料包原有的差异换成读者用语，资料批次的说明原样列出。 */
export const publicConflicts = (airport: Airport) => [
  ...(airport.sourceConflicts ?? []).map(readerText),
  ...(airport.fieldConflicts ?? []).filter((item) => item.public).map((item) => item.text),
  ...(airport.reviewNotes ?? []).filter((item) => item.public).map((item) => item.text),
].filter((text, index, list) => list.indexOf(text) === index);

export const hasSourceConflict = (airport: Airport) =>
  (airport.sourceConflicts?.length ?? 0) > 0 ||
  (airport.fieldConflicts ?? []).some((item) => item.public) ||
  (airport.reviewNotes ?? []).some((item) => item.public);

/** 站长核实：线路已核实 / 价格已由站长核对（2026-11-07 起，规则文件 ownerVerified）。不是独立核验，也不是官网核验。 */
export const ownerVerifiedLines = (airport: Airport) => airport.ownerVerified?.lines === true;
export const ownerVerifiedPricing = (airport: Airport) => airport.ownerVerified?.pricing === true;
const ownerVerifiedAll = (airport: Airport) => ownerVerifiedLines(airport) && ownerVerifiedPricing(airport);

export const statusLabel = (airport: Airport) => {
  // 运营状态互相矛盾或疑似演示站的品牌，有价格也不能当作可正常购买。
  if (airport.operatingStatus?.status === 'contradictory') return '运营状态待核';
  if (airport.operatingStatus?.status === 'static-demo-suspected') return '疑似演示站，待核';
  if (airport.isNew) return '新收录，待核验';
  if (ownerVerifiedAll(airport)) return '站长已核实';
  return hasSourceConflict(airport) ? '有来源差异' : '官网待核验';
};
export const needsAttention = (airport: Airport) =>
  (hasSourceConflict(airport) && !ownerVerifiedAll(airport)) || airport.isNew || ['contradictory', 'static-demo-suspected'].includes(airport.operatingStatus?.status);

/** 卡片底部的资料说明。 */
export const pricingSourceLabel = (airport: Airport) => {
  if (usesPricingScreenshots(airport)) return `套餐截图 ${airport.pricingEvidenceReceivedOn} 收到`;
  if (airport.pricingPriority === 'owner-version') return `站长资料 ${batchDate}`;
  if (airport.pricingPriority === 'md-batch') return `资料批次 ${batchDate}`;
  return `参考资料 ${airport.sourceUpdatedOn}、资料批次 ${batchDate}`;
};

export const nodeCount = (airport: Airport) => airport.nodeCountDisplay?.replace(/（.*$/, '') ?? null;

/** 所有地区，出现次数多的在前。地区只是参考资料列示，不代表当前在线节点。 */
export const allRegions = (() => {
  const counts = new Map<string, number>();
  for (const airport of airports) {
    for (const region of airport.regions ?? []) counts.set(region, (counts.get(region) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([region]) => region);
})();

/** 资料包里的整理用语换成读者能看懂的说法。只影响显示，不改动导入的数据。 */
export const readerText = (text: string) =>
  text
    .replace(/参考站|参考页/g, '参考资料')
    .replace(/站长节点清单/g, '节点清单')
    .replace(/站长原提供的/g, '本站收录的')
    .replace(/站长新提供的/g, '站长提供的')
    .replace(/另份汇编/g, '另一份资料')
    .replace(/本轮/g, '本次')
    .replace(/页面/g, '来源');

/** 资料方写的“34 家中第几”等横向排名不是本站评分，展示时去掉。 */
export const withoutRankings = (text: string | null | undefined) =>
  (text ?? '')
    .replace(/[（(][^）)]*\d+\s*家中[^）)]*[）)]/g, '')
    .replace(/[，,；]?\s*在?\s*\d+\s*家中[^，,。；]*/g, '')
    .replace(/[^，,。；]*低于\s*\d+\s*家中位数[，,]?/g, '')
    .replace(/^[，,；\s]+|[，,；\s]+$/g, '')
    .trim() || null;

/** 表格上方已经统一说明的套话不再逐行重复，只保留每条报价自己的说明。 */
export const quoteNote = (quote: Quote) => {
  const note = quote.sourceNote;
  if (!note || /按用户套餐截图可见金额|参考页表列标价|页面月付标价|参考站标价|参考站列价|页面列示的月付价格/.test(note)) return null;
  return readerText(note);
};

const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = {
  paused: '暂停提供',
  'not-recommended': '不推荐第三方客户端',
  'not-supported': '明确不支持',
  unconfirmed: '暂未确认',
  stated: '有说明',
};
export const clientStatusLabel = (status: ClientStatus | undefined) => CLIENT_STATUS_LABEL[status ?? 'unconfirmed'];

/** 卡片上的一句客户端提示：只在资料写明暂停或不支持第三方订阅时出现。 */
export const clientCardNote = (airport: Airport) => {
  const status = airport.client?.subscription.status;
  if (status === 'paused') return '资料称暂停第三方订阅链接（出处未确认，恢复时间未知），需用官方客户端';
  if (status === 'not-supported') return '资料记录：不提供第三方订阅，需用官方客户端';
  return null;
};

export const searchTerms = (airport: Airport) => [airport.name, ...airport.aliases];

/** 已达到发布门槛的详情页。草稿只在本地审稿版本（PREVIEW_DRAFTS=1）中生成。 */
export async function getPublishedEditorials() {
  const entries = await getCollection('airports');
  return entries.filter((entry) => {
    const brand = brandById(entry.id);
    if (!brand) return false;
    // 待核验品牌的详情页只在本地审稿版本生成，正式构建不会因为误改 draft 而公开。
    if (brand.listing !== 'public') return site.previewDrafts;
    return !entry.data.draft || site.previewDrafts;
  });
}

export async function getPublishedDetailIds() {
  return new Set((await getPublishedEditorials()).map((entry) => entry.id));
}

export async function getPublishedGuides() {
  const entries = await getCollection('guides');
  return entries
    .filter((entry) => !entry.data.draft || site.previewDrafts)
    .sort((a, b) => (b.data.publishedAt?.getTime() ?? 0) - (a.data.publishedAt?.getTime() ?? 0));
}
