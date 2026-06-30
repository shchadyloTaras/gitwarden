# Roadmap — GitWarden

> **Direction, not a promise.** Near-term items are firm; the further out, the more they will change. This is an outcome-level portfolio view, not a release plan — no dates. The _how_ lives in each feature's spec/plan, linked below; this file holds the _why_.
>
> _updated_at: 2026-06-28_

## Now (committed, in progress)

| Outcome                                                                                    | Link                                                                                 | Status                                                                                                        |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Ship signed, notarized, auto-updating installers so users can trust and stay current       | [`docs/plans/distribution-release-plan.md`](docs/plans/distribution-release-plan.md) | 🟡 packaging + unsigned release matrix done; signing/notarization + auto-update open (gated on signing certs) |
| Make the repo safe and fast for AI coding agents to work in (guardrails, reviewers, evals) | [`docs/plans/agentic-dx-plan.md`](docs/plans/agentic-dx-plan.md)                     | 🟡 DX-0–DX-5 done; DX-6 (optional / à la carte) open                                                          |

## Next (prioritized candidate pool — not yet spec'd)

> RICE = (Reach × Impact × Confidence) ÷ Effort. A guide, not a gate.

| Outcome / problem                                                                                                                                      | Reach | Impact | Confidence | Effort (wk) | RICE     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | ------ | ---------- | ----------- | -------- |
| Warn on _implausible_ repo↔profile bindings (an org-named remote bound to a personal profile) so a mis-binding can't yield a confidently-wrong verdict | 7     | 2      | 80%        | 1           | **11.2** |
| Guided SSH-key/account setup helper, to close the one identity gap the product currently punts on                                                      | 8     | 3      | 80%        | 2           | **9.6**  |
| Stash UI so the Developer can shelve work without the terminal                                                                                         | 5     | 1      | 80%        | 2           | **2.0**  |
| Visual commit graph for quicker history comprehension                                                                                                  | 6     | 1      | 80%        | 3           | **1.6**  |
| Pull-request awareness/support so the collaborator loop stays in-app                                                                                   | 7     | 2      | 50%        | 5           | **1.4**  |

## Later (directional themes — no detail, no scores)

- Awareness of Issues / Actions status alongside the repo, without becoming a full forge client.
- Encrypted export/import of profiles for backup and machine-to-machine handoff.
- Command palette / keyboard-first navigation.
- Shared/templated profiles for teams (without becoming a hosted service).

## Shipped

| Outcome                                                                                                                                                 | Link                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Prevent wrong-identity commits/pushes for multi-account developers (MVP core: profiles, repo binding, Safety Engine, everyday Git without the terminal) | [`docs/features/gitwarden/spec.md`](docs/features/gitwarden/spec.md)                 |
| Verify the GitHub account behind an HTTPS push (sign-in via device flow), turning the account check from assumed into verified                          | [`docs/plans/github-oauth-plan.md`](docs/plans/github-oauth-plan.md)                 |
| Optional, advisory-only AI assistance (commit messages, change review, safety copilot) that never takes a destructive action                            | [`docs/plans/ai-integration-plan.md`](docs/plans/ai-integration-plan.md)             |
| In-app AI chat assistant for general Git/product help                                                                                                   | [`docs/plans/ai-chat-redesign-plan.md`](docs/plans/ai-chat-redesign-plan.md)         |
| Model-chosen generative UI blocks that render AI output as interactive cards                                                                            | [`docs/plans/genui-blocks-plan.md`](docs/plans/genui-blocks-plan.md)                 |
| Per-repo push policy so a contractor can work safely on a client repo from their own account (branch scope + protected-branch block)                    | [`docs/plans/client-branch-access-plan.md`](docs/plans/client-branch-access-plan.md) |
| Public landing + download site (live at gitwarden.vercel.app)                                                                                           | [`docs/plans/landing-page-plan.md`](docs/plans/landing-page-plan.md)                 |

<!-- Note: most feature tracks still live under docs/plans/. Only `gitwarden` has an SDD docs/features/<slug>/ folder (this PRD). Links point at each track's actual doc. -->
