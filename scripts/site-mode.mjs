// 构建模式判断（2026-11-06，站长要求修补“默认构建命令会让整站不收录”的风险）。
// astro.config.mjs 和 scripts/verify-dist.mjs 都用这里，保证页面和产物检查用的是同一个模式。
//
// 1. 显式设置的 SITE_ENV 优先：npm run build:production 设为 production，npm run build:drafts 设为 preview。
// 2. 否则，在 Cloudflare Pages 上构建（CF_PAGES=1），并且分支等于 site.config.json 的 productionBranch（默认 main）时，
//    按正式构建：开放索引、输出 canonical 和 sitemap。所以后台即使用默认的 npm run build，正式站也不会被设成 noindex。
// 3. 其他情况（本机、Cloudflare 其他分支的预览部署）按预览构建，全部 noindex。
export const resolveSiteEnv = (env, config = {}) => {
  if (env.SITE_ENV) return env.SITE_ENV;
  const productionBranch = config.productionBranch || 'main';
  return env.CF_PAGES === '1' && env.CF_PAGES_BRANCH === productionBranch ? 'production' : 'preview';
};

/** 给构建日志看的一句说明。 */
export const describeSiteEnv = (env, config = {}) => {
  const mode = resolveSiteEnv(env, config);
  if (env.SITE_ENV) return `${mode}（SITE_ENV=${env.SITE_ENV}）`;
  if (env.CF_PAGES === '1') return `${mode}（Cloudflare Pages 分支 ${env.CF_PAGES_BRANCH ?? '未知'}，正式分支是 ${config.productionBranch || 'main'}）`;
  return `${mode}（本机构建）`;
};
