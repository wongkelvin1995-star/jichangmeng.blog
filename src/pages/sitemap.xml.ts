import type { APIRoute } from 'astro';
import { pageUpdatedOn, site } from '../config/site';
import { day, getContentIndex } from '../lib/content';

// 只列正式可索引的规范 URL；lastmod 来自内容的真实修改日期，不随构建刷新。
// 预览环境输出空 sitemap，避免写入占位域名。
export const GET: APIRoute = async () => {
  const entries: { path: string; lastmod: string }[] = [];

  if (site.isProduction) {
    const index = await getContentIndex();
    const newestIn = (prefix: string) =>
      index
        .filter((page) => page.path.startsWith(prefix) && page.updatedAt)
        .map((page) => day(page.updatedAt)!)
        .sort()
        .pop();

    entries.push(
      { path: '/', lastmod: pageUpdatedOn.home },
      { path: '/airports/', lastmod: pageUpdatedOn.airports },
      { path: '/guides/', lastmod: newestIn('/guides/') ?? pageUpdatedOn.home },
      { path: '/reviews/', lastmod: newestIn('/reviews/') ?? pageUpdatedOn.home },
      { path: '/compare/', lastmod: newestIn('/compare/') ?? pageUpdatedOn.home },
      { path: '/about/', lastmod: pageUpdatedOn.about },
      { path: '/editorial-policy/', lastmod: pageUpdatedOn.editorialPolicy },
      { path: '/disclosure/', lastmod: pageUpdatedOn.disclosure },
      { path: '/privacy/', lastmod: pageUpdatedOn.privacy },
    );
    for (const page of index) {
      if (page.updatedAt) entries.push({ path: page.path, lastmod: day(page.updatedAt)! });
    }
  }

  const urls = entries
    .map((entry) => `  <url>\n    <loc>${new URL(entry.path, site.origin!).href}</loc>\n    <lastmod>${entry.lastmod}</lastmod>\n  </url>`)
    .join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
