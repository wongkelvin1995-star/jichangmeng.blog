#!/usr/bin/env node
/**
 * 导入「机场MD」资料批次：npm run import:md [-- <源目录>] [--snapshot]
 *
 * 源目录只读；不传目录时依次使用 rules.batch.defaultSourceDir、materials/ 下的快照。
 * 输出：
 *   src/data/brands.json                 站点读取的品牌数据层（现有 29 家 + 新收录品牌）
 *   reports/md-import-<批次>.md / .json   内部导入报告（不在 public/，不进 sitemap）
 *   src/content/airports/<新品牌>.md      新品牌的草稿占位（已有文件不改）
 * --snapshot 把 38 份原始 MD 复制到 rules.batch.snapshotDir，供以后重复导入。
 *
 * 基础层仍是 src/data/airports.json（npm run import:package 生成），本脚本只读它。
 * 合并规则写在 src/data/brand-md-rules.json；同一品牌按稳定 ID 更新，重复运行结果相同；
 * 不在本批资料中的既有品牌原样保留。
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBrandMd, textValue } from './lib/parse-brand-md.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readText = (path) => readFileSync(path, 'utf8');
const sha256 = (content) => createHash('sha256').update(content).digest('hex');
const rulesText = readText(join(ROOT, 'src/data/brand-md-rules.json'));
const rules = JSON.parse(rulesText);
const baseText = readText(join(ROOT, 'src/data/airports.json'));
const base = JSON.parse(baseText);
const baseById = new Map(base.map((airport) => [airport.id, airport]));
const batch = rules.batch;

const args = process.argv.slice(2);
const takeSnapshot = args.includes('--snapshot');
const explicitDir = args.find((arg) => !arg.startsWith('--'));
const snapshotDir = join(ROOT, batch.snapshotDir);
// defaultSourceDir 用 ~ 表示用户主目录（2026-11-06：仓库公开，不写本机用户名）。
const defaultSourceDir = batch.defaultSourceDir?.startsWith('~') ? join(homedir(), batch.defaultSourceDir.slice(1)) : batch.defaultSourceDir;
const sourceDir = explicitDir
  ? resolve(explicitDir)
  : defaultSourceDir && existsSync(defaultSourceDir)
    ? defaultSourceDir
    : snapshotDir;

const failures = [];
const fail = (message) => failures.push(message);

// ---------- 1. 文件清点 ----------
if (!existsSync(sourceDir)) {
  console.error(`找不到资料目录：${sourceDir}`);
  process.exit(1);
}
const mdFiles = readdirSync(sourceDir).filter((name) => name.toLowerCase().endsWith('.md')).sort();
if (mdFiles.length !== batch.expectedFiles) fail(`应有 ${batch.expectedFiles} 份 MD，实际 ${mdFiles.length} 份`);
for (const name of Object.keys(batch.auxiliaryFiles)) if (!mdFiles.includes(name)) fail(`缺少辅助文件 ${name}`);
const brandFiles = mdFiles.filter((name) => /^\d\d_/.test(name) && !name.startsWith('00_'));
if (brandFiles.length !== batch.expectedBrandFiles) fail(`应有 ${batch.expectedBrandFiles} 份品牌 MD，实际 ${brandFiles.length} 份`);
const unexpected = mdFiles.filter((name) => !brandFiles.includes(name) && !(name in batch.auxiliaryFiles));
if (unexpected.length) fail(`有未登记的文件：${unexpected.join('、')}`);

const fileRecords = mdFiles.map((name) => {
  const buffer = readFileSync(join(sourceDir, name));
  return {
    file: name,
    bytes: buffer.length,
    sha256: sha256(buffer),
    role: batch.auxiliaryFiles[name] ?? '品牌资料',
  };
});

// ---------- 2. 总目录 ----------
const toc = new Map();
for (const line of readText(join(sourceDir, '00_总目录.md')).split(/\r?\n/)) {
  const cells = line.split('|').map((cell) => cell.trim());
  if (cells.length >= 7 && /^\d\d$/.test(cells[1])) {
    toc.set(cells[1], { no: cells[1], name: cells[2], englishName: cells[3], url: cells[4], file: cells[5] });
  }
}
if (toc.size !== batch.expectedBrandFiles) fail(`总目录应有 ${batch.expectedBrandFiles} 行，实际 ${toc.size} 行`);

// ---------- 工具 ----------
const PERIOD_MONTHS = { month: 1, quarter: 3, half_year: 6, year: 12, two_year: 24, three_year: 36 };
const PERIOD_LABEL = { month: '月付', quarter: '季付', half_year: '半年付', year: '年付', two_year: '两年付', three_year: '三年付', one_time: '一次性', day: '日付', week: '周付' };
const yuan = (amount) => `¥${Number.isInteger(amount) ? amount : String(Number(amount.toFixed(2)))}`;
const quoteText = (q) => `${yuan(q.amount)}${q.trafficGB !== null && q.trafficGB !== undefined ? ` / ${q.trafficGB}GB` : ''}`;
const kvOf = (doc, section) => doc.sections[section]?.kv ?? {};
const textOf = (doc, section, key) => textValue(kvOf(doc, section)[key]);
const listOf = (value) => (value === undefined || value === null ? [] : [].concat(value).map((item) => String(item).trim()).filter(Boolean));
const hashId = (...parts) => sha256(parts.join('|')).slice(0, 10);

function checkUrl(url) {
  if (!url) return '空';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return '不是 https';
    if (url !== url.trim()) return '前后有空白';
    return null;
  } catch {
    return '无法解析';
  }
}

const inviteCodeOf = (url) => url?.match(/[?&]code=([^&#\s]+)/)?.[1] ?? null;

const parseNodeTotal = (text) => {
  const match = String(text ?? '').match(/(\d+)\s*(\+)?\s*个?\s*节点/) ?? String(text ?? '').match(/^\s*(\d+)\s*(\+)?/);
  return match ? { value: Number(match[1]), plus: Boolean(match[2]) } : null;
};
const nodesCompatible = (a, b) => {
  if (!a || !b) return true;
  if (a.plus && b.plus) return true;
  if (a.plus) return b.value >= a.value;
  if (b.plus) return a.value >= b.value;
  return a.value === b.value;
};

const LINE_TOKENS = ['IPLC', 'IEPL', 'BGP', '中转', '直连', '隧道'];
const lineTokens = (text) => LINE_TOKENS.filter((token) => String(text ?? '').includes(token));

/** 节点地区文字 → 地区名。只取“共 N 个”之前列出的名字，去掉“等”“另有……”。 */
function regionsFrom(text) {
  if (!text) return [];
  const head = text.split(/，\s*(?:共|另有)/)[0];
  return head
    .split('、')
    .map((part) => part.replace(/等$/, '').trim())
    .filter((part) => part && part.length <= 6 && !/\d/.test(part));
}

function classifyClient(text) {
  if (!text) return 'unconfirmed';
  if (/暂停|暂不/.test(text)) return 'paused';
  if (/不推荐/.test(text)) return 'not-recommended';
  if (/不提供|不支持|不对外发放|不开放|只能使用/.test(text)) return 'not-supported';
  if (/待确认|未确认|以官网说明为准/.test(text)) return 'unconfirmed';
  return 'stated';
}

function discountNumber(text) {
  const match = String(text ?? '').match(/(\d+(?:\.\d+)?)\s*折/);
  if (!match) return null;
  const value = Number(match[1]);
  return value >= 10 ? value / 10 : value;
}

function brandTokens(rb, existing) {
  const tokens = new Set([rb.name, rb.mdName, existing?.name, ...(existing?.aliases ?? [])].filter(Boolean));
  const short = rb.name.replace(/(云|网络|加速)$/, '');
  if (short.length >= 2) tokens.add(short);
  return [...tokens].sort((a, b) => b.length - a.length);
}

function makeNormalizer(tokens) {
  const escaped = tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, ''));
  const prefix = escaped.length ? new RegExp(`^(?:${escaped.join('|')})[·\\-]?`, 'i') : null;
  return (name) => {
    let text = String(name).replace(/（[^）]*）|\([^)]*\)/g, '').replace(/\s+/g, '');
    if (prefix) text = text.replace(prefix, '');
    return text.replace(/[·\-_]/g, '').replace(/月付|季付|半年付|年付/g, '').toLowerCase();
  };
}

function planTypeOfBase(quote) {
  if (quote.priceStatus === 'custom-contact-required' || /定制/.test(quote.name)) return 'custom';
  if (quote.billingPeriod === 'one_time') return 'one-time';
  if (/试用|体验/.test(quote.name) && quote.billingPeriod === 'month') return 'trial';
  if (quote.billingPeriod === 'year' && /小包|轻量|保活|学生|高校|贴心|年付版|年付Small|年付Big|限时年付|年付特惠|年付标准/.test(quote.name)) return 'annual-small';
  return 'periodic';
}

const PLAN_TYPE_OF_KIND = { periodic: 'periodic', 'annual-small': 'annual-small', 'one-time': 'one-time', custom: 'custom', 'short-term': 'short-term', addon: 'addon' };

// ---------- 3. 逐品牌处理 ----------
const seenIds = new Set();
const seenNos = new Set();
const brands = [];
const report = [];

for (const rb of rules.brands) {
  if (seenIds.has(rb.id)) fail(`品牌 ID 重复：${rb.id}`);
  if (seenNos.has(rb.no)) fail(`编号重复：${rb.no}`);
  seenIds.add(rb.id);
  seenNos.add(rb.no);

  const entry = toc.get(rb.no);
  const file = brandFiles.find((name) => name.startsWith(`${rb.no}_`));
  if (!entry) { fail(`${rb.no} ${rb.name}：总目录没有这一行`); continue; }
  if (!file) { fail(`${rb.no} ${rb.name}：找不到品牌 MD`); continue; }
  if (entry.file !== file) fail(`${rb.no}：总目录写的文件是 ${entry.file}，实际是 ${file}`);
  if (entry.name !== rb.name) fail(`${rb.no}：总目录品牌名 ${entry.name} 与规则 ${rb.name} 不符`);

  const doc = parseBrandMd(readText(join(sourceDir, file)));
  const mdName = textOf(doc, '基本信息', '中文名');
  if (mdName !== (rb.mdName ?? rb.name)) fail(`${rb.no}：品牌 MD 中文名 ${mdName} 与规则 ${rb.mdName ?? rb.name} 不符`);
  if (doc.unparsed.length) fail(`${rb.no} ${rb.name}：有无法识别的行 ${doc.unparsed.join(' / ')}`);

  const existing = baseById.get(rb.id) ?? null;
  if (rb.new && existing) fail(`${rb.id} 标为新品牌，但基础层已有同 ID`);
  if (!rb.new && !existing) fail(`${rb.id} 不是新品牌，但基础层找不到`);
  const screenshotPricing = Boolean(existing?.primaryPricingSourceId);
  const ownerVersion = rb.priority === 'owner-version';
  const conflicts = [];
  const addConflict = (field, adopted, candidate, text, isPublic) => conflicts.push({ field, adopted, candidate, text, public: isPublic, status: 'unresolved' });

  // 推广链接：总目录、品牌 MD、现站三方核对，不静默选择。
  const mdUrl = textOf(doc, '基本信息', '推广链接');
  const link = { toc: entry.url, md: mdUrl, site: existing?.affiliateUrl ?? null, tocMatchesMd: mdUrl ? entry.url === mdUrl : null, problems: [] };
  let affiliateUrl = existing?.affiliateUrl ?? null;
  if (existing) {
    if (entry.url !== affiliateUrl) link.problems.push(`总目录为 ${entry.url}，与现站不同`);
    if (mdUrl && mdUrl !== affiliateUrl) link.problems.push(`品牌 MD 为 ${mdUrl}，与现站不同`);
    if (!mdUrl) link.problems.push('品牌 MD 未填推广链接');
    if (mdUrl && entry.url !== mdUrl) link.problems.push('总目录与品牌 MD 不一致');
    if (link.problems.length) addConflict('affiliateUrl', affiliateUrl, mdUrl ?? entry.url, `推广链接：${link.problems.join('；')}。现站链接保留，待站长确认。`, false);
  } else if (mdUrl && entry.url === mdUrl) {
    affiliateUrl = entry.url;
  } else {
    affiliateUrl = null;
    link.problems.push(mdUrl ? '总目录与品牌 MD 不一致，未采用任何一个' : '品牌 MD 未填推广链接');
    addConflict('affiliateUrl', null, entry.url, `推广链接：${link.problems.join('；')}。`, false);
  }
  for (const [label, url] of [['总目录', entry.url], ['品牌 MD', mdUrl], ['采用', affiliateUrl]]) {
    const problem = url ? checkUrl(url) : null;
    if (problem) fail(`${rb.no} ${rb.name}：${label}推广链接${problem}：${url}`);
  }
  link.adopted = affiliateUrl;
  link.status = link.problems.length ? 'conflict-recorded' : 'match';

  // 英文名：总目录与品牌 MD 一致才采用；站长版本按站长写法。不自行翻译。
  const tocEnglish = entry.englishName && entry.englishName !== '待确认' ? entry.englishName : null;
  const mdEnglish = textOf(doc, '基本信息', '英文名');
  let englishName = null;
  let englishNameStatus = 'unknown';
  const englishNameCandidates = [];
  if (ownerVersion && mdEnglish) {
    englishName = mdEnglish;
    englishNameStatus = 'owner-version';
    if (tocEnglish && tocEnglish !== mdEnglish) englishNameCandidates.push(tocEnglish);
  } else if (tocEnglish && mdEnglish && tocEnglish === mdEnglish) {
    englishName = tocEnglish;
    englishNameStatus = 'toc-and-md-agree';
  } else if (tocEnglish && !mdEnglish) {
    englishName = tocEnglish;
    englishNameStatus = 'toc-only';
  } else {
    for (const value of [tocEnglish, mdEnglish]) if (value && !englishNameCandidates.includes(value)) englishNameCandidates.push(value);
    if (englishNameCandidates.length) {
      englishNameStatus = 'candidate-unconfirmed';
      addConflict('englishName', null, englishNameCandidates.join(' / '), `英文名：资料写作 ${englishNameCandidates.join(' / ')}，总目录标“待确认”，暂不采用。`, false);
    }
  }

  const aliasSet = new Set(existing?.aliases ?? []);
  for (const alias of listOf(textOf(doc, '基本信息', '别名')).flatMap((value) => value.split(/[、,，]/))) if (alias.trim()) aliasSet.add(alias.trim());
  if (englishName && ![...aliasSet].some((alias) => alias.toLowerCase() === englishName.toLowerCase())) aliasSet.add(englishName);
  const aliases = [...aliasSet].filter((alias) => alias !== (existing?.name ?? rb.name));

  // 线路与节点
  const network = doc.sections['线路与节点'] ?? { kv: {}, raw: [] };
  const regionsText = textOf(doc, '线路与节点', '节点地区');
  const countsText = textOf(doc, '线路与节点', '各地区节点数');
  const regionCounts = countsText
    ? countsText.split(/[、，,]/).map((part) => part.trim().match(/^(.+?)\s*(\d+)$/)).filter(Boolean).map((m) => ({ region: m[1], count: Number(m[2]) }))
    : [];
  const perRegionLines = network.raw
    .map((line) => line.match(/^(\S{1,6})：(.+?)\s*x\s*(\d+)\s*节点/))
    .filter(Boolean)
    .map((m) => ({ region: m[1], line: m[2].trim(), count: Number(m[3]) }));
  const knownNetworkKeys = new Set(['节点地区', '各地区节点数', '线路类型', '倍率', '各地区线路类型']);
  const networkNotes = network.raw.filter((line) => {
    const key = line.match(/^([^：:]{1,24})[：:]/)?.[1]?.trim();
    if (key && knownNetworkKeys.has(key)) return false;
    if (/^(\S{1,6})：(.+?)\s*x\s*\d+\s*节点/.test(line)) return false;
    return true;
  });
  const mdNodeTotal = parseNodeTotal(regionsText);
  const counts = regionCounts.length ? regionCounts : perRegionLines;
  const countSum = counts.reduce((sum, item) => sum + item.count, 0);
  const mdRegions = regionsFrom(regionsText);
  const doubts = [];
  if (counts.length && mdNodeTotal) {
    const coversAll = mdRegions.length > 0 && mdRegions.every((region) => counts.some((item) => item.region === region)) && !/等/.test(regionsText);
    const mismatch = mdNodeTotal.plus ? countSum < mdNodeTotal.value && coversAll : countSum > mdNodeTotal.value || (coversAll && countSum !== mdNodeTotal.value);
    if (mismatch) {
      const text = `节点数疑点：资料写共 ${mdNodeTotal.value}${mdNodeTotal.plus ? '+' : ''} 个节点，但列出的分区数量相加为 ${countSum}（${counts.map((item) => `${item.region} ${item.count}`).join('、')}）。保留资料原写的总数，不改成相加结果。`;
      doubts.push(text);
      addConflict('nodeCount', `${mdNodeTotal.value}${mdNodeTotal.plus ? '+' : ''}`, String(countSum), text, true);
    }
  }
  let nodeCountDisplay = existing?.nodeCountDisplay ?? null;
  const baseNodes = parseNodeTotal(existing?.nodeCountDisplay);
  if (existing && mdNodeTotal) {
    if (ownerVersion) {
      if (!baseNodes || baseNodes.value !== mdNodeTotal.value || baseNodes.plus !== mdNodeTotal.plus) {
        nodeCountDisplay = `${mdNodeTotal.value}${mdNodeTotal.plus ? '+' : ''}（站长资料）`;
      }
    } else if (!nodesCompatible(baseNodes, mdNodeTotal)) {
      addConflict('nodeCount', existing.nodeCountDisplay, `${mdNodeTotal.value}${mdNodeTotal.plus ? '+' : ''}`, `节点数：现有资料为 ${existing.nodeCountDisplay.replace(/（.*$/, '')}，本批资料为 ${mdNodeTotal.value}${mdNodeTotal.plus ? '+' : ''}，未确认。`, true);
    }
  } else if (!existing && mdNodeTotal) {
    nodeCountDisplay = `${mdNodeTotal.value}${mdNodeTotal.plus ? '+' : ''}`;
  }

  const lineText = textOf(doc, '线路与节点', '线路类型') ?? (perRegionLines.length ? perRegionLines.map((item) => `${item.region} ${item.line}`).join('；') : null);

  // 套餐
  const mdQuotes = [];
  doc.plans.forEach((plan, planIndex) => {
    const groupNote = plan.group?.match(/（([^）]*)）/)?.[1] ?? null;
    for (const q of plan.quotes) {
      const kindType = PLAN_TYPE_OF_KIND[plan.kind] ?? 'periodic';
      const planType = kindType === 'periodic' && /试用/.test(plan.name) ? 'trial' : kindType;
      const isTotal = q.period === 'one_time' || plan.kind === 'one-time';
      const trafficGB = plan.traffic?.gb ?? null;
      const trafficPeriod = trafficGB === null ? null : isTotal ? 'total' : plan.traffic.perMonth ? 'month' : null;
      const cycleNotes = plan.notes.filter((note) => /每\s*30\s*天|刷新|自动重置/.test(note));
      const otherNotes = plan.notes.filter((note) => !cycleNotes.includes(note) && !/¥/.test(note));
      mdQuotes.push({
        planIndex,
        name: plan.name,
        group: plan.group,
        planType,
        billingPeriod: q.period,
        billingMonths: PERIOD_MONTHS[q.period] ?? null,
        amount: q.amount,
        trafficGB,
        trafficPeriod,
        fromNote: q.from === 'note',
        validityText: planType === 'one-time' ? groupNote : null,
        trafficCycleNote: cycleNotes.join('；') || null,
        nameNotes: otherNotes.join('；') || null,
        couponEligible: plan.notes.some((note) => /不参加优惠/.test(note)) ? false : null,
        resetOption: plan.extras.find((extra) => extra.kind === 'reset') ?? null,
        raw: `${plan.name}：${plan.body}`,
      });
    }
  });

  const normalize = makeNormalizer(brandTokens(rb, existing));
  const baseQuotes = existing?.packages ?? [];
  const usedBase = new Set();
  const matchOf = new Map();
  const similarity = (a, b) => {
    const na = normalize(a);
    const nb = normalize(b);
    if (!na || !nb) return 0;
    if (na === nb) return 2;
    return Math.min(na.length, nb.length) >= 2 && (na.includes(nb) || nb.includes(na)) ? 1 : 0;
  };
  // 第一轮：周期、金额、流量都相同 → 同一条报价
  mdQuotes.forEach((m, index) => {
    const candidates = baseQuotes
      .map((b, i) => ({ b, i }))
      .filter(({ b, i }) => !usedBase.has(i) && b.billingPeriod === m.billingPeriod && b.amount === m.amount && (b.trafficGB ?? null) === m.trafficGB)
      .sort((x, y) => similarity(y.b.name, m.name) - similarity(x.b.name, m.name));
    if (candidates.length) {
      usedBase.add(candidates[0].i);
      matchOf.set(index, { kind: 'same', baseIndex: candidates[0].i });
    }
  });
  // 第二轮：同名同周期但数值不同 → 冲突；先完全同名，再包含关系
  for (const level of [2, 1]) {
    mdQuotes.forEach((m, index) => {
      if (matchOf.has(index)) return;
      const found = baseQuotes.findIndex((b, i) => !usedBase.has(i) && b.billingPeriod === m.billingPeriod && similarity(b.name, m.name) === level);
      if (found >= 0) {
        usedBase.add(found);
        matchOf.set(index, { kind: 'conflict', baseIndex: found });
      }
    });
  }

  const flagsByQuote = (rb.quoteFlags ?? []).map((flag) => ({ ...flag, used: false }));
  const curatedFlag = (m) => {
    const flag = flagsByQuote.find((item) => item.plan === m.name && item.period === m.billingPeriod);
    if (flag) flag.used = true;
    return flag?.text ?? null;
  };

  const merged = [];
  const quoteStats = { same: 0, conflict: 0, mdOnly: 0, absent: 0, addedEligible: 0, statusChanged: 0 };
  baseQuotes.forEach((b, i) => {
    const mdIndex = [...matchOf.entries()].find(([, value]) => value.baseIndex === i)?.[0];
    const m = mdIndex === undefined ? null : mdQuotes[mdIndex];
    const match = mdIndex === undefined ? 'absent' : matchOf.get(mdIndex).kind;
    const quote = { ...b, planType: planTypeOfBase(b), origin: 'package', flags: [], md: { match } };
    if (m && m.name !== b.name) quote.md.mdName = m.name;
    if (m?.trafficCycleNote) quote.trafficCycleNote = m.trafficCycleNote;
    if (m?.validityText) quote.validityText = m.validityText;
    if (m?.resetOption) quote.resetOption = m.resetOption;
    if (match === 'same') {
      quoteStats.same += 1;
      if (ownerVersion && quote.priceStatus === 'reference-listed-unverified') {
        quote.priceStatus = 'owner-provided-unverified';
        quote.md.ownerVersionConfirmed = true;
      }
    } else if (match === 'conflict') {
      quoteStats.conflict += 1;
      quote.md.candidate = { amount: m.amount, trafficGB: m.trafficGB, name: m.name };
      const candidateText = quoteText(m);
      if (screenshotPricing) {
        quote.flags.push(`本批资料记为 ${candidateText}，与套餐截图不同；按截图展示。`);
      } else if (ownerVersion) {
        quote.md.previous = { amount: b.amount, trafficGB: b.trafficGB };
        quote.amount = m.amount;
        quote.trafficGB = m.trafficGB;
        quote.priceStatus = 'owner-provided-unverified';
        quote.flags.push(`按站长版本更新，旧资料为 ${quoteText(b)}。`);
        quoteStats.statusChanged += 1;
      } else {
        quote.priceStatus = 'conflicting-or-pending';
        quote.eligibleForReferenceComparison = false;
        quote.flags.push(`本批资料记为 ${candidateText}，与现有资料 ${quoteText(b)} 不同，待核实；暂不参与价格比较。`);
        quoteStats.statusChanged += 1;
      }
      addConflict('price', `${b.name} ${PERIOD_LABEL[b.billingPeriod]} ${quoteText(b)}`, `${m.name} ${PERIOD_LABEL[m.billingPeriod]} ${candidateText}`, `${b.name}（${PERIOD_LABEL[b.billingPeriod]}）：现有资料 ${quoteText(b)}，本批资料 ${candidateText}。${screenshotPricing ? '按套餐截图展示。' : ownerVersion ? '按站长版本更新。' : '待核实。'}`, true);
    } else {
      quoteStats.absent += 1;
      quote.flags.push('本批资料未列出此方案。');
    }
    merged.push(quote);
  });

  mdQuotes.forEach((m, index) => {
    if (matchOf.has(index)) return;
    quoteStats.mdOnly += 1;
    const flag = curatedFlag(m);
    const flags = flag ? [flag] : [];
    let priceStatus = 'md-listed-unverified';
    let eligible = true;
    if (rb.operatingStatus?.status === 'static-demo-suspected') {
      priceStatus = 'md-demo-unverified';
      eligible = false;
    } else if (screenshotPricing) {
      priceStatus = 'md-unseen-in-screenshots';
      eligible = false;
      flags.push('本批资料另列，站长提供的套餐截图中未见；只作候选，不参与价格比较。');
    } else if (m.planType === 'custom') {
      priceStatus = 'custom-contact-required';
      eligible = false;
    } else if (ownerVersion) {
      priceStatus = 'owner-provided-unverified';
    }
    if (flag && priceStatus !== 'md-demo-unverified') {
      priceStatus = 'md-doubtful';
      eligible = false;
    }
    if (m.billingPeriod === null || m.billingPeriod === 'day' || m.billingPeriod === 'week' || m.trafficGB === null) eligible = false;
    if (m.billingPeriod === null) flags.push('资料未写明付款周期。');
    if (m.trafficGB === null && m.planType !== 'custom') flags.push('资料未写明流量额度。');
    if (m.fromNote) flags.push('价格写在同一方案的括号说明里。');
    if (eligible) quoteStats.addedEligible += 1;
    merged.push({
      id: `${rb.id}-md-${hashId(m.name, m.billingPeriod ?? 'unknown', m.amount)}`,
      name: m.name,
      amount: m.amount,
      currency: 'CNY',
      billingPeriod: m.billingPeriod,
      billingMonths: m.billingMonths,
      trafficGB: m.trafficGB,
      trafficPeriod: m.trafficPeriod,
      couponEligible: m.couponEligible,
      sourceNote: null,
      priceStatus,
      eligibleForReferenceComparison: eligible,
      officialPriceVerified: false,
      sourceId: batch.id,
      sourceUrl: null,
      sourceUpdatedOn: null,
      retrievedOn: batch.collectedOn,
      planType: m.planType,
      origin: 'md',
      flags,
      md: { match: 'md-only', raw: m.raw },
      ...(m.nameNotes ? { nameNotes: m.nameNotes } : {}),
      ...(m.validityText ? { validityText: m.validityText } : {}),
      ...(m.trafficCycleNote ? { trafficCycleNote: m.trafficCycleNote } : {}),
      ...(m.resetOption ? { resetOption: m.resetOption } : {}),
    });
  });
  for (const flag of flagsByQuote) if (!flag.used) fail(`${rb.no} ${rb.name}：规则里的报价疑点「${flag.plan} ${flag.period}」没有对应的资料报价`);

  // 只有年付、没有同名月付的原有方案，是“年付、每月发放流量”的小包。
  for (const quote of merged) {
    if (quote.origin !== 'package' || quote.planType !== 'periodic' || quote.billingPeriod !== 'year' || quote.trafficPeriod !== 'month') continue;
    const key = normalize(quote.name);
    if (!merged.some((other) => other.billingPeriod === 'month' && normalize(other.md?.mdName ?? other.name) === key)) quote.planType = 'annual-small';
  }

  // 自动检查：长周期总价高于按月付累计、年付高于两次半年付。
  // 本批新增的报价据此标为存疑；原有报价只加说明，不改变状态。已有人工疑点的报价不再重复标注。
  const curatedQuotes = new Set(merged.filter((quote) => quote.priceStatus === 'md-doubtful'));
  const byPlan = new Map();
  for (const quote of merged) {
    if (!['periodic', 'trial'].includes(quote.planType)) continue;
    const key = normalize(quote.md?.mdName ?? quote.name);
    if (!byPlan.has(key)) byPlan.set(key, []);
    byPlan.get(key).push(quote);
  }
  for (const group of byPlan.values()) {
    const monthly = group.find((quote) => quote.billingPeriod === 'month');
    const half = group.find((quote) => quote.billingPeriod === 'half_year');
    for (const quote of group) {
      if (curatedQuotes.has(quote)) continue;
      const notes = [];
      if (monthly && quote !== monthly && quote.billingMonths > 1 && quote.amount > monthly.amount * quote.billingMonths + 0.005) {
        notes.push(`${PERIOD_LABEL[quote.billingPeriod]}总价 ${yuan(quote.amount)} 高于月付 × ${quote.billingMonths}（${yuan(Number((monthly.amount * quote.billingMonths).toFixed(2)))}），疑似没有随月付调整。`);
      }
      if (half && quote.billingPeriod === 'year' && quote.amount > half.amount * 2 + 0.005) {
        notes.push(`年付 ${yuan(quote.amount)} 高于两次半年付（${yuan(Number((half.amount * 2).toFixed(2)))}）。`);
      }
      if (!notes.length) continue;
      quote.flags.push(...notes.map((note) => `${note}保留资料原标价，结算时确认。`));
      if (quote.origin === 'md' && quote.priceStatus !== 'md-demo-unverified' && quote.priceStatus !== 'md-unseen-in-screenshots') {
        if (quote.eligibleForReferenceComparison) quoteStats.addedEligible -= 1;
        quote.priceStatus = 'md-doubtful';
        quote.eligibleForReferenceComparison = false;
      }
      addConflict('price-anomaly', `${quote.name} ${PERIOD_LABEL[quote.billingPeriod]} ${yuan(quote.amount)}`, null, `${quote.name}：${notes.join('')}`, true);
    }
  }

  // 优惠码：站长确认的规则保留为主；本批资料另存，冲突逐项记录。
  const cp = kvOf(doc, '优惠码');
  const mdCode = textValue(cp['优惠码']);
  const mdCoupon = mdCode
    ? {
        code: mdCode,
        discountText: textValue(cp['折扣']),
        applicable: textValue(cp['适用套餐']),
        excluded: textValue(cp['不适用']),
        limits: textValue(cp['使用限制']),
        stacking: textValue(cp['叠加']),
        method: textValue(cp['使用方法']),
        validity: null,
        status: 'md-recorded-unverified',
        looksLikePlanName: /[一-龥\s]/.test(mdCode),
      }
    : null;
  if (mdCoupon?.looksLikePlanName) addConflict('coupon.code', existing?.coupons?.[0]?.code ?? null, mdCode, `本批资料的优惠码「${mdCode}」看起来像套餐名称，不当作优惠码。`, false);
  let coupons = existing?.coupons ?? [];
  const siteCoupon = coupons[0] ?? null;
  if (siteCoupon && mdCoupon) {
    if (siteCoupon.code !== mdCoupon.code) {
      const caseOnly = siteCoupon.code.toLowerCase() === mdCoupon.code.toLowerCase();
      addConflict('coupon.code', siteCoupon.code, mdCoupon.code, caseOnly
        ? `优惠码大小写：本批资料写作 ${mdCoupon.code}，本站收录 ${siteCoupon.code}；以结算页为准。`
        : `优惠码：本批资料记为 ${mdCoupon.code}，本站按站长确认收录 ${siteCoupon.code}；以结算页为准。`, true);
    }
    const siteDiscount = discountNumber(siteCoupon.discountLabel);
    const mdDiscount = discountNumber(mdCoupon.discountText);
    if (siteDiscount !== null && mdDiscount !== null && siteDiscount !== mdDiscount) {
      addConflict('coupon.discount', siteCoupon.discountLabel, mdCoupon.discountText, `优惠幅度：本批资料记为 ${mdCoupon.discountText.replace(/（.*$/, '')}，站长确认的活动规则为 ${siteCoupon.discountLabel}；以结算页为准。`, true);
    }
  } else if (!siteCoupon && mdCoupon && !mdCoupon.looksLikePlanName) {
    coupons = [{
      code: mdCoupon.code,
      status: 'md-recorded-unverified',
      referenceRestrictionNotes: null,
      discountLabel: null,
      usageLimit: null,
      excludedPlanTypes: null,
      mdDiscountText: mdCoupon.discountText,
    }];
  }

  // 客户端：A 本站建议（全站统一）与 B 服务商说明（逐品牌资料记录）分开。
  const dev = kvOf(doc, '设备与客户端');
  const subscriptionText = textValue(dev['订阅链接']);
  const thirdPartyText = textValue(dev['第三方客户端']);
  const client = {
    usage: textValue(dev['使用方式']),
    systems: textValue(dev['支持系统']),
    otherDevices: textValue(dev['电视盒子、软路由等其他设备']),
    devices: textValue(dev['设备数']),
    download: textValue(dev['下载渠道']),
    note: textValue(dev['说明']),
    subscription: { status: classifyClient(subscriptionText), text: subscriptionText },
    thirdParty: { status: classifyClient(thirdPartyText), text: thirdPartyText },
    evidence: 'md-batch-no-provider-notice',
    restoreTime: [classifyClient(subscriptionText), classifyClient(thirdPartyText)].includes('paused') ? 'unknown' : null,
  };

  // 流媒体与 AI：服务商声明，不是测试结果。
  const media = doc.sections['流媒体与AI'] ?? { kv: {}, lines: [] };
  const claims = {
    ipText: media.lines.find((line) => /IP/.test(line)) ?? null,
    streaming: textValue(media.kv['流媒体']),
    ai: textValue(media.kv['AI 工具']),
    crossBorder: textValue(media.kv['跨境 / 社交']),
    note: textValue(media.kv['说明']),
    status: 'provider-claim-via-md',
  };

  // 第三方测试：日期、网络、地区结果、工具、来源分开保存；没有原始截图或日志就写明。
  const testSection = doc.sections['晚高峰实测'];
  const thirdPartyTests = [];
  if (testSection) {
    const known = new Set(['测试时间', '测试网络', '流媒体与 AI', '结论', '测试工具', '工具']);
    thirdPartyTests.push({
      id: `${rb.id}-md-test-1`,
      testedAt: textValue(testSection.kv['测试时间']),
      network: textValue(testSection.kv['测试网络']),
      tool: textValue(testSection.kv['测试工具'] ?? testSection.kv['工具']),
      regions: Object.entries(testSection.kv).filter(([key]) => !known.has(key)).map(([region, result]) => ({ region, result: textValue(result) })),
      services: textValue(testSection.kv['流媒体与 AI']),
      conclusion: textValue(testSection.kv['结论']),
      source: '本批资料转述的第三方测试',
      evidence: 'no-original-screenshot-or-log',
      firstParty: false,
    });
  }

  const svc = kvOf(doc, '客服与防骗');
  const service = {
    channels: textValue(svc['客服渠道']),
    hours: textValue(svc['客服时间']),
    refund: textValue(svc['退款']),
    trial: textValue(svc['试用']),
    payment: textValue(svc['付款方式']),
    antiFraud: listOf(svc['防骗提醒']),
    notes: doc.sections['客服与防骗']?.lines ?? [],
  };

  const trafficRules = doc.sections['流量规则']?.raw ?? [];
  const purchaseSteps = doc.sections['购买流程']?.raw ?? [];
  const reviewNotes = (rb.notes ?? []).map((note) => ({ text: note.text, public: note.public === true }));
  for (const doubt of doubts) if (!reviewNotes.some((note) => note.text === doubt)) reviewNotes.push({ text: doubt, public: true });

  const listing = rb.listing ?? 'public';
  const operatingStatus = rb.operatingStatus ?? { status: 'unverified', text: null };
  const record = {
    ...(existing ?? {
      id: rb.id,
      name: rb.name,
      aliases: [],
      editorialOrder: null,
      fixedPosition: null,
      officialUrl: null,
      verificationStatus: 'md-batch-provider-unverified',
      providerVerifiedAt: null,
      sourceUpdatedOn: null,
      referenceReviewedOn: batch.collectedOn,
      sourceUrl: null,
      logoPath: null,
      logoStatus: null,
      logoCrop: null,
      logoSourceImageSize: null,
      logoVisibleText: null,
      logoNote: null,
      sourceHeadlineMonthly: null,
      regions: mdRegions,
      lineTypes: lineTokens(lineText),
      protocols: null,
      lineTypesStatus: 'md-recorded-unverified',
      clientSupportStatus: 'not-directly-verified',
      eligibleForConfirmedRouteFilter: false,
      deviceLimitText: client.devices,
      paymentMethods: null,
      refundPolicy: null,
      packageCoverage: 'md-batch-listed',
      referenceCouponCode: null,
      pricingEvidenceReceivedOn: null,
      pricingEvidenceCapturedAt: null,
      primaryPricingSourceId: null,
      cardHighlights: [],
      providerClaims: null,
      verifiedFacts: [],
      tests: [],
      historicalTests: [],
      firstPartyTestCount: 0,
      sourceConflicts: null,
      sourceNotes: null,
      noExtraChargeVerified: false,
    }),
    aliases,
    affiliateUrl,
    nodeCountDisplay,
    packages: merged,
    coupons,
    // 卡片价格下方的优势：规则文件里有逐条注明依据的整理结果就用它，否则沿用资料包。
    cardHighlights: rb.highlights ? rb.highlights.map((item) => item.text) : (existing?.cardHighlights ?? []),
    isNew: Boolean(rb.new),
    listing,
    homeEligible: rb.homeEligible ?? (listing === 'public' && operatingStatus.status !== 'contradictory'),
    featuredEligible: listing === 'public' && !['contradictory', 'static-demo-suspected'].includes(operatingStatus.status),
    operatingStatus,
    pricingPriority: screenshotPricing ? 'screenshot' : ownerVersion ? 'owner-version' : existing ? 'reference' : 'md-batch',
    englishName,
    englishNameStatus,
    englishNameCandidates,
    inviteCode: inviteCodeOf(affiliateUrl),
    link,
    profile: {
      positioning: textOf(doc, '基本信息', '品牌定位'),
      strengths: textOf(doc, '基本信息', '最大优势'),
      audience: textOf(doc, '基本信息', '适合人群'),
    },
    network: {
      regionsText,
      regionCounts: counts,
      nodeTotal: mdNodeTotal,
      lineText,
      multiplierText: textOf(doc, '线路与节点', '倍率'),
      notes: networkNotes,
      doubts,
    },
    trafficRules,
    client,
    claims,
    thirdPartyTests,
    service,
    mdCoupon,
    purchaseSteps,
    reviewNotes,
    fieldConflicts: conflicts,
    officialUrlRecorded: textOf(doc, '基本信息', '官网'),
    mdSource: { batchId: batch.id, file, no: rb.no, collectedOn: batch.collectedOn, sha256: fileRecords.find((item) => item.file === file).sha256 },
  };

  // 站长核实过的信息（规则文件里的 ownerVerified，2026-11-07 起）：线路改用核实后的写法并标为站长核实；
  // 价格记为站长已核对。页面据此显示“站长核实/站长已核对”和日期，不写成独立核验或官网核验。
  if (rb.ownerVerified) {
    const ov = rb.ownerVerified;
    record.ownerVerified = { verifiedOn: ov.verifiedOn, lines: Boolean(ov.lineText), pricing: ov.pricing === true };
    if (ov.lineText) {
      record.network = { ...record.network, lineText: ov.lineText };
      record.lineTypes = ov.lineTypes ?? lineTokens(ov.lineText);
      record.lineTypesStatus = 'owner-verified';
    }
  }

  // “更新”= 采用值或参与比较的报价有变化；截图品牌的差异只记成候选和冲突，采用值不变，算“保留”。
  const coreChanged = (quoteStats.conflict > 0 && !screenshotPricing) || quoteStats.addedEligible > 0 || quoteStats.statusChanged > 0 || (existing && nodeCountDisplay !== existing.nodeCountDisplay);
  record.importResult = rb.new
    ? (operatingStatus.status === 'static-demo-suspected' ? '待核验' : '新增')
    : operatingStatus.status === 'contradictory'
      ? '待核验'
      : coreChanged
        ? '更新'
        : '保留';
  record.quoteStats = quoteStats;
  brands.push(record);
  report.push({ no: rb.no, file, name: rb.name, id: rb.id, record });
}

// 基础层中有、但本批资料没有的品牌：原样保留。
for (const airport of base) {
  if (seenIds.has(airport.id)) continue;
  brands.push({ ...airport, listing: 'public', homeEligible: true, featuredEligible: true, isNew: false, importResult: '保留（本批无资料）', packages: airport.packages.map((quote) => ({ ...quote, origin: 'package', flags: [], md: { match: 'no-batch' } })) });
}

if (failures.length) {
  console.error(`导入中止，${failures.length} 个问题：`);
  for (const item of failures) console.error(`  - ${item}`);
  process.exit(1);
}

// ---------- 4. 写出 ----------
const output = {
  schemaVersion: 1,
  batch: { id: batch.id, label: batch.label, collectedOn: batch.collectedOn, readerSourceLabel: batch.readerSourceLabel },
  siteClientRecommendation: rules.siteClientRecommendation,
  inputs: {
    baseSha256: sha256(baseText),
    rulesSha256: sha256(rulesText),
    files: fileRecords,
  },
  brands,
};
writeFileSync(join(ROOT, 'src/data/brands.json'), JSON.stringify(output, null, 2) + '\n');

// 新品牌的详情页草稿占位：只在 npm run build:drafts 中生成，已有文件不改。
for (const rb of rules.brands.filter((item) => item.new)) {
  const path = join(ROOT, 'src/content/airports', `${rb.id}.md`);
  if (!existsSync(path)) writeFileSync(path, '---\ndraft: true\n---\n');
}

if (takeSnapshot) {
  mkdirSync(snapshotDir, { recursive: true });
  for (const name of mdFiles) copyFileSync(join(sourceDir, name), join(snapshotDir, name));
  writeFileSync(join(snapshotDir, 'MANIFEST.json'), JSON.stringify({ batch: batch.id, copiedFrom: sourceDir, files: fileRecords }, null, 2) + '\n');
}

// ---------- 5. 内部报告 ----------
const CLIENT_LABEL = { paused: '暂停提供', 'not-recommended': '不推荐', 'not-supported': '明确不支持', unconfirmed: '暂未确认', stated: '有说明' };
const lines = [];
lines.push(`# 机场MD 导入报告（${batch.id}）`, '');
lines.push('> 内部资料：不在 public/，不进 sitemap。由 `npm run import:md` 生成，重复运行结果相同。', '');
lines.push(`- 读取目录：${sourceDir}`);
lines.push(`- 读取文件：${mdFiles.length} 份（品牌 ${brandFiles.length} 份，辅助 ${mdFiles.length - brandFiles.length} 份）`);
lines.push(`- 基础层 airports.json sha256：${output.inputs.baseSha256.slice(0, 16)}…`, '');
lines.push('## 文件', '', '| 文件 | 字节 | 用途 | sha256 |', '|---|---:|---|---|');
for (const item of fileRecords) lines.push(`| ${item.file} | ${item.bytes} | ${item.role} | ${item.sha256.slice(0, 12)} |`);
lines.push('', '## 品牌结果', '', '| 编号 | 文件 | ID | 结果 | 价格（一致/冲突/新增/本批未列） | 链接 | 优惠码（站内 / 本批） | 订阅 / 第三方 |', '|---|---|---|---|---|---|---|---|');
for (const { no, file, id, record } of report) {
  const s = record.quoteStats;
  const site = record.coupons[0];
  lines.push(`| ${no} | ${file} | ${id} | ${record.importResult} | ${s.same}/${s.conflict}/${s.mdOnly}/${s.absent} | ${record.link.status === 'match' ? '一致' : '有差异'} | ${site ? `${site.code}${site.discountLabel ? ` ${site.discountLabel}` : ''}` : '—'} / ${record.mdCoupon ? `${record.mdCoupon.code}${record.mdCoupon.discountText ? ` ${record.mdCoupon.discountText.replace(/（.*$/, '')}` : ''}` : '—'} | ${CLIENT_LABEL[record.client.subscription.status]} / ${CLIENT_LABEL[record.client.thirdParty.status]} |`);
}
lines.push('', '## 推广链接核对', '');
for (const { no, name, record } of report) {
  const l = record.link;
  if (l.status === 'match') continue;
  lines.push(`- ${no} ${name}：${l.problems.join('；')}`, `  - 总目录：${l.toc}`, `  - 品牌 MD：${l.md ?? '（空）'}`, `  - 现站：${l.site ?? '（无）'}`, `  - 采用：${l.adopted ?? '（未采用）'}`);
}
lines.push('', `其余 ${report.filter((item) => item.record.link.status === 'match').length} 家三方一致。`, '');
lines.push('## 未解决的冲突与待确认事项', '');
for (const { no, name, record } of report) {
  const items = [...record.fieldConflicts.map((c) => `${c.public ? '' : '［内部］'}${c.text}`), ...record.reviewNotes.map((n) => `${n.public ? '' : '［内部］'}${n.text}`)];
  if (record.operatingStatus.text) items.unshift(`运营状态：${record.operatingStatus.text}`);
  if (!items.length) continue;
  lines.push(`### ${no} ${name}`, '', ...[...new Set(items)].map((text) => `- ${text}`), '');
}
lines.push('## 内部观察', '', ...rules.internalObservations.map((text) => `- ${text}`), '');
mkdirSync(join(ROOT, 'reports'), { recursive: true });
writeFileSync(join(ROOT, 'reports', `md-import-${batch.id}.md`), lines.join('\n') + '\n');
writeFileSync(join(ROOT, 'reports', `md-import-${batch.id}.json`), JSON.stringify({
  batch: batch.id,
  sourceDir,
  files: fileRecords,
  brands: report.map(({ no, file, id, name, record }) => ({
    no, file, id, name,
    result: record.importResult,
    listing: record.listing,
    quoteStats: record.quoteStats,
    link: record.link,
    coupon: { site: record.coupons[0]?.code ?? null, md: record.mdCoupon?.code ?? null },
    client: { subscription: record.client.subscription.status, thirdParty: record.client.thirdParty.status },
    conflicts: record.fieldConflicts,
    notes: record.reviewNotes,
  })),
}, null, 2) + '\n');

const tally = report.reduce((acc, { record }) => ({ ...acc, [record.importResult]: (acc[record.importResult] ?? 0) + 1 }), {});
console.log(`已读取 ${mdFiles.length} 份 MD（品牌 ${brandFiles.length} 份）：${Object.entries(tally).map(([k, v]) => `${k} ${v}`).join('，')}`);
console.log(`品牌数据层：src/data/brands.json（${brands.length} 家，报价 ${brands.reduce((n, b) => n + b.packages.length, 0)} 条）`);
console.log(`内部报告：reports/md-import-${batch.id}.md`);
