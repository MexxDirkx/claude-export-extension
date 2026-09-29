// Retry policy for API calls.
//
// A bulk export makes one request per conversation, so transient rate limits
// are expected rather than exceptional. Statuses that can plausibly succeed on
// a second try are retried with exponential backoff; a 404 or 403 is not, since
// repeating it only delays an error the user needs to see.

export const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

const defaultDelay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry(fn, options = {}) {
  const {
    attempts = 4,
    baseDelayMs = 1000,
    delay = defaultDelay,
    isCancelled = () => false,
  } = options;

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (isCancelled()) throw new Error('Cancelled');
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      // A missing status means the request never reached the server (offline,
      // page navigated away); that is worth another try.
      const retryable = error?.status == null || RETRYABLE_STATUSES.has(error.status);
      if (!retryable || attempt === attempts) break;
      await delay(baseDelayMs * 2 ** (attempt - 1));
    }
  }
  if (isCancelled()) throw new Error('Cancelled');
  throw lastError;
}
