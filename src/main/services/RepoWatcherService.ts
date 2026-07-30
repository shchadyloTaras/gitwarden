// `.git` watcher (Phase 96, rename-proofed Phase 101, drop-proofed 2026-07-30) —
// instant external-change detection for the ACTIVE repo only. Reports four kinds:
// `head` (branch/detached-HEAD moves), `index` (stage/unstage), `config`
// (identity/remote edits), and `refs` (loose ref creation, deletion, fast-forward,
// plus `packed-refs`).
//
// The service does NOT decide what changed from the notification itself. Every
// notification — and a periodic safety-net tick — simply triggers one `check()` that
// re-reads a fingerprint (mtime + size + inode) of `HEAD`, `index`, `config`,
// `packed-refs` and the `refs/` tree, and emits an event only for the fingerprints
// that actually moved since the last check. Notifications are therefore a latency
// optimisation, not the source of truth, which is what makes the two silent failure
// modes of `fs.watch` survivable:
//
//   1. A notification can be DROPPED outright — FSEvents coalescing on macOS, a full
//      `ReadDirectoryChangesW` buffer on Windows. Both were observed here: the suite's
//      own staging test once waited a full 10s for a notification that never arrived
//      after `git add` had already returned. The safety-net tick catches it.
//   2. A notification can name NO entry — libuv reports the change against the watched
//      directory itself (a direct fs.watch experiment produced `change:.git` under
//      churn) or omits the filename entirely on platforms that don't supply one. The
//      previous implementation switched on that filename and silently dropped anything
//      it didn't recognise; `check()` never looks at it.
//
// Phase 96 originally watched `HEAD`/`index` via `fs.watch` on the FILES themselves —
// but git rewrites both via `*.lock` + `rename()`, and a per-file `fs.watch` follows
// the original inode: once that inode is replaced the watch is silently dead after its
// first event. Phase 101 moved to a DIRECTORY watch, which tracks entries by name and
// survives every rename. That is still how the watches are set up here; the fingerprint
// includes the inode for the same reason.
//
// Node's `fs.watch(dir, {recursive:true})` is unsupported on Linux (throws
// ERR_FEATURE_UNAVAILABLE_ON_PLATFORM) — `refs/` falls back to periodic stat-polling
// there, since a non-recursive watch would silently miss nested branch-name
// directories. Debounced ~400ms; a burst of index+refs churn from a single
// `git commit -a` collapses into (at most) one event per kind, not one per filesystem
// notification.
//
// Watches only ONE repo at a time: `watch()` always closes any previous watch first
// (the plan's own "watch ONLY the active repo" constraint), so the renderer never has
// to reason about multiple live watchers.

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

export interface RepoWatcherOptions {
  /**
   * How often to re-read `.git` regardless of notifications, in ms. This is the floor
   * on detection latency when the OS drops a notification entirely — not the normal
   * path, which stays notification-driven and ~400ms. Injectable so tests can prove
   * the safety net without waiting seconds for it.
   */
  safetyNetIntervalMs?: number
}

const DEBOUNCE_MS = 400
/** Stat-polling fallback interval for `refs/` on platforms without recursive `fs.watch`. */
const STAT_POLL_INTERVAL_MS = 400
/** Default for {@link RepoWatcherOptions.safetyNetIntervalMs}. */
const SAFETY_NET_INTERVAL_MS = 2000

interface Closeable {
  close(): void
}

/**
 * One thing worth watching, and the kind of change it represents. `read()` returns an
 * opaque fingerprint string; any difference between two reads means "this changed".
 */
interface Probe {
  id: string
  kind: RepoChangeKind
  read: () => string
}

/**
 * mtime + size + inode. The inode matters: git replaces `HEAD` and `index` by renaming
 * a `*.lock` file over them, so the entry can change identity while its size stays the
 * same — and on a filesystem with coarse timestamps, while its mtime does too.
 */
function fileFingerprint(file: string): string {
  try {
    const stats = fs.statSync(file)
    return `${stats.mtimeMs}:${stats.size}:${stats.ino}`
  } catch {
    // Absent is a state like any other: `packed-refs` appears on the first `git gc`,
    // `index` on the first `git add` in a fresh repo.
    return 'absent'
  }
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

/** Fingerprint of a whole directory tree: every file below `dir`, with its mtime. */
function dirFingerprint(dir: string): string {
  return [...snapshotDir(dir)]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([file, mtime]) => `${file}:${mtime}`)
    .join('|')
}

function probesFor(gitDir: string): Probe[] {
  return [
    { id: 'HEAD', kind: 'head', read: () => fileFingerprint(path.join(gitDir, 'HEAD')) },
    { id: 'index', kind: 'index', read: () => fileFingerprint(path.join(gitDir, 'index')) },
    { id: 'config', kind: 'config', read: () => fileFingerprint(path.join(gitDir, 'config')) },
    {
      id: 'packed-refs',
      kind: 'refs',
      read: () => fileFingerprint(path.join(gitDir, 'packed-refs')),
    },
    { id: 'refs', kind: 'refs', read: () => dirFingerprint(path.join(gitDir, 'refs')) },
  ]
}

/** Periodic stat-polling over every file under `dir` — the Linux fallback for a
 * recursive directory watch `fs.watch` doesn't support there. */
function startStatPolling(dir: string, onChange: () => void): Closeable {
  let last = dirFingerprint(dir)
  const interval = setInterval(() => {
    const next = dirFingerprint(dir)
    if (next !== last) {
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
 * Non-recursive watch on the `.git` DIRECTORY itself — rename-proof by construction (a
 * directory watch reports rename-replaced entries by name, so git's `*.lock` + `rename()`
 * pattern can no longer kill it after one event, unlike a per-file `fs.watch`). The
 * reported filename is deliberately ignored: it is unreliable (see the file header), and
 * the caller's `check()` establishes what actually changed. Tolerant of the directory
 * briefly not existing (never true for `.git` itself in practice, but matches the
 * defensive shape of the file-watch this replaces).
 */
function watchGitDirTopLevel(gitDir: string, onChange: () => void): Closeable {
  try {
    const watcher = fs.watch(gitDir, () => onChange())
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
  private readonly safetyNetIntervalMs: number

  private active: {
    watchers: Closeable[]
    debounceTimer: NodeJS.Timeout | null
    safetyNet: NodeJS.Timeout | null
  } | null = null

  constructor(options: RepoWatcherOptions = {}) {
    this.safetyNetIntervalMs = options.safetyNetIntervalMs ?? SAFETY_NET_INTERVAL_MS
  }

  watch(repoPath: string, sender: RepoWatchSender): void {
    this.unwatch()

    const gitDir = path.join(repoPath, '.git')
    const probes = probesFor(gitDir)
    // Baseline taken up front, so a notification replayed from just BEFORE this call
    // (macOS FSEvents does that) reports nothing rather than a phantom change.
    const lastSeen = new Map(probes.map((probe) => [probe.id, probe.read()]))

    const state = {
      watchers: [] as Closeable[],
      debounceTimer: null as NodeJS.Timeout | null,
      safetyNet: null as NodeJS.Timeout | null,
    }
    this.active = state

    /**
     * The single place an event can be born. Both the notification path and the safety
     * net run this against the same `lastSeen` state, so whichever observes a change
     * first consumes it and the other stays silent — one change, one event.
     */
    const check = (): void => {
      const changed: RepoChangeKind[] = []
      for (const probe of probes) {
        const current = probe.read()
        if (lastSeen.get(probe.id) === current) continue
        lastSeen.set(probe.id, current)
        if (!changed.includes(probe.kind)) changed.push(probe.kind)
      }
      if (changed.length === 0) return
      if (sender.isDestroyed?.()) return
      for (const kind of changed) {
        const validated = RepoChangedEventPayload.parse({ repoPath, kind })
        sender.send(REPO_CHANGED_CHANNEL, validated)
      }
    }

    const scheduleCheck = (): void => {
      if (state.debounceTimer) clearTimeout(state.debounceTimer)
      state.debounceTimer = setTimeout(() => {
        state.debounceTimer = null
        check()
      }, DEBOUNCE_MS)
    }

    state.watchers.push(
      watchGitDirTopLevel(gitDir, scheduleCheck),
      watchRefsDir(path.join(gitDir, 'refs'), scheduleCheck)
    )
    state.safetyNet = setInterval(check, this.safetyNetIntervalMs)
  }

  unwatch(): void {
    if (!this.active) return
    for (const watcher of this.active.watchers) watcher.close()
    if (this.active.debounceTimer) clearTimeout(this.active.debounceTimer)
    if (this.active.safetyNet) clearInterval(this.active.safetyNet)
    this.active = null
  }
}
