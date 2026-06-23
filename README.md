# GitWarden

A cross-platform desktop Git GUI focused on **safe multi-account GitHub usage** — it prevents committing or pushing with the wrong profile, author name, email, SSH key, or repository.

Built around **profiles** (e.g. Personal / Work / Client). Each repository is assigned to exactly one profile, and GitWarden surfaces identity safety **before** every commit and push — so you never accidentally push with the wrong account or key.

## Why

Juggling multiple GitHub identities locally is error-prone: the right email but the wrong SSH key, a repo committed under your personal name at work, a push to the wrong account. GitWarden makes the active identity always visible and **blocks** unsafe actions.

## Status

Early development — built in phases. See:

- **Plan:** [`docs/gitwarden-plan.md`](docs/gitwarden-plan.md)
- **Phase prompts:** [`docs/phase-prompts.md`](docs/phase-prompts.md)
- **Contributor/agent guides:** [`CLAUDE.md`](CLAUDE.md), [`AGENT.md`](AGENT.md)

## Stack

Electron + TypeScript (strict) + React (Vite) · Vitest (logic) + Playwright (e2e). Git is invoked via Node `child_process.execFile` (never a shell). Runs on macOS, Linux, and Windows.

## Repository

```
git@github.com:shchadyloTaras/gitwarden.git
```

## License

TBD.
