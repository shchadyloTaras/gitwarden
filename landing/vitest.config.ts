import { defineConfig } from 'vitest/config'

// Landing-local Vitest config — isolated from the Electron app's root vitest.config.ts.
// Without this, Vitest walks up and inherits the root config (whose `include` targets the
// app's tests/ dir), so landing's src/ tests would never be discovered.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
