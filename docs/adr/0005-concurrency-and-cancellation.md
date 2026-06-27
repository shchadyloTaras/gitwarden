---
status: accepted
date: 2026-06-23
phase: Phase 0
source: docs/plans/gitwarden-plan.md §7.5
---

# 0005 — Concurrency & cancellation

## Status

Accepted (Phase 0).

## Context

Network git operations (clone/fetch/pull/push) can run long or hang, and concurrent mutations of the
same repo collide on git's index lock (`index.lock`), producing corrupt or failed operations.

## Decision

- **Long ops are cancellable:** clone/fetch/pull/push keep their `ChildProcess` handle; cancel calls
  `kill()`; progress is surfaced from stderr.
- **Per-repo serialization:** mutating git ops are serialized per canonical repo path (one in-flight
  mutation per repo at a time). Read-only ops across different repos may still run in parallel.

## Consequences

- The user can always abort a long/hung network op, and stderr is git's real-time progress channel.
- Serializing per repo avoids `index.lock` collisions while still allowing read-only parallelism
  across different repos.
