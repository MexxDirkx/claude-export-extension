import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectAllPages } from '../src/core/paginate.js';

const pager = (pages) => async (offset, limit) => {
  const items = pages.slice(offset, offset + limit);
  return { items, hasMore: offset + limit < pages.length };
};

test('collects every item across pages', async () => {
  const all = Array.from({ length: 73 }, (_, i) => ({ uuid: `c${i}` }));
  const collected = await collectAllPages(pager(all), { pageSize: 30 });
  assert.equal(collected.length, 73);
  assert.equal(collected[72].uuid, 'c72');
});

test('handles an account with no conversations', async () => {
  assert.deepEqual(await collectAllPages(pager([]), { pageSize: 30 }), []);
});

test('reports how many have been found so far', async () => {
  const counts = [];
  await collectAllPages(pager(Array.from({ length: 70 }, (_, i) => i)), {
    pageSize: 30,
    onProgress: (n) => counts.push(n),
  });
  assert.deepEqual(counts, [30, 60, 70]);
});

test('stops when a page comes back empty even if hasMore stays true', async () => {
  let calls = 0;
  const stuck = async () => { calls += 1; return { items: [], hasMore: true }; };
  assert.deepEqual(await collectAllPages(stuck, { pageSize: 30 }), []);
  assert.equal(calls, 1, 'an empty page must end the loop rather than spin forever');
});

test('stops taking pages once cancelled', async () => {
  const all = Array.from({ length: 200 }, (_, i) => i);
  let seen = 0;
  const collected = await collectAllPages(async (offset, limit) => {
    seen += 1;
    return { items: all.slice(offset, offset + limit), hasMore: offset + limit < all.length };
  }, { pageSize: 30, isCancelled: () => seen >= 2 });

  assert.equal(collected.length, 60);
});
