import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPool } from '../src/core/pool.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('processes every item', async () => {
  const seen = [];
  await runPool([1, 2, 3, 4, 5], 2, async (n) => { seen.push(n); });
  assert.deepEqual(seen.sort((a, b) => a - b), [1, 2, 3, 4, 5]);
});

test('never exceeds the concurrency limit', async () => {
  let active = 0;
  let peak = 0;
  await runPool(Array.from({ length: 20 }, (_, i) => i), 3, async () => {
    active += 1;
    peak = Math.max(peak, active);
    await tick();
    active -= 1;
  });
  assert.equal(peak, 3);
});

test('reports a failing item without stopping the rest', async () => {
  const done = [];
  const { failures } = await runPool([1, 2, 3], 2, async (n) => {
    if (n === 2) throw new Error('boom');
    done.push(n);
  });

  assert.deepEqual(done.sort(), [1, 3]);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].item, 2);
  assert.match(failures[0].error, /boom/);
});

test('reports progress as each item settles', async () => {
  const progress = [];
  await runPool([1, 2, 3], 1, async () => {}, { onProgress: (n) => progress.push(n) });
  assert.deepEqual(progress, [1, 2, 3]);
});

test('stops taking new work once cancelled', async () => {
  const seen = [];
  let cancelled = false;
  await runPool([1, 2, 3, 4, 5, 6], 1, async (n) => {
    seen.push(n);
    if (n === 2) cancelled = true;
  }, { isCancelled: () => cancelled });

  assert.deepEqual(seen, [1, 2]);
});

test('handles an empty work list', async () => {
  const { failures } = await runPool([], 4, async () => { throw new Error('never'); });
  assert.deepEqual(failures, []);
});
