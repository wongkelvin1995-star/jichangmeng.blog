import { readFileSync } from 'node:fs';
import { unified } from '@astrojs/markdown-remark';
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import rehypeLinks from './src/lib/rehype-links.mjs';
import { resolveSiteEnv } from './scripts/site-mode.mjs';

// 把 .env 载入 process.env（已存在的环境变量优先），页面统一从 src/config/site.ts 读取。
const env = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '');
for (const [key, value] of Object.entries(env)) {
  process.env[key] ??= value;
}

const config = JSON.parse(readFileSync(new URL('./site.config.json', import.meta.url), 'utf8'));
// 构建模式写回 SITE_ENV，src/config/site.ts 读到的就是同一个结果（Cloudflare 正式分支会自动按正式构建，见 scripts/site-mode.mjs）。
process.env.SITE_ENV = resolveSiteEnv(process.env, config);
const production = process.env.SITE_ENV === 'production';

export default defineConfig({
  // 只有正式构建（npm run build:production）才写入正式域名；默认构建是 noindex 的预览版本。
  site: process.env.SITE_ORIGIN || (production ? config.origin : undefined),
  trailingSlash: 'always',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
  markdown: { processor: unified({ rehypePlugins: [rehypeLinks] }) },
});
