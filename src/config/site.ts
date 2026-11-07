// 站点配置。未提供的真实信息保持 null，页面据此隐藏对应内容，不编造。
// 正式域名、IndexNow 密钥和 Bing 验证值在根目录的 site.config.json。
import config from '../../site.config.json';

/** 主推简介里的一条理由、提醒或结论。 */
export interface SpotlightWhyItem {
  title?: string;
  /** 可用的占位符见 BrandSpotlight.astro 的 tokens；{testedOn}、{testNetwork} 要配合 test。 */
  text: string;
  /**
   * 条件成立才显示：subscriptionPaused 资料记录暂停第三方订阅；linesUnverified / linesVerified 线路未核实 / 站长已核实；
   * pricingUnverified / pricingVerified 价格未核对 / 站长已核对。状态变了，对应的条目自动切换。
   */
  when?: 'subscriptionPaused' | 'linesUnverified' | 'linesVerified' | 'pricingUnverified' | 'pricingVerified';
  /** 这条依据的第三方测试 id；数据层里没有这条测试时构建报错，提醒按新资料重写。 */
  test?: string;
}

export interface SpotlightWhy {
  brandId: string;
  reviewedOn: string;
  eyebrow: string;
  title: string;
  lead: string;
  reasons: SpotlightWhyItem[];
  checks: SpotlightWhyItem[];
  verdict: SpotlightWhyItem;
}

const env = process.env;
const production = env.SITE_ENV === 'production';
const origin = env.SITE_ORIGIN?.trim() || (production ? config.origin : null);

export const site = {
  name: '机场梦',
  headline: '一个小小的机场，拥有大大的梦想',
  tagline: '我们把机场资料、套餐规则和新手教程整理在一起：先看懂价格、流量和使用条件，再决定哪种订阅适合自己。事实、编辑分析和还没确认的部分，我们分开写清楚。',
  /**
   * 内容角度（SEO_KEYWORD_PLAN.md 第 4 节，站长 2026-11-06 指定）。新写和改写文章都按这个角度：
   * 品牌型 + 新手陪伴型；以“我们”的真诚语气写作；重点做图文新手教程和本站使用说明；
   * 强调透明、用心维护；推荐类大词改写为品牌介绍，不做第三方机场排行榜。
   */
  angle: {
    type: '品牌型 + 新手陪伴型',
    voice: '以“我们”的真诚语气写作',
    focus: ['图文新手教程', '本站使用说明'],
    principles: ['透明', '用心维护', '推荐类大词改写为品牌介绍', '不做第三方机场排行榜'],
  },
  // “机场推荐”一词由 /guides/jichang-tuijian-zenme-kan/ 承接（一词一页），首页标题以品牌为主。
  homeTitle: '机场梦｜机场资料整理、新手教程与选购方法',
  homeDescription:
    '机场梦整理机场套餐、流量规则和线路资料，写新手教程和本站使用说明，结合品牌资料评析和历史测试样本，帮助你在付款前看清条件、适用场景与已知限制。',
  orderingDisclosure:
    '以下为本站编辑推荐展示顺序，部分入口含推广链接；不代表统一性能测评、销量或绝对排名。',

  /** 站长提供的 Telegram 链接：页脚“本站说明”旁和顶部导航“搜索”旁的纸飞机图标使用。 */
  telegram: 'https://t.me/+362P1c5l2QU3OTU1',
  /** GitHub 链接（站长 2026-11-06 要求放在 TG 图标旁）：网站的公开仓库。填 null 则顶部导航不显示 GitHub 图标。 */
  github: 'https://github.com/wongkelvin1995-star/jichangmeng.blog' as string | null,
  /** 首页“需求入口”上方的站长主推模块（站长 2026-11-06 指定灵动云），内容全部从数据层读取。 */
  spotlight: {
    brandId: 'lingdongyun',
    label: '站长主推',
    /**
     * 主推模块上方的“为什么主推”简介（站长 2026-11-06 要求：由 AI 以旁观者角度说明为什么主推）。
     * 只按本站收录的资料写，先讲推广关系，再分开写理由和需要读者核对的地方；不写测速、稳定性结论。
     * brandId 和上面的 brandId 一致才显示，换主推品牌时这段不会张冠李戴，要为新品牌重写。
     * 数字用 {占位符}，由 BrandSpotlight 从数据层取值，和卡片、资料页同一份数据，取不到值时构建报错。
     */
    why: {
      brandId: 'lingdongyun',
      reviewedOn: '2026-11-07',
      eyebrow: 'AI 旁观视角',
      title: '为什么主推{name}？',
      lead: '这一段换个角度，由 AI 只根据本站收录的资料来回答。先说清楚：这是站长主推的品牌，入口含推广链接，通过本站注册或购买，本站可能获得佣金。抛开这层关系、只看资料，它被放在这里有几条站得住的理由，也有几处需要你自己核对。',
      // 2026-11-07 站长核实线路（全线 IEPL / IPLC 专线）、核对价格；AI 与高清视频的本站实测待更新。
      reasons: [
        { when: 'linesVerified', title: '线路已核实', text: '{lineText}，站长 {verifiedOn} 核实。' },
        { when: 'pricingVerified', title: '试用成本低', text: '月付 {monthly} 就有 {monthlyGB} 流量（价格经站长 {verifiedOn} 核对），先买一个月试试合不合用，花费不大。' },
        { when: 'pricingUnverified', title: '试用成本低', text: '月付 {monthly} 就有 {monthlyGB} 流量，先买一个月试试合不合用，花费不大。' },
        { title: '套餐跨度大', text: '从 {annualSmall} 一年、每月 {annualSmallGB} 的年付小包，到 {monthlyTiers} 档月付（最高每月 {maxMonthlyGB}），还有 {oneTimeCount} 款一次性流量包和私人定制，轻度和重度用户都能找到对应档位。' },
        { title: '长期用更省', text: '按资料列示的标价折算，年付约为月付的 {yearZhe}，三年付约 {threeYearZhe}；先用月付确认合适，再换长周期也不迟。' },
        { title: '规则对新手友好', text: '资料写明全节点 1x 倍率、不限同时在线设备数；月内流量用完可以买同档重置包，也可申请退款和升级补差价。' },
        { title: '有站长优惠码', text: '结算时填 {coupon}，适用的周期套餐可再打 {couponDiscount}，适用范围见下方“优惠码与售后”。' },
      ],
      checks: [
        { when: 'subscriptionPaused', title: '第三方订阅暂停', text: '资料称暂不支持导入 Clash、小火箭等，只能用官方客户端；这份公告是否出自{name}尚未确认，恢复时间未知。' },
        { when: 'linesUnverified', title: '线路说法不一', text: '各资料分别写作 IEPL + BGP、IEPL / IPLC 或 IPLC，本站没有实测。' },
        { title: 'AI 工具和高清视频', text: '关于实测部分，待更新中。' },
        { when: 'pricingUnverified', title: '价格未独立核验', text: '报价摘自{pricingSource}，最终金额与规则以购买页为准。' },
      ],
      verdict: { text: '更适合想低成本先试、看重套餐弹性和售后规则的人；AI 工具和高清视频的实测结果出来之前，建议先买一个月实际用用，再决定要不要换长周期。' },
    } as SpotlightWhy,
  },

  /** 真实作者或编辑署名。 */
  author: null as string | null,
  /** 联系方式（站长 2026-11-06 提供）：页脚“本站说明”列表和关于页“纠错”一节使用，填 null 则两处都不显示。 */
  contact: { label: '邮箱', href: 'mailto:wongkelvin1995@gmail.com', text: 'wongkelvin1995@gmail.com' } as { label: string; href: string; text: string } | null,

  origin,
  isProduction: production && Boolean(origin),
  previewDrafts: env.PREVIEW_DRAFTS === '1',
  bingVerification: env.BING_SITE_VERIFICATION?.trim() || config.bingSiteVerification || null,
  indexNowKey: env.INDEXNOW_KEY?.trim() || config.indexNowKey || null,
};

/** 说明页的内容修改日期，改动内容时手动更新；sitemap 的 lastmod 只读这里，不随构建变化。 */
export const pageUpdatedOn = {
  // 2026-11-06：导入「机场MD」资料批次，首页计数、目录和编辑方法的资料范围随之变化；
  // 同日按 SEO_KEYWORD_PLAN 第 1 批更新口号、首页入口、关于页，推广说明补了免责声明。
  // 2026-11-07：灵动云线路经站长核实、价格经站长核对，首页主推简介和目录卡片的说法随之更新。
  home: '2026-11-07',
  airports: '2026-11-07',
  about: '2026-11-06',
  editorialPolicy: '2026-11-06',
  disclosure: '2026-11-06',
  privacy: '2026-11-05',
};
