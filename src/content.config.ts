import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const publishable = {
  seoTitle: z.string().optional(),
  draft: z.boolean().default(true),
  publishedAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  relatedPaths: z.array(z.string()).default([]),
};

// 品牌结构化资料在 src/data/airports.json，这里放审核后的评析正文。
// 发布门槛见 scripts/check-data.mjs。
const airports = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/airports' }),
  schema: z.object({
    ...publishable,
    title: z.string().optional(),
    summary: z.string().optional(),
    sourceDataOn: z.coerce.date().optional(),
  }),
});

const article = z
  .object({
    ...publishable,
    title: z.string(),
    description: z.string(),
    category: z.string().optional(),
    author: z.string().optional(),
    sampleDates: z.array(z.coerce.date()).optional(),
    /** 分步教程：正文里的“### 第 N 步：…”会生成 HowTo 结构化数据。 */
    howTo: z.boolean().default(false),
  })
  .refine((entry) => entry.draft || (entry.publishedAt && entry.updatedAt), {
    message: '已发布内容必须有真实的 publishedAt 和 updatedAt',
  });

const guides = defineCollection({
  loader: glob({ pattern: '[^_]*.md', base: './src/content/guides' }),
  schema: article,
});
const compare = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/compare' }),
  schema: article,
});
const reviews = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/reviews' }),
  schema: article,
});

// 关于本站、编辑方法、推广说明的正文。
const pages = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/pages' }),
  schema: z.object({ title: z.string(), seoTitle: z.string(), description: z.string() }),
});

export const collections = { airports, guides, compare, reviews, pages };
