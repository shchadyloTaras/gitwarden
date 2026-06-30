# Architecture Decision Records (ADR)

GitWarden's binding architecture decisions, one per file, in [MADR](https://adr.github.io/madr/)
format. This directory is the **source of truth** for decision history; the repo-root
[`DECISIONS.md`](../../DECISIONS.md) is now a thin index that maps the old `§N` section numbers to
the files here (so existing "DECISIONS.md §6"-style references still resolve).

## Conventions

- **Filename:** `NNNN-short-kebab-title.md` (zero-padded, monotonic).
- **Status:** `accepted` · `superseded` (by a later ADR) · `amended-by` (refined, not reversed).
  Supersession/amendment is recorded in both files' frontmatter and Status section.
- **Don't rewrite history:** a superseded ADR stays as-is for the record; the reversing decision gets
  a new number and links back.

## Index

| ADR                                             | Decision                                       | Status                 |
| ----------------------------------------------- | ---------------------------------------------- | ---------------------- |
| [0001](0001-locate-and-trust-git-binary.md)     | Locating & trusting the `git` binary           | accepted               |
| [0002](0002-ssh-key-management-out-of-scope.md) | SSH model — app does not manage SSH keys       | accepted (↻ 0009)      |
| [0003](0003-token-auth-deferred-mvp.md)         | Token auth deferred (MVP)                      | superseded by 0004     |
| [0004](0004-github-oauth-device-flow.md)        | GitHub OAuth via Device Flow                   | accepted (↩ 0003)      |
| [0005](0005-concurrency-and-cancellation.md)    | Concurrency & cancellation                     | accepted               |
| [0006](0006-minimum-supported-versions.md)      | Minimum supported versions                     | accepted               |
| [0007](0007-ai-connections-advisory-layer.md)   | AI Connections — advisory layer                | accepted (↻ 0008)      |
| [0008](0008-ai-chat-redesign-simplification.md) | AI Chat Redesign & simplification              | accepted (amends 0007) |
| [0009](0009-ssh-transport-binding.md)           | SSH transport binding — remote ↔ profile alias | accepted (amends 0002) |

Legend: ↩ supersedes · ↻ amended by.
