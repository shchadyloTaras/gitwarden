// Secret redaction ruleset — pure core (Phase 28). No node/electron/DOM imports.
//
// This is the SINGLE source of truth for secret-shaped patterns. Two consumers
// reuse it, deliberately NOT a second parallel table (§4):
//
//   - Phase 31 AiContextBuilder runs `redactSecrets()` on the FULL context
//     BEFORE any chunk/truncation, so no split boundary leaks an un-scanned
//     secret. Redaction is defense-in-depth, best-effort — not a guarantee.
//   - Phase 33 deterministic secret scanner reuses `REDACTION_RULES` /
//     `findSecretMatches()` to surface findings with AI disabled.
//
// Patterns are intentionally conservative (recognizable token shapes), favoring
// low false-negatives on known secret formats over catching every possible
// secret. Replacement keeps non-secret context (e.g. an env var's NAME) where
// useful so the redacted payload preview stays readable.

/** A single redaction/scanner rule. `mask` defaults to returning `placeholder`. */
export interface RedactionRule {
  id: string
  label: string
  /** Global regex. Used by `String.replace` (redaction) and `matchAll` (scan). */
  pattern: RegExp
  /** The text substituted for a match in redacted output. */
  placeholder: string
  /**
   * Optional custom masker, e.g. to preserve a non-secret prefix. Receives the
   * full match and any named capture groups. Returns the replacement text.
   */
  mask?: (match: string, groups: Record<string, string> | undefined) => string
}

export interface RedactionMatch {
  ruleId: string
  label: string
  /** Where in the input the match began. */
  index: number
  /** Length of the matched text (the raw secret is never returned). */
  length: number
}

export interface RedactionResult {
  redacted: string
  matches: RedactionMatch[]
}

// Common env-secret variable names (assignment values get redacted, names kept).
const ENV_SECRET_NAME =
  '[A-Z][A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|TOKEN|API[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY|CLIENT[_-]?SECRET|AUTH)'

/**
 * The shared ruleset. Order matters only for overlapping shapes: more specific
 * rules (GitHub, JWT, private key) run before the broad env-secret assignment.
 */
export const REDACTION_RULES: RedactionRule[] = [
  {
    id: 'private-key',
    label: 'Private key (PEM block)',
    pattern:
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/g,
    placeholder: '«redacted:private-key»',
  },
  {
    id: 'github-token',
    label: 'GitHub token',
    // PATs/OAuth/app tokens (ghp_/gho_/ghu_/ghs_/ghr_) and fine-grained PATs.
    pattern: /\b(?:gh[posru]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/g,
    placeholder: '«redacted:github-token»',
  },
  {
    id: 'jwt',
    label: 'JSON Web Token',
    pattern: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    placeholder: '«redacted:jwt»',
  },
  {
    id: 'aws-access-key-id',
    label: 'AWS access key id',
    pattern: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA)[0-9A-Z]{16}\b/g,
    placeholder: '«redacted:aws-access-key-id»',
  },
  {
    id: 'slack-token',
    label: 'Slack token',
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    placeholder: '«redacted:slack-token»',
  },
  {
    id: 'api-key',
    label: 'Provider API key',
    // OpenAI/OpenRouter/Anthropic/Groq/xAI/Google-style key shapes.
    pattern:
      /\b(?:sk-[A-Za-z0-9_-]{16,}|gsk_[A-Za-z0-9]{20,}|xai-[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{20,})\b/g,
    placeholder: '«redacted:api-key»',
  },
  {
    id: 'credential-url',
    label: 'URL with embedded credentials',
    // scheme://user:password@host/... — redact the password, keep scheme+user+host
    // so the send-preview can still show the destination host (§4).
    pattern: /(?<scheme>[a-z][a-z0-9+.-]*:\/\/)(?<user>[^/@\s:]+):(?<pass>[^/@\s]+)@/gi,
    placeholder: '«redacted:credential-url»',
    mask: (_m, g) => `${g?.scheme ?? ''}${g?.user ?? ''}:«redacted»@`,
  },
  {
    id: 'env-secret',
    label: 'Env secret assignment',
    pattern: new RegExp(
      `(?<assign>\\b${ENV_SECRET_NAME}\\s*[:=]\\s*)(?<quote>['"]?)[^\\s'"#]{6,}\\k<quote>`,
      'gi'
    ),
    placeholder: '«redacted:env-secret»',
    // Keep the variable name + operator; redact the value only.
    mask: (_m, g) => `${g?.assign ?? ''}«redacted:env-secret»`,
  },
]

function extractGroups(args: unknown[]): Record<string, string> | undefined {
  // String.replace callback: (match, p1, …, offset, string, groups?). The named
  // groups object, when present, is the final argument and is a plain object.
  const last = args[args.length - 1]
  if (last && typeof last === 'object') return last as Record<string, string>
  return undefined
}

/**
 * Redact every known secret shape from `input`. The single redaction
 * implementation (§4). Returns the redacted text and a list of matches
 * (positions + rule, never the raw secret) for diagnostics/preview counts.
 */
export function redactSecrets(input: string): RedactionResult {
  const matches: RedactionMatch[] = []
  let out = input

  for (const rule of REDACTION_RULES) {
    // Record matches against the CURRENT text so indices line up with output.
    rule.pattern.lastIndex = 0
    for (const m of out.matchAll(rule.pattern)) {
      matches.push({
        ruleId: rule.id,
        label: rule.label,
        index: m.index ?? 0,
        length: m[0].length,
      })
    }
    out = out.replace(rule.pattern, (...args) => {
      const full = String(args[0])
      const groups = extractGroups(args)
      return rule.mask ? rule.mask(full, groups) : rule.placeholder
    })
  }

  return { redacted: out, matches }
}

/**
 * Detect (but do not redact) secret matches — the basis the Phase 33 scanner
 * reuses. Each match reports its rule, position, and length; never the secret.
 */
export function findSecretMatches(input: string): RedactionMatch[] {
  const matches: RedactionMatch[] = []
  for (const rule of REDACTION_RULES) {
    rule.pattern.lastIndex = 0
    for (const m of input.matchAll(rule.pattern)) {
      matches.push({
        ruleId: rule.id,
        label: rule.label,
        index: m.index ?? 0,
        length: m[0].length,
      })
    }
  }
  return matches
}

/** True when `input` contains at least one known secret shape. */
export function containsSecret(input: string): boolean {
  return REDACTION_RULES.some((rule) => {
    rule.pattern.lastIndex = 0
    return rule.pattern.test(input)
  })
}
