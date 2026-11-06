// 生成包含草稿详情页的本地审稿版本，输出到 dist-drafts/（全部 noindex，不要部署）。
// 查看：npx astro preview --outDir dist-drafts
import { spawnSync } from 'node:child_process';

const env = { ...process.env, PREVIEW_DRAFTS: '1', SITE_ENV: 'preview', SITE_ORIGIN: '' };
const run = (command) => {
  const result = spawnSync(command, { stdio: 'inherit', shell: true, env });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run('npx astro build --outDir dist-drafts');
run('npx pagefind --site dist-drafts');
