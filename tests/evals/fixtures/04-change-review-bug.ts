import type { EvalFixture } from '../types'

export const fixture: EvalFixture = {
  name: 'change-review-bug',
  description: 'A diff with an obvious off-by-one error must produce ≥ 1 finding.',
  assistant: 'change-review',
  input: {
    diff: `diff --git a/src/core/utils/counter.ts b/src/core/utils/counter.ts
--- a/src/core/utils/counter.ts
+++ b/src/core/utils/counter.ts
@@ -1,7 +1,9 @@
 export function sumArray(arr: number[]): number {
   let total = 0
-  for (let i = 0; i < arr.length; i++) {
+  for (let i = 0; i <= arr.length; i++) {
     total += arr[i]
   }
   return total
 }`,
    context: 'Loop bounds changed from < to <=, causing out-of-bounds access.',
  },
  cannedResponse: {
    findings: [
      {
        category: 'risky-file',
        source: 'ai',
        confidence: 'medium',
        file: 'src/core/utils/counter.ts',
        why: 'Loop condition uses `i <= arr.length` which reads arr[arr.length] — always undefined. Change to `i < arr.length`.',
      },
    ],
    overall: 'Found a potential off-by-one error in the loop bounds.',
  },
  checks: {
    minFindings: 1,
  },
}
