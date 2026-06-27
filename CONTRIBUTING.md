# Contributing to GitWarden

**GitWarden** is a cross-platform Electron desktop GUI for safe multi-account GitHub usage — it prevents committing or pushing with the wrong profile, identity, SSH key, or repository.

**Agent source of truth:** [AGENTS.md](AGENTS.md) — all coding-agent instructions, architecture rules, and the full build order live there.

## Prerequisites

- Node.js ≥ 20 · git ≥ 2.30
- macOS: Xcode Command Line Tools · Linux: `libgtk-3`, `libnss3`, `libxss1` (Electron native deps) · Windows: build tools (`npm install --global windows-build-tools`)
- Clone and install: `npm install`

## Commands

```bash
npm run dev      # Electron + Vite renderer (hot-reload)
npm test         # Vitest — unit + integration
npm run e2e      # Playwright — Electron e2e (builds first)
npm run lint     # ESLint + Prettier
npm run build    # electron-builder package
```

## Phase workflow

Full details in [AGENTS.md](AGENTS.md) "Operating workflow". Short form:

1. Check `docs/progress-log.md` — previous phase Exit criteria must be ✅.
2. Read the plan section and the matching prompt in `docs/prompts/`.
3. Implement, following the architecture rules in AGENTS.md.
4. Run the gate — use `/verify-phase` (or manually: both `tsc --noEmit` projects, `npm test`, `npm run lint`). Add `/verify-phase --ui` for UI phases.
5. Write the Progress Log entry and tick the checklist — use `/log-phase <N> <name>`.
6. Commit — use `/commit-phase <N> <name>` (refuses on red tests or missing log entry; never pushes).

## Non-negotiables

- **`src/core/` is pure** — no `child_process`, `fs`, `electron`, or DOM imports.
- **All git execution goes through `GitRunner`** — the only `execFile` caller (`src/main/git/`).
- **Git config changes are `--local` only** — never `--global` or `--system`.

## Load the repo into another AI tool

```bash
npm run pack        # produces gitwarden-context.txt (gitignored)
```

Paste `gitwarden-context.txt` into any AI tool for full project context without a verbal briefing.
For human onboarding, read this file first, then [AGENTS.md](AGENTS.md).
