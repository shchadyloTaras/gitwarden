// Centralised user-facing strings for GitWarden UI.
// Safety-engine messages live in src/core/safety/safetyMessages.ts (pure module).

export const STR = {
  // ── App shell ──────────────────────────────────────────────────────────────
  APP_TITLE: 'GitWarden',

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
  PROFILE_CREATED: 'Profile created.',
  PROFILE_SAVED: 'Profile saved.',

  // ── Repositories screen ───────────────────────────────────────────────────
  REPOSITORY_SAVED: 'Repository saved.',

  // ── Settings screen ────────────────────────────────────────────────────────
  SETTINGS_TITLE: 'Settings',
  SETTINGS_APPEARANCE_LABEL: 'Appearance',
  SETTINGS_APPEARANCE_SYSTEM: 'System',
  SETTINGS_APPEARANCE_LIGHT: 'Light',
  SETTINGS_APPEARANCE_DARK: 'Dark',
  SETTINGS_APPEARANCE_HINT:
    'Controls whether GitWarden uses a light or dark colour scheme. System follows your OS setting.',
  SETTINGS_GIT_PATH_LABEL: 'Custom Git Path',
  SETTINGS_GIT_PATH_INPUT_LABEL: 'Path to git binary',
  SETTINGS_GIT_PATH_PLACEHOLDER: 'e.g. /usr/local/bin/git',
  SETTINGS_GIT_PATH_HINT:
    'Leave blank to auto-detect from PATH. Custom paths are used the next time GitWarden starts.',
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
  ONBOARDING_STEP_WELCOME_TITLE: 'Welcome to GitWarden',
  ONBOARDING_STEP_WELCOME_BODY:
    'GitWarden keeps daily Git work tied to the right profile. This quick tour points out where profiles, repositories, safety, and Git actions live.',
  ONBOARDING_STEP_HEADER_TITLE: 'Global header',
  ONBOARDING_STEP_HEADER_BODY:
    'Your current repository, branch, safety badge, and active profile stay visible here while you work.',
  ONBOARDING_STEP_NAV_TITLE: 'Navigation',
  ONBOARDING_STEP_NAV_BODY:
    'Manage covers profiles and repositories. Git covers status, commits, remotes, branches, history, and the Safety Center. App holds settings.',
  ONBOARDING_STEP_PROFILES_TITLE: 'Create profiles first',
  ONBOARDING_STEP_PROFILES_BODY:
    'Profiles hold your Git author name, email, GitHub username, SSH alias, and allowed remote hosts.',
  ONBOARDING_STEP_REPOS_TITLE: 'Add repositories',
  ONBOARDING_STEP_REPOS_BODY:
    'Add an existing local repository, then assign it to exactly one profile so GitWarden can catch identity mixups.',
  ONBOARDING_STEP_STATUS_TITLE: 'Review and stage changes',
  ONBOARDING_STEP_STATUS_BODY:
    'Status separates staged, unstaged, and untracked files. Pick a repository, inspect the diff, then stage only what belongs in the next commit.',
  ONBOARDING_STEP_COMMIT_TITLE: 'Commit with safety checks',
  ONBOARDING_STEP_COMMIT_BODY:
    'The Commit screen checks profile assignment, local Git identity, staged changes, conflicts, and message before enabling a commit.',
  ONBOARDING_STEP_REMOTE_TITLE: 'Push only after confirmation',
  ONBOARDING_STEP_REMOTE_BODY:
    'Remote operations use a confirmation sheet with branch, remote host, profile, identity, and safety blockers before anything leaves your machine.',
  ONBOARDING_STEP_SAFETY_TITLE: 'Use Safety Center',
  ONBOARDING_STEP_SAFETY_BODY:
    'Safety Center audits identity, remote host, branch, and profile assignment in one place. Its verdict matches the commit and push gates.',
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
  GITHUB_CONNECT_SAVE_FIRST: 'Save the profile before connecting a GitHub account.',
  GITHUB_MODAL_TITLE: 'Connect GitHub',
  GITHUB_MODAL_STARTING: 'Requesting a device code…',
  GITHUB_MODAL_ENTER_CODE: 'Enter this code at github.com/login/device:',
  GITHUB_MODAL_WAITING: 'Waiting for you to authorize on GitHub…',
  GITHUB_MODAL_OPEN_BTN: 'Open GitHub',
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
  AI_KEY_DETECT_HINT: 'GitWarden detects the provider from the key prefix.',
  AI_DETECTED_PROVIDER: (kind: string, confidence: string) =>
    `Detected: ${kind} (${confidence} confidence)`,
  AI_DETECTED_UNKNOWN: 'Unrecognized key — configure this under Advanced.',
  AI_BASEURL_LABEL: 'Base URL',
  AI_BASEURL_HINT_AMBIGUOUS:
    'This key shape is shared by several providers — confirm the base URL.',
  AI_BASEURL_HINT_LOCAL: 'Confirm the local server port (LM Studio defaults to 1234).',
  AI_MODEL_LABEL: 'Model',
  AI_MODEL_PLACEHOLDER: 'e.g. anthropic/claude-3.5-sonnet',
  AI_MODEL_HINT: 'Fetching models is the connection test. Local servers show all returned models.',
  AI_MODELS_FETCH: 'Fetch models',
  AI_MODELS_FETCHING: 'Fetching models…',
  AI_MODELS_READY: (count: number) => `${count} model${count === 1 ? '' : 's'} available.`,
  AI_MODELS_ERROR: 'Could not fetch models for this connection.',
  AI_NAME_LABEL: 'Connection name',
  AI_NAME_PLACEHOLDER: 'e.g. OpenRouter',
  AI_SAVE_CONNECTION: 'Save connection',
  AI_SAVED: 'Connection saved.',
  AI_SAVE_ERROR: 'Failed to save the connection.',
  AI_ENABLE_LABEL: 'Enable AI',
  AI_ENABLE_HINT:
    'Separate, deliberate step: turning this on allows repo content to be sent to the provider. Off by default.',
  AI_ENABLE_ON: 'AI enabled',
  AI_ENABLE_OFF: 'AI disabled',
  AI_CRED_LABEL: 'Stored credential',
  AI_CRED_MASKED: (preview: string) => `Key: ${preview}`,
  AI_CRED_NONE: 'No credential stored for this connection yet.',
  AI_CRED_DELETE: 'Remove credential',
  AI_CONN_ENABLED: 'Connection on',
  AI_CONN_DISABLED: 'Connection off',
  AI_CONN_DISABLE_BTN: 'Disable connection',
  AI_CONN_ENABLE_BTN: 'Enable connection',
  AI_CONN_DELETE_BTN: 'Delete connection',
  AI_CONN_DELETE_CONFIRM: 'Delete this connection and its credential?',
  AI_RETENTION_LABEL: 'Privacy',
  AI_RETENTION_LOCAL: 'Local connection — source stays on this machine (safest).',
  AI_RETENTION_ZERO: 'Endpoint attests zero retention / no training.',
  AI_RETENTION_UNKNOWN: 'Retention unknown — review before enabling AI.',
  AI_RETENTION_ACCEPTED: 'You accepted this endpoint’s retention terms.',
  AI_ADVANCED_LABEL: 'Advanced',
  AI_ADVANCED_HINT: 'Custom HTTP and manual base URL arrive with the adapter registry (Phase 30).',
  AI_REPO_OVERRIDE_LABEL: 'AI for the current repository',
  AI_REPO_OVERRIDE_HINT:
    'A per-repo override is the most specific control — it can force AI off for this repo even when AI is globally enabled.',
  AI_REPO_OVERRIDE_INHERIT: 'Inherit',
  AI_REPO_OVERRIDE_ON: 'Force on',
  AI_REPO_OVERRIDE_OFF: 'Force off',
  AI_REPO_OVERRIDE_NO_REPO: 'Select a repository to set a per-repo override.',

  // ── Inspector ──────────────────────────────────────────────────────────────
  INSPECTOR_TITLE: 'Inspector',
  INSPECTOR_NO_PROFILE: 'No profile selected',
  INSPECTOR_NO_REPO: 'No repository selected',
  INSPECTOR_NO_BRANCH: '—',

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  KB_NAV_HINT: 'Cmd+1–9 to navigate screens',
} as const
