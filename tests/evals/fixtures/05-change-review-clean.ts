import type { EvalFixture } from '../types'

export const fixture: EvalFixture = {
  name: 'change-review-clean',
  description: 'A clean refactor diff must not produce any false-positive findings (≤ 0 findings).',
  assistant: 'change-review',
  input: {
    diff: `diff --git a/src/core/safety/SafetyCheckService.ts b/src/core/safety/SafetyCheckService.ts
--- a/src/core/safety/SafetyCheckService.ts
+++ b/src/core/safety/SafetyCheckService.ts
@@ -12,10 +12,12 @@
-function check(profile: Profile, repo: RepositoryRecord): SafetyIssue[] {
+function checkProfileAssignment(
+  profile: Profile,
+  repo: RepositoryRecord,
+): SafetyIssue[] {
   const issues: SafetyIssue[] = []
   if (repo.profileId !== profile.id) {
     issues.push({ code: 'PROFILE_MISMATCH' })
   }
   return issues
 }`,
    context: 'Pure rename of a private function — no logic change.',
  },
  cannedResponse: {
    findings: [],
    overall: 'No issues found in this well-structured refactor.',
  },
  checks: {
    maxFindings: 0,
  },
}
