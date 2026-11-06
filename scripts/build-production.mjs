// 正式构建：开放索引，输出 canonical、sitemap 和 IndexNow 密钥文件。
// 域名和密钥来自 site.config.json，也可以用环境变量 SITE_ORIGIN、INDEXNOW_KEY 覆盖。
import { spawnSync } from 'node:child_process';

const result = spawnSync('npm run build', {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, SITE_ENV: 'production' },
});
process.exit(result.status ?? 1);
