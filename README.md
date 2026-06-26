# GitWarden

A cross-platform desktop Git GUI focused on **safe multi-account GitHub usage** — it prevents committing or pushing with the wrong profile, author name, email, SSH key, or repository.

Built around **profiles** (e.g. Personal / Work / Client). Each repository is assigned to exactly one profile, and GitWarden surfaces identity safety **before** every commit and push — so you never accidentally push with the wrong account or key.

## Why

Juggling multiple GitHub identities locally is error-prone: the right email but the wrong SSH key, a repo committed under your personal name at work, a push to the wrong account. GitWarden makes the active identity always visible and **blocks** unsafe actions.

## Status

Built in phases. The MVP (Phases 0–20), GitHub OAuth (21–27), and the AI advisory + chat layer
(28–39, 52–55a) are complete; packaging/release (40–45) and the landing site (46–51) are planned.
See the [progress log](docs/progress-log.md) for the per-phase checklist and history.

- **Core plan:** [`docs/plans/gitwarden-plan.md`](docs/plans/gitwarden-plan.md) · prompts: [`docs/prompts/phase-prompts.md`](docs/prompts/phase-prompts.md)
- **GitHub OAuth:** [`docs/plans/github-oauth-plan.md`](docs/plans/github-oauth-plan.md) · prompts: [`docs/prompts/github-oauth-prompts.md`](docs/prompts/github-oauth-prompts.md)
- **AI Connections:** [`docs/plans/ai-integration-plan.md`](docs/plans/ai-integration-plan.md) · prompts: [`docs/prompts/ai-integration-prompts.md`](docs/prompts/ai-integration-prompts.md)
- **AI Chat Redesign:** [`docs/plans/ai-chat-redesign-plan.md`](docs/plans/ai-chat-redesign-plan.md)
- **Distribution & Release:** [`docs/plans/distribution-release-plan.md`](docs/plans/distribution-release-plan.md) · **Landing Page:** [`docs/plans/landing-page-plan.md`](docs/plans/landing-page-plan.md)
- **Decisions & security:** [`DECISIONS.md`](DECISIONS.md), [`SECURITY.md`](SECURITY.md)
- **Contributor/agent guides:** [`CLAUDE.md`](CLAUDE.md), [`AGENTS.md`](AGENTS.md)
- **Status & progress log:** [`docs/progress-log.md`](docs/progress-log.md)

## Stack

Electron + TypeScript (strict) + React (Vite) · Vitest (logic) + Playwright (e2e). Git is invoked via Node `child_process.execFile` (never a shell). Runs on macOS, Linux, and Windows.

## Repository

```
git@github.com:shchadyloTaras/gitwarden.git
```

## License

TBD.
