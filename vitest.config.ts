import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/evals/**/*.test.ts',
    ],
    // Much of this suite is integration-shaped: a single test chains a dozen or more REAL
    // git process spawns against a temp repo. Process creation on a loaded Windows CI
    // runner is roughly an order of magnitude slower than on macOS/Linux, so vitest's
    // 5000ms default is a coin flip there rather than a real signal — it has now failed
    // two release builds (v0.7.1, v0.7.2) on tests that pass everywhere else. These
    // ceilings are a hang detector, not a performance budget; the suite's slowest file
    // runs ~24s in total on Windows CI.
    testTimeout: 30_000,
    // Teardown retries a Windows file-handle race with backoff (tests/fixtures/tempDir.ts),
    // which alone can spend ~4.5s before it gives up — past the 10s hook default once the
    // fixture setup's own git spawns are added.
    hookTimeout: 30_000,
  },
})
