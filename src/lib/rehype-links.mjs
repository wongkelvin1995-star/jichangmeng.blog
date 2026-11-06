// 正文 HTML 的统一处理。
// 链接：推广链接标记 sponsored，其他站外链接新窗口打开并加保护；只改属性，href（含 hash 里的邀请参数）保持原样。
// 表格：包一层可横向滚动的容器，窄屏时只滚动表格，不撑宽页面。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const providers = JSON.parse(readFileSync(resolve('src/data/providers.json'), 'utf8')).providers;
const affiliateHosts = new Set(providers.map((provider) => new URL(provider.affiliateUrl).host));

function walk(node) {
  if (node.type === 'element' && node.tagName === 'a' && /^https?:\/\//.test(node.properties?.href ?? '')) {
    const { host } = new URL(node.properties.href);
    node.properties.rel = affiliateHosts.has(host) ? 'sponsored noopener' : 'noopener';
    node.properties.target = '_blank';
  }
  const children = node.children ?? [];
  children.forEach((child, index) => {
    walk(child);
    if (child.type === 'element' && child.tagName === 'table') {
      children[index] = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['table-wrap', 'table-wrap--article'] },
        children: [child],
      };
    }
  });
}

export default function rehypeLinks() {
  return (tree) => walk(tree);
}
