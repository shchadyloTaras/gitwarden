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

  // ── Inspector ──────────────────────────────────────────────────────────────
  INSPECTOR_TITLE: 'Inspector',
  INSPECTOR_NO_PROFILE: 'No profile selected',
  INSPECTOR_NO_REPO: 'No repository selected',
  INSPECTOR_NO_BRANCH: '—',

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  KB_NAV_HINT: 'Cmd+1–9 to navigate screens',
} as const
