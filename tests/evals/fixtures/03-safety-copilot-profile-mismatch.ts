import type { EvalFixture } from '../types'

export const fixture: EvalFixture = {
  name: 'safety-copilot-profile-mismatch',
  description:
    'Safety Copilot must detect PROFILE_MISMATCH when active profile differs from the repo assignment.',
  assistant: 'safety-copilot',
  input: {
    safetyCode: 'PROFILE_MISMATCH',
    activeProfile: 'Personal',
    assignedProfile: 'Work',
    context: 'User has the Personal profile active but is committing to a repo assigned to Work.',
  },
  // cannedResponse is the AI-enhanced explanation text (used in live mode).
  // In offline mode the deterministic path is exercised directly instead.
  cannedResponse: {
    explanation:
      'You are committing to a repository assigned to your Work profile, but your currently active profile is Personal. Switch to the Work profile to ensure the correct author name, email, and GitHub account are used.',
  },
  checks: {
    codeEquals: 'PROFILE_MISMATCH',
    suggestedActionIn: ['switch-active-profile', 'assign-repo-profile'],
  },
}
