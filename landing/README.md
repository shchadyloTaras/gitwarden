# GitWarden — Landing Page & Download Site

The public face of [GitWarden](https://github.com/shchadyloTaras/gitwarden): a fast, static
marketing site whose hero is a single, obvious **Download** button. It detects the visitor's OS
and links the latest matching installer resolved from **GitHub Releases** — the site hosts no
binaries itself.

Built with **Astro + TypeScript (strict) + Tailwind CSS v4**. This is an **isolated workspace**
— its own `package.json`, lockfile, and `node_modules`. It does not touch the Electron app's
tooling (plan §2).

> Plan: [`docs/plans/landing-page-plan.md`](../docs/plans/landing-page-plan.md) ·
> Prompts: [`docs/prompts/landing-page-prompts.md`](../docs/prompts/landing-page-prompts.md)

## Commands

All commands run from `landing/`:

| Command             | Action                                                |
| ------------------- | ----------------------------------------------------- |
| `npm install`       | Install dependencies                                  |
| `npm run dev`       | Start the dev server at `localhost:4321`              |
| `npm run build`     | Build the static site to `./dist/`                    |
| `npm run preview`   | Preview the production build locally                  |
| `npm run check`     | `astro check` — type-check `.astro` + `.ts`           |
| `npm run typecheck` | `tsc --noEmit` — type-check the pure `src/lib/` logic |
| `npm run lint`      | ESLint + Prettier check                               |
| `npm run format`    | Prettier write                                        |
| `npm test`          | Vitest (unit tests for `src/lib/`)                    |

## Structure

```text
landing/
  src/
    pages/      ← Astro file-based routing; index.astro = home
    layouts/    ← Base.astro (shared <head> + global styles)
    components/ ← .astro components
    content/    ← copy.ts — ALL user-facing strings (single source)
    lib/        ← pure logic: config.ts (repo coordinates), resolver (Phase 47)
    styles/     ← global.css — Tailwind import + @theme design tokens
  public/       ← static assets (favicon, OG image)
  astro.config.mjs
  tsconfig.json
  package.json
```

- **All copy** lives in `src/content/copy.ts`. **Repo coordinates / URLs** live in
  `src/lib/config.ts`. Never hardcode these elsewhere.
- **Design tokens** mirror the app's `src/renderer/theme.css` via the `@theme` block in
  `src/styles/global.css`. Do not invent a separate color system.

## Deploy (Vercel — wired in Phase 51)

Host on **Vercel** with **Root Directory = `landing/`** so the monorepo's app tree is ignored.
Static output (`output: 'static'`); push-to-deploy from `main`; PR preview deploys. The
Distribution release workflow fires a Vercel deploy hook so a new release refreshes the live
download buttons automatically. Set the canonical domain in `astro.config.mjs` (`site`).

## Testing

Every test mocks the GitHub API with fixture JSON — **no real network call** runs in tests
(plan §6). The pure resolver in `src/lib/` is the logic-first backbone, exhaustively unit-tested
before any UI consumes it.
