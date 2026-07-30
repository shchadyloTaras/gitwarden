import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, writeFile, readFile, rename } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import * as os from 'os'
import * as path from 'path'
import fs from 'node:fs'
import { EventEmitter } from 'node:events'
import {
  RepoWatcherService,
  type RepoWatchSender,
} from '../../src/main/services/RepoWatcherService'
import { removeTempDir } from '../fixtures/tempDir'

const execFileAsync = promisify(execFile)

async function git(repoPath: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', repoPath, ...args])
  return stdout.trim()
}

// The ceiling is a hang detector, not a performance budget: waitUntil returns the instant
// the predicate holds, so a generous default costs a healthy run nothing and only lengthens
// the path to an honest failure. 3000ms was too tight — fs.watch delivery plus the service's
// ~400ms debounce, multiplied by a suite running a dozen files in parallel, made this file
// fail intermittently on a developer Mac and would do so far more readily on Windows CI,
// where fs.watch is markedly less prompt.
async function waitUntil(
  predicate: () => boolean,
  timeoutMs = 10_000,
  intervalMs = 50
): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition')
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

interface RecordedEvent {
  repoPath: string
  kind: 'head' | 'refs' | 'index' | 'config'
}

function recordingSender(events: RecordedEvent[]): RepoWatchSender {
  return {
    send: (_channel: string, payload: unknown) => events.push(payload as RecordedEvent),
    isDestroyed: () => false,
  }
}

// Phase 96 (W4 full), rename-proofed Phase 101: RepoWatcherService watches ONLY the
// active repo's .git directory (HEAD/index/config, via one non-recursive directory
// watch — Phase 101) and .git/refs (recursive), debounces (~400ms), and reports which
// target changed — established by re-reading the targets' fingerprints, not by trusting
// the filename the OS put on the notification (2026-07-30). Offline (real fixture repos,
// no network) — external git operations via child_process prove the watch actually
// fires, with the right kind.
describe('RepoWatcherService (Phase 96, Phase 101)', () => {
  let tmpDir: string
  let repoPath: string
  let service: RepoWatcherService
  let events: RecordedEvent[]
  let sender: RepoWatchSender

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'gitwarden-repo-watcher-'))
    repoPath = path.join(tmpDir, 'repo')
    await execFileAsync('git', ['init', '-b', 'main', repoPath])
    await git(repoPath, 'config', 'user.name', 'Test User')
    await git(repoPath, 'config', 'user.email', 'test@example.com')
    await writeFile(path.join(repoPath, 'a.txt'), 'a\n')
    await git(repoPath, 'add', 'a.txt')
    await git(repoPath, 'commit', '-m', 'init')

    events = []
    sender = recordingSender(events)
    service = new RepoWatcherService()
  })

  afterEach(async () => {
    service.unwatch()
    await removeTempDir(tmpDir)
  })

  it('fires a head event when the branch is switched externally', async () => {
    service.watch(repoPath, sender)

    await git(repoPath, 'checkout', '-b', 'feature')

    await waitUntil(() => events.some((e) => e.kind === 'head'))
    expect(events.some((e) => e.repoPath === repoPath && e.kind === 'head')).toBe(true)
  })

  // ── Phase 101: rename-proof directory watch ─────────────────────────────────

  it('three atomic rename-rewrites of HEAD produce THREE events — the old per-file watch produced only one', async () => {
    service.watch(repoPath, sender)
    const headPath = path.join(repoPath, '.git', 'HEAD')
    const original = await readFile(headPath, 'utf8')

    // Mirrors git's own HEAD-update mechanism: write the new content to a lock
    // file, then rename it over HEAD. A per-file fs.watch follows the ORIGINAL
    // inode and dies after the first such rename; a directory watch tracks the
    // entry by name and survives every one.
    for (let i = 0; i < 3; i++) {
      const lockPath = `${headPath}.lock`
      await writeFile(lockPath, original)
      await rename(lockPath, headPath)
      await waitUntil(() => events.filter((e) => e.kind === 'head').length === i + 1)
      // Let the debounce window fully close so the next rename counts as a
      // separate event instead of collapsing into the same window.
      await new Promise((r) => setTimeout(r, 450))
    }

    expect(events.filter((e) => e.kind === 'head')).toHaveLength(3)
  })

  it('three real git switches between existing branches each fire head — not just the first', async () => {
    await git(repoPath, 'branch', 'feature-a')
    await git(repoPath, 'branch', 'feature-b')
    service.watch(repoPath, sender)

    await git(repoPath, 'switch', 'feature-a')
    await waitUntil(() => events.filter((e) => e.kind === 'head').length >= 1)
    await new Promise((r) => setTimeout(r, 450))

    await git(repoPath, 'switch', 'feature-b')
    await waitUntil(() => events.filter((e) => e.kind === 'head').length >= 2)
    await new Promise((r) => setTimeout(r, 450))

    await git(repoPath, 'switch', 'main')
    await waitUntil(() => events.filter((e) => e.kind === 'head').length >= 3)

    expect(events.filter((e) => e.kind === 'head').length).toBeGreaterThanOrEqual(3)
  })

  it('fires a config event when git config is edited externally', async () => {
    service.watch(repoPath, sender)

    await git(repoPath, 'config', 'user.email', 'new@example.com')

    await waitUntil(() => events.some((e) => e.kind === 'config'))
    expect(events.some((e) => e.repoPath === repoPath && e.kind === 'config')).toBe(true)
  })

  it('fires a refs event when a commit is made externally', async () => {
    service.watch(repoPath, sender)

    await writeFile(path.join(repoPath, 'b.txt'), 'b\n')
    await git(repoPath, 'add', 'b.txt')
    await git(repoPath, 'commit', '-m', 'second')

    await waitUntil(() => events.some((e) => e.kind === 'refs'))
    expect(events.some((e) => e.repoPath === repoPath && e.kind === 'refs')).toBe(true)
  })

  it('fires an index event when a file is staged externally', async () => {
    service.watch(repoPath, sender)

    await writeFile(path.join(repoPath, 'c.txt'), 'c\n')
    await git(repoPath, 'add', 'c.txt')

    // This used to fail intermittently (twice in 14 full-suite runs on a 12-core Mac)
    // because it depended on the OS actually delivering a notification, which `fs.watch`
    // does not promise. It no longer does: the service re-reads `.git` on a safety-net
    // tick as well, so a dropped notification costs latency, not the event. The tests
    // in the "dropped-notification safety net" group below pin that down directly.
    await waitUntil(() => events.some((e) => e.kind === 'index'))
    expect(events.some((e) => e.repoPath === repoPath && e.kind === 'index')).toBe(true)
  })

  it('debounces a burst of churn into a small number of events, not one per fs notification', async () => {
    service.watch(repoPath, sender)

    // A commit touches the index (via add) AND refs (via commit) in quick succession.
    await writeFile(path.join(repoPath, 'd.txt'), 'd\n')
    await git(repoPath, 'add', 'd.txt')
    await git(repoPath, 'commit', '-m', 'third')

    await waitUntil(() => events.some((e) => e.kind === 'refs'))
    // Give the debounce window a moment to fully settle before counting.
    await new Promise((r) => setTimeout(r, 200))
    // At most one event per distinct kind observed, never a flood of duplicates.
    const indexEvents = events.filter((e) => e.kind === 'index')
    const refsEvents = events.filter((e) => e.kind === 'refs')
    expect(indexEvents.length).toBeLessThanOrEqual(2)
    expect(refsEvents.length).toBeLessThanOrEqual(2)
  })

  it('unwatch stops further events', async () => {
    service.watch(repoPath, sender)
    service.unwatch()

    await writeFile(path.join(repoPath, 'e.txt'), 'e\n')
    await git(repoPath, 'add', 'e.txt')
    await new Promise((r) => setTimeout(r, 700))

    expect(events).toHaveLength(0)
  })

  it('attaches an error handler to every fs.watch() it creates (so an OS-level error, e.g. Windows EPERM when the watched directory disappears, cannot crash the process)', async () => {
    // A real fs.watch() FSWatcher's behavior (does .on()/.emit('error', ...) actually
    // reach a registered listener, does the special no-listener throw fire sync or
    // async) depends on its platform-specific native backend (inotify/FSEvents/
    // ReadDirectoryChangesW) in ways that don't hold uniformly — confirmed flaky
    // across two prior attempts at spying on the real watcher. A plain EventEmitter's
    // 'error' handling is pure, platform-independent JS, so stand in a fake watcher
    // for fs.watch() entirely: this isolates "does the code call .on('error', ...)"
    // from any native fs.watch behavior, which isn't what this test is about.
    class FakeWatcher extends EventEmitter {
      close(): void {}
    }
    const fakeWatchers: FakeWatcher[] = []
    const spy = vi.spyOn(fs, 'watch').mockImplementation(() => {
      const fake = new FakeWatcher()
      fakeWatchers.push(fake)
      return fake as unknown as fs.FSWatcher
    })

    try {
      service.watch(repoPath, sender)
      // Both watchGitDirTopLevel and watchRefsDir call fs.watch() synchronously and
      // unconditionally in this mocked-success setup (no platform-dependent fallback).
      await waitUntil(() => fakeWatchers.length >= 2)

      for (const fake of fakeWatchers) {
        const err = Object.assign(new Error('EPERM: operation not permitted, watch'), {
          code: 'EPERM',
        })
        expect(() => fake.emit('error', err)).not.toThrow()
      }
    } finally {
      spy.mockRestore()
    }
  })

  it('watching a different repo closes the previous watch — no leak, no cross-repo events', async () => {
    const tmpDir2 = await mkdtemp(path.join(os.tmpdir(), 'gitwarden-repo-watcher-2-'))
    const repoPath2 = path.join(tmpDir2, 'repo2')
    try {
      await execFileAsync('git', ['init', '-b', 'main', repoPath2])
      await git(repoPath2, 'config', 'user.name', 'Test User')
      await git(repoPath2, 'config', 'user.email', 'test@example.com')
      await writeFile(path.join(repoPath2, 'z.txt'), 'z\n')
      await git(repoPath2, 'add', 'z.txt')
      await git(repoPath2, 'commit', '-m', 'init2')

      service.watch(repoPath, sender)
      service.watch(repoPath2, sender) // must close repoPath's watch

      // A change to the now-unwatched first repo must produce no event at all.
      await writeFile(path.join(repoPath, 'f.txt'), 'f\n')
      await git(repoPath, 'add', 'f.txt')
      await new Promise((r) => setTimeout(r, 700))
      expect(events.filter((e) => e.repoPath === repoPath)).toHaveLength(0)

      // Sanity: the second repo IS actually being watched. (A leftover 'refs' event
      // from watching so soon after repo2's own setup commit can also show up here —
      // macOS FSEvents can replay a change from just before a watch subscribes —
      // so this only asserts the INDEX event we actually care about arrives, not
      // that it's the only one.)
      await writeFile(path.join(repoPath2, 'g.txt'), 'g\n')
      await git(repoPath2, 'add', 'g.txt')
      await waitUntil(() => events.some((e) => e.repoPath === repoPath2 && e.kind === 'index'))
      expect(events.some((e) => e.repoPath === repoPath2 && e.kind === 'index')).toBe(true)
    } finally {
      await removeTempDir(tmpDir2)
    }
  })

  // ── Dropped-notification safety net ─────────────────────────────────────────
  // `fs.watch` is best-effort by contract, and both of its failure modes are silent:
  // the OS can drop a notification outright (FSEvents coalescing on macOS, a full
  // ReadDirectoryChangesW buffer on Windows), and libuv can report a change against
  // the WATCHED DIRECTORY instead of naming the entry that changed. A watcher that
  // trusts notifications alone therefore misses external changes — the exact failure
  // this service exists to prevent. Both were observed for real: the suite's own
  // `index` test waited a full 10s for a notification that never came, and a direct
  // fs.watch experiment produced `change:.git` under churn.

  /** A watcher that is wired up but will never deliver a single notification. */
  function mockDeafWatchers(): { restore: () => void; count: () => number } {
    const created: EventEmitter[] = []
    const spy = vi.spyOn(fs, 'watch').mockImplementation((() => {
      const fake = Object.assign(new EventEmitter(), { close(): void {} })
      created.push(fake)
      return fake as unknown as fs.FSWatcher
    }) as unknown as typeof fs.watch)
    return { restore: () => spy.mockRestore(), count: () => created.length }
  }

  it('detects an external change even when the OS delivers no notification at all', async () => {
    const deaf = mockDeafWatchers()
    const polling = new RepoWatcherService({ safetyNetIntervalMs: 100 })
    try {
      polling.watch(repoPath, sender)
      expect(deaf.count()).toBeGreaterThan(0) // watchers exist; none of them will ever fire

      await writeFile(path.join(repoPath, 'safety-net.txt'), 'x\n')
      await git(repoPath, 'add', 'safety-net.txt')

      await waitUntil(() => events.some((e) => e.repoPath === repoPath && e.kind === 'index'))
      expect(events.some((e) => e.kind === 'index')).toBe(true)
    } finally {
      polling.unwatch()
      deaf.restore()
    }
  })

  it('acts on a notification that names no entry — the form libuv reports when it cannot attribute the change to one file', async () => {
    const gitDirListeners: Array<(eventType: string, filename: string | null) => void> = []
    const spy = vi.spyOn(fs, 'watch').mockImplementation(((...args: unknown[]) => {
      const listener = (typeof args[1] === 'function' ? args[1] : args[2]) as
        ((eventType: string, filename: string | null) => void) | undefined
      if (listener && path.basename(String(args[0])) === '.git') gitDirListeners.push(listener)
      return Object.assign(new EventEmitter(), { close(): void {} }) as unknown as fs.FSWatcher
    }) as unknown as typeof fs.watch)
    // A safety net that cannot possibly fire during this test, so the notification
    // path alone has to be what produces the event.
    const notificationOnly = new RepoWatcherService({ safetyNetIntervalMs: 60_000 })
    try {
      notificationOnly.watch(repoPath, sender)
      expect(gitDirListeners).toHaveLength(1)

      await git(repoPath, 'config', 'user.email', 'unnamed-notification@example.com')
      gitDirListeners[0]('change', null)

      await waitUntil(() => events.some((e) => e.repoPath === repoPath && e.kind === 'config'))
      expect(events.some((e) => e.kind === 'config')).toBe(true)
    } finally {
      notificationOnly.unwatch()
      spy.mockRestore()
    }
  })

  it('does not re-report a change the notification path already reported', async () => {
    // Notifications and the safety net both run against the same recorded state, so a
    // change seen by one is not re-announced by the other. Without that, every external
    // change would be delivered twice and the renderer would refresh twice for it.
    const both = new RepoWatcherService({ safetyNetIntervalMs: 100 })
    try {
      both.watch(repoPath, sender)

      await writeFile(path.join(repoPath, 'once.txt'), 'once\n')
      await git(repoPath, 'add', 'once.txt')

      await waitUntil(() => events.some((e) => e.kind === 'index'))
      // Several safety-net cycles with nothing further changing on disk.
      await new Promise((r) => setTimeout(r, 600))
      expect(events.filter((e) => e.kind === 'index')).toHaveLength(1)
    } finally {
      both.unwatch()
    }
  })
})
