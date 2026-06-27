// @ts-check
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import astro from 'eslint-plugin-astro'
import globals from 'globals'

// Flat config (ESLint 10). Isolated from the Electron app's .eslintrc.cjs (plan §2).
// Plain array form (not the deprecated tseslint.config() helper).
export default [
  { ignores: ['dist/', '.astro/', 'node_modules/', 'test-results/', 'playwright-report/'] },
  // Node.js globals for config files (astro.config.mjs, vitest.config.ts, playwright.config.ts)
  {
    files: ['*.mjs', '*.cjs', '*.config.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
]
