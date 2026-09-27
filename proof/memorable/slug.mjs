export function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function truncateSlug(s, n) {
  const slug = slugify(s);
  if (slug.length <= n) return slug;
  return slug.slice(0, n).replace(/-+$/, '');
}
