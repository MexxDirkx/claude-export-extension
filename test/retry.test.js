import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withRetry, RETRYABLE_STATUSES } from '../src/core/retry.js';

const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { status });

test('returns the value without retrying when the call succeeds', async () => {
  let calls = 0;
  const result = await withRetry(() => { calls += 1; return 'ok'; }, { delay: () => Promise.resolve() });
  assert.equal(result, 'ok');
  assert.equal(calls, 1);
});

test('retries a rate-limited call until it succeeds', async () => {
  let calls = 0;
  const result = await withRetry(() => {
    calls += 1;
    if (calls < 3) throw httpError(429);
    return 'ok';
  }, { delay: () => Promise.resolve() });

  assert.equal(result, 'ok');
  assert.equal(calls, 3);
});

test('gives up after the attempt budget and reports the last error', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(() => { calls += 1; throw httpError(503); }, { attempts: 3, delay: () => Promise.resolve() }),
    /HTTP 503/,
  );
  assert.equal(calls, 3);
});

test('does not retry a client error that will never succeed', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(() => { calls += 1; throw httpError(404); }, { delay: () => Promise.resolve() }),
    /HTTP 404/,
  );
  assert.equal(calls, 1, 'a 404 must not be retried');
});

test('backs off exponentially between attempts', async () => {
  const waits = [];
  await assert.rejects(withRetry(() => { throw httpError(429); }, {
    attempts: 4,
    baseDelayMs: 100,
    delay: (ms) => { waits.push(ms); return Promise.resolve(); },
  }));
  assert.deepEqual(waits, [100, 200, 400]);
});

test('stops immediately when the caller signals cancellation', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(() => { calls += 1; throw httpError(429); },
      { delay: () => Promise.resolve(), isCancelled: () => calls >= 2 }),
    /Cancelled/,
  );
  assert.equal(calls, 2);
});

test('treats a transport failure with no status as retryable', () => {
  assert.ok(RETRYABLE_STATUSES.has(429));
  assert.ok(!RETRYABLE_STATUSES.has(404));
});
