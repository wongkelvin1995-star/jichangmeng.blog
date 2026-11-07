import { getCollection } from 'astro:content';
import { site } from '../config/site';
import { brandById, type Airport } from './airports';

export const day = (date?: Date) => date?.toISOString().slice(0, 10);

/**
 * 品牌资料页的“最后更新”：正文修改日期和资料批次导入日期取较晚的一个。
 * 资料批次会改动页面上的客户端、客服、声明和待确认事项，只看正文日期会把页面写旧（2026-11-06 审计发现）。
 * 页面、结构化数据和 sitemap 都用这里，保持一致。
 */
export const brandPageUpdatedAt = (airport: Pick<Airport, 'mdSource' | 'ownerVerified'>, bodyUpdatedAt?: Date) => {
  // 站长核实（ownerVerified.verifiedOn）也会改动页面上的线路和价格说明，一并算进去。
  const candidates = [bodyUpdatedAt, airport.mdSource?.collectedOn, airport.ownerVerified?.verifiedOn]
    .filter(Boolean)
    .map((value) => (value instanceof Date ? value : new Date(value as string)));
  return candidates.length ? candidates.reduce((latest, value) => (value > latest ? value : latest)) : undefined;
};

const visible = <T extends { data: { draft: boolean } }>(entries: T[]) =>
  entries.filter((entry) => !entry.data.draft || site.previewDrafts);

const newestFirst = <T extends { data: { publishedAt?: Date } }>(entries: T[]) =>
  [...entries].sort((a, b) => (b.data.publishedAt?.getTime() ?? 0) - (a.data.publishedAt?.getTime() ?? 0));

export const getPublishedCompare = async () => newestFirst(visible(await getCollection('compare')));
export const getPublishedReviews = async () => newestFirst(visible(await getCollection('reviews')));

export const GUIDE_GROUPS = ['新手入门', '选购与付款', '线路与测试', '使用排查'];

export const KIND_LABEL = {
  brand: '资料评析',
  guide: '选购指南',
  compare: '条件对比',
  review: '历史样本解读',
} as const;

export interface IndexedPage {
  path: string;
  title: string;
  description: string;
  kind: keyof typeof KIND_LABEL | 'collection' | 'page';
  publishedAt?: Date;
  updatedAt?: Date;
}

/** 所有已公开页面的索引，用于相关链接、最近更新和 sitemap，只含真实存在的路径。 */
export async function getContentIndex() {
  const pages: IndexedPage[] = [
    { path: '/airports/', title: '机场资料与套餐入口', description: '查看品牌、代表套餐、资料日期及已知限制。', kind: 'collection' },
    { path: '/guides/', title: '机场选购与使用指南', description: '从付款、流量、客户端到测试方法。', kind: 'collection' },
    { path: '/reviews/', title: '机场评析与测试解读', description: '区分资料分析、历史样本和实际测试。', kind: 'collection' },
    { path: '/compare/', title: '按条件比较机场', description: '在相同口径下比较付款与流量。', kind: 'collection' },
    { path: '/about/', title: '关于机场梦', description: '网站定位与内容范围。', kind: 'page' },
    { path: '/editorial-policy/', title: '编辑方法', description: '顺序、资料与测试证据的标准。', kind: 'page' },
    { path: '/disclosure/', title: '推广与价格说明', description: '推广链接、佣金和报价口径。', kind: 'page' },
  ];

  for (const entry of await getCollection('airports')) {
    if (entry.data.draft) continue;
    const airport = brandById(entry.id);
    // 只收公开目录中的品牌；待核验品牌即使误把草稿关掉，也不进索引和 sitemap。
    if (!airport || airport.listing !== 'public') continue;
    pages.push({
      path: `/airports/${entry.id}/`,
      title: entry.data.title ?? `${airport.name}资料评析`,
      description: entry.data.summary ?? '',
      kind: 'brand',
      publishedAt: entry.data.publishedAt,
      updatedAt: brandPageUpdatedAt(airport, entry.data.updatedAt),
    });
  }
  const add = (section: string, kind: IndexedPage['kind'], entries: { id: string; data: { title: string; description: string; publishedAt?: Date; updatedAt?: Date } }[]) => {
    for (const { id, data } of entries) {
      pages.push({ path: `/${section}/${id}/`, title: data.title, description: data.description, kind, publishedAt: data.publishedAt, updatedAt: data.updatedAt });
    }
  };
  add('guides', 'guide', visible(await getCollection('guides')));
  add('compare', 'compare', visible(await getCollection('compare')));
  add('reviews', 'review', visible(await getCollection('reviews')));
  return pages;
}
