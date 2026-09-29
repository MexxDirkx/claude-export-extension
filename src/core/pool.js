// Bounded-concurrency work pool.
//
// A few requests in flight keeps a large archive from taking many minutes,
// while staying far below anything the API would consider abusive. One item
// failing must never abandon the rest of the archive, so failures are collected
// and returned rather than thrown.

export async function runPool(items, concurrency, handler, options = {}) {
  const { onProgress = () => {}, isCancelled = () => false } = options;

  const queue = [...items];
  const failures = [];
  let completed = 0;

  const worker = async () => {
    while (queue.length > 0) {
      if (isCancelled()) return;
      const item = queue.shift();
      try {
        await handler(item);
      } catch (error) {
        failures.push({ item, error: error?.message ?? String(error) });
      }
      completed += 1;
      onProgress(completed, items.length);
    }
  };

  const width = Math.max(1, Math.min(concurrency, queue.length));
  await Promise.all(Array.from({ length: width }, worker));

  return { failures, completed };
}
