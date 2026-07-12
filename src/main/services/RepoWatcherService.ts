// `.git` watcher (Phase 96, rename-proofed Phase 101) — instant external-change
// detection for the ACTIVE repo only. Watches: the `.git` DIRECTORY itself
// (non-recursive, filtered by filename) for `HEAD` (branch/detached-HEAD moves),
// `index` (stage/unstage), `config` (identity/remote edits), and `packed-refs`
// (folded into the `refs` kind); plus `refs/` (recursive, so nested
// `refs/heads/feature/foo`-style names are covered) for loose ref creation,
// deletion, and fast-forward.
//
// Phase 96 originally watched `HEAD`/`index` via `fs.watch` on the FILES
// themselves — but git rewrites both via `*.lock` + `rename()` (write the new
// content to `HEAD.lock`, then rename it over `HEAD`), and a per-file `fs.watch`
// follows the original inode: once that inode is replaced, the watch is silently
// dead after its first event (masked in practice by the separate `refs/` watch
// surviving for branch-creating switches). A DIRECTORY watch instead tracks
// entries BY NAME, so a rename-in event is reported like any other change — it
// cannot be killed by git's lock-then-rename pattern, and every subsequent
// external change (the 2nd, 3rd, Nth `git switch`) is detected exactly like the
// first.
//
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

export type RepoChangeKind = 'head' | 'refs' | 'index' | 'config'

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
    // The watched directory can disappear out from under an active watch — the
    // user deletes/moves the repo, or (in tests) cleanup removes a fixture while
    // still watching it. Windows in particular then emits 'error' (EPERM) on the
    // watcher; EventEmitter throws an unhandled 'error' with no listener, which
    // would crash the whole process. The watch is stale either way — swallow it,
    // matching the setup-time catch above.
    watcher.on('error', () => {})
    return { close: () => watcher.close() }
  } catch {
    return startStatPolling(refsDir, onChange)
  }
}

/**
 * Non-recursive watch on the `.git` DIRECTORY itself, filtered by filename — rename-proof
 * by construction (a directory watch reports rename-replaced entries by name, so git's
 * `*.lock` + `rename()` pattern can no longer kill it after one event, unlike a per-file
 * `fs.watch`). Tolerant of the directory briefly not existing (never true for `.git`
 * itself in practice, but matches the defensive shape of the file-watch this replaces).
 */
function watchGitDirTopLevel(gitDir: string, onChange: (kind: RepoChangeKind) => void): Closeable {
  try {
    const watcher = fs.watch(gitDir, (_eventType, filename) => {
      switch (filename) {
        case 'HEAD':
          onChange('head')
          break
        case 'index':
          onChange('index')
          break
        case 'config':
          onChange('config')
          break
        case 'packed-refs':
          onChange('refs')
          break
        default:
          break
      }
    })
    // See the matching comment in `watchRefsDir` — the watched directory can go
    // away out from under an active watch; don't let an unhandled 'error' crash
    // the process over a now-stale watch.
    watcher.on('error', () => {})
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
      watchGitDirTopLevel(gitDir, (kind) => scheduleEmit(kind)),
      watchRefsDir(path.join(gitDir, 'refs'), () => scheduleEmit('refs'))
    )
  }

  unwatch(): void {
    if (!this.active) return
    for (const watcher of this.active.watchers) watcher.close()
    if (this.active.debounceTimer) clearTimeout(this.active.debounceTimer)
    this.active = null
  }
}
