import type { EvalFixture } from '../types'

export const fixture: EvalFixture = {
  name: 'smart-commit-specific',
  description:
    'A dependency-bump diff must produce a specific message, not a generic "chore: update".',
  assistant: 'commit-draft',
  input: {
    diff: `diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -22,7 +22,7 @@
-    "eslint": "^8.0.0",
+    "eslint": "^8.57.0",`,
    context: 'package.json dependency version bump only.',
  },
  cannedResponse: {
    conventional: 'chore(deps): bump eslint from 8.0.0 to 8.57.0',
    plain: 'Bump eslint to 8.57.0',
    summary: 'Upgrades ESLint from 8.0.0 to 8.57.0, picking up security fixes in rule parsing.',
  },
  checks: {
    conventionalMaxLength: 50,
    // Subject must NOT be a bare generic "chore: update" with nothing else
    notMatchingPattern: '^chore:\\s*update\\s*$',
  },
}
