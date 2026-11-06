export interface BrandEntry {
  name: string;
  terms: string[];
  href: string;
}

/** 忽略大小写、空格和括号，使「FLY V」「flyv」「飞 V」都能命中同一品牌。 */
export const normalize = (text: string) => text.toLowerCase().replace(/[\s（）()·]/g, '');

export const termsMatch = (terms: string[], query: string) => {
  const needle = normalize(query);
  return needle.length > 0 && terms.some((term) => normalize(term).includes(needle));
};

export const matchBrands = (index: BrandEntry[], query: string) =>
  index.filter((brand) => termsMatch(brand.terms, query));
