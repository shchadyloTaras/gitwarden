import { rm } from 'fs/promises'

/**
 * Windows-safe teardown for a test's temp directory.
 *
 * A just-exited git process — or Defender / the search indexer scanning the pack files it
 * wrote — can keep a transient handle inside the directory for a few hundred ms after the
 * child's `close` event fires, even though nothing is really using it any more. On Windows
 * that surfaces as an EBUSY / EPERM / ENOTEMPTY rejection out of `afterEach`, which fails
 * the whole run (it took down the v0.7.1 and v0.7.2 release builds). Retry with backoff is
 * Node's own documented remedy: `rm` retries exactly those errno codes `maxRetries` times,
 * waiting `retryDelay` ms longer on each attempt.
 *
 * Every temp-dir cleanup in tests/unit and tests/integration goes through here so a new
 * test file cannot reintroduce the race by writing a bare `rm(dir, { recursive: true })`.
 */
export async function removeTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
}
