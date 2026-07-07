// `.git` watcher (Phase 96) — instant external-change detection for the ACTIVE repo
// only. Watches three targets inside `.git`: `HEAD` (branch/detached-HEAD moves),
// `refs` (branch/tag creation, deletion, fast-forward — recursive so nested
// `refs/heads/feature/foo`-style names are covered), and `index` (stage/unstage).
// Node's `fs.watch(dir, {recursive:true})` is unsupported on Linux (throws
// ERR_FEATURE_UNAVAILABLE_ON_PLATFORM) — `refs/` falls back to periodic
// stat-polling there, since a non-recursive watch would silently miss nested
// branch-name directories. Debounced ~400ms; a burst of index+refs churn from a
// single `git commit -a` collapses into (at most) one event per kind, not one per
// filesystem notification.
//
// Watches only ONE repo at a time: `watch()` always closes any previous watch
// first (the plan's own "watch ONLY the active repo" constraint), so the renderer
// never has to reason about multiple live watchers.

import fs from 'node:fs'
import path from 'node:path'
import { RepoChangedEventPayload } from '../ipc/ipc-schemas.js'

export type RepoChangeKind = 'head' | 'refs' | 'index'

export const REPO_CHANGED_CHANNEL = 'repo:changed'

/** The minimal Electron WebContents surface needed to push watch events. */
export interface RepoWatchSender {
  send(channel: string, payload: unknown): void
  isDestroyed?(): boolean
}

export interface IRepoWatcherService {
  /** Start watching `repoPath`, closing any previously-watched repo first. */
  watch(repoPath: string, sender: RepoWatchSender): void
  /** Stop watching, if anything is currently watched. Safe to call when idle. */
  unwatch(): void
}

const DEBOUNCE_MS = 400
/** Stat-polling fallback interval for `refs/` on platforms without recursive `fs.watch`. */
const STAT_POLL_INTERVAL_MS = 400

interface Closeable {
  close(): void
}

function snapshotDir(dir: string): Map<string, number> {
  const result = new Map<string, number>()
  const walk = (current: string): void => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      try {
        result.set(full, fs.statSync(full).mtimeMs)
      } catch {
        // removed between readdir and stat — treat as absent, not a crash
      }
    }
  }
  walk(dir)
  return result
}

function snapshotsDiffer(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return true
  for (const [file, mtime] of a) {
    if (b.get(file) !== mtime) return true
  }
  return false
}

/** Periodic stat-polling over every file under `dir` — the Linux fallback for a
 * recursive directory watch `fs.watch` doesn't support there. */
function startStatPolling(dir: string, onChange: () => void): Closeable {
  let last = snapshotDir(dir)
  const interval = setInterval(() => {
    const next = snapshotDir(dir)
    if (snapshotsDiffer(last, next)) {
      last = next
      onChange()
    }
  }, STAT_POLL_INTERVAL_MS)
  return { close: () => clearInterval(interval) }
}

/** Recursive watch on `refs/` where supported; stat-polling fallback otherwise. */
function watchRefsDir(refsDir: string, onChange: () => void): Closeable {
  try {
    const watcher = fs.watch(refsDir, { recursive: true }, () => onChange())
    return { close: () => watcher.close() }
  } catch {
    return startStatPolling(refsDir, onChange)
  }
}

/** Watches a single file; a no-op Closeable if the target doesn't exist (e.g. a
 * brand-new repo's `.git/index` before the first `git add`). */
function watchFileIfExists(filePath: string, onChange: () => void): Closeable {
  try {
    const watcher = fs.watch(filePath, () => onChange())
    return { close: () => watcher.close() }
  } catch {
    return { close: () => {} }
  }
}

export class RepoWatcherService implements IRepoWatcherService {
  private active: {
    watchers: Closeable[]
    debounceTimer: NodeJS.Timeout | null
    pendingKinds: Set<RepoChangeKind>
  } | null = null

  watch(repoPath: string, sender: RepoWatchSender): void {
    this.unwatch()

    const gitDir = path.join(repoPath, '.git')
    const pendingKinds = new Set<RepoChangeKind>()
    const state = {
      watchers: [] as Closeable[],
      debounceTimer: null as NodeJS.Timeout | null,
      pendingKinds,
    }
    this.active = state

    const scheduleEmit = (kind: RepoChangeKind): void => {
      pendingKinds.add(kind)
      if (state.debounceTimer) clearTimeout(state.debounceTimer)
      state.debounceTimer = setTimeout(() => {
        state.debounceTimer = null
        const kinds = [...pendingKinds]
        pendingKinds.clear()
        if (sender.isDestroyed?.()) return
        for (const emittedKind of kinds) {
          const validated = RepoChangedEventPayload.parse({ repoPath, kind: emittedKind })
          sender.send(REPO_CHANGED_CHANNEL, validated)
        }
      }, DEBOUNCE_MS)
    }

    state.watchers.push(
      watchFileIfExists(path.join(gitDir, 'HEAD'), () => scheduleEmit('head')),
      watchRefsDir(path.join(gitDir, 'refs'), () => scheduleEmit('refs')),
      watchFileIfExists(path.join(gitDir, 'index'), () => scheduleEmit('index'))
    )
  }

  unwatch(): void {
    if (!this.active) return
    for (const watcher of this.active.watchers) watcher.close()
    if (this.active.debounceTimer) clearTimeout(this.active.debounceTimer)
    this.active = null
  }
}
