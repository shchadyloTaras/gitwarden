// Shared with SettingsScreen.tsx (Phase 105: live theme preview) — kept out of App.tsx
// to avoid a circular import (App.tsx renders SettingsScreen, which needs this too).
export function applyTheme(appearance: string): void {
  const root = document.documentElement
  if (appearance === 'light') {
    root.setAttribute('data-theme', 'light')
  } else if (appearance === 'dark') {
    root.setAttribute('data-theme', 'dark')
  } else {
    // system — follow OS preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
  }
}
