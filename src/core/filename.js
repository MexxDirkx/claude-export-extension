// Turns conversation metadata into filesystem-safe names.

const MAX_SLUG = 60;

export function conversationBasename(conversation) {
  const date = (conversation?.created_at ?? '').slice(0, 10);
  // Emoji-only and blank titles slugify to nothing; the uuid stem keeps such
  // conversations distinguishable instead of colliding on the date alone.
  const slug = truncate(slugify(conversation?.name ?? ''))
    || String(conversation?.uuid ?? '').slice(0, 8)
    || 'conversation';
  return [date, slug].filter(Boolean).join('-');
}

function truncate(slug) {
  if (slug.length <= MAX_SLUG) return slug;
  const cut = slug.slice(0, MAX_SLUG);
  const lastBreak = cut.lastIndexOf('-');
  return (lastBreak > 20 ? cut.slice(0, lastBreak) : cut).replace(/-+$/, '');
}

function slugify(text) {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function uniqueName(base, taken) {
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}
