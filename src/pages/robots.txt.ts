import type { APIRoute } from 'astro';
import { site } from '../config/site';

// 预览环境靠页面上的 noindex 阻止索引，所以不能用 Disallow 挡住抓取，否则爬虫看不到 noindex。
export const GET: APIRoute = () => {
  const lines = ['User-agent: *', 'Allow: /'];
  if (site.isProduction) lines.push('', `Sitemap: ${new URL('/sitemap.xml', site.origin!).href}`);
  return new Response(lines.join('\n') + '\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
