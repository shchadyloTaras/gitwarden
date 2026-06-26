// Pure slash-command router for the advisory AI chat (Phase 53). No DOM / node /
// electron imports — this is the testable mapping from a typed line to a chat
// capability. It grants no authority: it only classifies input. The store layer
// decides what (if anything) to send, always through the same redaction + send
// -preview + enablement pipeline as every other AI feature.

import { ALL_SAFETY_CODES } from './safetyCopilot.js'
import type { SafetyCode } from '../safety/SafetyCheckService.js'

/**
 * What a parsed chat line resolves to. `chat` is free-text (general advisory
 * Q&A). `help`/`unknown` are handled locally and never reach the network.
 */
export type ChatCommandKind =
  | 'commit'
  | 'review'
  | 'push-brief'
  | 'history'
  | 'repo-brief'
  | 'propose'
  | 'explain'
  | 'help'
  | 'chat'
  | 'unknown'

export interface ChatCommandSpec {
  /** The slash trigger, e.g. "/commit". */
  command: string
  kind: Exclude<ChatCommandKind, 'chat' | 'unknown'>
  description: string
  /** When true, the command is meaningless without trailing text (e.g. /propose). */
  requiresArgs?: boolean
}

export interface ParsedChatCommand {
  kind: ChatCommandKind
  /** Trailing text after the command token (or the whole line for free-text chat). */
  args: string
  /** The original trimmed input. */
  raw: string
}

/** The closed set of slash-commands the chat exposes. Order drives the hint row. */
export const CHAT_COMMANDS: ChatCommandSpec[] = [
  { command: '/commit', kind: 'commit', description: 'Draft a commit message for staged changes' },
  { command: '/review', kind: 'review', description: 'Review staged changes for risk' },
  { command: '/push-brief', kind: 'push-brief', description: 'Summarize what a push will publish' },
  { command: '/history', kind: 'history', description: 'Draft release notes / changelog' },
  { command: '/repo-brief', kind: 'repo-brief', description: 'Generate a repo onboarding brief' },
  {
    command: '/propose',
    kind: 'propose',
    description: 'Propose allowlisted file edits (preview + confirm)',
    requiresArgs: true,
  },
  {
    command: '/explain',
    kind: 'explain',
    description: 'Explain a safety issue code or pasted tool/build output',
    requiresArgs: true,
  },
  { command: '/help', kind: 'help', description: 'List available commands' },
]

/** Capability kinds that perform a networked AI send (subject to the privacy gate). */
const NETWORKED_KINDS: ReadonlySet<ChatCommandKind> = new Set<ChatCommandKind>([
  'commit',
  'review',
  'push-brief',
  'history',
  'repo-brief',
  'propose',
  'explain',
  'chat',
])

const SAFETY_CODE_SET = new Set<string>(ALL_SAFETY_CODES)

/** How `/explain` args are classified before the store picks an IPC path. */
export type ExplainTargetKind = 'safety-code' | 'tool-output'

export interface ParsedExplainTarget {
  kind: ExplainTargetKind
  safetyCode?: SafetyCode
  output?: string
}

/** True when running this command sends repo context to the AI provider. */
export function isNetworkedChatCommand(kind: ChatCommandKind): boolean {
  return NETWORKED_KINDS.has(kind)
}

/**
 * Parse a raw chat line into a command. A leading "/" selects a slash-command
 * (unknown slash tokens resolve to `unknown`); anything else is free-text `chat`.
 * Empty input resolves to `unknown` with empty args.
 */
export function parseChatInput(input: string): ParsedChatCommand {
  const raw = input.trim()
  if (raw.length === 0) return { kind: 'unknown', args: '', raw }

  if (!raw.startsWith('/')) return { kind: 'chat', args: raw, raw }

  const spaceIndex = raw.search(/\s/)
  const token = (spaceIndex === -1 ? raw : raw.slice(0, spaceIndex)).toLowerCase()
  const args = spaceIndex === -1 ? '' : raw.slice(spaceIndex + 1).trim()

  const spec = CHAT_COMMANDS.find((c) => c.command === token)
  if (!spec) return { kind: 'unknown', args, raw }
  return { kind: spec.kind, args, raw }
}

/** Human-readable help body listing every command (used by /help and unknown input). */
export function chatHelpText(): string {
  return [
    'Available commands:',
    ...CHAT_COMMANDS.map((c) => `${c.command} — ${c.description}`),
    'Or just type a question to chat about this repository.',
  ].join('\n')
}

/**
 * Classify `/explain` trailing text: a known SafetyCode token, or pasted tool/build
 * output (everything else non-empty).
 */
export function parseExplainTarget(args: string): ParsedExplainTarget | null {
  const trimmed = args.trim()
  if (trimmed.length === 0) return null

  const firstToken = trimmed.split(/\s+/)[0]?.toUpperCase()
  if (firstToken && SAFETY_CODE_SET.has(firstToken)) {
    return { kind: 'safety-code', safetyCode: firstToken as SafetyCode }
  }
  return { kind: 'tool-output', output: trimmed }
}

/**
 * Slash-command autocomplete for the chat composer. Pass the full draft; returns
 * matching commands when the user is typing a `/` token (before or without args).
 */
export function filterSlashCommands(input: string): ChatCommandSpec[] {
  const trimmed = input.trimStart()
  if (!trimmed.startsWith('/')) return []
  const spaceIndex = trimmed.search(/\s/)
  if (spaceIndex !== -1) return []
  const partial = trimmed.toLowerCase()
  return CHAT_COMMANDS.filter((c) => c.command.startsWith(partial))
}
