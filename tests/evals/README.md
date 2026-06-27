# AI Evals — DX-4

Offline quality checks for GitWarden's AI features: Smart Commit, Change Review, Safety Copilot.

## What evals are

Each eval case is a **golden fixture**: a known input scenario, the expected AI response shape, and a set of _quality properties_ (not exact strings). Properties include things like "commit subject ≤ 50 chars", "imperative mood", "at least 1 finding", "zero false-positive findings".

Evals run against the **fake adapter** by default — offline, deterministic, no network access. They prove that the harness and quality invariants are correctly wired. When `GITWARDEN_EVAL_LIVE=1` is set, the same assertions run against the real configured AI provider (human opt-in; never in CI).

## Run evals

```bash
npm run eval                    # offline, deterministic — safe in CI
GITWARDEN_EVAL_LIVE=1 npm run eval  # live provider spot-check (opt-in)
```

`npm run eval` also passes `--reporter=verbose` so you see per-case pass/fail, not just a summary.

## The golden-set format

Each fixture is a single TypeScript file in `tests/evals/fixtures/`. It exports one `fixture: EvalFixture` object with these fields:

| Field            | Purpose                                                                              |
| ---------------- | ------------------------------------------------------------------------------------ |
| `name`           | Kebab-case test title                                                                |
| `description`    | What quality property this case proves                                               |
| `assistant`      | `'commit-draft'`, `'change-review'`, or `'safety-copilot'`                           |
| `input`          | Scenario description (diff, safetyCode, context…)                                    |
| `cannedResponse` | The expected AI response used in offline mode (must pass the assistant's Zod schema) |
| `checks`         | Quality assertions to run on the parsed response                                     |

### EvalChecks reference

```
commit-draft:
  conventionalMaxLength   number   subject length ≤ N
  imperativeMood          boolean  first word of description is not past-tense/gerund
  noFileNamesInSubject    boolean  no bare filename (.ts, .js …) in the subject
  noSecrets               boolean  no secret-like prefixes (sk-, ghp_, …)
  notMatchingPattern      string   conventional must NOT match this regex

change-review:
  minFindings             number   findings.length ≥ N
  maxFindings             number   findings.length ≤ N  (use 0 for "no false positives")

safety-copilot:
  codeEquals              string   result.code must equal this SafetyCode
  suggestedActionIn       string[] result.suggestedAction must be in this list
```

## Add a new eval case

1. Create `tests/evals/fixtures/NN-my-case.ts` following the pattern of existing fixtures.
2. Import it in `tests/evals/run-evals.test.ts` and add it to `ALL_FIXTURES`.
3. Run `npm run eval` — the new case appears in the report.

One file = one case. No other files need to change.

## Live spot-check (opt-in)

```bash
GITWARDEN_EVAL_LIVE=1 npm run eval
```

Uses the real AI connection configured in the app (`AiConnectionService`). Requires a configured active connection with a valid API key. Skipped by default in CI.
