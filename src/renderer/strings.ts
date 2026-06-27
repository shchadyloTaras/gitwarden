// Centralised user-facing strings for Git Warden UI.
// Safety-engine messages live in src/core/safety/safetyMessages.ts (pure module).

export const STR = {
  // ── App shell ──────────────────────────────────────────────────────────────
  APP_TITLE: 'Git Warden',
  LEFT_PANEL_RESIZE_LABEL: 'Resize navigation panel',
  RIGHT_PANEL_RESIZE_LABEL: 'Resize context panel',
  REPOSITORIES_SPLIT_RESIZE_LABEL: 'Resize repository list',
  PROFILES_SPLIT_RESIZE_LABEL: 'Resize profile list',
  STATUS_SPLIT_RESIZE_LABEL: 'Resize changes list',

  // ── Header guard badge ─────────────────────────────────────────────────────
  // Reports repo/profile/Git-identity alignment only — never commit/push safety.
  GUARD_READY: 'Guard · Ready',
  GUARD_REVIEW: 'Guard · Review',
  GUARD_BLOCKED: 'Guard · Blocked',
  GUARD_CHECKING: 'Guard · Checking',
  GUARD_NOT_CHECKED: 'Guard · Not checked',
  GUARD_OPEN_SAFETY_CENTER: 'Open Safety Center',
  GUARD_OPEN_REPOSITORIES: 'Open Repositories',

  // ── Navigation ─────────────────────────────────────────────────────────────
  NAV_REPOSITORIES: 'Repositories',
  NAV_STATUS: 'Status',
  NAV_COMMIT: 'Commit',
  NAV_REMOTE: 'Remote',
  NAV_BRANCHES: 'Branches',
  NAV_HISTORY: 'History',
  NAV_SAFETY_CENTER: 'Safety Center',
  NAV_PROFILES: 'Profiles',
  NAV_SETTINGS: 'Settings',

  // ── Common ─────────────────────────────────────────────────────────────────
  BTN_SAVE: 'Save',
  BTN_CANCEL: 'Cancel',
  BTN_DELETE: 'Delete',
  BTN_CONFIRM: 'Confirm',
  BTN_BROWSE: 'Browse…',
  LOADING: 'Loading…',
  NO_REPO_SELECTED: 'Select a repository to continue.',

  // ── Profiles screen ───────────────────────────────────────────────────────
  PROFILE_ACTIVE: 'Active',
  PROFILE_SET_ACTIVE: 'Set Active',
  PROFILE_CREATED: 'Profile created.',
  PROFILE_SAVED: 'Profile saved.',
  PROFILE_DISPLAYNAME_REQUIRED: 'Enter a display name to connect a GitHub account.',
  PROFILE_CREATED_NOT_CONNECTED: 'Profile saved as a draft — GitHub not connected.',

  // ── Repositories screen ───────────────────────────────────────────────────
  REPOSITORY_SAVED: 'Repository saved.',
  REPOSITORY_PATH_COPY: 'Copy path',
  REPOSITORY_PATH_COPIED: 'Copied',

  // ── Settings screen ────────────────────────────────────────────────────────
  SETTINGS_TITLE: 'Settings',
  SETTINGS_TAB_GENERAL: 'General',
  SETTINGS_TAB_GIT: 'Git',
  SETTINGS_TAB_AI: 'AI Assistant',
  SETTINGS_TAB_WALKTHROUGH: 'Walkthrough',
  SETTINGS_APPEARANCE_LABEL: 'Appearance',
  SETTINGS_APPEARANCE_SYSTEM: 'System',
  SETTINGS_APPEARANCE_LIGHT: 'Light',
  SETTINGS_APPEARANCE_DARK: 'Dark',
  SETTINGS_APPEARANCE_HINT:
    'Controls whether Git Warden uses a light or dark colour scheme. System follows your OS setting.',
  SETTINGS_GIT_PATH_LABEL: 'Custom Git Path',
  SETTINGS_GIT_PATH_INPUT_LABEL: 'Path to git binary',
  SETTINGS_GIT_PATH_PLACEHOLDER: 'e.g. /usr/local/bin/git',
  SETTINGS_GIT_PATH_HINT:
    'Leave blank to auto-detect from PATH. Custom paths are used the next time Git Warden starts.',
  SETTINGS_GIT_PATH_VALIDATE: 'Validate',
  SETTINGS_GIT_PATH_VALIDATING: 'Validating…',
  SETTINGS_GIT_PATH_CLEAR: 'Clear',
  SETTINGS_DEFAULT_FOLDER_LABEL: 'Default Projects Folder',
  SETTINGS_DEFAULT_FOLDER_INPUT_LABEL: 'Folder for new local repositories',
  SETTINGS_DEFAULT_FOLDER_PLACEHOLDER: 'e.g. /Users/alice/Projects',
  SETTINGS_DEFAULT_FOLDER_HINT:
    'Used as the starting folder for repository workflows that need a project location.',
  SETTINGS_DEFAULT_FOLDER_CLEAR: 'Clear',
  SETTINGS_SAVE: 'Save Settings',
  SETTINGS_SAVED: 'Settings saved.',
  SETTINGS_SAVE_ERROR: 'Failed to save settings.',
  SETTINGS_GIT_VALID: (version: string) => `Valid — ${version}`,
  SETTINGS_GIT_INVALID: 'Not a valid git executable.',
  SETTINGS_GIT_VALIDATE_HINT: 'Enter a path to validate it, or leave blank to use auto-detect.',
  SETTINGS_ONBOARDING_LABEL: 'Walkthrough',
  SETTINGS_ONBOARDING_HINT: 'Run the guided introduction again.',
  SETTINGS_ONBOARDING_START: 'Start Walkthrough',

  // ── Onboarding walkthrough ────────────────────────────────────────────────
  ONBOARDING_PROGRESS: (current: number, total: number) => `${current} of ${total}`,
  ONBOARDING_SKIP: 'Skip',
  ONBOARDING_BACK: 'Back',
  ONBOARDING_NEXT: 'Next',
  ONBOARDING_FINISH: 'Finish',
  ONBOARDING_STEP_WELCOME_TITLE: 'Welcome to Git Warden',
  ONBOARDING_STEP_WELCOME_BODY:
    'Git Warden keeps daily Git work tied to the right profile. This quick tour points out profiles, repositories, safety checks, Git actions, and the AI assistant.',
  ONBOARDING_STEP_HEADER_TITLE: 'Global header',
  ONBOARDING_STEP_HEADER_BODY:
    'Pick the active repository and branch, watch the safety badge, see your profile, and open AI chat from here while you work.',
  ONBOARDING_STEP_NAV_TITLE: 'Navigation',
  ONBOARDING_STEP_NAV_BODY:
    'Manage covers profiles and repositories. Git covers status, commits, remotes, branches, history, and the Safety Center. Settings holds appearance, Git path, AI connections, and this walkthrough.',
  ONBOARDING_STEP_PROFILES_TITLE: 'Create profiles first',
  ONBOARDING_STEP_PROFILES_BODY:
    'Profiles hold your Git author name, email, GitHub username, SSH alias, and allowed remote hosts. Connect GitHub on a profile to auto-fill identity and verify pushes.',
  ONBOARDING_STEP_REPOS_TITLE: 'Add repositories',
  ONBOARDING_STEP_REPOS_BODY:
    'Add an existing local repository, then assign it to exactly one profile so Git Warden can catch identity mixups.',
  ONBOARDING_STEP_STATUS_TITLE: 'Review and stage changes',
  ONBOARDING_STEP_STATUS_BODY:
    'Status separates staged, unstaged, and untracked files. Pick a repository, inspect the diff, then stage only what belongs in the next commit.',
  ONBOARDING_STEP_COMMIT_TITLE: 'Commit with safety checks',
  ONBOARDING_STEP_COMMIT_BODY:
    'The Commit screen checks profile assignment, local Git identity, staged changes, conflicts, and message before enabling a commit. An optional AI helper can draft commit messages here.',
  ONBOARDING_STEP_REMOTE_TITLE: 'Push only after confirmation',
  ONBOARDING_STEP_REMOTE_BODY:
    'Remote operations use a confirmation sheet with branch, remote host, profile, identity, and safety blockers before anything leaves your machine.',
  ONBOARDING_STEP_SAFETY_TITLE: 'Use Safety Center',
  ONBOARDING_STEP_SAFETY_BODY:
    'Safety Center audits identity, remote host, branch, and profile assignment in one place. Its verdict matches the commit and push gates.',
  ONBOARDING_STEP_AI_CHAT_TITLE: 'Ask Git Warden AI',
  ONBOARDING_STEP_AI_CHAT_BODY:
    'Open AI chat for repo-aware help: ask questions, run slash-commands like /commit or /review, and get push briefs or failure explanations. Paste an API key inline or configure providers in Settings.',
  ONBOARDING_STEP_AI_SETTINGS_TITLE: 'Connect an AI provider',
  ONBOARDING_STEP_AI_SETTINGS_BODY:
    'The AI Assistant tab is where you paste an API key, pick a model, and save. Saving a key enables AI across the app — including the chat panel and the commit helper.',
  ONBOARDING_STEP_SETTINGS_TITLE: 'Replay any time',
  ONBOARDING_STEP_SETTINGS_BODY:
    'The walkthrough stays available here, so you can rerun it after setup or share the app with someone new.',

  // ── Status screen — discard tracked changes ────────────────────────────────
  DISCARD_TRACKED_LABEL: 'Discard',
  DISCARD_TRACKED_CONFIRM_PROMPT: 'Discard?',
  DISCARD_TRACKED_CONFIRM_BTN: 'Yes, discard',
  DISCARD_TRACKED_CANCEL_BTN: 'Cancel',
  DISCARD_TRACKED_TITLE: (filePath: string) => `Discard changes to "${filePath}"?`,
  DISCARD_TRACKED_BODY:
    'This reverts the file to its last committed state. Unsaved edits will be lost.',

  // ── Status screen — delete untracked files (IRREVERSIBLE) ─────────────────
  DELETE_UNTRACKED_LABEL: 'Delete',
  DELETE_UNTRACKED_CONFIRM_PROMPT: '⚠ Delete?',
  DELETE_UNTRACKED_CONFIRM_BTN: '⚠ Delete permanently',
  DELETE_UNTRACKED_CANCEL_BTN: 'Cancel',
  DELETE_UNTRACKED_TITLE: (filePath: string) => `Permanently delete "${filePath}"?`,
  DELETE_UNTRACKED_BODY:
    'This file is untracked. Deleting it removes it from disk permanently — it cannot be recovered from Git.',

  // ── Connect GitHub (OAuth Device Flow) ─────────────────────────────────────
  GITHUB_SECTION_LABEL: 'GitHub Account',
  GITHUB_CONNECT_BTN: 'Connect GitHub',
  GITHUB_CONNECT_HINT:
    'Link this profile to a GitHub account to auto-fill its identity and verify pushes.',
  GITHUB_CONNECT_NEW_HINT:
    'Connecting saves this profile as a draft, then GitHub fills in the identity.',
  GITHUB_IDENTITY_MISMATCH: (expected: string, actual: string) =>
    `Authorized as @${actual}, but this profile expected @${expected}. Verify this is the right account.`,
  GITHUB_MODAL_TITLE: 'Connect GitHub',
  GITHUB_MODAL_STARTING: 'Requesting a device code…',
  GITHUB_MODAL_ENTER_CODE: 'Enter this code at github.com/login/device:',
  GITHUB_MODAL_WAITING: 'Waiting for you to authorize on GitHub…',
  GITHUB_MODAL_OPEN_BTN: 'Open GitHub',
  GITHUB_MODAL_COPY_BTN: 'Copy',
  GITHUB_MODAL_COPIED: 'Copied!',
  GITHUB_MODAL_COPY_CODE_LABEL: 'Copy device code',
  GITHUB_MODAL_CANCEL_BTN: 'Cancel',
  GITHUB_MODAL_CLOSE_BTN: 'Close',
  GITHUB_MODAL_SUCCESS_TITLE: 'Connected',
  GITHUB_MODAL_SUCCESS: (login: string) => `Authorized as @${login}.`,
  GITHUB_MODAL_DENIED: 'Authorization was denied on GitHub.',
  GITHUB_MODAL_EXPIRED: 'The device code expired. Start again to get a new one.',
  GITHUB_MODAL_REAUTH:
    'The stored GitHub token is no longer valid. Reconnect to re-authorize this profile.',
  GITHUB_MODAL_ERROR: 'Something went wrong while connecting. Please try again.',
  GITHUB_MODAL_RETRY_BTN: 'Try Again',
  GITHUB_LINKED_BADGE_LABEL: 'Linked GitHub',
  GITHUB_LINKED_AS: (login: string) => `@${login}`,
  GITHUB_LINKED_CONNECTED_AT: (iso: string) => `Connected ${new Date(iso).toLocaleDateString()}`,
  GITHUB_RECONNECT_BTN: 'Reconnect',
  GITHUB_DISCONNECT_BTN: 'Disconnect',
  GITHUB_DISCONNECT_CONFIRM_PROMPT: 'Disconnect this GitHub account?',
  GITHUB_DISCONNECT_CONFIRM_BTN: 'Disconnect',
  GITHUB_DISCONNECT_CANCEL_BTN: 'Cancel',
  GITHUB_DISCONNECT_HINT:
    'This removes the local token and opens GitHub so you can fully revoke access there.',
  GITHUB_REAUTH_NOTICE: 'GitHub token invalid — reconnect required.',

  // ── Remote push — HTTPS-token line ─────────────────────────────────────────
  PUSH_GH_LABEL: 'GitHub push',
  PUSH_GH_VERIFYING: 'Verifying GitHub token…',
  PUSH_GH_AS: (login: string, matches: boolean): string =>
    `Pushing as @${login} via HTTPS token — ${matches ? 'matches' : 'does NOT match'} assigned profile ${matches ? '✓' : '✗'}`,
  PUSH_GH_NO_TOKEN: 'No HTTPS token stored for the assigned profile.',
  PUSH_GH_TOKEN_INVALID: 'Stored GitHub token was rejected — reconnect required.',
  PUSH_GH_NOT_CONNECTED: 'Assigned profile has no linked GitHub account.',

  // ── Settings → AI (token-first single active connection) ───────────────────
  AI_SECTION_LABEL: 'AI Assistant',
  AI_SECTION_HINT:
    'Paste an API key to set up a single AI connection. Nothing is sent until you separately enable AI.',
  AI_KEY_INPUT_LABEL: 'API key',
  AI_KEY_PLACEHOLDER: 'sk-…  ·  sk-or-…  ·  sk-ant-…  ·  gsk_…',
  AI_KEY_DETECT_HINT: 'Git Warden detects the provider from the key prefix.',
  AI_DETECTED_PROVIDER: (kind: string, confidence: string) =>
    `Detected: ${kind} (${confidence} confidence)`,
  AI_DETECTED_UNKNOWN: 'Unrecognized key — configure this under Advanced.',
  AI_BASEURL_LABEL: 'Base URL',
  AI_BASEURL_HINT_AMBIGUOUS:
    'This key shape is shared by several providers — confirm the base URL.',
  AI_BASEURL_HINT_LOCAL: 'Confirm the local server port (LM Studio defaults to 1234).',
  AI_MODEL_LABEL: 'Model',
  AI_MODEL_PLACEHOLDER: 'e.g. anthropic/claude-3.5-sonnet',
  AI_MODEL_HINT:
    'The model list loads automatically when you save a key. Local servers show all returned models.',
  AI_MODELS_FETCHING: 'Fetching models…',
  AI_MODELS_LOADING: 'Loading models…',
  AI_MODELS_READY: (count: number) => `${count} model${count === 1 ? '' : 's'} available.`,
  AI_MODELS_ERROR: 'Could not fetch models for this connection.',
  DROPDOWN_SEARCH_PLACEHOLDER: 'Search models…',
  DROPDOWN_NO_MATCHES: 'No matching models',
  AI_SAVE_CONNECTION: 'Save connection',
  AI_SAVED: 'Connection saved.',
  AI_SAVE_ERROR: 'Failed to save the connection.',
  AI_CRED_LABEL: 'Stored credential',
  AI_CRED_MASKED: (preview: string) => `Key: ${preview}`,
  AI_CRED_NONE: 'No credential stored for this connection yet.',
  AI_CRED_CHANGE: 'Change key',
  AI_CRED_SAVE_KEY: 'Save key',
  AI_FETCH_NEEDS_KEY: 'Save an API key to load models.',
  AI_CONN_DELETE_BTN: 'Delete connection',
  AI_CONN_DELETE_CONFIRM: 'Delete this connection and its credential?',
  AI_PREVIEW_HOST: (host: string) => `Destination: ${host}`,
  AI_PREVIEW_PAYLOAD_LABEL: 'Post-redaction payload',
  AI_PREVIEW_REDACTIONS: (count: number) => `${count} redaction${count === 1 ? '' : 's'} applied.`,
  AI_PREVIEW_TRUNCATED: (omitted: number) =>
    `Preview truncated after redaction (${omitted} chars omitted).`,
  AI_PREVIEW_ERROR: 'Could not prepare the AI preview.',
  AI_USAGE_ESTIMATE: (inputTokens: number) =>
    `Estimated usage: ~${inputTokens.toLocaleString()} input tokens.`,
  AI_USAGE_EXPENSIVE_WARNING: 'This request is estimated to be expensive.',
  AI_USAGE_OVER_CAP: 'This request exceeds the per-request token cap and cannot be sent.',
  AI_EXPENSIVE_SEND_ACK_LABEL:
    'I understand this request is estimated to be expensive and want to send it anyway.',
  AI_COMMIT_ASSISTANT_HINT:
    'AI drafts the commit message from your staged changes. It only writes the message — it never commits, and you choose whether to use it.',
  AI_COMMIT_DRAFT_TOGGLE: '✨ Draft with AI',
  AI_COMMIT_DRAFT_CLOSE: 'Close',
  AI_COMMIT_DRAFT_BUTTON: 'Draft message',
  AI_COMMIT_DRAFT_REGENERATE: 'Regenerate',
  AI_COMMIT_DRAFT_LOADING: 'Drafting…',
  AI_COMMIT_DRAFT_ERROR: 'Could not draft a commit message.',
  AI_COMMIT_DRAFT_CONVENTIONAL: 'Conventional',
  AI_COMMIT_DRAFT_PLAIN: 'Plain',
  AI_COMMIT_DRAFT_SUMMARY: 'Summary',
  AI_COMMIT_DRAFT_BODY: 'Body',
  AI_COMMIT_INSERT: 'Insert',

  // ── AI Chat panel (Phase 54) ───────────────────────────────────────────────
  CHAT_TAB_CONTEXT: 'Context',
  CHAT_TAB_CHAT: 'AI Chat',
  CHAT_HEADER_TITLE: 'AI Chat',
  CHAT_OPEN_LABEL: 'Open AI chat',
  CHAT_INPUT_PLACEHOLDER: 'Ask about this repo, / for commands',
  CHAT_SEND: 'Send message',
  CHAT_STOP: 'Stop generating',
  CHAT_CLEAR: 'New chat',
  CHAT_EMPTY: 'Ask anything about this repository',
  CHAT_COMMANDS_TITLE: 'Commands',
  CHAT_THINKING: 'Thinking…',
  CHAT_YOU: 'You',
  CHAT_ASSISTANT: 'Git Warden AI',
  CHAT_PROPOSAL_APPLY: 'Apply edits',
  CHAT_PROPOSAL_APPLIED: 'Edits applied',
  CHAT_SUGGESTED: 'Suggested',
  CHAT_SETUP_TITLE: 'Connect an AI provider',
  CHAT_SETUP_HINT:
    'Paste an API key to set up a connection. Git Warden detects the provider and stores the key encrypted on this machine.',
  CHAT_SETUP_OPEN_SETTINGS: 'Advanced setup in Settings',
  CHAT_MODEL_LABEL: 'Model',
  CHAT_CAPABILITY_STRUCTURED_PARSE_ERROR:
    'The model returned an unexpected response. Try again or pick a model that supports structured JSON output.',

  // ── AI Chat — review findings card (Generative UI) ─────────────────────────
  REVIEW_NO_FINDINGS: 'No findings.',
  REVIEW_CONFIDENCE_HIGH: 'High',
  REVIEW_CONFIDENCE_MEDIUM: 'Medium',
  REVIEW_CONFIDENCE_LOW: 'Low',

  // ── Safety Copilot (Phase 34) ──────────────────────────────────────────────
  SAFETY_COPILOT_EXPLAIN_BTN: 'Explain this',
  SAFETY_COPILOT_SUGGESTED_ACTION: 'Suggested next step',
  SAFETY_COPILOT_SOURCE_DETERMINISTIC: 'Deterministic explanation',
  SAFETY_COPILOT_SOURCE_AI: 'AI-enhanced explanation',
  SAFETY_COPILOT_ENHANCE_BTN: 'Enhance with AI',
  SAFETY_COPILOT_AI_LOADING: 'Enhancing…',
  SAFETY_COPILOT_PREVIEW_LOADING: 'Loading preview…',
  SAFETY_COPILOT_PREVIEW_ERROR: 'Could not load the send preview.',
  SAFETY_COPILOT_AI_ERROR: 'Could not enhance the explanation with AI.',
  SAFETY_ACTION_LABELS: {
    'set-local-identity': 'Set local identity',
    'switch-active-profile': 'Switch active profile',
    'assign-repo-profile': 'Assign repository profile',
    'reconnect-github': 'Reconnect GitHub',
    'stage-changes': 'Stage changes',
    'write-commit-message': 'Write commit message',
    'resolve-conflicts': 'Resolve conflicts',
    'configure-remote': 'Configure remote',
    'review-staged-changes': 'Review staged changes',
    'switch-branch': 'Switch branch',
    'edit-push-policy': 'Edit push policy',
  },

  // ── Push Brief & History Intelligence (Phase 35) ───────────────────────────
  PUSH_BRIEF_TITLE: 'Push brief',
  PUSH_BRIEF_LOADING: 'Summarizing commits to publish…',
  PUSH_BRIEF_ERROR: 'Could not build the push brief.',
  PUSH_BRIEF_SOURCE_DETERMINISTIC: 'Deterministic summary',
  PUSH_BRIEF_SOURCE_AI: 'AI-enhanced summary',
  PUSH_BRIEF_ENHANCE_BTN: 'Enhance with AI',
  PUSH_BRIEF_AI_LOADING: 'Enhancing…',
  PUSH_BRIEF_PREVIEW_LOADING: 'Loading preview…',
  PUSH_BRIEF_PREVIEW_ERROR: 'Could not load the send preview.',
  PUSH_BRIEF_AI_ERROR: 'Could not enhance the push brief with AI.',
  HISTORY_SUMMARY_TITLE: 'History intelligence',
  HISTORY_SUMMARY_OPEN_BTN: 'Summarize history',
  HISTORY_SUMMARY_LOADING: 'Building history summary…',
  HISTORY_SUMMARY_ERROR: 'Could not build the history summary.',
  HISTORY_SUMMARY_RELEASE_NOTES: 'Release notes draft',
  HISTORY_SUMMARY_BRANCH_ACTIVITY: 'Branch activity',
  HISTORY_SUMMARY_CHANGELOG: 'Changelog draft',
  HISTORY_SUMMARY_SOURCE_DETERMINISTIC: 'Deterministic draft',
  HISTORY_SUMMARY_SOURCE_AI: 'AI-enhanced draft',
  HISTORY_SUMMARY_ENHANCE_BTN: 'Enhance with AI',
  HISTORY_SUMMARY_AI_LOADING: 'Enhancing…',
  HISTORY_SUMMARY_PREVIEW_LOADING: 'Loading preview…',
  HISTORY_SUMMARY_PREVIEW_ERROR: 'Could not load the send preview.',
  HISTORY_SUMMARY_AI_ERROR: 'Could not enhance the history summary with AI.',

  REPO_ONBOARDING_TITLE: 'How do I work on this repo?',
  REPO_ONBOARDING_OPEN_BTN: 'Open repo guide',
  REPO_ONBOARDING_LOADING: 'Building repo guide…',
  REPO_ONBOARDING_ERROR: 'Could not build the repo guide.',
  REPO_ONBOARDING_INCLUDED_FILES: 'Included files (allowlisted)',
  REPO_ONBOARDING_BUILD_COMMANDS: 'Likely build commands',
  REPO_ONBOARDING_TEST_COMMANDS: 'Likely test commands',
  REPO_ONBOARDING_ENHANCE_BTN: 'Enhance with AI',
  REPO_ONBOARDING_AI_LOADING: 'Enhancing…',
  REPO_ONBOARDING_PREVIEW_ERROR: 'Could not load the send preview.',
  REPO_ONBOARDING_AI_ERROR: 'Could not enhance the repo guide with AI.',
  REPO_ONBOARDING_SOURCE_DETERMINISTIC: 'Deterministic guide',
  REPO_ONBOARDING_SOURCE_AI: 'AI-enhanced guide',

  FAILURE_EXPLAIN_TITLE: 'Explain failure',
  FAILURE_EXPLAIN_HINT: 'Paste test or lint output for suggested next steps.',
  FAILURE_EXPLAIN_PLACEHOLDER: 'Paste failing test/lint/build output…',
  FAILURE_EXPLAIN_BUTTON: 'Explain output',
  FAILURE_EXPLAIN_LOADING: 'Explaining…',
  FAILURE_EXPLAIN_ERROR: 'Could not explain the output.',
  FAILURE_EXPLAIN_ACTION_HINT: 'Suggested next step',
  FAILURE_EXPLAIN_ENHANCE_BTN: 'Enhance with AI',
  FAILURE_EXPLAIN_AI_ERROR: 'Could not enhance the explanation with AI.',

  AGENTIC_TITLE: 'Agentic assistant (preview)',
  AGENTIC_HINT: 'AI may propose allowlisted file edits — nothing runs without your confirmation.',
  AGENTIC_PROMPT_PLACEHOLDER: 'Describe what you want help with…',
  AGENTIC_PROPOSE_BUTTON: 'Propose actions',
  AGENTIC_PROPOSE_LOADING: 'Proposing…',
  AGENTIC_PROPOSE_ERROR: 'Could not generate a proposal.',
  AGENTIC_REJECT_BUTTON: 'Reject',
  AGENTIC_CONFIRM_BUTTON: 'Confirm file edits',
  AGENTIC_EXECUTING: 'Applying…',
  AGENTIC_EXECUTED: 'Applied file edits.',
  AGENTIC_PREVIEW_REQUIRED: 'Show what will be sent before requesting agentic proposals.',
  AGENTIC_FILE_EDITS: 'Proposed file edits',
  AGENTIC_ACTIONS: 'Suggested actions',

  // ── Push Policy editor (RepositoriesScreen) ───────────────────────────────
  PUSH_POLICY_SECTION_TITLE: 'Push Policy',
  PUSH_POLICY_SECTION_HINT:
    'Controls which branches are allowed, which are protected, and which remote this repo should push to.',
  PUSH_POLICY_ENABLE_LABEL: 'Enable push policy for this repository',
  PUSH_POLICY_MODE_LABEL: 'Mode',
  PUSH_POLICY_MODE_UNRESTRICTED: 'Unrestricted (blocked patterns only)',
  PUSH_POLICY_MODE_BRANCH_SCOPED: 'Branch scoped (allowed list required)',
  PUSH_POLICY_ALLOWED_LABEL: 'Allowed branch patterns',
  PUSH_POLICY_ALLOWED_HINT:
    'One pattern per line. * = one segment, ** = any depth. Required in Branch Scoped mode.',
  PUSH_POLICY_BLOCKED_LABEL: 'Protected branch patterns',
  PUSH_POLICY_BLOCKED_HINT: 'Always enforced in both modes. e.g. main, release/*',
  PUSH_POLICY_EXPECTED_OWNER_LABEL: 'Expected remote owner',
  PUSH_POLICY_EXPECTED_OWNER_PLACEHOLDER: 'e.g. client-org',
  PUSH_POLICY_EXPECTED_REPO_LABEL: 'Expected remote repo',
  PUSH_POLICY_EXPECTED_REPO_PLACEHOLDER: 'e.g. project',
  PUSH_POLICY_GITHUB_ACTOR_LABEL: 'Expected GitHub actor (optional)',
  PUSH_POLICY_GITHUB_ACTOR_PLACEHOLDER: 'e.g. taras-work',
  PUSH_POLICY_GITHUB_ACTOR_HINT:
    'For HTTPS pushes, verified against the stored token. SSH actor is assumed — not verified locally.',
  PUSH_POLICY_PREFIX_LABEL: 'Suggested branch prefix (optional)',
  PUSH_POLICY_PREFIX_PLACEHOLDER: 'e.g. client-x/taras/',

  // ── Branch Access block (push sheet + Safety Center) ─────────────────────
  BRANCH_ACCESS_SECTION_TITLE: 'Branch Access',
  BRANCH_ACCESS_CURRENT_BRANCH_LABEL: 'Current branch',
  BRANCH_ACCESS_VERDICT_ALLOWED: '✓ Allowed',
  BRANCH_ACCESS_VERDICT_BLOCKED: '✗ Blocked — use a Pull Request',
  BRANCH_ACCESS_VERDICT_UNRESTRICTED: '✓ Unrestricted',
  BRANCH_ACCESS_MODE_LABEL: 'Policy mode',
  BRANCH_ACCESS_ALLOWED_PATTERNS_LABEL: 'Allowed patterns',
  BRANCH_ACCESS_BLOCKED_PATTERNS_LABEL: 'Protected patterns',
  BRANCH_ACCESS_NO_POLICY: 'No push policy configured.',
  BRANCH_ACCESS_SSH_ACTOR_LABEL: 'Pushing as (SSH)',
  BRANCH_ACCESS_SSH_ACTOR_UNVERIFIED: (actor: string): string =>
    `@${actor} — assumed from policy, unverified`,
  BRANCH_ACCESS_ENFORCEMENT_NOTE:
    'GitWarden enforces this locally. Ask the repo owner to set GitHub branch protection for real enforcement.',

  // ── Branch badge (BranchesScreen) ─────────────────────────────────────────
  BRANCH_BADGE_ALLOWED: 'allowed',
  BRANCH_BADGE_BLOCKED: 'blocked',
  BRANCH_BADGE_SUGGESTED_PREFIX: (prefix: string): string => `Suggested prefix: ${prefix}`,

  // ── Inspector ──────────────────────────────────────────────────────────────
  INSPECTOR_TITLE: 'Inspector',
  INSPECTOR_NO_PROFILE: 'No profile selected',
  INSPECTOR_NO_REPO: 'No repository selected',
  INSPECTOR_NO_BRANCH: '—',

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  KB_NAV_HINT: 'Cmd+1–9 to navigate screens',
} as const
