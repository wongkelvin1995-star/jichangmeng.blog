import type { APIRoute, GetStaticPaths } from 'astro';
import { site } from '../config/site';

// IndexNow 要求同域可访问的密钥文件，只在正式构建时生成。
export const getStaticPaths: GetStaticPaths = () =>
  site.isProduction && site.indexNowKey ? [{ params: { indexnowKey: site.indexNowKey } }] : [];

export const GET: APIRoute = () =>
  new Response(site.indexNowKey ?? '', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
