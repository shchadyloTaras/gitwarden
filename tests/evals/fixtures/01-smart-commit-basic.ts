import type { EvalFixture } from '../types'

export const fixture: EvalFixture = {
  name: 'smart-commit-basic',
  description: 'Commit subject ≤ 50 chars, imperative mood, no file names in subject, no secrets.',
  assistant: 'commit-draft',
  input: {
    diff: `diff --git a/src/core/ai/context.ts b/src/core/ai/context.ts
new file mode 100644
--- /dev/null
+++ b/src/core/ai/context.ts
@@ -0,0 +1,28 @@
+import type { AiMessage } from './types.js'
+
+/** Builds a redacted context payload for an AI request. Pure — no I/O. */
+export class ContextBuilder {
+  constructor(private readonly maxChars: number = 8_000) {}
+
+  build(messages: AiMessage[]): string {
+    const raw = messages.map(m => \`\${m.role}: \${m.content}\`).join('\\n')
+    return raw.length > this.maxChars ? raw.slice(0, this.maxChars) : raw
+  }
+}`,
    context: 'Work profile repo. Staged: new file src/core/ai/context.ts',
  },
  cannedResponse: {
    conventional: 'feat(core): add type-safe context builder',
    plain: 'Add type-safe context builder',
    summary:
      'Introduces ContextBuilder for building redacted AI context objects in the main process.',
  },
  checks: {
    conventionalMaxLength: 50,
    imperativeMood: true,
    noFileNamesInSubject: true,
    noSecrets: true,
  },
}
