export function slugFromUrl(url: string): string {
  const path = url.replace(/^https?:\/\/[^/]+/, '').replace(/\/+$/, '');
  const segs = path.split('/').filter(Boolean);
  if (segs[0] === 'uk' || segs[0] === 'es') segs.shift();
  const slug = segs[segs.length - 1];
  if (!slug) throw new Error(`cannot derive slug from url: ${url}`);
  return slug;
}
