// 解析「机场MD」批次里的品牌资料。原文件没有 frontmatter，是“一、基本信息 / 键：值”结构的纯文本。
// 只做转换，不判断真假；无法识别的行原样记录在 unparsed，交给导入报告人工检查。

const SECTION = /^([一二三四五六七八九十]+)、\s*(.+?)\s*$/;
const RULE = /^[-=]{6,}\s*$/;
const KV = /^([^：:]{1,24})[：:]\s*(.*)$/;

const PERIOD_WORDS = [
  ['两年付', 'two_year', 24],
  ['二年付', 'two_year', 24],
  ['三年付', 'three_year', 36],
  ['半年付', 'half_year', 6],
  ['季付', 'quarter', 3],
  ['年付', 'year', 12],
  ['月付', 'month', 1],
];
const UNIT_PERIOD = { 月: ['month', 1], 年: ['year', 12], 季: ['quarter', 3], 天: ['day', null], 日: ['day', null], 周: ['week', null] };

const num = (text) => Number(String(text).replace(/,/g, ''));

/** 流量：数字 + GB/TB，可带“/月”。TB 按 1000GB 换算，并保留原文。 */
function parseTraffic(text) {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(GB|G|TB|T)\b(?:\s*\/\s*(月|天|周|30\s*天))?/i);
  if (!match) return null;
  const value = num(match[1]) * (/^t/i.test(match[2]) ? 1000 : 1);
  return { gb: value, perMonth: Boolean(match[3]) && !/天|周/.test(match[3]) || /每\s*30\s*天/.test(text), raw: match[0] };
}

const periodPrices = (text) => {
  const found = [];
  for (const [word, period, months] of PERIOD_WORDS) {
    const re = new RegExp(`(?<![两二三半])${word}\\s*¥\\s*(\\d+(?:\\.\\d+)?)`, 'g');
    for (const m of text.matchAll(re)) found.push({ period, months, amount: num(m[1]) });
  }
  return found;
};

/**
 * 一行套餐 → 若干条报价。kind 决定没有写周期的单价怎么理解。
 * 括号里的内容是说明：其中写明付款周期的价格（例如“两年付 ¥190”）算同一方案的另一条报价；
 * 其余带价格的括号（例如“用完可付费重置，¥612”）是附加费用，不当成套餐售价。
 */
export function parsePlanLine(line, kind) {
  const nameMatch = line.match(/^([^：:]+)[：:]\s*(.*)$/);
  if (!nameMatch) return null;
  const name = nameMatch[1].trim();
  const body = nameMatch[2];
  const notes = [...body.matchAll(/（([^）]*)）/g)].map((m) => m[1].trim());
  const main = body.replace(/（[^）]*）/g, ' ');
  const traffic = parseTraffic(main);
  const quotes = periodPrices(main).map((q) => ({ ...q, from: 'main' }));

  if (!quotes.length) {
    // ¥19.9/月、¥99/年、¥1.9/天、¥9.9/周，或只有 ¥199（一次性流量包）
    for (const m of main.matchAll(/¥\s*(\d+(?:\.\d+)?)\s*(?:\/\s*(月|年|季|天|日|周))?/g)) {
      const unit = m[2];
      if (unit) {
        const [period, months] = UNIT_PERIOD[unit];
        quotes.push({ period, months, amount: num(m[1]), from: 'main' });
      } else if (kind === 'one-time' || kind === 'addon' || /一次性\s*¥/.test(main)) {
        quotes.push({ period: 'one_time', months: null, amount: num(m[1]), from: 'main' });
      } else {
        quotes.push({ period: null, months: null, amount: num(m[1]), from: 'main' });
      }
    }
  }

  const extras = [];
  for (const note of notes) {
    if (!/¥/.test(note)) continue;
    const more = periodPrices(note);
    if (more.length) {
      quotes.push(...more.map((q) => ({ ...q, from: 'note' })));
      continue;
    }
    for (const m of note.matchAll(/¥\s*(\d+(?:\.\d+)?)/g)) {
      extras.push({ amount: num(m[1]), text: note, kind: /重置/.test(note) ? 'reset' : /加购|叠加/.test(note) ? 'addon' : 'other' });
    }
  }
  return { name, kind, body, notes, traffic, quotes, extras };
}

const PLAN_KIND = [
  [/长周期|折扣/, 'discount'],
  [/年付小包|年付|年度/, 'annual-small'],
  [/不限时|一次性|永久|买断|流量包/, 'one-time'],
  [/独享|定制|专线|家宽/, 'custom'],
  [/短期|体验|按天|按周|日付|周付/, 'short-term'],
  [/重置|加购|加油/, 'addon'],
  [/周期|套餐/, 'periodic'],
];
const planKind = (title) => (PLAN_KIND.find(([re]) => re.test(title)) ?? [null, 'periodic'])[1];

export function parseBrandMd(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const doc = { title: lines[0].trim(), sections: {}, plans: [], discountText: [], unparsed: [] };
  let section = null;
  let planGroup = null;

  for (const raw of lines.slice(1)) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || RULE.test(line)) continue;
    const head = line.match(SECTION);
    if (head) {
      section = head[2].replace(/\s+/g, '');
      doc.sections[section] = { kv: {}, lines: [], raw: [] };
      planGroup = null;
      continue;
    }
    if (!section) { doc.unparsed.push(line); continue; }
    const target = doc.sections[section];
    target.raw.push(line.trim());

    if (section.startsWith('套餐与价格')) {
      if (!/^\s/.test(line) && /[：:]\s*$/.test(line)) {
        planGroup = { title: line.replace(/[：:]\s*$/, '').trim() };
        planGroup.kind = planKind(planGroup.title);
        continue;
      }
      if (planGroup?.kind === 'discount') { doc.discountText.push(line.trim()); continue; }
      const plan = parsePlanLine(line.trim(), planGroup?.kind ?? 'periodic');
      if (plan && plan.quotes.length) { plan.group = planGroup?.title ?? null; doc.plans.push(plan); continue; }
      target.lines.push(line.trim());
      doc.unparsed.push(`[套餐] ${line.trim()}`);
      continue;
    }

    const kv = line.trim().match(KV);
    if (kv && !/^\d+\./.test(line.trim())) {
      const key = kv[1].trim();
      if (key in target.kv) target.kv[key] = [].concat(target.kv[key], kv[2].trim());
      else target.kv[key] = kv[2].trim();
    } else {
      target.lines.push(line.trim());
    }
  }
  return doc;
}

/** 文字原样保留：“待确认”“无”“不支持”“未公开”各有含义，不转成 0、false 或“没有”。 */
export const textValue = (value) => {
  if (value === undefined || value === null) return null;
  const text = Array.isArray(value) ? value.join('；') : String(value).trim();
  return text === '' ? null : text;
};
