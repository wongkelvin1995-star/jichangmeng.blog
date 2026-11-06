// 品牌 Logo 展示图（站长 2026-11-06 要求：减小 Logo 体积，Logo 与外框保持一致）。
// 按资料里每家记录的裁切区域（logoCrop）从原图裁出这一家，缩到外框够用的尺寸（最大 1200×400，不放大），文件名带内容哈希。
// 页面的 3:1 外框、前景完整显示、背景同图模糊铺满的几何关系不变（BrandLogo.astro），
// 只是不再整张下载多家拼在一起的源图。资料里的 logoPath、logoCrop、logoSourceImageSize 仍记录原图，不改。
//
// 原图位置：资料包快照 materials/package/assets/logos/（含 generated/、replacements/），站长替换图 materials/logo-overrides/。
// 用法：npm run logos。import:package 导入资料包后会自动运行。
// 输出：public/assets/logo-display/<品牌>-<哈希>.webp 和 src/data/logo-display.json。
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..');
// 两档尺寸，按外框实际显示大小定（2026-11-06 实测）：
// - card：目录和首页卡片，外框约 346px（桌面）/ 324px（手机）。三倍屏手机要约 972×324 像素，两倍屏桌面约 692 像素。
// - large：首页主推区（外框 522px，两倍屏约 1044×348 像素）和品牌资料页。
// 都不放大原图；压缩质量与原来导出整图时相同（82）。
const VARIANTS = { card: { width: 1000, height: 334 }, large: { width: 1200, height: 400 } };
const QUALITY = 82;

const airports = JSON.parse(readFileSync(join(root, 'src', 'data', 'airports.json'), 'utf8'));
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

// 按文件名（不含扩展名）找原图：公开文件 /assets/logos/<名>.webp 对应原图 <名>.png 或替换图 <名>.webp。
const sources = new Map();
const walk = (dir) => {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(png|webp|jpe?g)$/i.test(name)) {
      const key = name.replace(/\.[^.]+$/, '');
      sources.set(key, [...(sources.get(key) ?? []), path]);
    }
  }
};
walk(join(root, 'materials', 'package', 'assets', 'logos'));
walk(join(root, 'materials', 'logo-overrides'));

const outDir = join(root, 'public', 'assets', 'logo-display');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const manifest = {};
let before = 0;
let after = 0;
const usedSources = new Map();
for (const airport of airports) {
  if (!airport.logoPath) continue;
  const key = basename(airport.logoPath).replace(/\.[^.]+$/, '');
  const found = sources.get(key) ?? [];
  if (found.length !== 1) throw new Error(`${airport.id} 的 Logo 原图${found.length ? '不唯一' : '找不到'}：${key}`);
  const source = found[0];
  const { logoCrop: crop, logoSourceImageSize: size } = airport;
  const meta = await sharp(source).metadata();
  if (meta.width !== size.width || meta.height !== size.height) {
    throw new Error(`${airport.id} 的原图尺寸 ${meta.width}×${meta.height} 与资料记录 ${size.width}×${size.height} 不一致，裁切会错位`);
  }
  const entry = { source: relative(root, source).replaceAll('\\', '/'), sourceSha256: sha256(readFileSync(source)), crop };
  for (const [variant, box] of Object.entries(VARIANTS)) {
    const { data, info } = await sharp(source)
      .extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height })
      .resize({ ...box, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALITY, effort: 6 })
      .toBuffer({ resolveWithObject: true });
    // 文件名按内容哈希：小图两档内容相同时共用一个文件；换图后文件名一定会变，不会被缓存成旧图。
    const name = `${airport.id}-${sha256(data).slice(0, 8)}.webp`;
    if (!existsSync(join(outDir, name))) {
      writeFileSync(join(outDir, name), data);
      after += data.length;
    }
    entry[variant] = { src: `/assets/logo-display/${name}`, width: info.width, height: info.height, bytes: data.length };
  }
  manifest[airport.id] = entry;
  const publicFile = join(root, 'public', airport.logoPath);
  if (existsSync(publicFile)) usedSources.set(airport.logoPath, statSync(publicFile).size);
}
for (const bytes of usedSources.values()) before += bytes;

const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(join(root, 'src', 'data', 'logo-display.json'), JSON.stringify(sorted, null, 2) + '\n');
const cardTotal = Object.values(sorted).reduce((sum, item) => sum + item.card.bytes, 0);
console.log(`Logo 展示图：${Object.keys(sorted).length} 家，文件共 ${Math.round(after / 1024)}KB；目录页 ${Object.keys(sorted).length} 张卡片图合计 ${Math.round(cardTotal / 1024)}KB（原来引用的整图 ${usedSources.size} 张，共 ${Math.round(before / 1024)}KB）`);
