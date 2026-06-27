# DECISIONS.md — GitWarden

> **This file is now an index.** The binding decisions were split into one-file-per-decision
> [MADR](https://adr.github.io/madr/) records under [`docs/adr/`](docs/adr/) (see the
> [ADR index](docs/adr/README.md)). This page maps the old `§N` section numbers to their ADR files so
> existing references (e.g. "DECISIONS.md §6") still resolve. Edit the ADR files, not this table.

| Old section                               | Decision                                     | ADR                                                      | Status                 |
| ----------------------------------------- | -------------------------------------------- | -------------------------------------------------------- | ---------------------- |
| §1 — Locating & trusting the `git` binary | Resolution order, fallbacks, verification    | [0001](docs/adr/0001-locate-and-trust-git-binary.md)     | accepted               |
| §2 — SSH model                            | App does not manage SSH keys (MVP)           | [0002](docs/adr/0002-ssh-key-management-out-of-scope.md) | accepted               |
| §3 — Token auth deferred                  | Model-only in MVP                            | [0003](docs/adr/0003-token-auth-deferred-mvp.md)         | superseded by 0004     |
| §3a — GitHub OAuth via Device Flow        | Token auth now in scope (reverses §3)        | [0004](docs/adr/0004-github-oauth-device-flow.md)        | accepted               |
| §4 — Concurrency & cancellation           | Cancellable long ops; per-repo serialization | [0005](docs/adr/0005-concurrency-and-cancellation.md)    | accepted               |
| §5 — Minimum supported versions           | Node ≥ 20, Electron ≥ 30, git ≥ 2.30         | [0006](docs/adr/0006-minimum-supported-versions.md)      | accepted               |
| §6 — AI Connections — advisory layer      | Advisory-only AI beside the Safety Engine    | [0007](docs/adr/0007-ai-connections-advisory-layer.md)   | accepted (amended)     |
| §6a — AI Chat Redesign & simplification   | One chat surface; paste-key-and-go           | [0008](docs/adr/0008-ai-chat-redesign-simplification.md) | accepted (amends 0007) |

New decisions get the next number under [`docs/adr/`](docs/adr/) — see the
[conventions](docs/adr/README.md#conventions). Source for the original decisions:
`docs/plans/gitwarden-plan.md` §7, `docs/plans/github-oauth-plan.md`,
`docs/plans/ai-integration-plan.md`, `docs/plans/ai-chat-redesign-plan.md`.
