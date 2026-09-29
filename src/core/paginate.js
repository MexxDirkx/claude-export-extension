// Walks an offset-paged list endpoint to completion.
//
// The loop trusts an empty page over the server's has_more flag: a flag that
// stays true while pages come back empty would otherwise spin forever.

export async function collectAllPages(fetchPage, options = {}) {
  const { pageSize = 30, onProgress = () => {}, isCancelled = () => false } = options;

  const collected = [];
  for (let offset = 0; ; offset += pageSize) {
    if (isCancelled()) break;

    const { items = [], hasMore = false } = await fetchPage(offset, pageSize);
    collected.push(...items);
    onProgress(collected.length);

    if (items.length === 0 || !hasMore) break;
  }
  return collected;
}
