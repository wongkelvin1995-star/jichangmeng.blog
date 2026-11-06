import { site } from '../config/site';
import ogImages from '../data/og-images.json';

const absolute = (path: string) => (site.origin ? new URL(path, site.origin).href : path);

/**
 * 每页的分享图（scripts/build-og-images.mjs 生成，1200×630）。页面 og:image 和文章结构化数据的 image 都用它；
 * 还没有专属分享图的页面用首页那张。
 */
export interface OgImage { src: string; width: number; height: number; title: string }
const ogList = ogImages as Record<string, OgImage>;
export const ogImageOf = (path: string): OgImage | null => ogList[path] ?? ogList['/'] ?? null;

/** 没有真实署名时使用可见的品牌组织，不虚构个人作者。 */
const organization = () => ({
  '@type': 'Organization',
  name: site.name,
  ...(site.origin ? { url: absolute('/') } : {}),
});

const authorOf = (name?: string | null) => {
  const real = name ?? site.author;
  return real ? { '@type': 'Person', name: real } : organization();
};

export const breadcrumbJsonLd = (items: { label: string; href?: string }[]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: item.label,
    ...(item.href ? { item: absolute(item.href) } : {}),
  })),
});

export const websiteJsonLd = () => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: site.name,
  description: site.homeDescription,
  inLanguage: 'zh-CN',
  publisher: organization(),
  ...(site.origin ? { url: absolute('/') } : {}),
});

const day = (date?: Date) => date?.toISOString().slice(0, 10);

export const articleJsonLd = (options: {
  type: 'Article' | 'BlogPosting';
  headline: string;
  description: string;
  path: string;
  publishedAt?: Date;
  updatedAt?: Date;
  author?: string | null;
}) => ({
  '@context': 'https://schema.org',
  '@type': options.type,
  headline: options.headline,
  description: options.description,
  inLanguage: 'zh-CN',
  mainEntityOfPage: absolute(options.path),
  ...(site.origin ? { url: absolute(options.path) } : {}),
  // 配图：本页的分享图（正式域名确定后才输出绝对地址）。
  ...(site.origin && ogList[options.path]
    ? { image: { '@type': 'ImageObject', url: absolute(ogList[options.path].src), width: ogList[options.path].width, height: ogList[options.path].height } }
    : {}),
  ...(options.publishedAt ? { datePublished: day(options.publishedAt) } : {}),
  ...(options.updatedAt ? { dateModified: day(options.updatedAt) } : {}),
  author: authorOf(options.author),
  publisher: organization(),
});

export const collectionJsonLd = (options: {
  name: string;
  description: string;
  path: string;
  items: { name: string; path: string }[];
}) => ({
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: options.name,
  description: options.description,
  inLanguage: 'zh-CN',
  ...(site.origin ? { url: absolute(options.path) } : {}),
  mainEntity: {
    '@type': 'ItemList',
    itemListElement: options.items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: absolute(item.path),
    })),
  },
});

/** Markdown 片段转成纯文本：去掉 HTML、图片、链接地址和强调符号。 */
const plainText = (markdown: string) =>
  markdown
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** 第一段文字（跳过截图等 HTML 块），结构化数据只取页面上看得到的那一段。 */
const firstBlock = (markdown: string) =>
  markdown
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .find((block) => block && !block.startsWith('<') && !block.startsWith('|')) ?? '';

/** 正文“## 常见问题”下的“### 问题”与紧跟的回答段落，生成 FAQPage。 */
export const faqJsonLd = (markdown: string) => {
  const section = markdown.match(/^##\s*常见问题[^\n]*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/m)?.[1];
  if (!section) return null;
  const items = [...section.matchAll(/^###\s+(.+)\n([\s\S]*?)(?=^###\s|(?![\s\S]))/gm)]
    .map(([, question, answer]) => ({ question: plainText(question), answer: plainText(firstBlock(answer)) }))
    .filter((item) => item.question && item.answer);
  if (!items.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: 'zh-CN',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
};

/** 分步教程：正文里“### 第 N 步：标题”及其后的第一段文字，生成 HowTo；步骤里的截图一并写入。 */
export const howToJsonLd = (options: { name: string; description: string; path: string; markdown: string }) => {
  const steps = [...options.markdown.matchAll(/^###\s*第\s*[0-9一二三四五六七八九十]+\s*步[：:]\s*(.+)\n([\s\S]*?)(?=^#{2,3}\s|(?![\s\S]))/gm)]
    .map(([, name, body]) => ({
      name: plainText(name),
      text: plainText(firstBlock(body)),
      image: body.match(/<img\b[^>]*\ssrc="([^"]+)"/)?.[1],
    }))
    .filter((step) => step.name && step.text);
  if (steps.length < 2) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: options.name,
    description: options.description,
    inLanguage: 'zh-CN',
    ...(site.origin ? { url: absolute(options.path) } : {}),
    step: steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.name,
      text: step.text,
      ...(step.image ? { image: absolute(step.image) } : {}),
    })),
  };
};

export const webPageJsonLd = (options: { name: string; description: string; path: string; updatedOn: string }) => ({
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: options.name,
  description: options.description,
  inLanguage: 'zh-CN',
  dateModified: options.updatedOn,
  publisher: organization(),
  ...(site.origin ? { url: absolute(options.path) } : {}),
});
