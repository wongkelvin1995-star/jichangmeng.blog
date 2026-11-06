# 机场梦

中文机场资料与选购博客。Astro 静态站，视觉主题为暗夜梦境 Dreamscape Nexus。

## 常用命令

| 命令 | 用途 |
|---|---|
| `npm run dev` | 本地开发（搜索页的全文检索需要构建后才可用） |
| `npm run build` | 校验数据、构建、生成搜索索引、检查产物；页面全部 noindex |
| `npm run build:production` | 同上，但开放索引，并输出 canonical、sitemap 和 IndexNow 密钥文件；部署用这个 |
| `npm run preview` | 预览 `dist/`，默认 http://localhost:4321 |
| `npm run build:drafts` | 生成含未发布品牌详情页的审稿版本到 `dist-drafts/`（不要部署） |
| `npx astro preview --outDir dist-drafts` | 查看审稿版本 |

## 内容放在哪里

| 位置 | 内容 | 如何修改 |
|---|---|---|
| `src/data/providers.json` | 原 29 家的品牌名单、编辑顺序、推广链接 | 资料包导入生成 |
| `src/data/airports.json` | 资料包的结构化资料（基础层） | `import:package` 生成，不手改 |
| `src/data/brands.json` | **页面实际读取的品牌数据层**：基础层 + 「机场MD」资料批次，34 家 | `import:md` 生成，不手改 |
| `src/data/brand-md-rules.json` | 资料批次的品牌映射、优先级、发布方式、人工整理的待确认事项，以及卡片价格下方的优势（`highlights`：每家 2–3 条，逐条写明 `basis` 依据，`check:data` 会拦下价格、测速和稳定性说法） | 手工编辑后重新 `import:md` |
| `reports/md-import-<批次>.md` | 内部导入报告：逐家结果、链接核对、未解决冲突 | `import:md` 生成，不公开 |
| `materials/md-batch-<日期>/` | 资料批次 38 份原始 MD 的快照，不公开 | `import:md -- --snapshot` 生成 |
| `site.config.json` | 正式域名、IndexNow 密钥、Bing 验证值 | 手工编辑 |
| `src/data/pricing-images.json`、`public/assets/pricing/` | 7 家的套餐截图清单和公开图片（微风网络的不公开，见下一行） | 导入生成，原图在 `materials/package/assets/pricing/` |
| `src/data/hidden-pricing-images.json` | 站长决定不公开套餐截图的品牌（2026-11-06 起：微风网络）。价格仍按截图整理，截图清单照常记录，但导入时不生成公开图片，资料页不显示“套餐截图”一节 | 手工编辑。新增一家：加一条记录，再删掉 `public/assets/pricing/<id>/`（不删的话 `check:data` 会报错）。恢复公开：删掉记录，再重新导入资料包 |
| `src/data/editorial-order.json` | 29 家的编辑顺序 | 手工编辑 |
| `src/data/logo-overrides.json` | 单独替换的 Logo，图放在 `materials/logo-overrides/` | 手工编辑 |
| `src/data/logo-display.json`、`public/assets/logo-display/` | 页面实际使用的 Logo 展示图：按每家的裁切区域从原图裁好，卡片用 `card`（最大 1000×334），首页主推区和资料页用 `large`（最大 1200×400），文件名带内容哈希 | `npm run logos` 生成（`import:package` 会自动运行）；原图或裁切变了 `check:data` 会提示重新生成 |
| `src/data/og-images.json`、`public/assets/og/` | 每个可索引页面的分享图（1200×630），用于 `og:image` 和文章结构化数据的 `image` | `npm run og` 生成，见“分享图” |
| `src/content/airports/<id>.md` | 品牌评析：是否发布、标题、摘要、正文 | 手工编辑 |
| `src/content/guides/*.md` | 选购指南，路径 `/guides/<文件名>/`，模板见 `_template.md` | 手工编辑 |
| `src/content/compare/*.md` | 条件对比，路径 `/compare/<文件名>/` | 手工编辑 |
| `src/content/reviews/*.md` | 历史样本解读，路径 `/reviews/<文件名>/` | 手工编辑 |
| `src/content/pages/*.md` | 关于本站、编辑方法、推广说明的正文 | 手工编辑 |
| `src/config/site.ts` | 站名、文案、作者、说明页更新日期；联系方式 `contact`（站长邮箱，页脚和关于页“纠错”一节使用）；Telegram 和 GitHub 链接（`github` 为空时不显示图标）；首页站长主推品牌 `spotlight`，以及主推模块上方“为什么主推”简介的文案 `spotlight.why` | 手工编辑 |
| `src/components/BrandSpotlight.astro` | 首页“需求入口”上方的站长主推模块：价格、长周期折算、线路、规则和优惠码都从数据层读取，自带推广披露和资料日期。上方的“为什么主推”简介（AI 旁观视角）文案在 `site.spotlight.why`，数字写成 `{monthly}` 这类占位符，构建时换成数据层的值；取不到值、或引用的第三方测试已不在数据里时构建报错，要按新资料重写；换主推品牌时这段不显示 | 手工编辑 |
| `src/components/SiteFooter.astro` | 页脚两段式品牌介绍和四个固定链接（资料包 00/03 文件，2026-11-06）；“核心内容”一栏链接 6 篇支柱指南（`coreLinks`，`verify-dist` 会检查链接是否存在）；“本站说明”列表在“隐私说明”下面有 Telegram 文字链接和站长邮箱 | 手工编辑 |
| `src/pages/index.astro` | 首页各栏目，含品牌卡片前的“先理解条件，再开始比较”四张说明卡 | 手工编辑 |
| `materials/package/` | 资料包快照与 Logo 原图，不公开 | 导入生成 |

## 常见维护

**导入新版资料包**（校验哈希后写入，已有编辑稿不变）：

```bash
npm run import:package -- "<资料包目录>" "<providers.json 路径>"
```

目前的资料包是 `机场梦-内容测评与SEO完整包-2026-11-05`（2026-11-06 补了 13 家 Logo）。第二个参数可以传 `materials/providers.source.json` 的副本，不要直接传这个文件本身，导入时会把参数文件复制过去。导入资料包后再运行 `npm run import:md`，否则 `check:data` 会提示品牌数据层过期。

**导入「机场MD」资料批次**（源目录只读；重复运行结果相同；基础层或规则改动后要重跑）：

```bash
npm run import:md
```

不带参数时读取 `brand-md-rules.json` 里的 `defaultSourceDir`，找不到再用 `materials/` 里的快照；也可以 `npm run import:md -- "<目录>"`。合并规则：

- 站长确认的推广链接、8 折优惠规则、飞V 站长版本优先；7 家的价格以套餐截图为准，资料批次的不同数值只作候选。
- 其余品牌：与已有资料一致的记为复核一致；说法不同的保留已有值、标为冲突，不参与价格排序；新增的付款周期按“资料列示，未核验”加入。标价看起来算错的保留原值并标为存疑。
- 新收录品牌（榴莲云、闪电云、环球云、神行云、云界云）只在 `npm run build:drafts` 中出现，不参与编辑顺序、首页推荐、价格排序和 sitemap。要公开某一家，先核实资料，再改规则里的 `listing` 并补编辑顺序。
- `npm run check:data` 会同时运行 `scripts/check-brands.mjs`：34 份文件都有结果、ID 不重复、链接逐家匹配、价格周期流量口径、未知值逐字保留等。

**发布一家的详情页**：编辑 `src/content/airports/<id>.md`，写入独有的分析正文（至少 300 字），再运行 `npm run build`。未达到要求时构建会报错。品牌资料页顶部的“最后更新”、结构化数据的 `dateModified` 和 sitemap 的 `lastmod`，取正文 `updatedAt` 与这家资料批次日期（`mdSource.collectedOn`）中较晚的一个；来源列表里仍分开写“正文更新于”和资料批次日期。

```markdown
---
draft: false
summary: 准确概括本页的搜索摘要
publishedAt: 2026-11-05
updatedAt: 2026-11-05
---

这里写该品牌独有的分析和适用场景。
```

**发布文章**：把 `src/content/guides/_template.md` 复制为 `<英文短名>.md`，填写内容和真实日期，设置 `draft: false`。对比和样本文章用同样的字段，放进对应目录。`relatedPaths` 控制文末的相关内容，内容改动后要更新 `updatedAt`，sitemap 的 `lastmod` 读取这个日期。

**SEO 关键词计划**（站长本机的 `SEO_KEYWORD_PLAN.md`，不在仓库里）：站点角度写在 `src/config/site.ts` 的 `angle`：品牌型 + 新手陪伴型，以“我们”的语气写作，重点做图文新手教程和本站使用说明，推荐类大词改写为品牌介绍，不做第三方机场排行榜。2026-11-06 完成第 1 批：新增 5 篇（新手教程、订阅链接、Clash 下载、第三方客户端导入、机场梦使用说明），改写 3 篇旧文（连不上、测速、IEPL 和 IPLC 区别），网址不变。同日完成第 2 批：新增科学上网入门（支柱页）和便宜、稳定、ChatGPT、节点 4 篇推荐类长尾；“机场套餐推荐”改写自原来的月付年付对比文章，网址不变。推荐类文章不排名、不放推广链接，文中也写明这一点。同日完成第 3 批：机场推荐（`/guides/jichang-tuijian-zenme-kan/`）和梯子推荐（`/guides/tizi-shi-shenme/`）两篇品牌介绍支柱页；首页标题改为以品牌为主，“机场推荐”这个词只由前一篇承接。Clash Verge Rev 教程和 Clash 导入订阅两篇需要最新版客户端的真实截图，站长决定先不写（2026-11-06）。之后按计划第 6 节持续维护：推荐类页面在资料变化时更新，长尾文章陆续新增。`verify-dist` 会检查这些页面的主关键词位置、相关文章、最后更新日期、结构化数据和一词一页。正文里的“## 常见问题”会生成 FAQPage；frontmatter 写 `howTo: true` 的教程，会按“### 第 N 步：…”生成 HowTo。

**教程截图**：只截本站自己的页面。先 `npm run build` 并 `npm run preview`，再运行 `node scripts/capture-guide-shots.mjs`（用本机 Edge 或 Chrome 的无界面模式，宽 390px、2 倍清晰度）。原图存 `materials/guide-screenshots/<日期>/`，公开版本在 `public/assets/guides/`。界面改动后重新运行，图片尺寸变了要同步改文章里 `<img>` 的 width 和 height。只截其中几张时，把名称写在命令后面。文章里的 `<img>` 直接用脚本打印的写法：`srcset` 写像素宽度（例如 `780w`）并配 `sizes`。不要只写 `2x`，否则 1 倍屏会按原图像素放大显示；`verify-dist` 会拦下这种写法。截图的显示宽度由 `global.css` 里的 `.prose .shot img[width="390"]`、`[width="784"]` 决定，图片加载前就按这个宽度占位；新截图用了别的宽度时要补一条同样的规则，否则桌面上图片加载时下面的内容会跳动，`verify-dist` 也会报错。

**导入内容资料包**（默认不覆盖已有文章，`--overwrite` 才会重写，人工修改也会被覆盖）：

```bash
npm run import:content -- "<内容资料包目录>" --published-on YYYY-MM-DD
```

**补 Logo**：把新图放入资料包并更新 MD 的 `logoPath`、`logoCrop`、`logoSourceImageSize` 后重新导入。2026-11-06 起原有 29 家都有图，其中 13 家（星岛梦、光速云、U1S1、极连云、光年梯、Sogo云、宇宙云、二猫云、一翻云、边缘节点、可信云、速界、快狸）是机场梦设计的展示图：原图在资料包 `assets/logos/generated/`，状态记为 `blog-designed-not-official`，公开文件是 `public/assets/logos/<id>-blog-v1.webp`，详情页会注明不是官方标志。新收录的 5 家还没有图，显示品牌文字。

**单独换一家的 Logo**：把图放进 `materials/logo-overrides/`，在 `src/data/logo-overrides.json` 加一条记录，再重新导入。文件名要用新的，避免缓存显示旧图。

**Logo 展示图**（2026-11-06 起）：页面不再直接引用整张原图。原来几家的 Logo 拼在同一张源图里，每一页都要整张下载。现在 `npm run logos` 会按资料里记录的裁切区域（`logoCrop`），从 `materials/` 的原图里裁出每一家，生成卡片和大图两档。外框、前景完整显示、背景同图模糊铺满的写法不变，改前改后逐家截图比对过，外观一致。效果是目录页图片从 967KB 降到 556KB，单个资料页的 Logo 从几十到一百多 KB 降到 7–72KB。资料里的 `logoPath`、`logoCrop`、`logoSourceImageSize` 仍记录原图，`public/assets/logos/` 里的整张原图也照常导出（页面已不引用，`verify-dist` 会拦下引用它的页面）。

**分享图**：`npm run og` 用本机 Edge 为每个可索引页面渲染一张 1200×630 的分享图，放在 `public/assets/og/`，同时写入 `src/data/og-images.json`。图上有品牌标记、站名、栏目标签、页面标题和口号；品牌资料页还会放上和页面一样的 Logo 外框；首页那张写站名和口号。图上不印域名。运行前先 `npm run build` 和 `npm run preview`。改了页面标题、换了 Logo 或新增页面后要重新运行；`verify-dist` 会提醒哪些分享图过期了（只提醒，不中止构建）。没有专属图的页面用首页那张。`og:image` 和结构化数据里的图片地址只在正式构建（有正式域名）时输出。

**改说明页**：改完同步更新 `src/config/site.ts` 里的 `pageUpdatedOn`，sitemap 的 `lastmod` 只读这里。

**调整编辑顺序**：改 `src/data/editorial-order.json` 里的排列，再重新导入资料包并构建。

## 上线

默认的 `npm run build` 是预览版本：所有页面 noindex、没有 canonical、sitemap 为空。`npm run build:production` 才开放索引，正式域名和 IndexNow 密钥读取 `site.config.json`。

Cloudflare Pages 配置：

- 构建命令：`npm run build:production`。用后台默认的 `npm run build` 也可以：在 Cloudflare 的正式分支上构建时（环境变量 `CF_PAGES=1`，且分支等于 `site.config.json` 的 `productionBranch`，默认 `main`），会自动按正式版构建，开放索引并输出 canonical 和 sitemap。其他分支的预览部署仍然 noindex。判断逻辑在 `scripts/site-mode.mjs`，构建日志最后一行会写明用了哪种模式。正式分支不叫 `main` 时，要先改 `productionBranch`。
- 如果是在本机构建后再用 Direct Upload 上传，Cloudflare 不会参与判断，必须先运行 `npm run build:production`。
- 输出目录：`dist`
- 根目录：留空（仓库根目录）。
- Node 版本：Astro 7 需要 Node 22.23.4 以上。仓库根目录的 `.node-version`（26，和本机测试用的版本一致）会被 Cloudflare 自动读取；也可以在环境变量里设 `NODE_VERSION=26`。
- 依赖锁文件里的下载地址是 npmmirror（本机 npm 用的镜像），Cloudflare 一般也能正常下载。如果安装依赖时报超时，可以在环境变量里加 `NPM_CONFIG_REGISTRY=https://registry.npmjs.org/` 和 `NPM_CONFIG_REPLACE_REGISTRY_HOST=registry.npmmirror.com`。
- 响应头写在 `public/_headers`（只用 ASCII 字符）：`/_astro/` 下的文件名带内容哈希，长期缓存；`/assets/` 下的图片换图时常沿用原文件名（教程截图重新截取、资料包里的 Logo），只缓存一天，避免老访客看到旧图；全站加 `X-Content-Type-Options`、`Referrer-Policy` 和禁止被其他网站嵌入的 `X-Frame-Options: DENY`。HTTPS 跳转、www 与非 www 的统一和 HSTS 在 Cloudflare 后台设置。

上线后：

1. 确认首页源码是 `index,follow`，且 `/sitemap.xml` 列出正式地址。
2. 把 Bing Webmaster Tools 的验证值填入 `site.config.json` 的 `bingSiteVerification` 并重新部署，再在后台提交 sitemap。
3. 确认 `/<indexNowKey>.txt` 可访问。
4. 页面确有变化后通知 IndexNow。默认只预览，加 `--submit` 才发送，结果记录在 `logs/indexnow.jsonl`：

```bash
npm run indexnow -- --since 2026-11-05
```

提交成功只表示通知已送达，不代表页面被抓取或收录。

## 资料规则

构建校验（`scripts/check-data.mjs`、`scripts/verify-dist.mjs`）会拦下以下情况：

- 名单不是 29 家、编辑顺序不连续、前 14 位被改动，或推广链接与原始注册表不一致。
- 无忧优惠码不是 `woyou666`，或报价数量、冲突数量与资料包不符。
- 冲突报价参与排序，或报价缺少来源和日期。
- 草稿生成了公开页面，或 `internal` 内容、历史截图进入产物（截图决定不公开，原文件在 `materials/package/assets/tests/`）；决定不公开的套餐截图出现在产物或任何页面里。
- 页面的 title、description 重复，H1 不是一个，站内链接或锚点失效，推广链接缺少 `sponsored`。
- 正式模式下 canonical、robots 和 sitemap 不一致，或结构化数据缺少真实日期和作者。

写内容时还需注意：未实测不写速度和稳定性结论；未核实各家定价前，不写“通过推广链接不会加价”。
